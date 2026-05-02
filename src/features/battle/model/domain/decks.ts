import { cards } from "../cards";
import { BATTLE_HAND_SIZE, MIN_DECK_SIZE } from "../constants";
import type { Card, CardCollection, Deck } from "../types";

export function createCardCollection(ownerId: string, cardIds: string[]): CardCollection {
  assertKnownCards(cardIds, "collection");
  assertUniqueCards(cardIds, "collection");

  return {
    ownerId,
    cardIds,
  };
}

export function createDeck(ownerId: string, collection: CardCollection, cardIds: string[]): Deck {
  assertKnownCards(cardIds, "deck");
  assertUniqueCards(cardIds, "deck");

  if (cardIds.length < MIN_DECK_SIZE) {
    throw new Error(`Deck for ${ownerId} must contain at least ${MIN_DECK_SIZE} cards.`);
  }

  const missing = cardIds.filter((cardId) => !collection.cardIds.includes(cardId));
  if (missing.length > 0) {
    throw new Error(`Deck for ${ownerId} contains cards outside collection: ${missing.join(", ")}`);
  }

  return {
    ownerId,
    cardIds,
  };
}

export function createBattleHand(deck: Deck, excludedCardIds: string[] = []) {
  const cardIds = selectBattleCardIds(deck, excludedCardIds);

  return cardIds.map((cardId) => {
    const card = findCard(cardId);
    return { ...card, used: false };
  });
}

export function selectBattleCardIds(deck: Deck, excludedCardIds: string[] = []) {
  const availableCardIds = deck.cardIds.filter((cardId) => !excludedCardIds.includes(cardId));

  if (availableCardIds.length === 0) {
    throw new Error(`Deck for ${deck.ownerId} cannot provide more battle cards.`);
  }

  return shuffle(availableCardIds).slice(0, BATTLE_HAND_SIZE);
}

export function findCard(cardId: string): Card {
  const card = cards.find((item) => item.id === cardId);
  if (!card) throw new Error(`Unknown card id: ${cardId}`);
  return card;
}

function assertKnownCards(cardIds: string[], source: string) {
  const unknown = cardIds.filter((cardId) => !cards.some((item) => item.id === cardId));
  if (unknown.length > 0) {
    throw new Error(`Unknown ${source} card ids: ${unknown.join(", ")}`);
  }
}

function assertUniqueCards(cardIds: string[], source: string) {
  const duplicates = cardIds.filter((cardId, index) => cardIds.indexOf(cardId) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate ${source} card ids: ${[...new Set(duplicates)].join(", ")}`);
  }
}

function shuffle<T>(items: T[]) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function randomIndex(maxExclusive: number) {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    const maxUint32 = 0xffffffff;
    const limit = maxUint32 - (maxUint32 % maxExclusive);

    do {
      cryptoApi.getRandomValues(values);
    } while (values[0] >= limit);

    return values[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}
