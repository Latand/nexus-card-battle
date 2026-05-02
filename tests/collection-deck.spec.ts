import { expect, test, type Route } from "@playwright/test";
import { cards } from "../src/features/battle/model/cards";
import type { PlayerIdentity } from "../src/features/player/profile/types";
import { fulfillPlayerProfile, mockDeckReadyProfile, PROFILE_DECK_IDS, PROFILE_OWNED_CARD_IDS, type TestPlayerProfileInput } from "./fixtures/playerProfile";

const extraOwnedCardId = PROFILE_OWNED_CARD_IDS.find((cardId) => !PROFILE_DECK_IDS.includes(cardId));
const nonOwnedCard = cards.find((card) => !PROFILE_OWNED_CARD_IDS.includes(card.id));
const secondExtraOwnedCardId = cards.find((card) => !PROFILE_OWNED_CARD_IDS.includes(card.id))?.id;
const deckReadyIdentity: PlayerIdentity = {
  mode: "guest",
  guestId: "guest-deck-ready-e2e",
};

test("edits and persists decks from owned cards only", async ({ page }) => {
  if (!extraOwnedCardId) throw new Error("Fixture must include an owned card outside the deck.");

  await mockDeckReadyProfile(page);
  await page.goto("/");

  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-collection-mode", "owned");
  await expect(page.locator('[data-testid^="collection-card-"]')).toHaveCount(PROFILE_OWNED_CARD_IDS.length);
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);

  await page.getByTestId(`collection-toggle-${extraOwnedCardId}`).click({ force: true });

  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(10);
  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "saved");

  await page.reload();

  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-collection-mode", "owned");
  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(10);
});

test("shows full base as read-only reference for non-owned cards", async ({ page }) => {
  if (!nonOwnedCard) throw new Error("Fixture must leave at least one active card unowned.");

  await mockDeckReadyProfile(page);
  await page.goto("/");

  await page.getByTestId("collection-mode-base").click();
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-collection-mode", "base");

  await page.getByTestId("collection-search").fill(nonOwnedCard.name);

  await expect(page.getByTestId(`collection-card-${nonOwnedCard.id}`)).toBeVisible();
  await expect(page.getByTestId(`collection-locked-${nonOwnedCard.id}`)).toBeVisible();
  await expect(page.getByTestId(`collection-toggle-${nonOwnedCard.id}`)).toHaveCount(0);

  await page.getByLabel(`Обрати ${nonOwnedCard.name}`).click();
  await expect(page.getByTestId(`selected-card-readonly-${nonOwnedCard.id}`)).toHaveText("Закрито");
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);
});

test("blocks battle entry while a deck save is pending and rolls back failed saves", async ({ page }) => {
  if (!extraOwnedCardId) throw new Error("Fixture must include an owned card outside the deck.");

  let resolveDeckSaveRoute: (route: Route) => void = () => undefined;
  const deckSaveRoutePromise = new Promise<Route>((resolve) => {
    resolveDeckSaveRoute = resolve;
  });

  await mockDeckReadyProfile(page, {
    onDeckSave(route) {
      resolveDeckSaveRoute(route);
      return false;
    },
  });
  await page.goto("/");

  await page.getByTestId(`collection-toggle-${extraOwnedCardId}`).click({ force: true });
  const deckSaveRoute = await deckSaveRoutePromise;

  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(10);
  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "saving");
  await expect(page.getByTestId("play-selected-deck")).toBeDisabled();
  await expect(page.getByTestId("play-human-match")).toBeDisabled();

  await deckSaveRoute.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({
      error: "profile_unavailable",
      message: "Player profile is unavailable.",
    }),
  });

  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "error");
  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toHaveCount(0);
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);
  await expect(page.getByTestId("play-selected-deck")).toBeEnabled();
  await expect(page.getByTestId("play-human-match")).toBeEnabled();
});

test("loads the full active card base beyond the first grid page", async ({ page }) => {
  await mockDeckReadyProfile(page);
  await page.goto("/");

  await page.getByTestId("collection-mode-base").click();
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-filtered-card-count", String(cards.length));
  await expect(page.locator('[data-testid^="collection-card-"]')).toHaveCount(240);

  while ((await page.locator('[data-testid^="collection-card-"]').count()) < cards.length) {
    await page.getByTestId("collection-load-more").click();
  }

  await expect(page.locator('[data-testid^="collection-card-"]')).toHaveCount(cards.length);
  await expect(page.getByTestId("collection-load-more")).toHaveCount(0);
});

test("blocks overlapping deck edits and rolls a failed save back to the confirmed profile deck", async ({ page }) => {
  if (!extraOwnedCardId || !secondExtraOwnedCardId) throw new Error("Fixture must include two owned cards outside the deck.");

  const profile = createProfile({
    ownedCardIds: [...PROFILE_OWNED_CARD_IDS, secondExtraOwnedCardId],
    deckIds: PROFILE_DECK_IDS,
  });
  let releaseSave: (() => void) | undefined;

  await page.route("**/api/player/deck", async (route) => {
    await new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "invalid_deck",
        message: "test forced deck save failure",
      }),
    });
  });
  await page.route("**/api/player", async (route) => fulfillPlayerProfile(route, profile));
  await page.goto("/");

  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);
  await page.getByTestId(`collection-toggle-${extraOwnedCardId}`).click({ force: true });

  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(10);
  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "saving");
  await expect(page.getByTestId(`collection-toggle-${secondExtraOwnedCardId}`)).toHaveCount(0);
  await expect.poll(() => Boolean(releaseSave)).toBe(true);

  releaseSave?.();

  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "error");
  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toHaveCount(0);
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(PROFILE_DECK_IDS.length);
  await expect(page.locator('[data-testid^="deck-card-"]').first()).toBeVisible();
});

function createProfile(overrides: Partial<TestPlayerProfileInput> = {}): TestPlayerProfileInput {
  return {
    id: "player-deck-ready-e2e",
    identity: deckReadyIdentity,
    ownedCardIds: PROFILE_OWNED_CARD_IDS,
    deckIds: PROFILE_DECK_IDS,
    starterFreeBoostersRemaining: 0,
    openedBoosterIds: ["neon-breach", "factory-shift"],
    ...overrides,
  };
}
