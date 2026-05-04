import { expect, test } from "@playwright/test";
import { cards, sourceCards } from "../src/features/battle/model/cards";
import { clanList, clans } from "../src/features/battle/model/clans";
import { aiOpponents, createCardCollection, createInitialGame, score } from "../src/features/battle/model/game";
import { fulfillBoosterCatalog, fulfillPlayerProfile, type TestPlayerProfileInput } from "./fixtures/playerProfile";

const GUEST_ID_STORAGE_KEY = "nexus:player-guest-id:v1";

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

test("starter AI opponent uses a softer varied deck", () => {
  const game = createInitialGame({ enemyOpponentId: aiOpponents[0].id });
  const enemyCards = game.enemy.deck.cardIds.map((cardId) => {
    const card = cards.find((item) => item.id === cardId);
    expect(card).toBeTruthy();
    return card!;
  });

  expect(game.enemy.name).toBe(aiOpponents[0].name);
  expect(enemyCards).toHaveLength(12);
  expect(new Set(enemyCards.map((card) => card.id)).size).toBe(12);
  expect(new Set(enemyCards.map((card) => card.clan))).toEqual(new Set(["Metropolis", "Workers", "Toyz"]));
  expect(enemyCards.every((card) => card.rarity === "Common" || card.rarity === "Rare")).toBe(true);
});

test("all active cards can be scored without copy-clan-bonus support", () => {
  for (const card of cards) {
    expect(() => score(card, 0, true)).not.toThrow();
  }
});

test("starter onboarding UI does not render removed C.O.R.R. or copy-clan-bonus content", async ({ page }) => {
  const guestId = "removed-data-ui-e2e";
  const profile: TestPlayerProfileInput = {
    id: "player-removed-data-ui-e2e",
    identity: { mode: "guest", guestId },
    ownedCardIds: [],
    deckIds: [],
    starterFreeBoostersRemaining: 2,
    openedBoosterIds: [],
  };

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: GUEST_ID_STORAGE_KEY, value: guestId },
  );
  await page.route("**/api/player", async (route) => {
    await fulfillPlayerProfile(route, profile);
  });
  await page.route("**/api/boosters", async (route) => {
    await fulfillBoosterCatalog(route, profile);
  });

  await page.goto("/");
  await expect(page.getByTestId("starter-booster-catalog")).toBeVisible();
  await expect(page.locator('[data-testid^="starter-booster-card-"]')).toHaveCount(12);

  await expect(page.locator("body")).not.toContainText(/C\.O\.R\.R\.|copy-clan-bonus/i);
  const bodyHtml = await page.locator("body").evaluate((element) => element.innerHTML);
  expect(bodyHtml).not.toMatch(/C\.O\.R\.R\.|copy-clan-bonus|copyClan/);
});
