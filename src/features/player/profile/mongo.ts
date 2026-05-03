import { MongoClient, MongoServerError, ObjectId, type Collection, type Filter, type WithId } from "mongodb";
import { BoosterOpeningError } from "@/features/boosters/opening";
import type { BoosterOpeningSource, PersistStarterBoosterOpeningInput, PersistedStarterBoosterOpening, StoredBoosterOpeningRecord } from "@/features/boosters/types";
import {
  DEFAULT_PLAYER_CRYSTALS,
  DEFAULT_PLAYER_DRAWS,
  DEFAULT_PLAYER_LEVEL,
  DEFAULT_PLAYER_LOSSES,
  DEFAULT_PLAYER_TOTAL_XP,
  DEFAULT_PLAYER_WINS,
  createNewStoredPlayerProfile,
  type PlayerIdentity,
  type StoredPlayerProfile,
} from "./types";
import type { ApplyMatchRewardsInput, PlayerDeckStore, PlayerMatchRewardsStore } from "./api";

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/nexus-card-battle";
const DEFAULT_MONGODB_DB = "nexus-card-battle";
const DEFAULT_MONGODB_SERVER_SELECTION_TIMEOUT_MS = 1_500;
const PLAYERS_COLLECTION = "players";
const BOOSTER_OPENINGS_COLLECTION = "boosterOpenings";

// Progression fields are optional on the document type so legacy profiles
// (written before slice 1) read cleanly. Defaults are applied in
// fromMongoDocument().
type MongoPlayerDocument = Omit<StoredPlayerProfile, "id" | "crystals" | "totalXp" | "level" | "wins" | "losses" | "draws"> & {
  createdAt: Date;
  updatedAt: Date;
  crystals?: number;
  totalXp?: number;
  level?: number;
  wins?: number;
  losses?: number;
  draws?: number;
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

export class MongoPlayerProfileStore implements PlayerDeckStore, PlayerMatchRewardsStore {
  private indexesReady?: Promise<void>;
  private boosterOpeningIndexesReady?: Promise<void>;

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
          ownedCardIds: insertedProfile.ownedCardIds,
          deckIds: insertedProfile.deckIds,
          starterFreeBoostersRemaining: insertedProfile.starterFreeBoostersRemaining,
          openedBoosterIds: insertedProfile.openedBoosterIds,
          crystals: insertedProfile.crystals,
          totalXp: insertedProfile.totalXp,
          level: insertedProfile.level,
          wins: insertedProfile.wins,
          losses: insertedProfile.losses,
          draws: insertedProfile.draws,
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

    return fromMongoDocument(document);
  }

  async applyMatchRewards(identity: PlayerIdentity, rewards: ApplyMatchRewardsInput): Promise<StoredPlayerProfile> {
    const players = await this.getPlayersCollection();
    const now = new Date();
    // Counter increment for the per-result wins/losses/draws bucket.
    const resultCounterField =
      rewards.result === "win" ? "wins" : rewards.result === "loss" ? "losses" : "draws";

    const updatedPlayer = await players.findOneAndUpdate(
      identityFilter(identity),
      {
        $set: {
          crystals: rewards.newTotals.crystals,
          totalXp: rewards.newTotals.totalXp,
          level: rewards.newTotals.level,
          updatedAt: now,
        },
        $inc: {
          [resultCounterField]: 1,
        },
      },
      {
        returnDocument: "after",
      },
    );

    if (!updatedPlayer) {
      throw new Error("Player profile did not exist for match rewards apply.");
    }

    return fromMongoDocument(updatedPlayer);
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

  async saveDeck(identity: PlayerIdentity, deckIds: string[]): Promise<StoredPlayerProfile> {
    const players = await this.getPlayersCollection();
    const updatedPlayer = await players.findOneAndUpdate(
      {
        ...identityFilter(identity),
        ownedCardIds: { $all: deckIds },
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

    const ownedCardIds = new Set(currentPlayer.ownedCardIds);
    const missingOwnedIds = deckIds.filter((cardId) => !ownedCardIds.has(cardId));
    if (missingOwnedIds.length > 0) {
      throw new Error(`Deck contains non-owned card ids: ${missingOwnedIds.join(", ")}`);
    }

    throw new Error("Player deck could not be saved.");
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
    this.boosterOpeningIndexesReady ??= Promise.all([
      collection.createIndex(
        { playerId: 1, boosterId: 1, source: 1 },
        {
          name: "uniq_starter_booster_opening",
          unique: true,
        },
      ),
      collection.createIndex({ playerId: 1, openedAt: -1 }, { name: "idx_booster_openings_player_opened_at" }),
      collection.createIndex({ boosterId: 1, openedAt: -1 }, { name: "idx_booster_openings_booster_opened_at" }),
    ]).then(() => undefined);

    return this.boosterOpeningIndexesReady;
  }
}

async function applyStarterOpeningToPlayer(
  players: Collection<MongoPlayerDocument>,
  identity: PlayerIdentity,
  boosterId: string,
  cardIds: string[],
  now: Date,
) {
  const updatedPlayer = await players.findOneAndUpdate(
    {
      ...identityFilter(identity),
      starterFreeBoostersRemaining: { $gt: 0 },
      openedBoosterIds: { $ne: boosterId },
      ownedCardIds: { $nin: cardIds },
    },
    {
      $addToSet: {
        ownedCardIds: { $each: cardIds },
        deckIds: { $each: cardIds },
        openedBoosterIds: boosterId,
      },
      $inc: {
        starterFreeBoostersRemaining: -1,
      },
      $set: {
        updatedAt: now,
      },
    },
    {
      returnDocument: "after",
    },
  );

  if (updatedPlayer) {
    return updatedPlayer;
  }

  const currentPlayer = await players.findOne(identityFilter(identity));
  if (currentPlayer && hasAppliedStarterOpening(currentPlayer, boosterId, cardIds)) {
    return currentPlayer;
  }

  throw new BoosterOpeningError("starter_booster_unavailable", "Starter booster opening could not be saved for the current player state.", 409);
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

function hasAppliedStarterOpening(player: MongoPlayerDocument, boosterId: string, cardIds: string[]) {
  const ownedCardIds = new Set(player.ownedCardIds);
  const deckIds = new Set(player.deckIds);
  return player.openedBoosterIds.includes(boosterId) && cardIds.every((cardId) => ownedCardIds.has(cardId) && deckIds.has(cardId));
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
  return {
    id: document._id.toHexString(),
    identity: document.identity,
    ownedCardIds: document.ownedCardIds,
    deckIds: document.deckIds,
    starterFreeBoostersRemaining: document.starterFreeBoostersRemaining,
    openedBoosterIds: document.openedBoosterIds,
    // Pre-progression Mongo documents may not include these fields. Default
    // them so toPlayerProfile downstream produces a complete profile.
    crystals: nonNegativeIntegerOrDefault(document.crystals, DEFAULT_PLAYER_CRYSTALS),
    totalXp: nonNegativeIntegerOrDefault(document.totalXp, DEFAULT_PLAYER_TOTAL_XP),
    level: positiveIntegerOrDefault(document.level, DEFAULT_PLAYER_LEVEL),
    wins: nonNegativeIntegerOrDefault(document.wins, DEFAULT_PLAYER_WINS),
    losses: nonNegativeIntegerOrDefault(document.losses, DEFAULT_PLAYER_LOSSES),
    draws: nonNegativeIntegerOrDefault(document.draws, DEFAULT_PLAYER_DRAWS),
  };
}

function nonNegativeIntegerOrDefault(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return fallback;
  return value;
}

function positiveIntegerOrDefault(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return fallback;
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
