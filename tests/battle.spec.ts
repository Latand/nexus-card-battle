import { expect, test, type Page } from "@playwright/test";
import { cards } from "../src/features/battle/model/cards";
import { mockDeckReadyProfile } from "./fixtures/playerProfile";

const DECK_SESSION_STORAGE_KEY = "nexus:deck-session:v1";
const PROFILE_ONLY_DECK_IDS = cards
  .filter((card) => card.clan === "Workers")
  .slice(0, 9)
  .map((card) => card.id);
const PROFILE_ONLY_OWNED_CARD_IDS = [
  ...PROFILE_ONLY_DECK_IDS,
  cards.find((card) => card.clan === "Workers" && !PROFILE_ONLY_DECK_IDS.includes(card.id))?.id,
].filter((cardId): cardId is string => Boolean(cardId));

test("keeps the minimum deck locked", async ({ page }) => {
  await mockDeckReadyProfile(page);
  await page.goto("/");

  const deckCards = page.locator('[data-testid^="deck-card-"]');
  await expect(deckCards).toHaveCount(9);
  await expect.poll(async () => page.locator('[data-testid^="collection-card-"]').count()).toBeGreaterThan(9);

  const firstCardId = await deckCards.first().getAttribute("data-testid").then((testId) => testId?.replace("deck-card-", ""));
  expect(firstCardId).toBeTruthy();

  await expect(page.getByTestId(`deck-remove-${firstCardId}`)).toBeDisabled();
});

test("keeps starter-fallback decks visible but unavailable for AI and PvP", async ({ page }) => {
  await mockDeckReadyProfile(page, {
    ownedCardIds: PROFILE_ONLY_OWNED_CARD_IDS,
    deckIds: [],
    starterFreeBoostersRemaining: 0,
    openedBoosterIds: ["neon-breach", "factory-shift"],
  });

  await page.goto("/");

  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-deck-source", "starter-fallback");
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);
  await expect(page.getByTestId("play-selected-deck")).toBeDisabled();
  await expect(page.getByTestId("play-human-match")).toBeDisabled();
  await expect(page.getByTestId("round-status")).toHaveCount(0);
});

test("ignores legacy deck session storage without deleting it", async ({ page }) => {
  await mockDeckReadyProfile(page);
  const legacyDeckIds = [
    "dahack-1645",
    "dahack-110",
    "dahack-820",
    "dahack-167",
    "dahack-1727",
    "dahack-795",
    "dahack-1383",
    "dahack-658",
    "dahack-108",
    "dahack-363",
  ];
  await page.addInitScript(
    ({ storageKey, deckIds }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(deckIds));
    },
    { storageKey: DECK_SESSION_STORAGE_KEY, deckIds: legacyDeckIds },
  );

  await page.goto("/");

  const deckCards = page.locator('[data-testid^="deck-card-"]');
  await expect(deckCards).toHaveCount(9);
  await expect.poll(() => readSavedDeckIds(page)).toEqual(legacyDeckIds);
});

test("starts AI battles from the saved owned profile deck", async ({ page }) => {
  const legacyDeckIds = cards
    .filter((card) => card.clan === "Toyz")
    .slice(0, 9)
    .map((card) => card.id);

  await mockDeckReadyProfile(page, {
    ownedCardIds: PROFILE_ONLY_OWNED_CARD_IDS,
    deckIds: PROFILE_ONLY_DECK_IDS,
  });
  await page.addInitScript(
    ({ storageKey, deckIds }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(deckIds));
      window.localStorage.setItem("nexus_deck_v1", JSON.stringify(deckIds));
    },
    { storageKey: DECK_SESSION_STORAGE_KEY, deckIds: legacyDeckIds },
  );

  await page.goto("/");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-deck-source", "profile");
  await page.getByTestId("play-selected-deck").click();

  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });
  await expectPlayerHandToUseDeck(page, PROFILE_ONLY_DECK_IDS);
  await expect.poll(() => readSavedDeckIds(page)).toEqual(legacyDeckIds);
});

test("returns from an active battle to the collection deck screen", async ({ page }) => {
  await mockDeckReadyProfile(page);
  await page.goto("/");

  await expect(page.getByTestId("collection-search")).toBeVisible();
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("battle-arena")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("battle-hud-open-decks").click();

  await expect(page).not.toHaveURL(/screen=battle/);
  await expect(page.getByTestId("collection-search")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);
});

test("plays a complete state-machine battle", async ({ page }) => {
  await mockDeckReadyProfile(page);
  await page.goto("/");

  await expect(page.getByTestId("collection-search")).toBeVisible();
  await expect.poll(async () => page.locator('[data-testid^="collection-card-"]').count()).toBeGreaterThan(9);
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);
  await page.getByTestId("play-selected-deck").click();

  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("turn-timer")).toBeVisible();
  await expect(page.getByTestId("round-marker")).toContainText("1");
  await expect(page.locator('[data-testid^="player-card-"]')).toHaveCount(4);
  await expect(page.locator('[data-testid^="enemy-card-"]')).toHaveCount(4);

  await playFirstAvailableCard(page, 2, { knownEnemyCard: false });

  let knownEnemyCard = true;
  for (let round = 2; round <= 4; round += 1) {
    await expect
      .poll(
        async () => {
          if (await page.getByTestId("reward-summary").isVisible().catch(() => false)) return "reward";
          if ((await countEnabledPlayerCards(page)) > 0) return "card";
          return "waiting";
        },
        { timeout: 30_000 },
      )
      .not.toBe("waiting");

    if (await page.getByTestId("reward-summary").isVisible().catch(() => false)) break;

    await playFirstAvailableCard(page, 0, { knownEnemyCard });
    knownEnemyCard = !knownEnemyCard;
  }

  await expect(page.getByTestId("reward-summary")).toBeVisible({ timeout: 60_000 });

  const replayAiButton = page.getByTestId("reward-replay-ai");
  await expect(replayAiButton).toHaveAttribute("data-mode", "ai");
  await expect(replayAiButton).toContainText("AI");
  await expect(page.getByTestId("reward-replay-human")).toBeVisible();
  await replayAiButton.click();
  await expect(page.getByTestId("phase-overlay")).toHaveAttribute("data-phase", "match_intro");
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-testid^="player-card-"]')).toHaveCount(4);
  await expect(page.locator('[data-testid^="enemy-card-"]')).toHaveCount(4);
});

async function playFirstAvailableCard(page: Page, extraEnergyClicks: number, options: { knownEnemyCard: boolean }) {
  await expect(page.getByTestId("phase-overlay")).toBeHidden({ timeout: 12_000 });
  await expect.poll(async () => countEnabledPlayerCards(page), { timeout: 12_000 }).toBeGreaterThan(0);

  const cardButton = await getFirstEnabledPlayerCard(page);
  await cardButton.scrollIntoViewIfNeeded();
  await cardButton.click();

  await expect(page.getByTestId("selection-overlay")).toBeVisible();
  await expect(page.getByTestId("selection-energy")).toHaveText("1");
  if (options.knownEnemyCard) {
    await expect(page.getByTestId("known-enemy-card")).toBeVisible();
  } else {
    await expect(page.getByTestId("enemy-card-hidden")).toBeVisible();
  }

  for (let index = 0; index < extraEnergyClicks; index += 1) {
    await page.getByTestId("energy-plus").click();
  }
  await expect(page.getByTestId("selection-energy")).toHaveText(`${extraEnergyClicks + 1}`);

  await page.getByTestId("selection-ok").click();
  if (options.knownEnemyCard) {
    await expect(page.getByTestId("battle-overlay")).toHaveAttribute("data-phase", "battle_intro", { timeout: 5_000 });
  } else {
    await expect(page.getByTestId("phase-overlay")).toBeHidden();
    await expect(page.getByTestId("opponent-thinking")).toBeVisible();
    await expect(page.locator('[data-owner="enemy"] [data-played="true"]')).toHaveCount(1);
  }
  await expect(page.getByTestId("battle-overlay")).toHaveAttribute("data-phase", "battle_intro", { timeout: 8_000 });
  await expect.poll(async () => page.getByTestId("duel-exchange-projectile").count()).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => page.getByTestId("duel-exchange-projectile").count()).toBeLessThanOrEqual(4);
  await expect
    .poll(
      async () => {
        const overlay = page.getByTestId("battle-overlay");
        if (!(await overlay.isVisible().catch(() => false))) return "hidden";
        return (await overlay.getAttribute("data-phase")) ?? "missing";
      },
      { timeout: 24_000 },
    )
    .toMatch(/^(damage_apply|hidden)$/);
  await expect(page.getByTestId("battle-overlay")).toBeHidden({ timeout: 24_000 });
}

async function getFirstEnabledPlayerCard(page: Page) {
  const cardButtons = page.locator('[data-testid^="player-card-"]');
  const count = await cardButtons.count();

  for (let index = 0; index < count; index += 1) {
    const cardButton = cardButtons.nth(index);
    if (await cardButton.isEnabled()) return cardButton;
  }

  throw new Error("No enabled player cards found.");
}

async function countEnabledPlayerCards(page: Page) {
  const cardButtons = page.locator('[data-testid^="player-card-"]');
  const count = await cardButtons.count();
  let enabled = 0;

  for (let index = 0; index < count; index += 1) {
    if (await cardButtons.nth(index).isEnabled()) enabled += 1;
  }

  return enabled;
}

async function readSavedDeckIds(page: Page) {
  return page.evaluate((storageKey) => {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }, DECK_SESSION_STORAGE_KEY);
}

async function expectPlayerHandToUseDeck(page: Page, deckIds: string[]) {
  const playerCards = page.locator('[data-testid^="player-card-"]');
  await expect(playerCards).toHaveCount(4);

  const handIds = await playerCards.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-testid")?.replace("player-card-", "")),
  );

  expect(handIds).toHaveLength(4);
  expect(handIds.every((cardId) => Boolean(cardId) && deckIds.includes(cardId))).toBe(true);
}
