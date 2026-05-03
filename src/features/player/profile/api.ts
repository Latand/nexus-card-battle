import {
  PlayerIdentityValidationError,
  type PlayerIdentity,
  type PlayerProfile,
  type StoredPlayerProfile,
  parsePlayerIdentity,
  toPlayerProfile,
} from "./types";
import { cards } from "@/features/battle/model/cards";
import { MIN_DECK_SIZE } from "@/features/battle/model/constants";
import {
  LEVEL_XP_BASE,
  computeMatchRewards,
  type ComputedMatchRewardTotals,
  type MatchResultBucket,
} from "./progression";
import type { RewardSummary } from "@/features/battle/model/types";

export type PlayerProfileStore = {
  findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile>;
};

export type PlayerDeckStore = PlayerProfileStore & {
  saveDeck(identity: PlayerIdentity, deckIds: string[]): Promise<StoredPlayerProfile>;
};

export type ApplyMatchRewardsInput = {
  result: MatchResultBucket;
  newTotals: ComputedMatchRewardTotals;
};

export type PlayerMatchRewardsStore = PlayerProfileStore & {
  applyMatchRewards(identity: PlayerIdentity, rewards: ApplyMatchRewardsInput): Promise<StoredPlayerProfile>;
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

export async function handlePlayerMatchFinishedPost(request: Request, store: PlayerMatchRewardsStore) {
  try {
    const body = await readJsonObject(request);
    const identity = parsePlayerIdentity(body.identity);
    const mode = parseMatchMode(body.mode);
    const result = parseMatchResult(body.result);

    const profile = toPlayerProfile(await store.findOrCreateByIdentity(identity));
    const rewards = computeMatchRewards(
      { crystals: profile.crystals, totalXp: profile.totalXp, level: profile.level },
      { mode, result },
    );

    const persisted = toPlayerProfile(
      await store.applyMatchRewards(identity, { result, newTotals: rewards.newTotals }),
    );

    const summary: RewardSummary = {
      // Slice 1: PvE only awards user XP. The legacy card/match-XP fields are
      // kept on the type for the existing overlay; we mirror the user XP
      // delta into matchXp so the existing progress bar still renders sane.
      matchXp: rewards.deltaXp,
      levelProgress: levelProgressPercent(persisted.totalXp, persisted.level),
      cardRewards: [],
      deltaXp: rewards.deltaXp,
      deltaCrystals: rewards.deltaCrystals,
      leveledUp: rewards.leveledUp,
      levelUpBonusCrystals: rewards.levelUpBonusCrystals,
      newTotals: {
        crystals: persisted.crystals,
        totalXp: persisted.totalXp,
        level: persisted.level,
      },
    };

    return Response.json(
      { rewards: summary, player: persisted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return playerProfileErrorResponse(error);
  }
}

function levelProgressPercent(totalXp: number, level: number) {
  // Mirrors computeLevelFromXp for the bar fill. We re-derive from totals so
  // the bar shows the player's standing right now (post-match), independent
  // of the exact match-info inputs.
  const xpToReachThisLevel = sumXpToReachLevel(level);
  const xpForNextLevel = LEVEL_XP_BASE * (level + 1) * (level + 1);
  const into = Math.max(0, totalXp - xpToReachThisLevel);
  if (xpForNextLevel <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((into / xpForNextLevel) * 100)));
}

function sumXpToReachLevel(level: number) {
  let sum = 0;
  for (let n = 2; n <= level; n += 1) {
    sum += LEVEL_XP_BASE * n * n;
  }
  return sum;
}

function parseMatchMode(value: unknown): "pve" {
  // Slice 1 only persists PvE matches. PvP is server-authoritative and
  // lands in slice 2.
  if (value === "pve") return "pve";
  throw new MatchFinishedValidationError("mode must be \"pve\" in slice 1.");
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
