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

  // v2 redesign: card add/remove toggle moved into the Card Detail modal.
  await page.getByTestId(`collection-card-${extraOwnedCardId}`).click();
  await expect(page.getByTestId("card-details-shell")).toBeVisible();
  await page.getByTestId("card-details-add-toggle").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("card-details-shell")).toBeHidden();

  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeAttached();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(10);
  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "saved");

  await page.reload();

  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-collection-mode", "owned");
  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeAttached();
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
  // v2 redesign: there is no inline "collection-toggle" anymore; the toggle
  // moved into the Card Detail modal. Asserting that the modal's add toggle
  // is disabled for non-owned cards conveys the same "read-only" semantic.
  await expect(page.getByTestId(`collection-toggle-${nonOwnedCard.id}`)).toHaveCount(0);

  // v2 redesign: open Card Detail modal by clicking the tile (no aria-label
  // "Обрати …" exists in the new tile).
  await page.getByTestId(`collection-card-${nonOwnedCard.id}`).click();
  await expect(page.getByTestId("card-details-shell")).toBeVisible();
  // TODO(v2-redesign): the dedicated `selected-card-readonly-${id}` "Закрито"
  // tag was removed; the modal expresses non-owned by disabling the add
  // toggle button. Assert the disabled button as the equivalent state.
  await expect(page.getByTestId("card-details-add-toggle")).toBeDisabled();
  await page.keyboard.press("Escape");
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

  // v2 redesign: deck toggle moved into Card Detail modal.
  await page.getByTestId(`collection-card-${extraOwnedCardId}`).click();
  await expect(page.getByTestId("card-details-shell")).toBeVisible();
  await page.getByTestId("card-details-add-toggle").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("card-details-shell")).toBeHidden();
  const deckSaveRoute = await deckSaveRoutePromise;

  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeAttached();
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

test("opens an already known booster again for 100 crystals from the collection screen", async ({ page }) => {
  const identity: PlayerIdentity = { mode: "guest", guestId: "guest-paid-booster-e2e" };
  const drawnCards = cards.filter((card) => !PROFILE_OWNED_CARD_IDS.includes(card.id)).slice(0, 5);
  let requestedSource: unknown;

  await mockDeckReadyProfile(page, {
    identity,
    crystals: 100,
    openedBoosterIds: ["neon-breach", "factory-shift"],
    starterFreeBoostersRemaining: 0,
  });

  await page.route("**/api/player/open-booster", async (route) => {
    const body = route.request().postDataJSON() as { source?: unknown; boosterId: string };
    requestedSource = body.source;
    const ownedCards = [
      ...PROFILE_OWNED_CARD_IDS.map((cardId) => ({ cardId, count: 1 })),
      ...drawnCards.map((card) => ({ cardId: card.id, count: 1 })),
    ];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        booster: {
          id: body.boosterId,
          name: "Neon Breach",
          clans: ["[Da:Hack]", "Aliens"],
        },
        cards: drawnCards,
        opening: {
          id: "paid-opening-e2e",
          playerId: "player-paid-booster-e2e",
          boosterId: body.boosterId,
          source: "paid_crystals",
          cardIds: drawnCards.map((card) => card.id),
          openedAt: "2026-05-02T12:00:00.000Z",
        },
        player: {
          id: "player-paid-booster-e2e",
          identity,
          ownedCards,
          deckIds: PROFILE_DECK_IDS,
          starterFreeBoostersRemaining: 0,
          openedBoosterIds: ["neon-breach", "factory-shift"],
          crystals: 0,
          totalXp: 0,
          level: 1,
          wins: 0,
          losses: 0,
          draws: 0,
          eloRating: 1000,
          onboarding: {
            starterBoostersAvailable: false,
            collectionReady: true,
            deckReady: true,
            completed: true,
          },
        },
        crystalCost: 100,
      }),
    });
  });

  await page.goto("/");
  await page.getByTestId("paid-booster-open-neon-breach").click();

  expect(requestedSource).toBe("paid_crystals");
  await expect(page.getByTestId("paid-booster-reveal")).toBeVisible();
  await expect(page.getByTestId("player-hud-sidebar")).toHaveAttribute("data-profile-crystals", "0");
  await expect(page.getByTestId("paid-booster-open-neon-breach")).toBeDisabled();
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
  // v2 redesign: deck toggle moved into Card Detail modal.
  await page.getByTestId(`collection-card-${extraOwnedCardId}`).click();
  await expect(page.getByTestId("card-details-shell")).toBeVisible();
  await page.getByTestId("card-details-add-toggle").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("card-details-shell")).toBeHidden();

  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeAttached();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(10);
  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "saving");
  // v2 redesign: instead of inline `collection-toggle-${id}` blocking, the
  // second card's add toggle in the modal is disabled while a save is in
  // flight. Open it and assert the toggle is disabled.
  await page.getByTestId(`collection-card-${secondExtraOwnedCardId}`).click();
  await expect(page.getByTestId("card-details-shell")).toBeVisible();
  await expect(page.getByTestId("card-details-add-toggle")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect.poll(() => Boolean(releaseSave)).toBe(true);

  releaseSave?.();

  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "error");
  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toHaveCount(0);
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(PROFILE_DECK_IDS.length);
  await expect(page.locator('[data-testid^="deck-card-"]').first()).toBeAttached();
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
