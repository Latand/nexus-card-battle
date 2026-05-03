import type { MatchResult, RewardSummary } from "../model/types";

export type RewardVisibleTiles = {
  showCrystals: boolean;
  showElo: boolean;
  showLevelUp: boolean;
};

export type RewardTitle = {
  text: string;
  tone: "victory" | "draw" | "defeat" | "neutral";
};

export const DEFAULT_REWARD_AVATAR_URL = "/nexus-assets/characters/cyber-brawler-thumb.png";

/**
 * Drives which stat tiles render. Data-driven (no per-mode UI gates) so the
 * overlay stays honest: PvE matches naturally hide 💎 + 🏆 because their
 * deltas aren't present.
 */
export function selectVisibleTiles(rewards?: RewardSummary | null): RewardVisibleTiles {
  if (!rewards) {
    return { showCrystals: false, showElo: false, showLevelUp: false };
  }

  const showCrystals = (rewards.deltaCrystals ?? 0) > 0;
  const showElo = typeof rewards.deltaElo === "number";
  const showLevelUp = Boolean(rewards.leveledUp);

  return { showCrystals, showElo, showLevelUp };
}

export function resolveRewardTitle(result: MatchResult | undefined): RewardTitle {
  if (result === "player") return { text: "ПЕРЕМОГА", tone: "victory" };
  if (result === "draw") return { text: "НІЧИЯ", tone: "draw" };
  if (result === "enemy") return { text: "ПОРАЗКА", tone: "defeat" };
  return { text: "Бій завершено", tone: "neutral" };
}

/**
 * Avatar resolution seam shared with the player HUD work. Persisted profile
 * avatar wins over a live override; a missing override falls back to the
 * default character art.
 */
export function resolveRewardAvatarUrl(persistedAvatarUrl?: string | null, liveAvatarUrl?: string | null): string {
  const persisted = sanitizeAvatar(persistedAvatarUrl);
  if (persisted) return persisted;
  const live = sanitizeAvatar(liveAvatarUrl);
  if (live) return live;
  return DEFAULT_REWARD_AVATAR_URL;
}

export type XpProgress = {
  percent: number;
  highlightStartPercent: number;
  highlightEndPercent: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  deltaInLevel: number;
};

/**
 * Splits the XP-to-next-level bar into a base fill and a highlighted segment
 * representing the XP just gained from this match. When the gain crosses the
 * level boundary (leveledUp), the highlight covers the post-level-up portion
 * accumulated so far.
 */
export function computeXpProgress(
  xpIntoLevel: number,
  xpForNextLevel: number,
  deltaXp: number,
): XpProgress {
  const safeForNext = Math.max(1, sanitizeInteger(xpForNextLevel, 1));
  const safeInto = clamp(sanitizeInteger(xpIntoLevel, 0), 0, safeForNext);
  const safeDelta = Math.max(0, sanitizeInteger(deltaXp, 0));
  const deltaInLevel = Math.min(safeInto, safeDelta);
  const baseInto = safeInto - deltaInLevel;
  const percent = (safeInto / safeForNext) * 100;
  const highlightStartPercent = (baseInto / safeForNext) * 100;
  const highlightEndPercent = percent;

  return {
    percent: clamp(percent, 0, 100),
    highlightStartPercent: clamp(highlightStartPercent, 0, 100),
    highlightEndPercent: clamp(highlightEndPercent, 0, 100),
    xpIntoLevel: safeInto,
    xpForNextLevel: safeForNext,
    deltaInLevel,
  };
}

function sanitizeAvatar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function sanitizeInteger(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.floor(value);
}
