import { cards as activeCards } from "@/features/battle/model/cards";
import type { Card, Rarity } from "@/features/battle/model/types";
import type { PlayerProfile } from "@/features/player/profile/types";
import { getBoosterById, serializeBooster } from "./catalog";
import { PAID_BOOSTER_CRYSTAL_COST, STARTER_BOOSTER_CARD_COUNT, type PreparedPaidBoosterOpening, type PreparedStarterBoosterOpening } from "./types";

export type RandomSource = () => number;

const REQUIRED_STARTER_RARITIES: Rarity[] = ["Legend", "Unique"];
const REQUIRED_PAID_RARITIES: Rarity[] = ["Unique"];
const WEIGHTED_STARTER_RARITIES: { rarity: Rarity; weight: number }[] = [
  { rarity: "Common", weight: 72 },
  { rarity: "Rare", weight: 23 },
  { rarity: "Unique", weight: 4 },
  { rarity: "Legend", weight: 1 },
];
const FALLBACK_RARITY_ORDER: Rarity[] = ["Common", "Rare", "Unique", "Legend"];

export class BoosterOpeningError extends Error {
  constructor(
    readonly code:
      | "invalid_booster_id"
      | "starter_booster_unavailable"
      | "starter_booster_already_opened"
      | "insufficient_crystals"
      | "booster_required_rarity_unavailable"
      | "booster_pool_exhausted"
      | "invalid_booster_opening",
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "BoosterOpeningError";
  }
}

export function prepareStarterBoosterOpening(input: {
  boosterId: string;
  player: Pick<PlayerProfile, "ownedCards" | "openedBoosterIds" | "starterFreeBoostersRemaining">;
  rng?: RandomSource;
  cardPool?: readonly Card[];
}): PreparedStarterBoosterOpening {
  const booster = getBoosterById(input.boosterId);

  if (!booster) {
    throw new BoosterOpeningError("invalid_booster_id", "Booster does not exist.", 404);
  }

  if (input.player.starterFreeBoostersRemaining <= 0) {
    throw new BoosterOpeningError("starter_booster_unavailable", "No free starter boosters remain.", 409);
  }

  if (input.player.openedBoosterIds.includes(booster.id)) {
    throw new BoosterOpeningError("starter_booster_already_opened", "Starter boosters must be different.", 409);
  }

  const openedCards = prepareBoosterOpeningCards({
    clans: booster.clans,
    requiredRarities: REQUIRED_STARTER_RARITIES,
    requireLegend: true,
    rng: input.rng,
    cardPool: input.cardPool,
  });

  return {
    booster: serializeBooster(booster),
    cards: openedCards,
    cardIds: openedCards.map((card) => card.id),
    source: "starter_free",
  };
}

export function preparePaidBoosterOpening(input: {
  boosterId: string;
  player: Pick<PlayerProfile, "crystals">;
  rng?: RandomSource;
  cardPool?: readonly Card[];
}): PreparedPaidBoosterOpening {
  const booster = getBoosterById(input.boosterId);

  if (!booster) {
    throw new BoosterOpeningError("invalid_booster_id", "Booster does not exist.", 404);
  }

  if (input.player.crystals < PAID_BOOSTER_CRYSTAL_COST) {
    throw new BoosterOpeningError("insufficient_crystals", "Not enough crystals to open this booster.", 409);
  }

  const openedCards = prepareBoosterOpeningCards({
    clans: booster.clans,
    requiredRarities: REQUIRED_PAID_RARITIES,
    requireLegend: false,
    rng: input.rng,
    cardPool: input.cardPool,
  });

  return {
    booster: serializeBooster(booster),
    cards: openedCards,
    cardIds: openedCards.map((card) => card.id),
    source: "paid_crystals",
    crystalCost: PAID_BOOSTER_CRYSTAL_COST,
  };
}

export function chooseStarterWeightedRarity(rng: RandomSource): Rarity {
  const roll = normalizeRandom(rng()) * 100;
  let cumulative = 0;

  for (const item of WEIGHTED_STARTER_RARITIES) {
    cumulative += item.weight;
    if (roll < cumulative) return item.rarity;
  }

  return "Legend";
}

function prepareBoosterOpeningCards(input: {
  clans: readonly [string, string];
  requiredRarities: readonly Rarity[];
  requireLegend: boolean;
  rng?: RandomSource;
  cardPool?: readonly Card[];
}) {
  const rng = input.rng ?? Math.random;
  const cardPool = input.cardPool ?? activeCards;
  // Within-pull duplicate prevention only — cross-pull duplicates are allowed
  // and increment the multiset count instead.
  const openedCards: Card[] = [];
  const candidatePool = createBoosterCardPool(input.clans, cardPool);

  for (const rarity of input.requiredRarities) {
    openedCards.push(pickRequiredRarityCard(candidatePool, rarity, openedCards, rng));
  }

  const weightedCardCount = STARTER_BOOSTER_CARD_COUNT - input.requiredRarities.length;
  for (let index = 0; index < weightedCardCount; index += 1) {
    openedCards.push(pickWeightedRarityCard(candidatePool, chooseStarterWeightedRarity(rng), openedCards, rng));
  }

  validateOpeningCards(openedCards, input.clans, cardPool, { requireLegend: input.requireLegend });
  return openedCards;
}

function createBoosterCardPool(clans: readonly [string, string], cardPool: readonly Card[]) {
  const clanSet = new Set<string>(clans);
  const seen = new Set<string>();

  return cardPool.filter((card) => {
    if (!clanSet.has(card.clan)) return false;
    if (card.clan === "C.O.R.R." || card.id.startsWith("corr-")) return false;
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

function pickRequiredRarityCard(pool: readonly Card[], rarity: Rarity, openedCards: readonly Card[], rng: RandomSource) {
  const bucket = availableCards(pool, openedCards).filter((card) => card.rarity === rarity);

  if (bucket.length === 0) {
    throw new BoosterOpeningError("booster_required_rarity_unavailable", `No available ${rarity} cards remain for this booster.`, 409);
  }

  return pickRandomCard(bucket, rng);
}

function pickWeightedRarityCard(pool: readonly Card[], rarity: Rarity, openedCards: readonly Card[], rng: RandomSource) {
  const candidates = availableCards(pool, openedCards);

  if (candidates.length === 0) {
    throw new BoosterOpeningError("booster_pool_exhausted", "No available cards remain for this booster.", 409);
  }

  const preferredBucket = candidates.filter((card) => card.rarity === rarity);
  if (preferredBucket.length > 0) return pickRandomCard(preferredBucket, rng);

  for (const fallbackRarity of FALLBACK_RARITY_ORDER) {
    const fallbackBucket = candidates.filter((card) => card.rarity === fallbackRarity);
    if (fallbackBucket.length > 0) return pickRandomCard(fallbackBucket, rng);
  }

  throw new BoosterOpeningError("booster_pool_exhausted", "No available cards remain for this booster.", 409);
}

function availableCards(pool: readonly Card[], openedCards: readonly Card[]) {
  const openedCardIds = new Set(openedCards.map((card) => card.id));
  return pool.filter((card) => !openedCardIds.has(card.id));
}

function pickRandomCard(cards: readonly Card[], rng: RandomSource) {
  const index = Math.min(Math.floor(normalizeRandom(rng()) * cards.length), cards.length - 1);
  return cards[index];
}

function normalizeRandom(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1 - Number.EPSILON;
  return value;
}

function validateOpeningCards(
  openedCards: readonly Card[],
  clans: readonly [string, string],
  cardPool: readonly Card[],
  options: { requireLegend: boolean },
) {
  if (openedCards.length !== STARTER_BOOSTER_CARD_COUNT) {
    throw new BoosterOpeningError("invalid_booster_opening", "Starter booster opening must contain five cards.", 500);
  }

  const activeCardIds = new Set(cardPool.map((card) => card.id));
  const clanSet = new Set<string>(clans);
  const openedCardIds = new Set<string>();
  let hasLegend = false;
  let hasUnique = false;

  for (const card of openedCards) {
    if (openedCardIds.has(card.id)) {
      throw new BoosterOpeningError("invalid_booster_opening", "Booster opening contains a duplicate card.", 500);
    }

    if (!activeCardIds.has(card.id) || !clanSet.has(card.clan)) {
      throw new BoosterOpeningError("invalid_booster_opening", "Booster opening contains a card outside the booster pool.", 500);
    }

    if (card.clan === "C.O.R.R." || card.id.startsWith("corr-")) {
      throw new BoosterOpeningError("invalid_booster_opening", "Booster opening contains a removed clan card.", 500);
    }

    openedCardIds.add(card.id);
    hasLegend ||= card.rarity === "Legend";
    hasUnique ||= card.rarity === "Unique";
  }

  if (!hasUnique || (options.requireLegend && !hasLegend)) {
    throw new BoosterOpeningError("invalid_booster_opening", "Booster opening does not satisfy its guaranteed rarity rules.", 500);
  }
}
