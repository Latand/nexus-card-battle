import type { Rarity } from "@/features/battle/model/types";
import type { OwnedCardEntry } from "@/features/inventory/inventoryOps";
import type { PlayerIdentity, PlayerProfile } from "@/features/player/profile/types";

export type CollectionMode = "owned" | "base";
export type RarityFilter = Rarity | "all";
export type SortMode = "rarity" | "power" | "damage" | "name";

export type SellStatus =
  | { kind: "idle" }
  | { kind: "selling" }
  | { kind: "error"; message: string };

export type CollectionDeckScreenProps = {
  collectionIds: string[];
  ownedCards: readonly OwnedCardEntry[];
  deckIds: string[];
  profileStatus: "loading" | "ready" | "unavailable";
  profileIdentityMode?: "telegram" | "guest";
  profileOwnedCardCount: number;
  profileDeckCount: number;
  deckSource: "profile" | "starter-fallback";
  deckSaveStatus: "idle" | "saving" | "saved" | "error";
  deckReadyToPlay: boolean;
  starterFreeBoostersRemaining: number;
  playerIdentity?: PlayerIdentity | null;
  onPlayerUpdated?: (profile: PlayerProfile) => void;
  onDeckChange: (deckIds: string[]) => void;
  onPlay: (deckIds: string[], mode: "ai" | "human") => void;
};

export const RARITY_ORDER: Record<Rarity, number> = {
  Legend: 4,
  Unique: 3,
  Rare: 2,
  Common: 1,
};

export const RARITY_LABELS: Record<Rarity, string> = {
  Common: "COMMON",
  Rare: "RARE",
  Unique: "UNIQ",
  Legend: "LEGEND",
};

export const RARITY_LABELS_LOCAL: Record<Rarity, string> = {
  Common: "Звичайна",
  Rare: "Рідкісна",
  Unique: "Унікальна",
  Legend: "Легендарна",
};

export const GRID_LIMIT = 240;

export const RARITY_FILTERS: { value: RarityFilter; label: string }[] = [
  { value: "all", label: "Усі" },
  { value: "Legend", label: "Легенда" },
  { value: "Unique", label: "Унікальна" },
  { value: "Rare", label: "Рідкісна" },
  { value: "Common", label: "Звичайна" },
];

export const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: "rarity", label: "Рідкість" },
  { value: "power", label: "Сила" },
  { value: "damage", label: "Урон" },
  { value: "name", label: "Назва" },
];

export const COLLECTION_MODES: { value: CollectionMode; label: string }[] = [
  { value: "owned", label: "Мої" },
  { value: "base", label: "Уся база" },
];

export function sellErrorMessage(error: string): string {
  switch (error) {
    case "card_in_deck":
      return "Видали з колоди, щоб продати";
    case "insufficient_stock":
      return "Недостатньо копій для продажу";
    case "invalid_card_id":
      return "Невідома карта";
    case "invalid_sell_count":
      return "Невірна кількість";
    default:
      return "Не вдалося продати";
  }
}
