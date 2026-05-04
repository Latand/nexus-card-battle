import type { Card } from "@/features/battle/model/types";
import type { PlayerProfile, StoredPlayerProfile } from "@/features/player/profile/types";

export const STARTER_BOOSTER_CARD_COUNT = 5;
export const STARTER_BOOSTER_WEIGHTED_CARD_COUNT = 3;
export const PAID_BOOSTER_CRYSTAL_COST = 100;

export type Booster = {
  id: string;
  name: string;
  clans: readonly [string, string];
};

export type BoosterResponse = {
  id: string;
  name: string;
  clans: [string, string];
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
};

export type PlayerBoosterCatalogProfile = Pick<PlayerProfile, "openedBoosterIds" | "starterFreeBoostersRemaining" | "crystals">;
