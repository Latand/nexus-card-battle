import type { Card, Rarity } from "@/features/battle/model/types";
import type { PlayerProfile, StoredPlayerProfile } from "@/features/player/profile/types";

export const STARTER_BOOSTER_CARD_COUNT = 5;
export const STARTER_BOOSTER_WEIGHTED_CARD_COUNT = 3;
export const PAID_BOOSTER_CRYSTAL_COST = 100;

// `clans` is 1..2 entries — most boosters pair two clans, but solo-clan
// boosters (e.g. fan-clan drops like VibeCoders) are also supported.
export type Booster = {
  id: string;
  name: string;
  clans: readonly string[];
  presentation?: BoosterPresentation;
  group?: {
    chatId: string;
  };
  // Optional per-booster overrides — fall back to the global defaults when
  // omitted. Allows weird shapes like a 4-Legend solo-clan starter pack.
  cardCount?: number;
  requiredRarities?: readonly Rarity[];
};

export type BoosterPresentation = "special" | "group";

export type BoosterResponse = {
  id: string;
  name: string;
  clans: string[];
  cardCount?: number;
  presentation?: BoosterPresentation;
  groupChatId?: string;
};

export type BoosterCatalogItem = BoosterResponse & {
  starter: {
    opened: boolean;
    canOpen: boolean;
    disabledReason?: "already_opened" | "no_starter_boosters_remaining";
  };
  paid: {
    crystalCost: number;
    canOpen: boolean;
    disabledReason?: "insufficient_crystals";
  };
};

export type BoosterOpeningSource = "starter_free" | "paid_crystals";

export type StoredBoosterOpeningRecord = {
  id: string;
  playerId: string;
  boosterId: string;
  source: BoosterOpeningSource;
  cardIds: string[];
  openedAt: Date;
};

export type BoosterOpeningRecord = Omit<StoredBoosterOpeningRecord, "openedAt"> & {
  openedAt: string;
};

export type PreparedStarterBoosterOpening = {
  booster: BoosterResponse;
  cards: Card[];
  cardIds: string[];
  source: "starter_free";
};

export type PreparedPaidBoosterOpening = {
  booster: BoosterResponse;
  cards: Card[];
  cardIds: string[];
  source: "paid_crystals";
  crystalCost: number;
};

export type PersistStarterBoosterOpeningInput = {
  identity: StoredPlayerProfile["identity"];
  playerId: string;
  boosterId: string;
  cardIds: string[];
  openedAt: Date;
};

export type PersistedStarterBoosterOpening = {
  player: StoredPlayerProfile;
  opening: StoredBoosterOpeningRecord;
};

export type PersistPaidBoosterOpeningInput = {
  identity: StoredPlayerProfile["identity"];
  playerId: string;
  boosterId: string;
  cardIds: string[];
  openedAt: Date;
  crystalCost: number;
};

export type PersistedPaidBoosterOpening = {
  player: StoredPlayerProfile;
  opening: StoredBoosterOpeningRecord;
};

export type BoosterOpeningStore = {
  findOrCreateByIdentity(identity: StoredPlayerProfile["identity"]): Promise<StoredPlayerProfile>;
  saveStarterBoosterOpening(input: PersistStarterBoosterOpeningInput): Promise<PersistedStarterBoosterOpening>;
  savePaidBoosterOpening(input: PersistPaidBoosterOpeningInput): Promise<PersistedPaidBoosterOpening>;
  findIntegrationGroupByChatId?(chatId: string): Promise<{
    chatId: string;
    clan: string;
    boosterId: string;
    displayName: string;
    cardIds: string[];
  } | undefined>;
  findIntegrationGroupCardsByChatId?(chatId: string): Promise<readonly {
    id: string;
    chatId: string;
    dropWeight: number;
  }[]>;
};

export type PlayerBoosterCatalogProfile = Pick<PlayerProfile, "openedBoosterIds" | "starterFreeBoostersRemaining" | "crystals">;
