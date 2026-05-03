export const STARTER_FREE_BOOSTERS = 2;
export const DEFAULT_PLAYER_CRYSTALS = 0;
export const DEFAULT_PLAYER_TOTAL_XP = 0;
export const DEFAULT_PLAYER_LEVEL = 1;
export const DEFAULT_PLAYER_WINS = 0;
export const DEFAULT_PLAYER_LOSSES = 0;
export const DEFAULT_PLAYER_DRAWS = 0;

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

export type PlayerProgressionTotals = {
  crystals: number;
  totalXp: number;
  level: number;
  wins: number;
  losses: number;
  draws: number;
};

export type PlayerProfile = {
  id: string;
  identity: PlayerIdentity;
  ownedCardIds: string[];
  deckIds: string[];
  starterFreeBoostersRemaining: number;
  openedBoosterIds: string[];
  crystals: number;
  totalXp: number;
  level: number;
  wins: number;
  losses: number;
  draws: number;
  onboarding: PlayerOnboardingState;
};

export type StoredPlayerProfile = Omit<PlayerProfile, "onboarding">;

export function createNewStoredPlayerProfile(id: string, identity: PlayerIdentity): StoredPlayerProfile {
  return {
    id,
    identity,
    ownedCardIds: [],
    deckIds: [],
    starterFreeBoostersRemaining: STARTER_FREE_BOOSTERS,
    openedBoosterIds: [],
    crystals: DEFAULT_PLAYER_CRYSTALS,
    totalXp: DEFAULT_PLAYER_TOTAL_XP,
    level: DEFAULT_PLAYER_LEVEL,
    wins: DEFAULT_PLAYER_WINS,
    losses: DEFAULT_PLAYER_LOSSES,
    draws: DEFAULT_PLAYER_DRAWS,
  };
}

export function toPlayerProfile(profile: StoredPlayerProfile): PlayerProfile {
  const ownedCardIds = normalizeStringArray(profile.ownedCardIds);
  const deckIds = normalizeStringArray(profile.deckIds);
  const openedBoosterIds = normalizeStringArray(profile.openedBoosterIds);
  const starterFreeBoostersRemaining = normalizeNonNegativeInteger(profile.starterFreeBoostersRemaining, STARTER_FREE_BOOSTERS);
  const crystals = normalizeNonNegativeInteger(profile.crystals, DEFAULT_PLAYER_CRYSTALS);
  const totalXp = normalizeNonNegativeInteger(profile.totalXp, DEFAULT_PLAYER_TOTAL_XP);
  const level = normalizePositiveInteger(profile.level, DEFAULT_PLAYER_LEVEL);
  const wins = normalizeNonNegativeInteger(profile.wins, DEFAULT_PLAYER_WINS);
  const losses = normalizeNonNegativeInteger(profile.losses, DEFAULT_PLAYER_LOSSES);
  const draws = normalizeNonNegativeInteger(profile.draws, DEFAULT_PLAYER_DRAWS);

  return {
    id: profile.id,
    identity: profile.identity,
    ownedCardIds,
    deckIds,
    starterFreeBoostersRemaining,
    openedBoosterIds,
    crystals,
    totalXp,
    level,
    wins,
    losses,
    draws,
    onboarding: createOnboardingState({
      ownedCardIds,
      deckIds,
      starterFreeBoostersRemaining,
    }),
  };
}

export function createOnboardingState(profile: Pick<StoredPlayerProfile, "ownedCardIds" | "deckIds" | "starterFreeBoostersRemaining">): PlayerOnboardingState {
  const collectionReady = profile.ownedCardIds.length > 0;
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

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return fallback;
  return value;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return fallback;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
