import type { Card, Rarity } from "@/features/battle/model/types";

// Single source of truth for the sell economy. Adjusting values here
// also updates server-authoritative payouts and any UI badge that displays
// "за N кристалів" — keep them in sync rather than copy-pasting elsewhere.
export const SELL_PRICES_BY_RARITY: Record<Rarity, number> = {
  Common: 5,
  Rare: 15,
  Unique: 50,
  Legend: 200,
};

export function getSellPrice(rarity: Rarity): number {
  return SELL_PRICES_BY_RARITY[rarity];
}

export function computeSellRevenue(card: Pick<Card, "rarity">, count: number): number {
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    throw new Error(`computeSellRevenue: count must be a non-negative integer, received ${String(count)}.`);
  }

  return count * getSellPrice(card.rarity);
}
