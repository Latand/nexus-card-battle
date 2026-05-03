import { describe, expect, test } from "bun:test";
import {
  LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL,
  PVE_XP_REWARDS,
  PVP_CRYSTAL_REWARDS,
  PVP_XP_REWARDS,
  computeLevelFromXp,
  computeLevelUpBonusForRange,
  computeMatchRewards,
} from "../src/features/player/profile/progression";
import { LEVEL_XP_BASE } from "../src/features/player/profile/types";

// Cumulative XP required to reach the start of level N (so level N exactly,
// xpIntoLevel = 0). Level 1 needs 0 XP. Level N needs sum_{k=2..N} 50 * k^2.
function xpToReachLevel(level: number) {
  let sum = 0;
  for (let k = 2; k <= level; k += 1) sum += LEVEL_XP_BASE * k * k;
  return sum;
}

describe("computeLevelFromXp", () => {
  test("level 1 starts at 0 XP and the next level threshold is 50 * 2^2 = 200", () => {
    const info = computeLevelFromXp(0);
    expect(info.level).toBe(1);
    expect(info.xpIntoLevel).toBe(0);
    expect(info.xpForNextLevel).toBe(LEVEL_XP_BASE * 2 * 2);
    expect(info.xpForNextLevel).toBe(200);
  });

  test("199 XP is still level 1 (one short of the level 2 threshold)", () => {
    const info = computeLevelFromXp(199);
    expect(info.level).toBe(1);
    expect(info.xpIntoLevel).toBe(199);
    expect(info.xpForNextLevel).toBe(200);
  });

  test("200 XP is exactly level 2 (xpIntoLevel resets to 0)", () => {
    const info = computeLevelFromXp(200);
    expect(info.level).toBe(2);
    expect(info.xpIntoLevel).toBe(0);
    // Level 3 needs an extra 50 * 3^2 = 450.
    expect(info.xpForNextLevel).toBe(450);
  });

  test("level 3 boundary lands at the cumulative 200 + 450 = 650 XP", () => {
    expect(xpToReachLevel(3)).toBe(650);

    const justBelow = computeLevelFromXp(649);
    expect(justBelow.level).toBe(2);
    expect(justBelow.xpIntoLevel).toBe(449);
    expect(justBelow.xpForNextLevel).toBe(450);

    const exact = computeLevelFromXp(650);
    expect(exact.level).toBe(3);
    expect(exact.xpIntoLevel).toBe(0);
    // Level 4 needs an extra 50 * 4^2 = 800.
    expect(exact.xpForNextLevel).toBe(800);
  });

  test("level 10 boundary follows the 50 * N^2 sum", () => {
    const cumulative = xpToReachLevel(10);

    // Sanity: 50 * (4 + 9 + 16 + 25 + 36 + 49 + 64 + 81 + 100) = 50 * 384 = 19200.
    expect(cumulative).toBe(19200);

    const justBelow = computeLevelFromXp(cumulative - 1);
    expect(justBelow.level).toBe(9);

    const exact = computeLevelFromXp(cumulative);
    expect(exact.level).toBe(10);
    expect(exact.xpIntoLevel).toBe(0);
    expect(exact.xpForNextLevel).toBe(LEVEL_XP_BASE * 11 * 11);
  });

  test("clamps negative or fractional totals safely to non-negative integers", () => {
    expect(computeLevelFromXp(-50).level).toBe(1);
    expect(computeLevelFromXp(199.9).level).toBe(1);
    expect(computeLevelFromXp(200.9).level).toBe(2);
  });
});

describe("computeMatchRewards (PvE)", () => {
  const freshProfile = { crystals: 0, totalXp: 0, level: 1 };

  test("PvE win awards +30 XP, no crystals, no level-up at zero baseline", () => {
    const rewards = computeMatchRewards(freshProfile, { mode: "pve", result: "win" });

    expect(rewards.deltaXp).toBe(PVE_XP_REWARDS.win);
    expect(rewards.deltaXp).toBe(30);
    expect(rewards.deltaCrystals).toBe(0);
    expect(rewards.leveledUp).toBe(false);
    expect(rewards.levelUpBonusCrystals).toBe(0);
    expect(rewards.newTotals).toEqual({ crystals: 0, totalXp: 30, level: 1 });
  });

  test("PvE draw awards +15 XP", () => {
    const rewards = computeMatchRewards(freshProfile, { mode: "pve", result: "draw" });

    expect(rewards.deltaXp).toBe(15);
    expect(rewards.deltaCrystals).toBe(0);
    expect(rewards.leveledUp).toBe(false);
    expect(rewards.newTotals.totalXp).toBe(15);
    expect(rewards.newTotals.level).toBe(1);
  });

  test("PvE loss awards +5 XP", () => {
    const rewards = computeMatchRewards(freshProfile, { mode: "pve", result: "loss" });

    expect(rewards.deltaXp).toBe(5);
    expect(rewards.deltaCrystals).toBe(0);
    expect(rewards.leveledUp).toBe(false);
    expect(rewards.newTotals.totalXp).toBe(5);
  });

  test("crossing the level 2 threshold awards a one-time level-up bonus of new_level * 25 crystals", () => {
    // Level 2 needs 200 XP. Start at 195 XP and earn a +30 PvE win → 225 → level 2.
    const rewards = computeMatchRewards(
      { crystals: 0, totalXp: 195, level: 1 },
      { mode: "pve", result: "win" },
    );

    expect(rewards.deltaXp).toBe(30);
    expect(rewards.leveledUp).toBe(true);
    expect(rewards.levelUpBonusCrystals).toBe(2 * LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL);
    expect(rewards.levelUpBonusCrystals).toBe(50);
    expect(rewards.deltaCrystals).toBe(50);
    expect(rewards.newTotals).toEqual({ crystals: 50, totalXp: 225, level: 2 });
  });

  test("level-up bonus stacks onto an existing crystal balance", () => {
    const rewards = computeMatchRewards(
      { crystals: 12, totalXp: 195, level: 1 },
      { mode: "pve", result: "win" },
    );

    expect(rewards.leveledUp).toBe(true);
    expect(rewards.levelUpBonusCrystals).toBe(50);
    expect(rewards.newTotals.crystals).toBe(12 + 50);
  });

  test("rejects an unsupported match mode", () => {
    expect(() =>
      computeMatchRewards(freshProfile, { mode: "co-op", result: "win" } as unknown as Parameters<typeof computeMatchRewards>[1]),
    ).toThrow(/Unsupported match mode/);
  });
});

describe("computeMatchRewards (PvP)", () => {
  const freshProfile = { crystals: 0, totalXp: 0, level: 1 };

  test("PvP win awards 10 crystals + 100 XP", () => {
    const rewards = computeMatchRewards(freshProfile, { mode: "pvp", result: "win" });

    expect(rewards.deltaXp).toBe(PVP_XP_REWARDS.win);
    expect(rewards.deltaXp).toBe(100);
    expect(rewards.matchCrystals).toBe(PVP_CRYSTAL_REWARDS.win);
    expect(rewards.matchCrystals).toBe(10);
    expect(rewards.deltaCrystals).toBe(10);
    expect(rewards.leveledUp).toBe(false);
    expect(rewards.levelUpBonusCrystals).toBe(0);
    expect(rewards.newTotals).toEqual({ crystals: 10, totalXp: 100, level: 1 });
  });

  test("PvP draw awards 3 crystals + 50 XP", () => {
    const rewards = computeMatchRewards(freshProfile, { mode: "pvp", result: "draw" });

    expect(rewards.deltaXp).toBe(PVP_XP_REWARDS.draw);
    expect(rewards.deltaXp).toBe(50);
    expect(rewards.matchCrystals).toBe(PVP_CRYSTAL_REWARDS.draw);
    expect(rewards.matchCrystals).toBe(3);
    expect(rewards.deltaCrystals).toBe(3);
    expect(rewards.leveledUp).toBe(false);
    expect(rewards.newTotals).toEqual({ crystals: 3, totalXp: 50, level: 1 });
  });

  test("PvP loss awards 0 crystals + 10 XP", () => {
    const rewards = computeMatchRewards(freshProfile, { mode: "pvp", result: "loss" });

    expect(rewards.deltaXp).toBe(PVP_XP_REWARDS.loss);
    expect(rewards.deltaXp).toBe(10);
    expect(rewards.matchCrystals).toBe(0);
    expect(rewards.deltaCrystals).toBe(0);
    expect(rewards.leveledUp).toBe(false);
    expect(rewards.newTotals).toEqual({ crystals: 0, totalXp: 10, level: 1 });
  });

  test("PvP win that crosses the level 2 threshold stacks the level-up bonus on top of match crystals", () => {
    // Level 2 needs 200 XP. 150 + 100 (PvP win XP) = 250 → level 2.
    const rewards = computeMatchRewards(
      { crystals: 30, totalXp: 150, level: 1 },
      { mode: "pvp", result: "win" },
    );

    expect(rewards.deltaXp).toBe(100);
    expect(rewards.matchCrystals).toBe(10);
    expect(rewards.leveledUp).toBe(true);
    expect(rewards.levelUpBonusCrystals).toBe(2 * LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL);
    expect(rewards.levelUpBonusCrystals).toBe(50);
    expect(rewards.deltaCrystals).toBe(60);
    expect(rewards.newTotals).toEqual({ crystals: 90, totalXp: 250, level: 2 });
  });
});

describe("computeMatchRewards (PvP ELO)", () => {
  test("PvP win against an equal-rated opponent moves player ELO by +16", () => {
    const rewards = computeMatchRewards(
      { crystals: 0, totalXp: 0, level: 1, eloRating: 1000 },
      { mode: "pvp", result: "win", opponentEloBefore: 1000 },
    );

    expect(rewards.deltaElo).toBe(16);
    expect(rewards.newTotals.eloRating).toBe(1016);
  });

  test("PvP loss against an equal-rated opponent moves player ELO by -16", () => {
    const rewards = computeMatchRewards(
      { crystals: 0, totalXp: 0, level: 1, eloRating: 1500 },
      { mode: "pvp", result: "loss", opponentEloBefore: 1500 },
    );

    expect(rewards.deltaElo).toBe(-16);
    expect(rewards.newTotals.eloRating).toBe(1484);
  });

  test("PvP draw against an equal-rated opponent leaves ELO unchanged", () => {
    const rewards = computeMatchRewards(
      { crystals: 0, totalXp: 0, level: 1, eloRating: 1200 },
      { mode: "pvp", result: "draw", opponentEloBefore: 1200 },
    );

    expect(rewards.deltaElo).toBe(0);
    expect(rewards.newTotals.eloRating).toBe(1200);
  });

  test("PvP loss at floor 100 against a 2000 opponent stays at 100 (no underflow)", () => {
    const rewards = computeMatchRewards(
      { crystals: 0, totalXp: 0, level: 1, eloRating: 100 },
      { mode: "pvp", result: "loss", opponentEloBefore: 2000 },
    );

    expect(rewards.newTotals.eloRating).toBe(100);
    expect(rewards.deltaElo).toBe(0);
  });

  test("PvE never produces an ELO delta or ELO total", () => {
    const rewards = computeMatchRewards(
      { crystals: 0, totalXp: 0, level: 1, eloRating: 1234 },
      { mode: "pve", result: "win" },
    );

    expect(rewards.deltaElo).toBeUndefined();
    expect(rewards.newTotals.eloRating).toBeUndefined();
  });

  test("PvP without an opponentEloBefore omits the ELO delta (defensive default for unseeded callers)", () => {
    const rewards = computeMatchRewards(
      { crystals: 0, totalXp: 0, level: 1, eloRating: 1000 },
      { mode: "pvp", result: "win" },
    );

    expect(rewards.deltaElo).toBeUndefined();
    expect(rewards.newTotals.eloRating).toBeUndefined();
  });

  test("missing eloRating on the profile defaults to 1000 before the formula", () => {
    const rewards = computeMatchRewards(
      { crystals: 0, totalXp: 0, level: 1 },
      { mode: "pvp", result: "win", opponentEloBefore: 1000 },
    );

    expect(rewards.deltaElo).toBe(16);
    expect(rewards.newTotals.eloRating).toBe(1016);
  });
});

describe("computeLevelUpBonusForRange", () => {
  test("returns 0 when no levels were crossed", () => {
    expect(computeLevelUpBonusForRange(1, 1)).toBe(0);
    expect(computeLevelUpBonusForRange(5, 5)).toBe(0);
    expect(computeLevelUpBonusForRange(5, 4)).toBe(0);
  });

  test("crossing one level pays new_level * 25", () => {
    expect(computeLevelUpBonusForRange(1, 2)).toBe(2 * LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL);
    expect(computeLevelUpBonusForRange(2, 3)).toBe(3 * LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL);
    expect(computeLevelUpBonusForRange(9, 10)).toBe(10 * LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL);
  });

  test("crossing multiple levels sums level * 25 over each crossed level", () => {
    // 1 -> 3 crosses levels 2 and 3: 50 + 75 = 125.
    expect(computeLevelUpBonusForRange(1, 3)).toBe(125);
    // 1 -> 4 crosses 2, 3, 4: 50 + 75 + 100 = 225.
    expect(computeLevelUpBonusForRange(1, 4)).toBe(225);
  });
});
