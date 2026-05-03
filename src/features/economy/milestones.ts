import type { Card, Rarity } from "@/features/battle/model/types";

export type RandomSource = () => number;

export type MilestoneEntry = {
  level: number;
  rarity: Rarity;
};

export type MilestoneCardReward = {
  cardId: string;
  cardName: string;
  rarity: Rarity;
};

// Curated milestone schedule. Levels not listed here grant nothing on cross,
// except the every-5-after-25 tail handled by `getMilestonesCrossed`.
export const MILESTONE_TABLE: readonly MilestoneEntry[] = [
  { level: 1, rarity: "Rare" },
  { level: 3, rarity: "Rare" },
  { level: 5, rarity: "Unique" },
  { level: 10, rarity: "Unique" },
  { level: 15, rarity: "Legend" },
  { level: 20, rarity: "Legend" },
  { level: 25, rarity: "Legend" },
];

const MILESTONE_TAIL_INTERVAL = 5;
const MILESTONE_TAIL_START = 30;
const MILESTONE_TAIL_RARITY: Rarity = "Legend";

export function getMilestonesCrossed(oldLevel: number, newLevel: number): MilestoneEntry[] {
  const safeOld = Number.isFinite(oldLevel) ? Math.floor(oldLevel) : 0;
  const safeNew = Number.isFinite(newLevel) ? Math.floor(newLevel) : 0;
  if (safeNew <= safeOld) return [];

  const crossed: MilestoneEntry[] = [];

  for (const entry of MILESTONE_TABLE) {
    if (entry.level > safeOld && entry.level <= safeNew) {
      crossed.push(entry);
    }
  }

  // Generate the every-5 Legend tail on the fly: 30, 35, 40, ...
  const firstTail = Math.max(MILESTONE_TAIL_START, ceilToInterval(safeOld + 1, MILESTONE_TAIL_INTERVAL, MILESTONE_TAIL_START));
  for (let level = firstTail; level <= safeNew; level += MILESTONE_TAIL_INTERVAL) {
    crossed.push({ level, rarity: MILESTONE_TAIL_RARITY });
  }

  crossed.sort((a, b) => a.level - b.level);
  return crossed;
}

export function pickMilestoneRewards(
  milestones: readonly MilestoneEntry[],
  cardPool: readonly Card[],
  rng: RandomSource,
): MilestoneCardReward[] {
  const rewards: MilestoneCardReward[] = [];

  for (const milestone of milestones) {
    const bucket = cardPool.filter((card) => card.rarity === milestone.rarity);
    if (bucket.length === 0) {
      throw new Error(`Milestone card pool is missing rarity "${milestone.rarity}" for level ${milestone.level}.`);
    }

    const index = Math.min(Math.floor(normalizeRandom(rng()) * bucket.length), bucket.length - 1);
    const picked = bucket[index];
    rewards.push({ cardId: picked.id, cardName: picked.name, rarity: picked.rarity });
  }

  return rewards;
}

function ceilToInterval(value: number, interval: number, start: number) {
  if (value <= start) return start;
  const offset = value - start;
  const remainder = offset % interval;
  return remainder === 0 ? value : value + (interval - remainder);
}

function normalizeRandom(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1 - Number.EPSILON;
  return value;
}
