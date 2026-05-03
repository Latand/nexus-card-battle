import { describe, expect, it } from "bun:test";
import {
  DEFAULT_REWARD_AVATAR_URL,
  computeXpProgress,
  resolveRewardAvatarUrl,
  resolveRewardTitle,
  selectVisibleTiles,
} from "../src/features/battle/ui/rewardOverlayPresenter";
import type { RewardSummary } from "../src/features/battle/model/types";

const baseRewards: RewardSummary = {
  matchXp: 0,
  levelProgress: 0,
  cardRewards: [],
  milestoneCardRewards: [],
  deltaXp: 30,
  deltaCrystals: 0,
  leveledUp: false,
  levelUpBonusCrystals: 0,
  newTotals: { crystals: 0, totalXp: 30, level: 1 },
};

describe("selectVisibleTiles", () => {
  it("hides every tile when no rewards have been persisted", () => {
    expect(selectVisibleTiles(undefined)).toEqual({ showCrystals: false, showElo: false, showLevelUp: false, showMilestone: false });
    expect(selectVisibleTiles(null)).toEqual({ showCrystals: false, showElo: false, showLevelUp: false, showMilestone: false });
  });

  it("hides 💎 when deltaCrystals is zero (PvE without level-up)", () => {
    expect(selectVisibleTiles(baseRewards).showCrystals).toBe(false);
  });

  it("shows 💎 only when deltaCrystals > 0 (PvP win or level-up bonus)", () => {
    const pvpWin: RewardSummary = { ...baseRewards, deltaCrystals: 50, newTotals: { ...baseRewards.newTotals, crystals: 50 } };
    expect(selectVisibleTiles(pvpWin).showCrystals).toBe(true);
  });

  it("hides 🏆 when deltaElo is undefined (PvE)", () => {
    expect(selectVisibleTiles(baseRewards).showElo).toBe(false);
  });

  it("shows 🏆 when deltaElo is present, including zero and negative deltas", () => {
    const draw: RewardSummary = { ...baseRewards, deltaElo: 0, newTotals: { ...baseRewards.newTotals, eloRating: 1000 } };
    const loss: RewardSummary = { ...baseRewards, deltaElo: -16, newTotals: { ...baseRewards.newTotals, eloRating: 984 } };
    expect(selectVisibleTiles(draw).showElo).toBe(true);
    expect(selectVisibleTiles(loss).showElo).toBe(true);
  });

  it("shows ⭐ only when leveledUp is true", () => {
    expect(selectVisibleTiles(baseRewards).showLevelUp).toBe(false);
    const leveled: RewardSummary = { ...baseRewards, leveledUp: true, levelUpBonusCrystals: 50, deltaCrystals: 50 };
    expect(selectVisibleTiles(leveled).showLevelUp).toBe(true);
  });

  it("shows the milestone tile only when at least one milestone card was granted", () => {
    expect(selectVisibleTiles(baseRewards).showMilestone).toBe(false);
    const granted: RewardSummary = {
      ...baseRewards,
      milestoneCardRewards: [{ cardId: "rare-1", cardName: "Rare 1", rarity: "Rare" }],
    };
    expect(selectVisibleTiles(granted).showMilestone).toBe(true);
  });

  it("PvE win without level-up hides all three tiles", () => {
    expect(selectVisibleTiles(baseRewards)).toEqual({ showCrystals: false, showElo: false, showLevelUp: false, showMilestone: false });
  });

  it("PvP win with level-up shows all three tiles", () => {
    const pvpWinLevelUp: RewardSummary = {
      ...baseRewards,
      deltaXp: 100,
      deltaCrystals: 100,
      deltaElo: 16,
      leveledUp: true,
      levelUpBonusCrystals: 50,
      newTotals: { crystals: 100, totalXp: 250, level: 2, eloRating: 1016 },
    };
    expect(selectVisibleTiles(pvpWinLevelUp)).toEqual({ showCrystals: true, showElo: true, showLevelUp: true, showMilestone: false });
  });

  it("PvP loss shows only the ELO tile", () => {
    const pvpLoss: RewardSummary = {
      ...baseRewards,
      deltaXp: 10,
      deltaCrystals: 0,
      deltaElo: -16,
      newTotals: { crystals: 0, totalXp: 10, level: 1, eloRating: 984 },
    };
    expect(selectVisibleTiles(pvpLoss)).toEqual({ showCrystals: false, showElo: true, showLevelUp: false, showMilestone: false });
  });
});

describe("resolveRewardTitle", () => {
  it("returns ПЕРЕМОГА with victory tone for a win", () => {
    expect(resolveRewardTitle("player")).toEqual({ text: "ПЕРЕМОГА", tone: "victory" });
  });

  it("returns НІЧИЯ with draw tone for a draw", () => {
    expect(resolveRewardTitle("draw")).toEqual({ text: "НІЧИЯ", tone: "draw" });
  });

  it("returns ПОРАЗКА with defeat tone for a loss", () => {
    expect(resolveRewardTitle("enemy")).toEqual({ text: "ПОРАЗКА", tone: "defeat" });
  });

  it("returns a neutral title when the result is unknown", () => {
    expect(resolveRewardTitle(undefined).tone).toBe("neutral");
  });
});

describe("resolveRewardAvatarUrl", () => {
  it("falls back to the default cyber-brawler asset when nothing is provided", () => {
    expect(resolveRewardAvatarUrl()).toBe(DEFAULT_REWARD_AVATAR_URL);
    expect(resolveRewardAvatarUrl(null, undefined)).toBe(DEFAULT_REWARD_AVATAR_URL);
    expect(resolveRewardAvatarUrl("", "   ")).toBe(DEFAULT_REWARD_AVATAR_URL);
  });

  it("prefers a persisted profile avatarUrl over a live override", () => {
    expect(resolveRewardAvatarUrl("/persisted.png", "/live.png")).toBe("/persisted.png");
  });

  it("falls back to a live override when no persisted url is available", () => {
    expect(resolveRewardAvatarUrl(undefined, "/live.png")).toBe("/live.png");
    expect(resolveRewardAvatarUrl("", "/live.png")).toBe("/live.png");
  });
});

describe("computeXpProgress", () => {
  it("returns zero highlight when no XP was just gained", () => {
    const progress = computeXpProgress(50, 200, 0);
    expect(progress.percent).toBe(25);
    expect(progress.highlightStartPercent).toBe(25);
    expect(progress.highlightEndPercent).toBe(25);
    expect(progress.deltaInLevel).toBe(0);
  });

  it("highlights the just-gained portion ending at the current XP", () => {
    const progress = computeXpProgress(60, 200, 30);
    expect(progress.percent).toBe(30);
    expect(progress.highlightStartPercent).toBe(15);
    expect(progress.highlightEndPercent).toBe(30);
    expect(progress.deltaInLevel).toBe(30);
  });

  it("clamps the highlight when the gain is larger than the XP into this level", () => {
    const progress = computeXpProgress(20, 200, 100);
    expect(progress.percent).toBe(10);
    expect(progress.highlightStartPercent).toBe(0);
    expect(progress.deltaInLevel).toBe(20);
  });

  it("clamps every percent into the [0, 100] range", () => {
    const progress = computeXpProgress(500, 200, 100);
    expect(progress.percent).toBe(100);
    expect(progress.highlightEndPercent).toBe(100);
  });

  it("treats a non-finite xpForNextLevel as 1 to avoid division-by-zero", () => {
    const progress = computeXpProgress(0, Number.NaN, 0);
    expect(progress.xpForNextLevel).toBe(1);
    expect(progress.percent).toBe(0);
  });
});
