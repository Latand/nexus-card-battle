import { cards } from "@/features/battle/model/cards";
import { MIN_DECK_SIZE } from "@/features/battle/model/constants";

const RANDOM_FACTION_COUNT = 3;
const RANDOM_CARDS_PER_FACTION = 3;
export const PLAYER_DECK_SIZE = RANDOM_FACTION_COUNT * RANDOM_CARDS_PER_FACTION;

export function createRandomStarterDeckIds() {
  const factions = shuffle(unique(cards.map((card) => card.clan)), "starter-factions").slice(0, RANDOM_FACTION_COUNT);
  const deckIds = factions.flatMap((faction) => {
    const factionCards = cards.filter((card) => card.clan === faction);
    return shuffle(factionCards, `starter-${faction}`)
      .slice(0, RANDOM_CARDS_PER_FACTION)
      .map((card) => card.id);
  });

  if (deckIds.length < MIN_DECK_SIZE) {
    throw new Error(`Random starter deck must contain at least ${MIN_DECK_SIZE} cards.`);
  }

  return deckIds;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function shuffle<T>(items: T[], salt: string) {
  const next = [...items];
  let seed = hashSeed(salt);

  for (let index = next.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
