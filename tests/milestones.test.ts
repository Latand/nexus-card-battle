import { describe, expect, test } from "bun:test";
import {
  MILESTONE_TABLE,
  getMilestonesCrossed,
  pickMilestoneRewards,
  type RandomSource,
} from "../src/features/economy/milestones";
import { cards } from "../src/features/battle/model/cards";
import type { Card, Rarity } from "../src/features/battle/model/types";

describe("MILESTONE_TABLE", () => {
  test("contains the curated levels in PRD order with the right rarities", () => {
    expect(MILESTONE_TABLE).toEqual([
      { level: 1, rarity: "Rare" },
      { level: 3, rarity: "Rare" },
      { level: 5, rarity: "Unique" },
      { level: 10, rarity: "Unique" },
      { level: 15, rarity: "Legend" },
      { level: 20, rarity: "Legend" },
      { level: 25, rarity: "Legend" },
    ]);
  });
});

describe("getMilestonesCrossed", () => {
  test("returns empty when oldLevel === newLevel", () => {
    expect(getMilestonesCrossed(1, 1)).toEqual([]);
    expect(getMilestonesCrossed(7, 7)).toEqual([]);
  });

  test("returns empty when newLevel does not match any milestone (1 -> 2)", () => {
    expect(getMilestonesCrossed(1, 2)).toEqual([]);
  });

  test("crossing from 0 to 1 grants the level-1 Rare milestone", () => {
    expect(getMilestonesCrossed(0, 1)).toEqual([{ level: 1, rarity: "Rare" }]);
  });

  test("crossing from 1 to 5 grants Levels 3 (Rare) and 5 (Unique)", () => {
    expect(getMilestonesCrossed(1, 5)).toEqual([
      { level: 3, rarity: "Rare" },
      { level: 5, rarity: "Unique" },
    ]);
  });

  test("crossing from 2 to 11 grants Levels 3, 5, 10", () => {
    expect(getMilestonesCrossed(2, 11)).toEqual([
      { level: 3, rarity: "Rare" },
      { level: 5, rarity: "Unique" },
      { level: 10, rarity: "Unique" },
    ]);
  });

  test("crossing from 25 to 30 grants the Level-30 Legend tail", () => {
    expect(getMilestonesCrossed(25, 30)).toEqual([{ level: 30, rarity: "Legend" }]);
  });

  test("crossing from 25 to 36 grants Levels 30 and 35 (Legend)", () => {
    expect(getMilestonesCrossed(25, 36)).toEqual([
      { level: 30, rarity: "Legend" },
      { level: 35, rarity: "Legend" },
    ]);
  });

  test("crossing from 24 to 30 grants Level 25 then Level 30 in order", () => {
    expect(getMilestonesCrossed(24, 30)).toEqual([
      { level: 25, rarity: "Legend" },
      { level: 30, rarity: "Legend" },
    ]);
  });

  test("crossing from 26 to 30 grants only Level 30 (no curated milestones at 27-29, no tail at 25 since 25 is not > oldLevel)", () => {
    expect(getMilestonesCrossed(26, 30)).toEqual([{ level: 30, rarity: "Legend" }]);
  });

  test("crossing from 30 to 35 grants only Level 35 (tail does not re-fire at 30)", () => {
    expect(getMilestonesCrossed(30, 35)).toEqual([{ level: 35, rarity: "Legend" }]);
  });
});

describe("pickMilestoneRewards", () => {
  const sampleCard = (id: string, name: string, rarity: Rarity): Card => ({
    id,
    name,
    clan: "Bangers",
    level: 1,
    power: 1,
    damage: 1,
    ability: { id: "a", name: "Ability", description: "", effects: [] },
    bonus: { id: "b", name: "Bonus", description: "", effects: [] },
    artUrl: "",
    frameUrl: "",
    used: false,
    rarity,
    portrait: "",
    accent: "",
    source: {
      sourceId: 0,
      sourceUrl: "",
      collectible: true,
      abilityText: "",
      abilityDescription: "",
      bonusText: "",
      bonusDescription: "",
    },
  });

  // Stub RNG that emits a deterministic sequence.
  function seededRng(values: readonly number[]): RandomSource {
    let index = 0;
    return () => {
      const value = values[index % values.length];
      index += 1;
      return value;
    };
  }

  test("picks a single card deterministically from the rarity bucket", () => {
    const pool: Card[] = [
      sampleCard("rare-a", "Rare A", "Rare"),
      sampleCard("rare-b", "Rare B", "Rare"),
      sampleCard("rare-c", "Rare C", "Rare"),
      sampleCard("u-1", "Unique 1", "Unique"),
    ];
    const result = pickMilestoneRewards([{ level: 1, rarity: "Rare" }], pool, seededRng([0]));
    expect(result).toEqual([{ cardId: "rare-a", cardName: "Rare A", rarity: "Rare" }]);

    const second = pickMilestoneRewards([{ level: 1, rarity: "Rare" }], pool, seededRng([0.5]));
    expect(second).toEqual([{ cardId: "rare-b", cardName: "Rare B", rarity: "Rare" }]);
  });

  test("returns rewards in milestone order with the seeded RNG", () => {
    const pool: Card[] = [
      sampleCard("rare-a", "Rare A", "Rare"),
      sampleCard("rare-b", "Rare B", "Rare"),
      sampleCard("u-1", "Unique 1", "Unique"),
      sampleCard("u-2", "Unique 2", "Unique"),
    ];
    const result = pickMilestoneRewards(
      [
        { level: 3, rarity: "Rare" },
        { level: 5, rarity: "Unique" },
      ],
      pool,
      seededRng([0, 0.99]),
    );
    expect(result).toEqual([
      { cardId: "rare-a", cardName: "Rare A", rarity: "Rare" },
      { cardId: "u-2", cardName: "Unique 2", rarity: "Unique" },
    ]);
  });

  test("throws a clear error when the rarity bucket is empty", () => {
    const pool: Card[] = [sampleCard("rare-a", "Rare A", "Rare")];
    expect(() => pickMilestoneRewards([{ level: 5, rarity: "Unique" }], pool, seededRng([0]))).toThrow(
      /missing rarity \"Unique\"/,
    );
  });

  test("throws when the card pool excludes the milestone rarity (no silent rarity swap)", () => {
    const pool: Card[] = [sampleCard("u-1", "Unique 1", "Unique")];
    expect(() => pickMilestoneRewards([{ level: 15, rarity: "Legend" }], pool, seededRng([0]))).toThrow(
      /missing rarity \"Legend\"/,
    );
  });

  test("works against the real `cards` pool for every rarity present in MILESTONE_TABLE", () => {
    for (const milestone of MILESTONE_TABLE) {
      const result = pickMilestoneRewards([milestone], cards, seededRng([0]));
      expect(result).toHaveLength(1);
      expect(result[0]?.rarity).toBe(milestone.rarity);
    }
  });
});
