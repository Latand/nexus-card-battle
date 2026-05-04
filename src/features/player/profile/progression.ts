import {
  DEFAULT_PLAYER_CRYSTALS,
  DEFAULT_PLAYER_ELO_RATING,
  DEFAULT_PLAYER_LEVEL,
  DEFAULT_PLAYER_TOTAL_XP,
  computeLevelFromXp,
  type PlayerProfile,
} from "./types";
import { computeElo } from "./elo";

export { computeLevelFromXp };

export const PVE_XP_REWARDS = {
  win: 30,
  draw: 15,
  loss: 5,
} as const;

export const PVP_XP_REWARDS = {
  win: 100,
  draw: 50,
  loss: 10,
} as const;

export const PVP_CRYSTAL_REWARDS = {
  win: 10,
  draw: 3,
  loss: 0,
} as const;

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
      opponentEloBefore?: number;
    };

export type ComputedMatchRewardTotals = {
  crystals: number;
  totalXp: number;
  level: number;
  eloRating?: number;
};

export type ComputedMatchRewards = {
  deltaXp: number;
  deltaCrystals: number;
  // Crystals NOT attributable to a level-up (PvE = 0).
  matchCrystals: number;
  deltaElo?: number;
  leveledUp: boolean;
  levelUpBonusCrystals: number;
  newTotals: ComputedMatchRewardTotals;
};

/**
 * Returns the rewards a match should grant. The persistence layer recomputes
 * `levelUpBonusCrystals` from authoritative post-write state via
 * `computeLevelUpBonusForRange`; this return value reflects only the caller's
 * pre-call view.
 */
export function computeMatchRewards(
  profileBefore: Pick<PlayerProfile, "crystals" | "totalXp" | "level"> & { eloRating?: number },
  matchInfo: MatchInfo,
): ComputedMatchRewards {
  if (matchInfo.mode !== "pve" && matchInfo.mode !== "pvp") {
    throw new Error(`Unsupported match mode: ${(matchInfo as { mode: string }).mode}`);
  }

  const xpFromMatch = matchInfo.mode === "pvp" ? PVP_XP_REWARDS[matchInfo.result] : PVE_XP_REWARDS[matchInfo.result];
  const matchCrystals = matchInfo.mode === "pvp" ? PVP_CRYSTAL_REWARDS[matchInfo.result] : 0;
  const crystalsBefore = nonNegativeInteger(profileBefore.crystals, DEFAULT_PLAYER_CRYSTALS);
  const totalXpBefore = nonNegativeInteger(profileBefore.totalXp, DEFAULT_PLAYER_TOTAL_XP);
  const levelBefore = positiveInteger(profileBefore.level, DEFAULT_PLAYER_LEVEL);

  const newTotalXp = totalXpBefore + xpFromMatch;
  const newLevelInfo = computeLevelFromXp(newTotalXp);
  const leveledUp = newLevelInfo.level > levelBefore;

  const levelUpBonusCrystals = computeLevelUpBonusForRange(levelBefore, newLevelInfo.level);
  const deltaCrystals = matchCrystals + levelUpBonusCrystals;
  const newCrystals = crystalsBefore + deltaCrystals;

  let deltaElo: number | undefined;
  let eloRating: number | undefined;
  if (matchInfo.mode === "pvp" && typeof matchInfo.opponentEloBefore === "number") {
    const playerElo = sanitizeRating(profileBefore.eloRating, DEFAULT_PLAYER_ELO_RATING);
    const eloOutcome = computeElo({
      playerRating: playerElo,
      opponentRating: matchInfo.opponentEloBefore,
      result: matchInfo.result,
    });
    deltaElo = eloOutcome.delta;
    eloRating = eloOutcome.newRating;
  }

  return {
    deltaXp: xpFromMatch,
    deltaCrystals,
    matchCrystals,
    deltaElo,
    leveledUp,
    levelUpBonusCrystals,
    newTotals: {
      crystals: newCrystals,
      totalXp: newTotalXp,
      level: newLevelInfo.level,
      ...(eloRating !== undefined ? { eloRating } : {}),
    },
  };
}

/**
 * Sums `level * LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL` for every level strictly
 * greater than `oldLevel` and <= `newLevel`. Callable from the persistence
 * layer with authoritative pre/post totals so concurrent writers cannot
 * double-pay the bonus.
 */
export function computeLevelUpBonusForRange(oldLevel: number, newLevel: number): number {
  const safeOld = Math.max(1, Math.floor(oldLevel));
  const safeNew = Math.max(safeOld, Math.floor(newLevel));
  let bonus = 0;
  for (let level = safeOld + 1; level <= safeNew; level += 1) {
    bonus += level * LEVEL_UP_CRYSTAL_BONUS_PER_LEVEL;
  }
  return bonus;
}

function nonNegativeInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return fallback;
  return value;
}

function positiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return fallback;
  return value;
}

function sanitizeRating(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(value);
}
