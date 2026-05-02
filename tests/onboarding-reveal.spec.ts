import { expect, test, type Route } from "@playwright/test";
import { cards } from "../src/features/battle/model/cards";
import type { Card } from "../src/features/battle/model/types";
import type { PlayerIdentity } from "../src/features/player/profile/types";
import { fulfillBoosterCatalog, fulfillPlayerProfile, type TestPlayerProfileInput } from "./fixtures/playerProfile";

const GUEST_ID_STORAGE_KEY = "nexus:player-guest-id:v1";
const identity: PlayerIdentity = {
  mode: "guest",
  guestId: "starter-reveal-e2e",
};
const neonClans = new Set(["[Da:Hack]", "Aliens"]);
const openedCards = cards.filter((card) => neonClans.has(card.clan)).slice(0, 5);

test("opens the first starter booster, reveals saved cards, and reloads into the second-booster state", async ({ page }) => {
  expect(openedCards).toHaveLength(5);

  let profile = createProfile();
  let catalogRequestCount = 0;
  let openRequestCount = 0;
  let resolveOpenRoute: (route: Route) => void = () => undefined;
  const openRoutePromise = new Promise<Route>((resolve) => {
    resolveOpenRoute = resolve;
  });

  await page.addInitScript(
    ({ key, guestId }) => {
      window.localStorage.setItem(key, guestId);
    },
    { key: GUEST_ID_STORAGE_KEY, guestId: identity.guestId },
  );
  await page.route("**/api/player", async (route) => {
    await fulfillPlayerProfile(route, profile);
  });
  await page.route("**/api/boosters", async (route) => {
    const catalogBody = route.request().postDataJSON() as { identity: PlayerIdentity };
    catalogRequestCount += 1;
    expect(catalogBody.identity).toEqual(identity);
    await fulfillBoosterCatalog(route, profile);
  });
  await page.route("**/api/player/open-booster", async (route) => {
    openRequestCount += 1;
    resolveOpenRoute(route);
  });

  await page.goto("/");

  const shell = page.getByTestId("starter-onboarding-shell");
  await expect(shell).toBeVisible();
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-owned-card-count", "0");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-starter-free-boosters-remaining", "2");
  await expect(shell).toHaveAttribute("data-opened-booster-count", "0");
  await expect(shell).toHaveAttribute("data-catalog-status", "ready");
  await expect(page.locator('[data-testid^="starter-booster-card-"]')).toHaveCount(12);
  await expect(page.getByTestId("collection-search")).toHaveCount(0);

  await page.getByTestId("starter-booster-open-neon-breach").click();
  const openRoute = await openRoutePromise;
  const openBody = openRoute.request().postDataJSON() as { identity: PlayerIdentity; boosterId: string };

  expect(openRequestCount).toBe(1);
  expect(openBody).toEqual({ identity, boosterId: "neon-breach" });
  await expect(shell).toHaveAttribute("data-phase", "opening");
  await expect(page.getByTestId("starter-opening-pending")).toBeVisible();
  await expect(page.getByTestId("starter-reveal-shell")).toHaveCount(0);

  profile = createProfile({
    ownedCardIds: openedCards.map((card) => card.id),
    deckIds: openedCards.map((card) => card.id),
    starterFreeBoostersRemaining: 1,
    openedBoosterIds: ["neon-breach"],
  });
  await fulfillOpenBooster(openRoute, openedCards, profile);

  await expect(page.getByTestId("starter-reveal-shell")).toBeVisible();
  await expect(page.locator('[data-testid^="starter-reveal-card-"]')).toHaveCount(5, { timeout: 6_000 });
  await expect(page.getByTestId("starter-reveal-active-card")).toHaveAttribute("data-card-id", openedCards[4].id);
  await expect(page.getByTestId("starter-reveal-continue")).toBeVisible();

  await page.getByTestId("starter-reveal-continue").click();

  await expect(shell).toHaveAttribute("data-phase", "catalog");
  await expect(shell).toHaveAttribute("data-opened-booster-count", "1");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-owned-card-count", "5");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-deck-count", "5");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-starter-free-boosters-remaining", "1");
  await expect(page.getByTestId("starter-state-label")).toHaveText("Другий вибір");
  await expect(page.getByTestId("starter-booster-card-neon-breach")).toHaveAttribute("data-opened", "true");
  await expect(page.getByTestId("starter-booster-open-neon-breach")).toBeDisabled();
  await expect(page.getByTestId("starter-booster-open-factory-shift")).toBeEnabled();
  expect(catalogRequestCount).toBeGreaterThanOrEqual(2);

  await page.reload();

  await expect(page.getByTestId("starter-onboarding-shell")).toBeVisible();
  await expect(page.getByTestId("starter-onboarding-shell")).toHaveAttribute("data-opened-booster-count", "1");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-owned-card-count", "5");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-deck-count", "5");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-starter-free-boosters-remaining", "1");
  await expect(page.getByTestId("starter-booster-open-neon-breach")).toBeDisabled();
  await expect(page.getByTestId("starter-booster-open-factory-shift")).toBeEnabled();
});

function createProfile(overrides: Partial<TestPlayerProfileInput> = {}): TestPlayerProfileInput {
  return {
    id: "player-starter-reveal-e2e",
    identity,
    ownedCardIds: [],
    deckIds: [],
    starterFreeBoostersRemaining: 2,
    openedBoosterIds: [],
    ...overrides,
  };
}

async function fulfillOpenBooster(route: Route, openingCards: Card[], player: TestPlayerProfileInput) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      booster: {
        id: "neon-breach",
        name: "Neon Breach",
        clans: ["[Da:Hack]", "Aliens"],
      },
      cards: openingCards,
      opening: {
        id: "opening-starter-reveal-e2e",
        playerId: player.id,
        boosterId: "neon-breach",
        source: "starter_free",
        cardIds: openingCards.map((card) => card.id),
        openedAt: "2026-05-02T12:00:00.000Z",
      },
      player: {
        ...player,
        onboarding: {
          starterBoostersAvailable: player.starterFreeBoostersRemaining > 0,
          collectionReady: player.ownedCardIds.length > 0,
          deckReady: player.deckIds.length > 0,
          completed: player.ownedCardIds.length > 0 && player.deckIds.length > 0 && player.starterFreeBoostersRemaining === 0,
        },
      },
    }),
  });
}
