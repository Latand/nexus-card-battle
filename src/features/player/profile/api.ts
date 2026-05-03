import {
  PlayerIdentityValidationError,
  normalizeAvatarUrl,
  type PlayerIdentity,
  type PlayerProfile,
  type StoredPlayerProfile,
  parsePlayerIdentity,
  toPlayerProfile,
} from "./types";
import { cards } from "@/features/battle/model/cards";
import { MIN_DECK_SIZE } from "@/features/battle/model/constants";
import { computeMatchRewards, type MatchResultBucket } from "./progression";
import { computeLevelFromXp } from "./types";
import type { RewardSummary } from "@/features/battle/model/types";

export type PlayerProfileStore = {
  findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile>;
};

export type PlayerDeckStore = PlayerProfileStore & {
  saveDeck(identity: PlayerIdentity, deckIds: string[]): Promise<StoredPlayerProfile>;
};

export type ApplyMatchRewardsInput = {
  result: MatchResultBucket;
  deltaXp: number;
  // Baseline match crystals (NOT the level-up bonus — that is recomputed
  // inside the store from the authoritative post-$inc totalXp).
  matchCrystals: number;
  // Absolute post-match ELO. PvE callers omit this; PvP callers pass the
  // value computed against an authoritative pre-match opponent snapshot.
  eloRating?: number;
};

export type PlayerMatchRewardsStore = PlayerProfileStore & {
  applyMatchRewards(identity: PlayerIdentity, rewards: ApplyMatchRewardsInput): Promise<StoredPlayerProfile>;
};

export type PlayerAvatarStore = PlayerProfileStore & {
  setAvatarUrl(identity: PlayerIdentity, avatarUrl: string): Promise<StoredPlayerProfile>;
};

export async function handlePlayerProfilePost(request: Request, store: PlayerProfileStore) {
  try {
    const body = await readJsonObject(request);
    const identity = parsePlayerIdentity(body.identity);
    const profile = await store.findOrCreateByIdentity(identity);

    return playerProfileResponse(toPlayerProfile(profile));
  } catch (error) {
    return playerProfileErrorResponse(error);
  }
}

export async function handlePlayerProfileGet(request: Request, store: PlayerProfileStore) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const identity =
      mode === "telegram"
        ? parsePlayerIdentity({ mode, telegramId: url.searchParams.get("telegramId") })
        : parsePlayerIdentity({ mode, guestId: url.searchParams.get("guestId") });
    const profile = await store.findOrCreateByIdentity(identity);

    return playerProfileResponse(toPlayerProfile(profile));
  } catch (error) {
    return playerProfileErrorResponse(error);
  }
}

export async function handlePlayerAvatarPost(request: Request, store: PlayerAvatarStore) {
  try {
    const body = await readJsonObject(request);
    const identity = parsePlayerIdentity(body.identity);
    const avatarUrl = normalizeAvatarUrl(body.avatarUrl);
    if (avatarUrl === undefined) {
      throw new PlayerAvatarValidationError("avatarUrl must be a valid https URL.");
    }

    const stored = await store.setAvatarUrl(identity, avatarUrl);
    return playerProfileResponse(toPlayerProfile(stored));
  } catch (error) {
    return playerProfileErrorResponse(error);
  }
}

export async function handlePlayerMatchFinishedPost(request: Request, store: PlayerMatchRewardsStore) {
  try {
    const body = await readJsonObject(request);
    const identity = parsePlayerIdentity(body.identity);
    const mode = parseMatchMode(body.mode);
    const result = parseMatchResult(body.result);

    const { summary, persisted } = await applyAndSummarizeMatchRewards(store, identity, { mode, result });

    return Response.json(
      { rewards: summary, player: persisted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return playerProfileErrorResponse(error);
  }
}

export type ApplyMatchRewardsContext =
  | { mode: "pve"; result: MatchResultBucket }
  | { mode: "pvp"; result: MatchResultBucket; opponentEloBefore?: number };

export type PvpSideInput = {
  key: string;
  identity: PlayerIdentity;
  result: MatchResultBucket;
};

export type PvpSideOutcome = {
  key: string;
  summary: RewardSummary | null;
  error?: unknown;
};

export type PvpEloReadFailureLog = (event: { key: string; error: unknown }) => void;

export async function applyAndSummarizeMatchRewards(
  store: PlayerMatchRewardsStore,
  identity: PlayerIdentity,
  matchInfo: ApplyMatchRewardsContext,
): Promise<{ summary: RewardSummary; persisted: PlayerProfile }> {
  const profile = toPlayerProfile(await store.findOrCreateByIdentity(identity));
  const rewards = computeMatchRewards(
    {
      crystals: profile.crystals,
      totalXp: profile.totalXp,
      level: profile.level,
      eloRating: profile.eloRating,
    },
    matchInfo,
  );

  const persisted = toPlayerProfile(
    await store.applyMatchRewards(identity, {
      result: matchInfo.result,
      deltaXp: rewards.deltaXp,
      matchCrystals: rewards.matchCrystals,
      ...(rewards.newTotals.eloRating !== undefined ? { eloRating: rewards.newTotals.eloRating } : {}),
    }),
  );

  const persistedLevelInfo = computeLevelFromXp(persisted.totalXp);

  const summary: RewardSummary = {
    matchXp: rewards.deltaXp,
    levelProgress: levelProgressPercent(persistedLevelInfo),
    cardRewards: [],
    deltaXp: rewards.deltaXp,
    deltaCrystals: rewards.deltaCrystals,
    ...(rewards.deltaElo !== undefined ? { deltaElo: rewards.deltaElo } : {}),
    leveledUp: rewards.leveledUp,
    levelUpBonusCrystals: rewards.levelUpBonusCrystals,
    newTotals: {
      crystals: persisted.crystals,
      totalXp: persisted.totalXp,
      level: persisted.level,
      ...(rewards.deltaElo !== undefined ? { eloRating: persisted.eloRating } : {}),
    },
  };

  return { summary, persisted };
}

export async function applyPvpMatchRewardsForBothSides(
  store: PlayerMatchRewardsStore,
  sides: [PvpSideInput, PvpSideInput],
  options: { onEloReadFailure?: PvpEloReadFailureLog } = {},
): Promise<[PvpSideOutcome, PvpSideOutcome]> {
  const eloReads = await Promise.all(
    sides.map(async (side) => {
      try {
        const profile = toPlayerProfile(await store.findOrCreateByIdentity(side.identity));
        return { key: side.key, ok: true as const, rating: profile.eloRating };
      } catch (error) {
        options.onEloReadFailure?.({ key: side.key, error });
        return { key: side.key, ok: false as const, error };
      }
    }),
  );
  // ELO is all-or-nothing per match: an asymmetric apply (one side moves,
  // the other does not) would break zero-sum and corrupt persistent state.
  const everyEloRead = eloReads.every((entry) => entry.ok);
  const ratingByKey = new Map<string, number>();
  for (const entry of eloReads) if (entry.ok) ratingByKey.set(entry.key, entry.rating);

  const outcomes = await Promise.all(
    sides.map(async (side, index) => {
      const opponent = sides[index === 0 ? 1 : 0];
      const matchInfo: ApplyMatchRewardsContext =
        everyEloRead && ratingByKey.has(opponent.key)
          ? { mode: "pvp", result: side.result, opponentEloBefore: ratingByKey.get(opponent.key)! }
          : { mode: "pvp", result: side.result };

      try {
        const { summary } = await applyAndSummarizeMatchRewards(store, side.identity, matchInfo);
        return { key: side.key, summary };
      } catch (error) {
        return { key: side.key, summary: null, error };
      }
    }),
  );

  return outcomes as [PvpSideOutcome, PvpSideOutcome];
}

function levelProgressPercent(levelInfo: { xpIntoLevel: number; xpForNextLevel: number }) {
  if (levelInfo.xpForNextLevel <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((levelInfo.xpIntoLevel / levelInfo.xpForNextLevel) * 100)));
}

function parseMatchMode(value: unknown): "pve" {
  if (value === "pve") return "pve";
  throw new MatchFinishedValidationError("mode must be \"pve\".");
}

function parseMatchResult(value: unknown): MatchResultBucket {
  if (value === "win" || value === "draw" || value === "loss") return value;
  throw new MatchFinishedValidationError("result must be one of \"win\", \"draw\", \"loss\".");
}

class MatchFinishedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchFinishedValidationError";
  }
}

class PlayerAvatarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerAvatarValidationError";
  }
}

export async function handlePlayerDeckSavePost(request: Request, store: PlayerDeckStore) {
  try {
    const body = await readJsonObject(request);
    const identity = parsePlayerIdentity(body.identity);
    const deckIds = parseDeckIds(body.deckIds);
    const profile = await store.findOrCreateByIdentity(identity);

    validateDeckSave(deckIds, profile.ownedCardIds);

    const savedProfile = await store.saveDeck(identity, deckIds);
    return playerProfileResponse(toPlayerProfile(savedProfile));
  } catch (error) {
    return playerProfileErrorResponse(error);
  }
}

function playerProfileResponse(player: PlayerProfile) {
  return Response.json(
    { player },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function playerProfileErrorResponse(error: unknown) {
  if (error instanceof PlayerDeckValidationError) {
    return Response.json(
      {
        error: "invalid_deck",
        message: error.message,
      },
      { status: 400 },
    );
  }

  if (error instanceof MatchFinishedValidationError) {
    return Response.json(
      {
        error: "invalid_match",
        message: error.message,
      },
      { status: 400 },
    );
  }

  if (error instanceof PlayerAvatarValidationError) {
    return Response.json(
      {
        error: "invalid_avatar",
        message: error.message,
      },
      { status: 400 },
    );
  }

  if (error instanceof PlayerIdentityValidationError || error instanceof SyntaxError) {
    return Response.json(
      {
        error: "invalid_identity",
        message: error.message,
      },
      { status: 400 },
    );
  }

  console.error("Player profile API failed.", error);
  return Response.json(
    {
      error: "profile_unavailable",
      message: "Player profile is unavailable.",
    },
    { status: 500 },
  );
}

class PlayerDeckValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerDeckValidationError";
  }
}

function parseDeckIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new PlayerDeckValidationError("deckIds must be an array.");
  }

  return value.map((item) => {
    if (typeof item !== "string") {
      throw new PlayerDeckValidationError("deckIds must contain only strings.");
    }

    const cardId = item.trim();
    if (!cardId) {
      throw new PlayerDeckValidationError("deckIds must not contain empty card ids.");
    }

    return cardId;
  });
}

function validateDeckSave(deckIds: string[], ownedCardIds: string[]) {
  const duplicateIds = duplicateValues(deckIds);
  if (duplicateIds.length > 0) {
    throw new PlayerDeckValidationError(`Duplicate deck card ids: ${duplicateIds.join(", ")}`);
  }

  const knownCardIds = new Set(cards.map((card) => card.id));
  const unknownIds = deckIds.filter((cardId) => !knownCardIds.has(cardId));
  if (unknownIds.length > 0) {
    throw new PlayerDeckValidationError(`Unknown deck card ids: ${unknownIds.join(", ")}`);
  }

  const owned = new Set(ownedCardIds);
  const missingOwnedIds = deckIds.filter((cardId) => !owned.has(cardId));
  if (missingOwnedIds.length > 0) {
    throw new PlayerDeckValidationError(`Deck contains non-owned card ids: ${missingOwnedIds.join(", ")}`);
  }

  if (deckIds.length < MIN_DECK_SIZE) {
    throw new PlayerDeckValidationError(`Deck must contain at least ${MIN_DECK_SIZE} cards.`);
  }
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates];
}

async function readJsonObject(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new SyntaxError("request body must be valid JSON.");
  }

  if (!isRecord(body)) {
    throw new PlayerIdentityValidationError("request body must be an object.");
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
