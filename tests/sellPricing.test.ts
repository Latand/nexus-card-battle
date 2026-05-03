import { describe, expect, test } from "bun:test";
import {
  SELL_PRICES_BY_RARITY,
  computeSellRevenue,
  getSellPrice,
} from "../src/features/economy/sellPricing";
import type { Card } from "../src/features/battle/model/types";

describe("SELL_PRICES_BY_RARITY", () => {
  test("exposes the canonical 5 / 15 / 50 / 200 ladder for the four rarities", () => {
    expect(SELL_PRICES_BY_RARITY).toEqual({
      Common: 5,
      Rare: 15,
      Unique: 50,
      Legend: 200,
    });
  });
});

describe("getSellPrice", () => {
  test("returns the per-rarity unit price", () => {
    expect(getSellPrice("Common")).toBe(5);
    expect(getSellPrice("Rare")).toBe(15);
    expect(getSellPrice("Unique")).toBe(50);
    expect(getSellPrice("Legend")).toBe(200);
  });
});

describe("computeSellRevenue", () => {
  const sampleCard = (rarity: Card["rarity"]): Pick<Card, "rarity"> => ({ rarity });

  test("scales the per-rarity unit price linearly by count", () => {
    expect(computeSellRevenue(sampleCard("Common"), 1)).toBe(5);
    expect(computeSellRevenue(sampleCard("Common"), 4)).toBe(20);
    expect(computeSellRevenue(sampleCard("Rare"), 3)).toBe(45);
    expect(computeSellRevenue(sampleCard("Unique"), 2)).toBe(100);
    expect(computeSellRevenue(sampleCard("Legend"), 1)).toBe(200);
    expect(computeSellRevenue(sampleCard("Legend"), 5)).toBe(1000);
  });

  test("count = 0 is a no-op revenue of 0 and does not throw", () => {
    expect(computeSellRevenue(sampleCard("Legend"), 0)).toBe(0);
  });

  test("rejects negative, fractional, NaN, Infinity, and non-numeric counts", () => {
    expect(() => computeSellRevenue(sampleCard("Common"), -1)).toThrow(/non-negative integer/);
    expect(() => computeSellRevenue(sampleCard("Common"), 1.5)).toThrow(/non-negative integer/);
    expect(() => computeSellRevenue(sampleCard("Common"), Number.NaN)).toThrow(/non-negative integer/);
    expect(() => computeSellRevenue(sampleCard("Common"), Number.POSITIVE_INFINITY)).toThrow(/non-negative integer/);
    expect(() => computeSellRevenue(sampleCard("Common"), "2" as unknown as number)).toThrow(/non-negative integer/);
  });
});
