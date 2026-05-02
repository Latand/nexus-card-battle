import { expect, test, type Page, type Route } from "@playwright/test";
import { cards } from "../src/features/battle/model/cards";
import type { Card } from "../src/features/battle/model/types";
import { getBoosterById } from "../src/features/boosters/catalog";
import { STARTER_FREE_BOOSTERS, type PlayerIdentity } from "../src/features/player/profile/types";
import { fulfillBoosterCatalog, fulfillPlayerProfile, type TestPlayerProfileInput } from "./fixtures/playerProfile";

const GUEST_ID_STORAGE_KEY = "nexus:player-guest-id:v1";
const identity: PlayerIdentity = {
  mode: "guest",
  guestId: "starter-reveal-e2e",
};
const firstBoosterId = "neon-breach";
const secondBoosterId = "factory-shift";
const firstOpenedCards = getCardsForClans(["[Da:Hack]", "Aliens"]);
const secondOpenedCards = getCardsForClans(["Workers", "Micron"]);
const fullStarterDeckIds = [...firstOpenedCards, ...secondOpenedCards].map((card) => card.id);

type RevealProfileState = Pick<
  TestPlayerProfileInput,
  "ownedCardIds" | "deckIds" | "starterFreeBoostersRemaining" | "openedBoosterIds"
>;

test("opens two different starter boosters, survives reload, reaches deck ready, and enters battle", async ({ page }) => {
  expect(firstOpenedCards).toHaveLength(5);
  expect(secondOpenedCards).toHaveLength(5);

  const harness = await setupStarterOnboarding(page);

  await page.goto("/");
  await expectInitialStarterCatalog(page);

  await openBoosterAndReveal(page, harness, firstBoosterId, firstOpenedCards, {
    ownedCardIds: firstOpenedCards.map((card) => card.id),
    deckIds: firstOpenedCards.map((card) => card.id),
    starterFreeBoostersRemaining: 1,
    openedBoosterIds: [firstBoosterId],
  });

  await page.getByTestId("starter-reveal-continue").click();

  const shell = page.getByTestId("starter-onboarding-shell");
  await expect(shell).toHaveAttribute("data-phase", "catalog");
  await expect(shell).toHaveAttribute("data-opened-booster-count", "1");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-owned-card-count", "5");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-deck-count", "5");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-starter-free-boosters-remaining", "1");
  await expect(page.getByTestId("starter-state-label")).toHaveText("Другий вибір");
  await expect(page.getByTestId(`starter-booster-card-${firstBoosterId}`)).toHaveAttribute("data-opened", "true");
  await expect(page.getByTestId(`starter-booster-open-${firstBoosterId}`)).toBeDisabled();
  await expect(page.getByTestId(`starter-booster-open-${secondBoosterId}`)).toBeEnabled();
  expect(harness.catalogRequestCount()).toBeGreaterThanOrEqual(2);

  await page.reload();

  await expect(page.getByTestId("starter-onboarding-shell")).toBeVisible();
  await expect(page.getByTestId("starter-onboarding-shell")).toHaveAttribute("data-opened-booster-count", "1");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-owned-card-count", "5");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-deck-count", "5");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-starter-free-boosters-remaining", "1");
  await expect(page.getByTestId(`starter-booster-open-${firstBoosterId}`)).toBeDisabled();
  await expect(page.getByTestId(`starter-booster-open-${secondBoosterId}`)).toBeEnabled();

  await openBoosterAndReveal(page, harness, secondBoosterId, secondOpenedCards, {
    ownedCardIds: fullStarterDeckIds,
    deckIds: fullStarterDeckIds,
    starterFreeBoostersRemaining: 0,
    openedBoosterIds: [firstBoosterId, secondBoosterId],
  });

  await page.getByTestId("starter-reveal-continue").click();
  await expectDeckReady(page);

  await page.getByTestId("starter-deck-ready-edit").click();
  await expect(page.getByTestId("collection-search")).toBeVisible();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(10);
  await expect(page.getByTestId("play-selected-deck")).toBeEnabled();
  await expect(page.getByTestId("play-human-match")).toBeEnabled();

  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid^="player-card-"]')).toHaveCount(4);
  await expectPlayerHandToUseDeck(page, fullStarterDeckIds);
});

test("starts an AI battle from the ten-card starter deck-ready state", async ({ page }) => {
  const harness = await setupStarterOnboarding(page, "starter-reveal-play-e2e");

  await page.goto("/");
  await expectInitialStarterCatalog(page);

  await openBoosterAndReveal(page, harness, firstBoosterId, firstOpenedCards, {
    ownedCardIds: firstOpenedCards.map((card) => card.id),
    deckIds: firstOpenedCards.map((card) => card.id),
    starterFreeBoostersRemaining: 1,
    openedBoosterIds: [firstBoosterId],
  });
  await page.getByTestId("starter-reveal-continue").click();

  await openBoosterAndReveal(page, harness, secondBoosterId, secondOpenedCards, {
    ownedCardIds: fullStarterDeckIds,
    deckIds: fullStarterDeckIds,
    starterFreeBoostersRemaining: 0,
    openedBoosterIds: [firstBoosterId, secondBoosterId],
  });
  await page.getByTestId("starter-reveal-continue").click();
  await expectDeckReady(page);

  await page.getByTestId("starter-deck-ready-play").click();
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid^="player-card-"]')).toHaveCount(4);
  await expectPlayerHandToUseDeck(page, fullStarterDeckIds);
});

async function setupStarterOnboarding(page: Page, guestId = identity.guestId) {
  const activeIdentity: PlayerIdentity = { mode: "guest", guestId };
  let profile = createProfile({ identity: activeIdentity });
  let catalogRequestCount = 0;
  let openRequestCount = 0;
  const openRoutes: Route[] = [];
  const openRouteWaiters: ((route: Route) => void)[] = [];

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
    const catalogBody = route.request().postDataJSON() as { identity: PlayerIdentity };
    catalogRequestCount += 1;
    expect(catalogBody.identity).toEqual(activeIdentity);
    await fulfillBoosterCatalog(route, profile);
  });
  await page.route("**/api/player/open-booster", async (route) => {
    openRequestCount += 1;
    const waiter = openRouteWaiters.shift();
    if (waiter) {
      waiter(route);
      return;
    }

    openRoutes.push(route);
  });

  return {
    identity: activeIdentity,
    setProfile(nextProfile: Partial<TestPlayerProfileInput>) {
      profile = createProfile({ identity: activeIdentity, ...nextProfile });
    },
    waitForOpenRoute() {
      const route = openRoutes.shift();
      if (route) return Promise.resolve(route);

      return new Promise<Route>((resolve) => {
        openRouteWaiters.push(resolve);
      });
    },
    catalogRequestCount: () => catalogRequestCount,
    openRequestCount: () => openRequestCount,
  };
}

async function expectInitialStarterCatalog(page: Page) {
  const shell = page.getByTestId("starter-onboarding-shell");
  await expect(shell).toBeVisible();
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-owned-card-count", "0");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-starter-free-boosters-remaining", "2");
  await expect(shell).toHaveAttribute("data-opened-booster-count", "0");
  await expect(shell).toHaveAttribute("data-catalog-status", "ready");
  await expect(page.locator('[data-testid^="starter-booster-card-"]')).toHaveCount(12);
  await expect(page.getByTestId("collection-search")).toHaveCount(0);
}

async function openBoosterAndReveal(
  page: Page,
  harness: Awaited<ReturnType<typeof setupStarterOnboarding>>,
  boosterId: string,
  openingCards: Card[],
  nextProfile: RevealProfileState,
) {
  const openRoutePromise = harness.waitForOpenRoute();
  await page.getByTestId(`starter-booster-open-${boosterId}`).click();
  const openRoute = await openRoutePromise;
  const openBody = openRoute.request().postDataJSON() as { identity: PlayerIdentity; boosterId: string };

  expect(openBody).toEqual({ identity: harness.identity, boosterId });
  await expect(page.getByTestId("starter-onboarding-shell")).toHaveAttribute("data-phase", "opening");
  await expect(page.getByTestId("starter-opening-pending")).toBeVisible();
  await expect(page.getByTestId("starter-reveal-shell")).toHaveCount(0);

  harness.setProfile(nextProfile);
  await fulfillOpenBooster(openRoute, boosterId, openingCards, createProfile({ identity: harness.identity, ...nextProfile }));

  await expect(page.getByTestId("starter-reveal-shell")).toBeVisible();
  const onboardingShell = page.getByTestId("starter-onboarding-shell");
  const profileShell = page.getByTestId("player-profile-shell");
  const progressCount = Math.max(0, STARTER_FREE_BOOSTERS - nextProfile.starterFreeBoostersRemaining);
  await expect(onboardingShell).toHaveAttribute("data-phase", "reveal");
  await expect(onboardingShell).toHaveAttribute("data-opened-booster-count", String(nextProfile.openedBoosterIds.length));
  await expect(onboardingShell).toHaveAttribute("data-progress-count", String(progressCount));
  await expect(profileShell).toHaveAttribute("data-profile-owned-card-count", String(nextProfile.ownedCardIds.length));
  await expect(profileShell).toHaveAttribute("data-profile-deck-count", String(nextProfile.deckIds.length));
  await expect(profileShell).toHaveAttribute("data-starter-free-boosters-remaining", String(nextProfile.starterFreeBoostersRemaining));
  await expect(page.locator('[data-testid^="starter-reveal-card-"]')).toHaveCount(5, { timeout: 6_000 });
  await expect(page.getByTestId("starter-reveal-active-card")).toHaveAttribute("data-card-id", openingCards[4].id);
  await expect(page.getByTestId("starter-reveal-continue")).toBeVisible();
}

async function expectDeckReady(page: Page) {
  const readyShell = page.getByTestId("starter-deck-ready-shell");
  await expect(readyShell).toBeVisible();
  await expect(readyShell).toHaveAttribute("data-card-count", "10");
  await expect(readyShell).toHaveAttribute("data-profile-deck-count", "10");
  await expect(readyShell).toHaveAttribute("data-opened-booster-count", "2");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-owned-card-count", "10");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-deck-count", "10");
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-starter-free-boosters-remaining", "0");
  await expect(page.locator('[data-testid^="starter-deck-ready-card-"]')).toHaveCount(10);
  await expect(page.getByTestId("starter-deck-ready-play")).toBeEnabled();
  await expect(page.getByTestId("starter-deck-ready-edit")).toBeEnabled();
}

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

async function fulfillOpenBooster(route: Route, boosterId: string, openingCards: Card[], player: TestPlayerProfileInput) {
  const booster = getBoosterById(boosterId);
  if (!booster) throw new Error(`Unknown test booster ${boosterId}.`);

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      booster: {
        id: booster.id,
        name: booster.name,
        clans: booster.clans,
      },
      cards: openingCards,
      opening: {
        id: `opening-${boosterId}-starter-reveal-e2e`,
        playerId: player.id,
        boosterId,
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

function getCardsForClans(clans: string[]) {
  const clanSet = new Set(clans);
  return cards.filter((card) => clanSet.has(card.clan)).slice(0, 5);
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
