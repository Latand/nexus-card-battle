import type { Card } from "@/features/battle/model/types";
import type { PlayerProfile, StoredPlayerProfile } from "@/features/player/profile/types";

export const STARTER_BOOSTER_CARD_COUNT = 5;
export const STARTER_BOOSTER_WEIGHTED_CARD_COUNT = 3;

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
};

export type BoosterOpeningSource = "starter_free";

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
  source: BoosterOpeningSource;
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

export type BoosterOpeningStore = {
  findOrCreateByIdentity(identity: StoredPlayerProfile["identity"]): Promise<StoredPlayerProfile>;
  saveStarterBoosterOpening(input: PersistStarterBoosterOpeningInput): Promise<PersistedStarterBoosterOpening>;
};

export type PlayerBoosterCatalogProfile = Pick<PlayerProfile, "openedBoosterIds" | "starterFreeBoostersRemaining">;
