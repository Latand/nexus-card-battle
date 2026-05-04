import { MAX_ENERGY, MAX_HEALTH } from "../constants";
import type { Fighter, FighterAiProfile } from "../types";
import { createBattleHand, createCardCollection, createDeck } from "./decks";

export function makeFighter(
  id: string,
  name: string,
  title: string,
  collectionIds: string[],
  deckIds: string[],
  options: { avatarUrl?: string; aiProfile?: FighterAiProfile } = {},
): Fighter {
  const collection = createCardCollection(id, collectionIds);
  const deck = createDeck(id, collection, deckIds);

  return {
    id,
    name,
    title,
    avatarUrl: options.avatarUrl ?? (id === "player" ? "/nexus-assets/characters/cyber-brawler-thumb.png" : "/nexus-assets/characters/portrait-slot-silhouette.png"),
    aiProfile: options.aiProfile,
    hp: MAX_HEALTH,
    energy: MAX_ENERGY,
    statuses: [],
    collection,
    deck,
    hand: createBattleHand(deck),
    usedCardIds: [],
  };
}

export function refreshBattleHand(fighter: Fighter): Fighter {
  return {
    ...fighter,
    hand: createBattleHand(fighter.deck, fighter.usedCardIds),
  };
}

export function getUsedIds(fighter: Fighter) {
  return fighter.usedCardIds;
}

export function getAvailableCards(fighter: Fighter) {
  return fighter.hand.filter((card) => !card.used && !fighter.usedCardIds.includes(card.id));
}

export function getSelectedCard(fighter: Fighter, selectedId?: string) {
  return fighter.hand.find((card) => card.id === selectedId && !card.used && !fighter.usedCardIds.includes(card.id)) ?? getAvailableCards(fighter)[0];
}

export function spendAndUse(fighter: Fighter, cardId: string, energySpent: number): Fighter {
  return {
    ...fighter,
    energy: Math.max(0, fighter.energy - energySpent),
    usedCardIds: fighter.usedCardIds.includes(cardId) ? fighter.usedCardIds : [...fighter.usedCardIds, cardId],
    hand: fighter.hand.map((card) => (card.id === cardId ? { ...card, used: true } : card)),
  };
}
