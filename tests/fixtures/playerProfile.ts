import type { Page, Route } from "@playwright/test";
import { getBoosterCatalogForPlayer } from "../../src/features/boosters/catalog";
import type { PlayerIdentity } from "../../src/features/player/profile/types";

export const PROFILE_DECK_IDS = [
  "dahack-1645",
  "dahack-110",
  "dahack-820",
  "dahack-167",
  "dahack-1727",
  "dahack-795",
  "dahack-1383",
  "dahack-658",
  "dahack-108",
];
export const PROFILE_OWNED_CARD_IDS = [...PROFILE_DECK_IDS, "dahack-363"];

export type TestPlayerProfileInput = {
  id: string;
  identity: PlayerIdentity;
  ownedCardIds: string[];
  deckIds: string[];
  starterFreeBoostersRemaining: number;
  openedBoosterIds?: string[];
};

type MockDeckReadyProfileOptions = Partial<TestPlayerProfileInput> & {
  onDeckSave?: (route: Route, profile: TestPlayerProfileInput) => Promise<boolean | void> | boolean | void;
};

export async function mockDeckReadyProfile(page: Page, options: MockDeckReadyProfileOptions = {}) {
  let profile: TestPlayerProfileInput | undefined;

  await page.route("**/api/player/deck", async (route) => {
    const requestBody = route.request().postDataJSON() as { identity?: PlayerIdentity; deckIds?: string[] };
    const identity = options.identity ?? requestBody.identity ?? profile?.identity ?? { mode: "guest", guestId: "guest-deck-ready-e2e" };
    profile = {
      id: options.id ?? profile?.id ?? "player-deck-ready-e2e",
      identity,
      ownedCardIds: options.ownedCardIds ?? profile?.ownedCardIds ?? PROFILE_OWNED_CARD_IDS,
      deckIds: requestBody.deckIds ?? options.deckIds ?? profile?.deckIds ?? PROFILE_DECK_IDS,
      starterFreeBoostersRemaining: options.starterFreeBoostersRemaining ?? profile?.starterFreeBoostersRemaining ?? 0,
      openedBoosterIds: options.openedBoosterIds ?? profile?.openedBoosterIds ?? ["neon-breach", "factory-shift"],
    };
    const handled = await options.onDeckSave?.(route, profile);
    if (handled === false) return;

    await fulfillPlayerProfile(route, profile);
  });

  await page.route("**/api/player", async (route) => {
    const requestBody = route.request().postDataJSON() as { identity?: PlayerIdentity };
    const identity = options.identity ?? requestBody.identity ?? { mode: "guest", guestId: "guest-deck-ready-e2e" };

    profile = {
      id: options.id ?? profile?.id ?? "player-deck-ready-e2e",
      identity,
      ownedCardIds: options.ownedCardIds ?? profile?.ownedCardIds ?? PROFILE_OWNED_CARD_IDS,
      deckIds: options.deckIds ?? profile?.deckIds ?? PROFILE_DECK_IDS,
      starterFreeBoostersRemaining: options.starterFreeBoostersRemaining ?? profile?.starterFreeBoostersRemaining ?? 0,
      openedBoosterIds: options.openedBoosterIds ?? profile?.openedBoosterIds ?? ["neon-breach", "factory-shift"],
    };
    await fulfillPlayerProfile(route, profile);
  });
}

export async function fulfillPlayerProfile(route: Route, profile: TestPlayerProfileInput) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      player: createPlayerProfileBody(profile),
    }),
  });
}

export async function fulfillBoosterCatalog(route: Route, profile: TestPlayerProfileInput) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      boosters: getBoosterCatalogForPlayer({
        openedBoosterIds: profile.openedBoosterIds ?? [],
        starterFreeBoostersRemaining: profile.starterFreeBoostersRemaining,
      }),
      player: createPlayerProfileBody(profile),
    }),
  });
}

function createPlayerProfileBody(profile: TestPlayerProfileInput) {
  const collectionReady = profile.ownedCardIds.length > 0;
  const deckReady = profile.deckIds.length > 0;

  return {
    ...profile,
    openedBoosterIds: profile.openedBoosterIds ?? [],
    onboarding: {
      starterBoostersAvailable: profile.starterFreeBoostersRemaining > 0,
      collectionReady,
      deckReady,
      completed: collectionReady && deckReady && profile.starterFreeBoostersRemaining === 0,
    },
  };
}
