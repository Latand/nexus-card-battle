import { getOwnedCardIds, type OwnedCardEntry } from "@/features/inventory/inventoryOps";

export type { OwnedCardEntry } from "@/features/inventory/inventoryOps";

export const STARTER_FREE_BOOSTERS = 2;
export const DEFAULT_PLAYER_CRYSTALS = 0;
export const DEFAULT_PLAYER_TOTAL_XP = 0;
export const DEFAULT_PLAYER_LEVEL = 1;
export const DEFAULT_PLAYER_WINS = 0;
export const DEFAULT_PLAYER_LOSSES = 0;
export const DEFAULT_PLAYER_DRAWS = 0;
export const DEFAULT_PLAYER_ELO_RATING = 1000;

// Quadratic curve: XP to advance from level N-1 to N is LEVEL_XP_BASE * N^2.
// Lives here (not in progression.ts) so toPlayerProfile() can derive level
// from totalXp without a circular import.
export const LEVEL_XP_BASE = 50;

export type LevelInfo = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
};

export function computeLevelFromXp(totalXp: number): LevelInfo {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));
  let level = 1;
  let consumed = 0;

  while (true) {
    const xpForNextLevel = LEVEL_XP_BASE * (level + 1) * (level + 1);
    if (consumed + xpForNextLevel > safeTotal) {
      return {
        level,
        xpIntoLevel: safeTotal - consumed,
        xpForNextLevel,
      };
    }
    consumed += xpForNextLevel;
    level += 1;
  }
}

export type PlayerIdentity = TelegramPlayerIdentity | GuestPlayerIdentity;

export type TelegramPlayerIdentity = {
  mode: "telegram";
  telegramId: string;
};

export type GuestPlayerIdentity = {
  mode: "guest";
  guestId: string;
};

export type PlayerOnboardingState = {
  starterBoostersAvailable: boolean;
  collectionReady: boolean;
  deckReady: boolean;
  completed: boolean;
};

export type PlayerProfile = {
  id: string;
  identity: PlayerIdentity;
  ownedCards: OwnedCardEntry[];
  deckIds: string[];
  starterFreeBoostersRemaining: number;
  openedBoosterIds: string[];
  crystals: number;
  totalXp: number;
  level: number;
  wins: number;
  losses: number;
  draws: number;
  eloRating: number;
  avatarUrl?: string;
  onboarding: PlayerOnboardingState;
};

export type StoredPlayerProfile = Omit<PlayerProfile, "onboarding" | "level">;

export function createNewStoredPlayerProfile(id: string, identity: PlayerIdentity): StoredPlayerProfile {
  return {
    id,
    identity,
    ownedCards: [],
    deckIds: [],
    starterFreeBoostersRemaining: STARTER_FREE_BOOSTERS,
    openedBoosterIds: [],
    crystals: DEFAULT_PLAYER_CRYSTALS,
    totalXp: DEFAULT_PLAYER_TOTAL_XP,
    wins: DEFAULT_PLAYER_WINS,
    losses: DEFAULT_PLAYER_LOSSES,
    draws: DEFAULT_PLAYER_DRAWS,
    eloRating: DEFAULT_PLAYER_ELO_RATING,
  };
}

export function toPlayerProfile(profile: StoredPlayerProfile): PlayerProfile {
  const legacyOwnedCardIds = readLegacyOwnedCardIds(profile);
  const ownedCards = normalizeOwnedCards(profile.ownedCards, legacyOwnedCardIds);
  const deckIds = normalizeStringArray(profile.deckIds);
  const openedBoosterIds = normalizeStringArray(profile.openedBoosterIds);
  const starterFreeBoostersRemaining = normalizeNonNegativeInteger(profile.starterFreeBoostersRemaining, STARTER_FREE_BOOSTERS);
  const crystals = normalizeNonNegativeInteger(profile.crystals, DEFAULT_PLAYER_CRYSTALS);
  const totalXp = normalizeNonNegativeInteger(profile.totalXp, DEFAULT_PLAYER_TOTAL_XP);
  const wins = normalizeNonNegativeInteger(profile.wins, DEFAULT_PLAYER_WINS);
  const losses = normalizeNonNegativeInteger(profile.losses, DEFAULT_PLAYER_LOSSES);
  const draws = normalizeNonNegativeInteger(profile.draws, DEFAULT_PLAYER_DRAWS);
  const eloRating = normalizeEloRating(profile.eloRating, DEFAULT_PLAYER_ELO_RATING);
  const avatarUrl = normalizeAvatarUrl(profile.avatarUrl);
  const level = computeLevelFromXp(totalXp).level;

  return {
    id: profile.id,
    identity: profile.identity,
    ownedCards,
    deckIds,
    starterFreeBoostersRemaining,
    openedBoosterIds,
    crystals,
    totalXp,
    level,
    wins,
    losses,
    draws,
    eloRating,
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    onboarding: createOnboardingState({
      ownedCards,
      deckIds,
      starterFreeBoostersRemaining,
    }),
  };
}

export function normalizeAvatarUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return undefined;
  if (!/^https:\/\//i.test(trimmed)) return undefined;
  return trimmed;
}

export function createOnboardingState(profile: Pick<StoredPlayerProfile, "ownedCards" | "deckIds" | "starterFreeBoostersRemaining">): PlayerOnboardingState {
  const collectionReady = getOwnedCardIds(profile.ownedCards).length > 0;
  const deckReady = profile.deckIds.length > 0;

  return {
    starterBoostersAvailable: profile.starterFreeBoostersRemaining > 0,
    collectionReady,
    deckReady,
    completed: collectionReady && deckReady && profile.starterFreeBoostersRemaining === 0,
  };
}

export class PlayerIdentityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerIdentityValidationError";
  }
}

export function parsePlayerIdentity(value: unknown): PlayerIdentity {
  if (!isRecord(value)) {
    throw new PlayerIdentityValidationError("identity must be an object.");
  }

  if (value.mode === "telegram") {
    if ("guestId" in value) {
      throw new PlayerIdentityValidationError("telegram identity must not include guestId.");
    }

    return {
      mode: "telegram",
      telegramId: parseIdentityId(value.telegramId, "telegramId"),
    };
  }

  if (value.mode === "guest") {
    if ("telegramId" in value) {
      throw new PlayerIdentityValidationError("guest identity must not include telegramId.");
    }

    return {
      mode: "guest",
      guestId: parseIdentityId(value.guestId, "guestId"),
    };
  }

  throw new PlayerIdentityValidationError("identity.mode must be either telegram or guest.");
}

export function isSamePlayerIdentity(left: PlayerIdentity, right: PlayerIdentity) {
  if (left.mode !== right.mode) return false;
  if (left.mode === "telegram" && right.mode === "telegram") return left.telegramId === right.telegramId;
  if (left.mode === "guest" && right.mode === "guest") return left.guestId === right.guestId;
  return false;
}

function parseIdentityId(value: unknown, fieldName: "telegramId" | "guestId") {
  if (typeof value !== "string") {
    throw new PlayerIdentityValidationError(`identity.${fieldName} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new PlayerIdentityValidationError(`identity.${fieldName} must not be empty.`);
  }

  if (trimmed.length > 128) {
    throw new PlayerIdentityValidationError(`identity.${fieldName} must be 128 characters or less.`);
  }

  if (!/^[A-Za-z0-9:_-]+$/.test(trimmed)) {
    throw new PlayerIdentityValidationError(`identity.${fieldName} contains unsupported characters.`);
  }

  return trimmed;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function readLegacyOwnedCardIds(profile: StoredPlayerProfile): string[] {
  const legacy = (profile as unknown as { ownedCardIds?: unknown }).ownedCardIds;
  return normalizeStringArray(legacy);
}

function normalizeOwnedCards(value: unknown, legacyOwnedCardIds: readonly string[]): OwnedCardEntry[] {
  if (!Array.isArray(value)) {
    return legacyOwnedCardIds.map((cardId) => ({ cardId, count: 1 }));
  }

  const merged = new Map<string, number>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const cardId = item.cardId;
    const count = item.count;
    if (typeof cardId !== "string" || !cardId) continue;
    if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) continue;
    merged.set(cardId, (merged.get(cardId) ?? 0) + count);
  }

  return [...merged.entries()].map(([cardId, count]) => ({ cardId, count }));
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return fallback;
  return value;
}

function normalizeEloRating(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
