import {
  DEFAULT_PLAYER_CRYSTALS,
  DEFAULT_PLAYER_LEVEL,
  DEFAULT_PLAYER_TOTAL_XP,
  type PlayerProfile,
} from "./types";

// Quadratic level curve. The XP required to reach level N from level N-1 is
// LEVEL_XP_BASE * N^2 (so level 2 needs 200 XP, level 3 needs an extra 450,
// level 4 needs an extra 800, ...). Cumulative XP for level N is the sum of
// LEVEL_XP_BASE * k^2 for k = 1..N-1.
export const LEVEL_XP_BASE = 50;

// PvE reward table. PvE matches grant XP only — crystals come exclusively
// from level-up bonuses.
export const PVE_XP_REWARDS = {
  win: 30,
  draw: 15,
  loss: 5,
} as const;

// One-time crystal bonus paid out when a match crosses one or more level
// thresholds. Awarded based on the new level reached.
export const LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL = 25;

export type MatchResultBucket = "win" | "draw" | "loss";

export type MatchInfo =
  | {
      mode: "pve";
      result: MatchResultBucket;
    }
  | {
      mode: "pvp";
      result: MatchResultBucket;
      // Reserved for slice #2 / slice #3 (server-authoritative ELO).
      opponentEloBefore?: number;
    };

export type LevelInfo = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
};

export type ComputedMatchRewardTotals = {
  crystals: number;
  totalXp: number;
  level: number;
};

export type ComputedMatchRewards = {
  deltaXp: number;
  deltaCrystals: number;
  leveledUp: boolean;
  levelUpBonusCrystals: number;
  newTotals: ComputedMatchRewardTotals;
};

/**
 * Pure: returns the player level reached for a given cumulative XP value, plus
 * how much XP has been earned into that level and how much more XP is needed
 * to advance to the next level.
 */
export function computeLevelFromXp(totalXp: number): LevelInfo {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));
  let level = 1;
  let consumed = 0;

  // Walk levels until the next level threshold exceeds the available XP.
  while (true) {
    const xpForNextLevel = LEVEL_XP_BASE * (level + 1) * (level + 1);
    if (consumed + xpForNextLevel > safeTotal) {
      return {
        level,
        xpIntoLevel: safeTotal - consumed,
        xpForNextLevel,
      };
    }
    consumed += xpForNextLevel;
    level += 1;
  }
}

/**
 * Pure: returns the rewards a match should grant to the player. The player's
 * profile is treated as immutable input; the caller is responsible for
 * persisting the returned `newTotals` and per-result counters.
 */
export function computeMatchRewards(
  profileBefore: Pick<PlayerProfile, "crystals" | "totalXp" | "level">,
  matchInfo: MatchInfo,
): ComputedMatchRewards {
  if (matchInfo.mode === "pvp") {
    throw new Error("PvP rewards are not implemented in slice #1; tracked under slice #2.");
  }

  if (matchInfo.mode !== "pve") {
    throw new Error(`Unsupported match mode: ${(matchInfo as { mode: string }).mode}`);
  }

  const xpFromMatch = PVE_XP_REWARDS[matchInfo.result];
  const crystalsBefore = nonNegativeInteger(profileBefore.crystals, DEFAULT_PLAYER_CRYSTALS);
  const totalXpBefore = nonNegativeInteger(profileBefore.totalXp, DEFAULT_PLAYER_TOTAL_XP);
  const levelBefore = positiveInteger(profileBefore.level, DEFAULT_PLAYER_LEVEL);

  const newTotalXp = totalXpBefore + xpFromMatch;
  const newLevelInfo = computeLevelFromXp(newTotalXp);
  const leveledUp = newLevelInfo.level > levelBefore;

  // Spec: when a match crosses one or more level thresholds award a one-time
  // bonus based on the NEW level reached (not per intermediate level).
  const levelUpBonusCrystals = leveledUp ? newLevelInfo.level * LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL : 0;
  const newCrystals = crystalsBefore + levelUpBonusCrystals;

  return {
    deltaXp: xpFromMatch,
    deltaCrystals: levelUpBonusCrystals,
    leveledUp,
    levelUpBonusCrystals,
    newTotals: {
      crystals: newCrystals,
      totalXp: newTotalXp,
      level: newLevelInfo.level,
    },
  };
}

function nonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return fallback;
  return value;
}

function positiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return fallback;
  return value;
}

// Re-exported defaults so callers can build a "fresh profile" snapshot for
// computeMatchRewards in tests without importing types directly.
export const FRESH_PROGRESSION_TOTALS: ComputedMatchRewardTotals = {
  crystals: DEFAULT_PLAYER_CRYSTALS,
  totalXp: DEFAULT_PLAYER_TOTAL_XP,
  level: DEFAULT_PLAYER_LEVEL,
};
