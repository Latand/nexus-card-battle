import type { Page, Route } from "@playwright/test";
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

export async function mockDeckReadyProfile(page: Page, options: Partial<TestPlayerProfileInput> = {}) {
  await page.route("**/api/player", async (route) => {
    const requestBody = route.request().postDataJSON() as { identity?: PlayerIdentity };
    const identity = options.identity ?? requestBody.identity ?? { mode: "guest", guestId: "guest-deck-ready-e2e" };

    await fulfillPlayerProfile(route, {
      id: options.id ?? "player-deck-ready-e2e",
      identity,
      ownedCardIds: options.ownedCardIds ?? PROFILE_OWNED_CARD_IDS,
      deckIds: options.deckIds ?? PROFILE_DECK_IDS,
      starterFreeBoostersRemaining: options.starterFreeBoostersRemaining ?? 0,
      openedBoosterIds: options.openedBoosterIds ?? ["neon-breach", "factory-shift"],
    });
  });
}

export async function fulfillPlayerProfile(route: Route, profile: TestPlayerProfileInput) {
  const collectionReady = profile.ownedCardIds.length > 0;
  const deckReady = profile.deckIds.length > 0;

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      player: {
        ...profile,
        openedBoosterIds: profile.openedBoosterIds ?? [],
        onboarding: {
          starterBoostersAvailable: profile.starterFreeBoostersRemaining > 0,
          collectionReady,
          deckReady,
          completed: collectionReady && deckReady && profile.starterFreeBoostersRemaining === 0,
        },
      },
    }),
  });
}
