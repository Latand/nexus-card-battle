import { expect, test } from "@playwright/test";
import { cards, sourceCards } from "../src/features/battle/model/cards";
import { clanList, clans } from "../src/features/battle/model/clans";
import { createCardCollection, createInitialGame, score } from "../src/features/battle/model/game";

test("exports no C.O.R.R. clan, cards, or copy-clan-bonus effects", () => {
  const activeData = JSON.stringify({ cards, clanList, sourceCards });

  expect(clanList.map((clan) => clan.slug)).not.toContain("corr");
  expect(clanList.map((clan) => clan.name)).not.toContain("C.O.R.R.");
  expect(Object.keys(clans)).not.toContain("C.O.R.R.");
  expect(sourceCards.some((card) => card.id.startsWith("corr-") || card.clan === "C.O.R.R.")).toBe(false);
  expect(cards.some((card) => card.id.startsWith("corr-") || card.clan === "C.O.R.R.")).toBe(false);
  expect(activeData).not.toMatch(/C\.O\.R\.R\.|"corr-|copy-clan-bonus|copyClan/);
});

test("default battle data and validation do not keep C.O.R.R. fallbacks", () => {
  const game = createInitialGame();
  const gameplayCards = [...game.player.hand, ...game.enemy.hand];
  const gameplayIds = [
    ...game.player.collection.cardIds,
    ...game.player.deck.cardIds,
    ...game.enemy.collection.cardIds,
    ...game.enemy.deck.cardIds,
    ...gameplayCards.map((card) => card.id),
  ];

  expect(gameplayCards.some((card) => card.id.startsWith("corr-") || card.clan === "C.O.R.R.")).toBe(false);
  expect(gameplayIds.some((cardId) => cardId.startsWith("corr-"))).toBe(false);
  expect(() => createCardCollection("regression", ["corr-1285"])).toThrow(/Unknown collection card ids: corr-1285/);
});

test("all active cards can be scored without copy-clan-bonus support", () => {
  for (const card of cards) {
    expect(() => score(card, 0, true)).not.toThrow();
  }
});
