import { MongoClient, MongoServerError, ObjectId, type Collection, type Filter, type WithId } from "mongodb";
import { BoosterOpeningError } from "@/features/boosters/opening";
import type { BoosterOpeningSource, PersistPaidBoosterOpeningInput, PersistStarterBoosterOpeningInput, PersistedPaidBoosterOpening, PersistedStarterBoosterOpening, StoredBoosterOpeningRecord } from "@/features/boosters/types";
import { cards } from "@/features/battle/model/cards";
import { getOwnedCount, getSellableCount, type OwnedCardEntry } from "@/features/inventory/inventoryOps";
import { computeSellRevenue } from "@/features/economy/sellPricing";
import {
  DEFAULT_PLAYER_CRYSTALS,
  DEFAULT_PLAYER_DRAWS,
  DEFAULT_PLAYER_ELO_RATING,
  DEFAULT_PLAYER_LOSSES,
  DEFAULT_PLAYER_TOTAL_XP,
  DEFAULT_PLAYER_WINS,
  computeLevelFromXp,
  createNewStoredPlayerProfile,
  normalizeAvatarUrl,
  type PlayerIdentity,
  type StoredPlayerProfile,
} from "./types";
import { computeLevelUpBonusForRange } from "./progression";
import { SellError, type ApplyMatchRewardsInput, type ApplyMatchRewardsOutput, type PlayerAvatarStore, type PlayerDeckStore, type PlayerMatchRewardsStore, type PlayerSellStore } from "./api";
import { getMilestonesCrossed, pickMilestoneRewards, type MilestoneCardReward } from "@/features/economy/milestones";
import { cards as activeCards } from "@/features/battle/model/cards";
import {
  createGroupCardRecord,
  createNewGroup,
  validateGroupBonusChange,
  type CreateGroupCardInput,
  type CreateGroupCardResult,
  type IntegrationStore,
  type UpsertGroupInput,
} from "@/features/integrations/api";
import { hydrateGroupRuntime, type GroupCardIntegrationRecord, type GroupIntegrationRecord } from "@/features/integrations/runtime";

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/nexus-card-battle";
const DEFAULT_MONGODB_DB = "nexus-card-battle";
const DEFAULT_MONGODB_SERVER_SELECTION_TIMEOUT_MS = 1_500;
const PLAYERS_COLLECTION = "players";
const BOOSTER_OPENINGS_COLLECTION = "boosterOpenings";
const GROUPS_COLLECTION = "integrationGroups";
const GROUP_CARDS_COLLECTION = "integrationGroupCards";

// Progression fields are optional so pre-existing documents read cleanly.
// `level` is intentionally absent — it is derived from totalXp on read,
// because storing an absolute level would race against $inc(totalXp).
// `ownedCardIds` is the legacy on-disk field; `ownedCards` is the multiset.
// Documents written before slice 1 have only `ownedCardIds`; new writes use
// `ownedCards` while leaving the legacy field untouched (lazy migration).
type MongoPlayerDocument = Omit<StoredPlayerProfile, "id" | "ownedCards" | "crystals" | "totalXp" | "wins" | "losses" | "draws" | "eloRating" | "avatarUrl"> & {
  createdAt: Date;
  updatedAt: Date;
  ownedCards?: OwnedCardEntry[];
  ownedCardIds?: string[];
  crystals?: number;
  totalXp?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  eloRating?: number;
  avatarUrl?: string;
};

type MongoBoosterOpeningDocument = {
  playerId: string;
  identity: PlayerIdentity;
  boosterId: string;
  source: BoosterOpeningSource;
  cardIds: string[];
  openedAt: Date;
  createdAt: Date;
};

type MongoClientPromiseCache = {
  key: string;
  promise: Promise<MongoClient>;
};

const mongoGlobal = globalThis as typeof globalThis & {
  __nexusPlayerMongoClientPromise?: MongoClientPromiseCache;
};

export function getMongoPlayerProfileStore() {
  const { uri, dbName, serverSelectionTimeoutMS } = getMongoConfig();
  const clientPromise = getMongoClient(uri, serverSelectionTimeoutMS);
  return new MongoPlayerProfileStore(clientPromise, dbName);
}

type MongoGroupDocument = GroupIntegrationRecord;
type MongoGroupCardDocument = GroupCardIntegrationRecord & {
  card: CreateGroupCardInput;
};

export class MongoPlayerProfileStore implements PlayerDeckStore, PlayerMatchRewardsStore, PlayerAvatarStore, PlayerSellStore, IntegrationStore {
  private indexesReady?: Promise<void>;
  private boosterOpeningIndexesReady?: Promise<void>;
  private integrationIndexesReady?: Promise<void>;

  constructor(
    private readonly clientPromise: Promise<MongoClient>,
    private readonly dbName: string,
  ) {}

  async findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile> {
    const collection = await this.getPlayersCollection();
    const now = new Date();
    const filter = identityFilter(identity);
    const insertedProfile = createNewStoredPlayerProfile("", identity);
    const document = await collection.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          identity: insertedProfile.identity,
          ownedCards: insertedProfile.ownedCards,
          deckIds: insertedProfile.deckIds,
          starterFreeBoostersRemaining: insertedProfile.starterFreeBoostersRemaining,
          openedBoosterIds: insertedProfile.openedBoosterIds,
          crystals: insertedProfile.crystals,
          totalXp: insertedProfile.totalXp,
          wins: insertedProfile.wins,
          losses: insertedProfile.losses,
          draws: insertedProfile.draws,
          eloRating: insertedProfile.eloRating,
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    if (!document) {
      throw new Error("MongoDB did not return a player profile.");
    }

    await this.hydrateIntegrationRuntime();
    return fromMongoDocument(document);
  }

  async applyMatchRewards(identity: PlayerIdentity, rewards: ApplyMatchRewardsInput): Promise<ApplyMatchRewardsOutput> {
    const players = await this.getPlayersCollection();
    const now = new Date();
    const resultCounterField =
      rewards.result === "win" ? "wins" : rewards.result === "loss" ? "losses" : "draws";

    // Op A is $inc-only on additive fields so concurrent calls compose;
    // ELO is $set because the caller already resolved it against an
    // authoritative pre-match opponent snapshot (callers racing on the
    // same player necessarily race on opponent identity too).
    const setFields: Record<string, unknown> = { updatedAt: now };
    if (typeof rewards.eloRating === "number" && Number.isFinite(rewards.eloRating)) {
      setFields.eloRating = Math.max(0, Math.round(rewards.eloRating));
    }

    const afterIncrement = await players.findOneAndUpdate(
      identityFilter(identity),
      {
        $inc: {
          totalXp: rewards.deltaXp,
          crystals: rewards.matchCrystals,
          [resultCounterField]: 1,
        },
        $set: setFields,
      },
      { returnDocument: "after" },
    );

    if (!afterIncrement) {
      throw new Error("Player profile did not exist for match rewards apply.");
    }

    // Level boundaries come from the post-Op-A totalXp, not the caller's
    // pre-call view, so concurrent matches racing across a threshold pay
    // the bonus exactly once.
    const authoritativeTotalXp = numberOrZero(afterIncrement.totalXp);
    const xpBeforeMatch = Math.max(0, authoritativeTotalXp - rewards.deltaXp);
    const oldLevel = computeLevelFromXp(xpBeforeMatch).level;
    const newLevel = computeLevelFromXp(authoritativeTotalXp).level;

    if (newLevel <= oldLevel) {
      return { profile: fromMongoDocument(afterIncrement), milestoneCardRewards: [] };
    }

    let latest: WithId<MongoPlayerDocument> = afterIncrement;
    const bonus = computeLevelUpBonusForRange(oldLevel, newLevel);
    if (bonus > 0) {
      const afterBonus = await players.findOneAndUpdate(
        identityFilter(identity),
        {
          $inc: { crystals: bonus },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: "after" },
      );
      if (afterBonus) latest = afterBonus;
    }

    // Op C — milestone-card grant. The same oldLevel/newLevel computed above
    // drives this so concurrent matches that racy-cross a milestone level
    // each pick up exactly the milestones THEY crossed (Op-A's authoritative
    // $inc fans out the totalXp deterministically per call).
    const milestonesCrossed = getMilestonesCrossed(oldLevel, newLevel);
    if (milestonesCrossed.length === 0) {
      return { profile: fromMongoDocument(latest), milestoneCardRewards: [] };
    }

    const rng = rewards.rng ?? Math.random;
    let granted: MilestoneCardReward[];
    try {
      granted = pickMilestoneRewards(milestonesCrossed, activeCards, rng);
    } catch (error) {
      // Card-pool / rarity configuration bug — log and skip Op-C without
      // rolling back the level-up bonus the player already earned.
      console.error("Milestone card pick failed; skipping milestone grant.", { error, oldLevel, newLevel });
      return { profile: fromMongoDocument(latest), milestoneCardRewards: [] };
    }

    try {
      const grantedIds = granted.map((entry) => entry.cardId);
      const afterMilestones = await players.findOneAndUpdate(
        identityFilter(identity),
        [
          {
            $set: {
              ownedCards: buildOwnedCardsIncrementPipeline(grantedIds),
              updatedAt: new Date(),
            },
          },
        ],
        { returnDocument: "after" },
      );
      if (afterMilestones) latest = afterMilestones;
    } catch (error) {
      // If Op-C fails after Op-A and Op-B succeeded, do NOT roll back; the
      // player keeps the XP/crystals/level-up bonus they earned.
      console.error("Milestone card grant write failed; profile retains Op-A/Op-B but no cards.", { error });
      return { profile: fromMongoDocument(latest), milestoneCardRewards: [] };
    }

    return { profile: fromMongoDocument(latest), milestoneCardRewards: granted };
  }

  async saveStarterBoosterOpening(input: PersistStarterBoosterOpeningInput): Promise<PersistedStarterBoosterOpening> {
    const players = await this.getPlayersCollection();
    const openings = await this.getBoosterOpeningsCollection();
    const now = new Date();
    const { opening, insertedOpeningId } = await createOrLoadStarterOpening(openings, input, now);

    try {
      return {
        player: fromMongoDocument(await applyStarterOpeningToPlayer(players, input.identity, input.boosterId, opening.cardIds, now)),
        opening: fromMongoOpeningDocument(opening),
      };
    } catch (error) {
      if (insertedOpeningId) {
        await openings.deleteOne({ _id: insertedOpeningId }).catch(() => undefined);
      }

      throw error;
    }
  }

  async savePaidBoosterOpening(input: PersistPaidBoosterOpeningInput): Promise<PersistedPaidBoosterOpening> {
    const players = await this.getPlayersCollection();
    const openings = await this.getBoosterOpeningsCollection();
    const now = new Date();
    const { opening, insertedOpeningId } = await createPaidOpening(openings, input, now);

    try {
      return {
        player: fromMongoDocument(await applyPaidOpeningToPlayer(players, input.identity, opening.cardIds, input.crystalCost, now)),
        opening: fromMongoOpeningDocument(opening),
      };
    } catch (error) {
      await openings.deleteOne({ _id: insertedOpeningId }).catch(() => undefined);
      throw error;
    }
  }

  async setAvatarUrl(identity: PlayerIdentity, avatarUrl: string): Promise<StoredPlayerProfile> {
    const players = await this.getPlayersCollection();
    const sanitized = normalizeAvatarUrl(avatarUrl);
    if (sanitized === undefined) {
      throw new Error("avatarUrl must be a valid https URL.");
    }

    const updated = await players.findOneAndUpdate(
      identityFilter(identity),
      {
        $set: {
          avatarUrl: sanitized,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );

    if (!updated) {
      throw new Error("Player profile did not exist for avatar update.");
    }

    return fromMongoDocument(updated);
  }

  async saveDeck(identity: PlayerIdentity, deckIds: string[]): Promise<StoredPlayerProfile> {
    const players = await this.getPlayersCollection();
    // Atomic precondition on the multiset: every deck card must already exist
    // in `ownedCards.cardId`. Closing the TOCTOU window here matters once
    // slice 2's sell flow can drop counts to zero between read and write.
    // Legacy documents that only carry `ownedCardIds` still satisfy the
    // post-write fallback below via `readOwnedCards`.
    const updatedPlayer = await players.findOneAndUpdate(
      {
        ...identityFilter(identity),
        "ownedCards.cardId": { $all: deckIds },
      },
      {
        $set: {
          deckIds,
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
      },
    );

    if (updatedPlayer) {
      return fromMongoDocument(updatedPlayer);
    }

    const currentPlayer = await players.findOne(identityFilter(identity));
    if (!currentPlayer) {
      throw new Error("Player profile did not exist for deck save.");
    }

    const ownedCards = readOwnedCards(currentPlayer);
    const missingOwnedIds = deckIds.filter((cardId) => getOwnedCount(ownedCards, cardId) < 1);
    if (missingOwnedIds.length > 0) {
      throw new Error(`Deck contains non-owned card ids: ${missingOwnedIds.join(", ")}`);
    }

    // Legacy doc without `ownedCards` but with `ownedCardIds` covering the
    // deck — atomic precondition rejected it because `ownedCards.cardId` is
    // empty. Fall back to a non-precondition write so the migration window
    // does not block deck saves.
    const fallbackUpdate = await players.findOneAndUpdate(
      identityFilter(identity),
      {
        $set: {
          deckIds,
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
      },
    );

    if (fallbackUpdate) {
      return fromMongoDocument(fallbackUpdate);
    }

    throw new Error("Player deck could not be saved.");
  }

  async applySellCards(identity: PlayerIdentity, cardId: string, count: number): Promise<StoredPlayerProfile> {
    const players = await this.getPlayersCollection();
    return applySellCardsToPlayer(players, identity, cardId, count);
  }

  async upsertGroup(input: UpsertGroupInput): Promise<GroupIntegrationRecord> {
    const groups = await this.getGroupsCollection();
    const current = await groups.findOne({ chatId: input.chatId });
    validateGroupBonusChange(current ?? undefined, input.bonus);

    const now = new Date();
    const base = current ?? createNewGroup(input, now);
    const next: GroupIntegrationRecord = {
      ...base,
      displayName: input.displayName,
      glyphUrl: input.glyphUrl,
      bonus: input.bonus,
      updatedAt: now,
    };

    await groups.updateOne({ chatId: input.chatId }, { $set: next, $setOnInsert: { createdAt: next.createdAt } }, { upsert: true });
    const stored = await groups.findOne({ chatId: input.chatId });
    if (!stored) throw new Error("Integration group upsert did not return a group.");
    return fromMongoGroup(stored);
  }

  async createGroupCard(input: CreateGroupCardInput): Promise<CreateGroupCardResult> {
    const groups = await this.getGroupsCollection();
    const groupCards = await this.getGroupCardsCollection();
    const players = await this.getPlayersCollection();
    const existing = await this.findGroupCardByIdempotencyKey(input.chatId, input.idempotencyKey);
    if (existing) return existing;

    const group = await groups.findOne({ chatId: input.chatId });
    if (!group) {
      throw new Error(`Integration group does not exist for chatId: ${input.chatId}`);
    }

    const now = new Date();
    const groupCard = createGroupCardRecord(input, now);
    const identity: PlayerIdentity = { mode: "telegram", telegramId: input.creatorTelegramId };
    await this.findOrCreateByIdentity(identity);

    try {
      try {
        await groupCards.insertOne({ ...groupCard, card: input });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          const duplicate = await this.findGroupCardByIdempotencyKey(input.chatId, input.idempotencyKey);
          if (duplicate) return duplicate;
        }
        throw error;
      }
      await groups.updateOne({ chatId: input.chatId }, { $addToSet: { cardIds: groupCard.id }, $set: { updatedAt: now } });
      const updatedPlayer = await grantGroupCardOnce(players, identity, groupCard.id, now);
      const updatedGroup = await groups.findOne({ chatId: input.chatId });
      const responseGroup = updatedGroup ?? { ...group, cardIds: [...new Set([...group.cardIds, groupCard.id])], updatedAt: now };
      return { group: fromMongoGroup(responseGroup), groupCard, cardInput: input, player: updatedPlayer, idempotent: false };
    } catch (error) {
      await groupCards.deleteOne({ chatId: input.chatId, idempotencyKey: input.idempotencyKey }).catch(() => undefined);
      await groups.updateOne({ chatId: input.chatId }, { $pull: { cardIds: groupCard.id } }).catch(() => undefined);
      throw error;
    }
  }

  async findGroupCardByIdempotencyKey(chatId: string, idempotencyKey: string): Promise<CreateGroupCardResult | undefined> {
    const groups = await this.getGroupsCollection();
    const groupCards = await this.getGroupCardsCollection();
    const existing = await groupCards.findOne({ chatId, idempotencyKey });
    if (!existing) return undefined;
    const group = await groups.findOne({ chatId: existing.chatId });
    if (!group) throw new Error("Integration group card history references a missing group.");
    const players = await this.getPlayersCollection();
    const player = await grantGroupCardOnce(players, { mode: "telegram", telegramId: existing.creatorTelegramId }, existing.id, new Date());
    return { group: fromMongoGroup(group), groupCard: fromMongoGroupCard(existing), cardInput: existing.card, player, idempotent: true };
  }

  async findIntegrationGroupByChatId(chatId: string): Promise<GroupIntegrationRecord | undefined> {
    const groups = await this.getGroupsCollection();
    const group = await groups.findOne({ chatId });
    return group ? fromMongoGroup(group) : undefined;
  }

  async findIntegrationGroupCardsByChatId(chatId: string): Promise<GroupCardIntegrationRecord[]> {
    const groupCards = await this.getGroupCardsCollection();
    const cards = await groupCards.find({ chatId }).toArray();
    return cards.map(fromMongoGroupCard);
  }

  async hydrateIntegrationRuntime() {
    const groups = await this.getGroupsCollection();
    const groupCards = await this.getGroupCardsCollection();
    const [storedGroups, storedGroupCards] = await Promise.all([
      groups.find({}).toArray(),
      groupCards.find({}).toArray(),
    ]);
    hydrateGroupRuntime(storedGroups.map(fromMongoGroup), storedGroupCards.map((card) => card.card));
  }

  private async getPlayersCollection() {
    const client = await this.clientPromise;
    const collection = client.db(this.dbName).collection<MongoPlayerDocument>(PLAYERS_COLLECTION);
    await this.ensureIndexes(collection);
    return collection;
  }

  private async getBoosterOpeningsCollection() {
    const client = await this.clientPromise;
    const collection = client.db(this.dbName).collection<MongoBoosterOpeningDocument>(BOOSTER_OPENINGS_COLLECTION);
    await this.ensureBoosterOpeningIndexes(collection);
    return collection;
  }

  private async getGroupsCollection() {
    const client = await this.clientPromise;
    const collection = client.db(this.dbName).collection<MongoGroupDocument>(GROUPS_COLLECTION);
    await this.ensureIntegrationIndexes();
    return collection;
  }

  private async getGroupCardsCollection() {
    const client = await this.clientPromise;
    const collection = client.db(this.dbName).collection<MongoGroupCardDocument>(GROUP_CARDS_COLLECTION);
    await this.ensureIntegrationIndexes();
    return collection;
  }

  private ensureIndexes(collection: Collection<MongoPlayerDocument>) {
    this.indexesReady ??= Promise.all([
      collection.createIndex(
        { "identity.telegramId": 1 },
        {
          name: "uniq_player_telegram_identity",
          unique: true,
          partialFilterExpression: { "identity.mode": "telegram" },
        },
      ),
      collection.createIndex(
        { "identity.guestId": 1 },
        {
          name: "uniq_player_guest_identity",
          unique: true,
          partialFilterExpression: { "identity.mode": "guest" },
        },
      ),
    ]).then(() => undefined);

    return this.indexesReady;
  }

  private ensureBoosterOpeningIndexes(collection: Collection<MongoBoosterOpeningDocument>) {
    this.boosterOpeningIndexesReady ??= ensureBoosterOpeningIndexes(collection);

    return this.boosterOpeningIndexesReady;
  }

  private async ensureIntegrationIndexes() {
    this.integrationIndexesReady ??= (async () => {
      const client = await this.clientPromise;
      const db = client.db(this.dbName);
      await Promise.all([
        db.collection<MongoGroupDocument>(GROUPS_COLLECTION).createIndex({ chatId: 1 }, { unique: true, name: "uniq_integration_group_chat" }),
        db.collection<MongoGroupCardDocument>(GROUP_CARDS_COLLECTION).dropIndex("uniq_integration_group_card_idempotency").catch((error) => {
          if (error instanceof MongoServerError && error.codeName === "IndexNotFound") return undefined;
          throw error;
        }),
        db.collection<MongoGroupCardDocument>(GROUP_CARDS_COLLECTION).createIndex({ chatId: 1, idempotencyKey: 1 }, { unique: true, name: "uniq_integration_group_card_chat_idempotency" }),
        db.collection<MongoGroupCardDocument>(GROUP_CARDS_COLLECTION).createIndex({ chatId: 1 }, { name: "idx_integration_group_cards_chat" }),
      ]);
    })();
    return this.integrationIndexesReady;
  }
}

function fromMongoGroup(group: WithId<MongoGroupDocument> | MongoGroupDocument): GroupIntegrationRecord {
  return {
    chatId: group.chatId,
    clan: group.clan,
    boosterId: group.boosterId,
    displayName: group.displayName,
    glyphUrl: group.glyphUrl,
    bonus: group.bonus,
    cardIds: Array.isArray(group.cardIds) ? group.cardIds : [],
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

function fromMongoGroupCard(card: WithId<MongoGroupCardDocument> | MongoGroupCardDocument): GroupCardIntegrationRecord {
  return {
    id: card.id,
    chatId: card.chatId,
    creatorTelegramId: card.creatorTelegramId,
    idempotencyKey: card.idempotencyKey,
    dropWeight: card.dropWeight,
    createdAt: card.createdAt,
  };
}

async function ensureBoosterOpeningIndexes(collection: Collection<MongoBoosterOpeningDocument>) {
  const indexes = await collection.indexes();
  const starterUniqueIndex = indexes.find((index) => index.name === "uniq_starter_booster_opening");
  if (starterUniqueIndex && !starterUniqueIndex.partialFilterExpression) {
    await collection.dropIndex("uniq_starter_booster_opening");
  }

  await Promise.all([
    collection.createIndex(
      { playerId: 1, boosterId: 1, source: 1 },
      {
        name: "uniq_starter_booster_opening",
        unique: true,
        partialFilterExpression: { source: "starter_free" },
      },
    ),
    collection.createIndex({ playerId: 1, openedAt: -1 }, { name: "idx_booster_openings_player_opened_at" }),
    collection.createIndex({ boosterId: 1, openedAt: -1 }, { name: "idx_booster_openings_booster_opened_at" }),
  ]);
}

async function applyStarterOpeningToPlayer(
  players: Collection<MongoPlayerDocument>,
  identity: PlayerIdentity,
  boosterId: string,
  cardIds: string[],
  now: Date,
) {
  // Pipeline-update so the multiset increment runs server-side against the
  // post-write document state. Two concurrent opens for the same player (with
  // different boosterIds — legitimate, since STARTER_FREE_BOOSTERS = 2) can
  // otherwise interleave a JS-side read between each other and clobber each
  // other's `ownedCards` array. Aggregation pipelines can't be combined with
  // $inc/$addToSet, so deck/openedBoosters/starter fields are expressed as
  // pipeline equivalents below.
  const updatedPlayer = await players.findOneAndUpdate(
    {
      ...identityFilter(identity),
      starterFreeBoostersRemaining: { $gt: 0 },
      openedBoosterIds: { $ne: boosterId },
    },
    [
      {
        $set: {
          ownedCards: buildOwnedCardsIncrementPipeline(cardIds),
          deckIds: { $setUnion: [{ $ifNull: ["$deckIds", []] }, cardIds] },
          openedBoosterIds: { $setUnion: [{ $ifNull: ["$openedBoosterIds", []] }, [boosterId]] },
          starterFreeBoostersRemaining: { $subtract: [{ $ifNull: ["$starterFreeBoostersRemaining", 0] }, 1] },
          updatedAt: now,
        },
      },
    ],
    {
      returnDocument: "after",
    },
  );

  if (updatedPlayer) {
    return updatedPlayer;
  }

  // No match → either the player doc is missing, or this booster was already
  // applied (`openedBoosterIds: { $ne: boosterId }` rejected the filter). The
  // recovery branch surfaces the latter as success so duplicate-call replays
  // (network retry, server restart) stay idempotent.
  const currentPlayer = await players.findOne(identityFilter(identity));
  if (currentPlayer && hasAppliedStarterOpening(currentPlayer, boosterId, cardIds)) {
    return currentPlayer;
  }

  throw new BoosterOpeningError("starter_booster_unavailable", "Starter booster opening could not be saved for the current player state.", 409);
}

async function applyPaidOpeningToPlayer(
  players: Collection<MongoPlayerDocument>,
  identity: PlayerIdentity,
  cardIds: string[],
  crystalCost: number,
  now: Date,
) {
  const updatedPlayer = await players.findOneAndUpdate(
    {
      ...identityFilter(identity),
      crystals: { $gte: crystalCost },
    },
    [
      {
        $set: {
          ownedCards: buildOwnedCardsIncrementPipeline(cardIds),
          crystals: { $subtract: [{ $ifNull: ["$crystals", 0] }, crystalCost] },
          updatedAt: now,
        },
      },
    ],
    {
      returnDocument: "after",
    },
  );

  if (updatedPlayer) {
    return updatedPlayer;
  }

  const currentPlayer = await players.findOne(identityFilter(identity));
  if (!currentPlayer || numberOrZero(currentPlayer.crystals) < crystalCost) {
    throw new BoosterOpeningError("insufficient_crystals", "Not enough crystals to open this booster.", 409);
  }

  throw new BoosterOpeningError("invalid_booster_opening", "Paid booster opening could not be saved for the current player state.", 409);
}

async function grantGroupCardOnce(
  players: Collection<MongoPlayerDocument>,
  identity: PlayerIdentity,
  cardId: string,
  now: Date,
): Promise<StoredPlayerProfile> {
  const updated = await players.findOneAndUpdate(
    {
      ...identityFilter(identity),
      "ownedCards.cardId": { $ne: cardId },
    },
    [
      {
        $set: {
          ownedCards: buildOwnedCardsIncrementPipeline([cardId]),
          updatedAt: now,
        },
      },
    ],
    { returnDocument: "after" },
  );

  if (updated) {
    return fromMongoDocument(updated);
  }

  const current = await players.findOne(identityFilter(identity));
  if (current) {
    return fromMongoDocument(current);
  }

  throw new Error("Player profile did not exist for group card grant.");
}

async function applySellCardsToPlayer(
  players: Collection<MongoPlayerDocument>,
  identity: PlayerIdentity,
  cardId: string,
  count: number,
): Promise<StoredPlayerProfile> {
  if (!Number.isInteger(count) || count <= 0) {
    throw new SellError("invalid_sell_count", "count must be a positive integer.", 400);
  }

  const card = cards.find((entry) => entry.id === cardId);
  if (!card) {
    throw new SellError("invalid_card_id", `Unknown card id: ${cardId}`, 400);
  }

  const revenue = computeSellRevenue(card, count);
  const now = new Date();

  // Pipeline-update so the multiset decrement runs server-side: two concurrent
  // sells of the same cardId compose against the post-write document state and
  // can't drive the count negative or skip a debit. The filter pre-checks both
  // "enough sellable stock" and "card not in any saved deck" so a no-op match
  // is always due to one of those server-authoritative invariants.
  const updated = await players.findOneAndUpdate(
    {
      ...identityFilter(identity),
      ownedCards: { $elemMatch: { cardId, count: { $gte: count } } },
      deckIds: { $ne: cardId },
    },
    [
      {
        $set: {
          ownedCards: {
            $filter: {
              input: {
                $map: {
                  input: { $ifNull: ["$ownedCards", []] },
                  as: "entry",
                  in: {
                    $cond: [
                      { $eq: ["$$entry.cardId", cardId] },
                      { cardId: "$$entry.cardId", count: { $subtract: ["$$entry.count", count] } },
                      "$$entry",
                    ],
                  },
                },
              },
              as: "entry",
              cond: { $gt: ["$$entry.count", 0] },
            },
          },
          crystals: { $add: [{ $ifNull: ["$crystals", 0] }, revenue] },
          updatedAt: now,
        },
      },
    ],
    { returnDocument: "after" },
  );

  if (updated) {
    return fromMongoDocument(updated);
  }

  // Filter rejected the update — disambiguate the failure cause for the API
  // surface so a UI can render a precise error.
  const current = await players.findOne(identityFilter(identity));
  if (!current) {
    throw new SellError("insufficient_stock", "Player profile did not exist for sell apply.", 409);
  }

  const ownedCards = readOwnedCards(current);
  const deckIds = Array.isArray(current.deckIds) ? current.deckIds : [];
  if (deckIds.includes(cardId)) {
    throw new SellError("card_in_deck", "Cannot sell a card that is in a saved deck.", 409);
  }

  if (count > getSellableCount(ownedCards, deckIds, cardId)) {
    throw new SellError("insufficient_stock", "Not enough sellable copies for this sell.", 409);
  }

  // Filter rejected, but post-read invariants now satisfy the precondition —
  // most likely a concurrent write briefly raced us. Surface as conflict.
  throw new SellError("insufficient_stock", "Sell could not be applied due to a concurrent write.", 409);
}

function buildOwnedCardsIncrementPipeline(cardIds: readonly string[]) {
  return {
    $reduce: {
      input: cardIds,
      initialValue: buildOwnedCardsReadBasePipeline(),
      in: {
        $cond: [
          { $in: ["$$this", { $ifNull: ["$$value.cardId", []] }] },
          {
            $map: {
              input: "$$value",
              as: "entry",
              in: {
                $cond: [
                  { $eq: ["$$entry.cardId", "$$this"] },
                  { cardId: "$$entry.cardId", count: { $add: ["$$entry.count", 1] } },
                  "$$entry",
                ],
              },
            },
          },
          { $concatArrays: ["$$value", [{ cardId: "$$this", count: 1 }]] },
        ],
      },
    },
  };
}

function buildOwnedCardsReadBasePipeline() {
  return {
    $reduce: {
      input: { $ifNull: ["$ownedCardIds", []] },
      initialValue: { $ifNull: ["$ownedCards", []] },
      in: {
        $cond: [
          { $in: ["$$this", { $ifNull: ["$$value.cardId", []] }] },
          "$$value",
          { $concatArrays: ["$$value", [{ cardId: "$$this", count: 1 }]] },
        ],
      },
    },
  };
}

async function createOrLoadStarterOpening(
  openings: Collection<MongoBoosterOpeningDocument>,
  input: PersistStarterBoosterOpeningInput,
  now: Date,
): Promise<{ opening: WithId<MongoBoosterOpeningDocument>; insertedOpeningId?: ObjectId }> {
  const openingId = new ObjectId();
  const openingDocument: WithId<MongoBoosterOpeningDocument> = {
    _id: openingId,
    playerId: input.playerId,
    identity: input.identity,
    boosterId: input.boosterId,
    source: "starter_free",
    cardIds: input.cardIds,
    openedAt: input.openedAt,
    createdAt: now,
  };

  try {
    // Compose uses standalone Mongo, so history is written before player state and replayed on duplicate recovery.
    await openings.insertOne(openingDocument);
    return {
      opening: openingDocument,
      insertedOpeningId: openingId,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const existingOpening = await openings.findOne(starterOpeningFilter(input.playerId, input.boosterId));
  if (!existingOpening) {
    throw new BoosterOpeningError("starter_booster_unavailable", "Starter booster opening history could not be recovered.", 409);
  }

  return {
    opening: existingOpening,
  };
}

async function createPaidOpening(
  openings: Collection<MongoBoosterOpeningDocument>,
  input: PersistPaidBoosterOpeningInput,
  now: Date,
): Promise<{ opening: WithId<MongoBoosterOpeningDocument>; insertedOpeningId: ObjectId }> {
  const openingId = new ObjectId();
  const openingDocument: WithId<MongoBoosterOpeningDocument> = {
    _id: openingId,
    playerId: input.playerId,
    identity: input.identity,
    boosterId: input.boosterId,
    source: "paid_crystals",
    cardIds: input.cardIds,
    openedAt: input.openedAt,
    createdAt: now,
  };

  await openings.insertOne(openingDocument);
  return {
    opening: openingDocument,
    insertedOpeningId: openingId,
  };
}

// Verified safe in slice 2: openedBoosterIds.includes(boosterId) is the
// short-circuit left-hand of the AND, so recovery only consults deck/owned
// state when the booster was already recorded as opened. Subsequent /sell
// calls cannot strip openedBoosterIds, and applyStarterOpeningToPlayer's
// duplicate-call branch returns the prior write directly rather than
// re-running this predicate, so post-open sells do not break recovery.
function hasAppliedStarterOpening(player: MongoPlayerDocument, boosterId: string, cardIds: string[]) {
  const ownedCards = readOwnedCards(player);
  const deckIds = new Set(player.deckIds);
  return player.openedBoosterIds.includes(boosterId) && cardIds.every((cardId) => getOwnedCount(ownedCards, cardId) >= 1 && deckIds.has(cardId));
}

function readOwnedCards(player: WithId<MongoPlayerDocument> | MongoPlayerDocument): OwnedCardEntry[] {
  const playerId = "_id" in player ? player._id.toHexString() : "<unsaved>";
  return mergeOwnedCardsWithLegacyIds({
    ownedCards: player.ownedCards,
    ownedCardIds: player.ownedCardIds,
    playerId,
  });
}

export function mergeOwnedCardsWithLegacyIds(input: {
  ownedCards?: unknown;
  ownedCardIds?: unknown;
  playerId?: string;
}): OwnedCardEntry[] {
  const playerId = input.playerId ?? "<unsaved>";
  const valid: OwnedCardEntry[] = [];
  const seenCardIds = new Set<string>();

  if (Array.isArray(input.ownedCards) && input.ownedCards.length > 0) {
    for (const entry of input.ownedCards) {
      if (entry && typeof entry.cardId === "string" && entry.cardId.length > 0 && Number.isInteger(entry.count) && entry.count > 0) {
        valid.push({ cardId: entry.cardId, count: entry.count });
        seenCardIds.add(entry.cardId);
      } else {
        console.warn("MongoPlayerProfileStore: dropping malformed ownedCards entry.", { playerId, entry });
      }
    }
  }

  if (Array.isArray(input.ownedCardIds)) {
    for (const cardId of input.ownedCardIds) {
      if (typeof cardId !== "string" || cardId.length === 0 || seenCardIds.has(cardId)) continue;
      valid.push({ cardId, count: 1 });
      seenCardIds.add(cardId);
    }
  }

  return valid;
}

function starterOpeningFilter(playerId: string, boosterId: string): Filter<MongoBoosterOpeningDocument> {
  return {
    playerId,
    boosterId,
    source: "starter_free",
  };
}

function isDuplicateKeyError(error: unknown) {
  return error instanceof MongoServerError && error.code === 11000;
}

function getMongoClient(uri: string, serverSelectionTimeoutMS: number) {
  const key = `${uri}|${serverSelectionTimeoutMS}`;
  if (mongoGlobal.__nexusPlayerMongoClientPromise?.key === key) {
    return mongoGlobal.__nexusPlayerMongoClientPromise.promise;
  }

  const promise = new MongoClient(uri, {
    serverSelectionTimeoutMS,
  })
    .connect()
    .catch((error) => {
      if (mongoGlobal.__nexusPlayerMongoClientPromise?.promise === promise) {
        mongoGlobal.__nexusPlayerMongoClientPromise = undefined;
      }

      throw error;
    });

  mongoGlobal.__nexusPlayerMongoClientPromise = { key, promise };
  return promise;
}

function getMongoConfig() {
  const uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
  return {
    uri,
    dbName: process.env.MONGODB_DB || parseDatabaseName(uri) || DEFAULT_MONGODB_DB,
    serverSelectionTimeoutMS: parsePositiveInteger(
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      DEFAULT_MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    ),
  };
}

function parseDatabaseName(uri: string) {
  try {
    const pathname = new URL(uri).pathname.replace(/^\//, "");
    return pathname || undefined;
  } catch {
    return undefined;
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function identityFilter(identity: PlayerIdentity): Filter<MongoPlayerDocument> {
  if (identity.mode === "telegram") {
    return { "identity.mode": "telegram", "identity.telegramId": identity.telegramId };
  }

  return { "identity.mode": "guest", "identity.guestId": identity.guestId };
}

function fromMongoDocument(document: WithId<MongoPlayerDocument>): StoredPlayerProfile {
  const avatarUrl = normalizeAvatarUrl(document.avatarUrl);
  return {
    id: document._id.toHexString(),
    identity: document.identity,
    ownedCards: readOwnedCards(document),
    deckIds: document.deckIds,
    starterFreeBoostersRemaining: document.starterFreeBoostersRemaining,
    openedBoosterIds: document.openedBoosterIds,
    crystals: nonNegativeIntegerOrDefault(document.crystals, DEFAULT_PLAYER_CRYSTALS),
    totalXp: nonNegativeIntegerOrDefault(document.totalXp, DEFAULT_PLAYER_TOTAL_XP),
    wins: nonNegativeIntegerOrDefault(document.wins, DEFAULT_PLAYER_WINS),
    losses: nonNegativeIntegerOrDefault(document.losses, DEFAULT_PLAYER_LOSSES),
    draws: nonNegativeIntegerOrDefault(document.draws, DEFAULT_PLAYER_DRAWS),
    eloRating: eloRatingOrDefault(document.eloRating, DEFAULT_PLAYER_ELO_RATING),
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
  };
}

function eloRatingOrDefault(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function nonNegativeIntegerOrDefault(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return fallback;
  return value;
}

function numberOrZero(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}

function fromMongoOpeningDocument(document: WithId<MongoBoosterOpeningDocument>): StoredBoosterOpeningRecord {
  return {
    id: document._id.toHexString(),
    playerId: document.playerId,
    boosterId: document.boosterId,
    source: document.source,
    cardIds: document.cardIds,
    openedAt: document.openedAt,
  };
}
