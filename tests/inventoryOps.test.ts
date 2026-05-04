import { describe, expect, test } from "bun:test";
import {
  addToInventory,
  getOwnedCardIds,
  getOwnedCount,
  getSellableCount,
  removeFromInventory,
  type OwnedCardEntry,
} from "../src/features/inventory/inventoryOps";

const card = (cardId: string, count: number): OwnedCardEntry => ({ cardId, count });

describe("addToInventory", () => {
  test("creates a new entry when the card is not yet owned", () => {
    const next = addToInventory([], "alpha");
    expect(next).toEqual([card("alpha", 1)]);
  });

  test("creates a new entry with the requested count", () => {
    const next = addToInventory([], "alpha", 3);
    expect(next).toEqual([card("alpha", 3)]);
  });

  test("increments the existing entry without reordering", () => {
    const inventory = [card("alpha", 2), card("beta", 1)];
    const next = addToInventory(inventory, "alpha", 4);
    expect(next).toEqual([card("alpha", 6), card("beta", 1)]);
  });

  test("appends new entries after existing ones", () => {
    const inventory = [card("alpha", 1)];
    const next = addToInventory(inventory, "beta", 2);
    expect(next).toEqual([card("alpha", 1), card("beta", 2)]);
  });

  test("returns a copy when count is zero (no-op)", () => {
    const inventory = [card("alpha", 1)];
    const next = addToInventory(inventory, "alpha", 0);
    expect(next).toEqual([card("alpha", 1)]);
    expect(next).not.toBe(inventory);
  });

  test("does not mutate the input inventory", () => {
    const inventory = [card("alpha", 1)];
    addToInventory(inventory, "alpha", 2);
    expect(inventory).toEqual([card("alpha", 1)]);
  });

  test("throws on a negative count", () => {
    expect(() => addToInventory([], "alpha", -1)).toThrow("count must be a non-negative integer.");
  });

  test("throws on a non-integer count", () => {
    expect(() => addToInventory([], "alpha", 1.5)).toThrow("count must be a non-negative integer.");
  });
});

describe("removeFromInventory", () => {
  test("decrements an existing entry", () => {
    const inventory = [card("alpha", 3)];
    const next = removeFromInventory(inventory, "alpha", 1);
    expect(next).toEqual([card("alpha", 2)]);
  });

  test("removes the entry when the full count is removed", () => {
    const inventory = [card("alpha", 2), card("beta", 1)];
    const next = removeFromInventory(inventory, "alpha", 2);
    expect(next).toEqual([card("beta", 1)]);
  });

  test("throws when removing more than is owned", () => {
    const inventory = [card("alpha", 1)];
    expect(() => removeFromInventory(inventory, "alpha", 2)).toThrow("Cannot remove 2 of alpha: only 1 owned.");
  });

  test("throws when removing a card that is not owned", () => {
    expect(() => removeFromInventory([], "alpha", 1)).toThrow("Cannot remove 1 of alpha: only 0 owned.");
  });

  test("returns a copy when count is zero (no-op)", () => {
    const inventory = [card("alpha", 1)];
    const next = removeFromInventory(inventory, "alpha", 0);
    expect(next).toEqual([card("alpha", 1)]);
    expect(next).not.toBe(inventory);
  });

  test("does not mutate the input inventory", () => {
    const inventory = [card("alpha", 2), card("beta", 1)];
    removeFromInventory(inventory, "alpha", 1);
    expect(inventory).toEqual([card("alpha", 2), card("beta", 1)]);
  });

  test("throws on a negative count", () => {
    expect(() => removeFromInventory([card("alpha", 1)], "alpha", -1)).toThrow("count must be a non-negative integer.");
  });
});

describe("getOwnedCount", () => {
  test("returns zero for an empty inventory", () => {
    expect(getOwnedCount([], "alpha")).toBe(0);
  });

  test("returns zero for a card that is not owned", () => {
    expect(getOwnedCount([card("alpha", 2)], "beta")).toBe(0);
  });

  test("returns the count for an owned card", () => {
    expect(getOwnedCount([card("alpha", 2), card("beta", 5)], "beta")).toBe(5);
  });
});

describe("getSellableCount", () => {
  test("returns zero when the card is not owned", () => {
    expect(getSellableCount([], [], "alpha")).toBe(0);
  });

  test("returns the full owned count when the card is not in any deck", () => {
    expect(getSellableCount([card("alpha", 3)], ["beta"], "alpha")).toBe(3);
  });

  test("subtracts one when the card is in the deck (deck-protection branch)", () => {
    expect(getSellableCount([card("alpha", 3)], ["alpha"], "alpha")).toBe(2);
  });

  test("returns zero when the only owned copy is in the deck", () => {
    expect(getSellableCount([card("alpha", 1)], ["alpha"], "alpha")).toBe(0);
  });

  test("never returns a negative number", () => {
    expect(getSellableCount([], ["alpha"], "alpha")).toBe(0);
  });
});

describe("getOwnedCardIds", () => {
  test("returns an empty array for an empty inventory", () => {
    expect(getOwnedCardIds([])).toEqual([]);
  });

  test("returns the card ids for non-zero entries", () => {
    expect(getOwnedCardIds([card("alpha", 1), card("beta", 3)])).toEqual(["alpha", "beta"]);
  });

  test("preserves entry order", () => {
    expect(getOwnedCardIds([card("beta", 1), card("alpha", 1)])).toEqual(["beta", "alpha"]);
  });
});
