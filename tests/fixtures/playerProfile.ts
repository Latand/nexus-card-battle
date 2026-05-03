import type { Page, Route } from "@playwright/test";
import { getBoosterCatalogForPlayer } from "../../src/features/boosters/catalog";
import { computeLevelFromXp, type PlayerIdentity } from "../../src/features/player/profile/types";

const GUEST_ID_STORAGE_KEY = "nexus:player-guest-id:v1";
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
  crystals?: number;
  totalXp?: number;
  level?: number;
  wins?: number;
  losses?: number;
  draws?: number;
};

type MockDeckReadyProfileOptions = Partial<TestPlayerProfileInput> & {
  onDeckSave?: (route: Route, profile: TestPlayerProfileInput) => Promise<boolean | void> | boolean | void;
};

export async function mockDeckReadyProfile(page: Page, options: MockDeckReadyProfileOptions = {}) {
  const defaultIdentity: PlayerIdentity = options.identity ?? { mode: "guest", guestId: "guest-deck-ready-e2e" };
  const initialProfile = createTestProfileInput(options, defaultIdentity);
  let profile: TestPlayerProfileInput | undefined;

  if (defaultIdentity.mode === "guest") {
    await page.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: GUEST_ID_STORAGE_KEY, value: defaultIdentity.guestId },
    );
  }
  await seedServerPlayerProfile(page, initialProfile);

  await page.route("**/api/player/deck", async (route) => {
    const requestBody = route.request().postDataJSON() as { identity?: PlayerIdentity; deckIds?: string[] };
    const identity = options.identity ?? requestBody.identity ?? profile?.identity ?? defaultIdentity;
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

    await seedServerPlayerProfile(page, profile);
    await fulfillPlayerProfile(route, profile);
  });

  await page.route("**/api/player", async (route) => {
    const requestBody = route.request().postDataJSON() as { identity?: PlayerIdentity };
    const identity = options.identity ?? requestBody.identity ?? defaultIdentity;

    profile = {
      id: options.id ?? profile?.id ?? "player-deck-ready-e2e",
      identity,
      ownedCardIds: options.ownedCardIds ?? profile?.ownedCardIds ?? PROFILE_OWNED_CARD_IDS,
      deckIds: options.deckIds ?? profile?.deckIds ?? PROFILE_DECK_IDS,
      starterFreeBoostersRemaining: options.starterFreeBoostersRemaining ?? profile?.starterFreeBoostersRemaining ?? 0,
      openedBoosterIds: options.openedBoosterIds ?? profile?.openedBoosterIds ?? ["neon-breach", "factory-shift"],
    };
    await seedServerPlayerProfile(page, profile);
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
  const totalXp = profile.totalXp ?? 0;

  return {
    ...profile,
    openedBoosterIds: profile.openedBoosterIds ?? [],
    crystals: profile.crystals ?? 0,
    totalXp,
    level: profile.level ?? computeLevelFromXp(totalXp).level,
    wins: profile.wins ?? 0,
    losses: profile.losses ?? 0,
    draws: profile.draws ?? 0,
    onboarding: {
      starterBoostersAvailable: profile.starterFreeBoostersRemaining > 0,
      collectionReady,
      deckReady,
      completed: collectionReady && deckReady && profile.starterFreeBoostersRemaining === 0,
    },
  };
}

function createTestProfileInput(options: MockDeckReadyProfileOptions, identity: PlayerIdentity): TestPlayerProfileInput {
  return {
    id: options.id ?? "player-deck-ready-e2e",
    identity,
    ownedCardIds: options.ownedCardIds ?? PROFILE_OWNED_CARD_IDS,
    deckIds: options.deckIds ?? PROFILE_DECK_IDS,
    starterFreeBoostersRemaining: options.starterFreeBoostersRemaining ?? 0,
    openedBoosterIds: options.openedBoosterIds ?? ["neon-breach", "factory-shift"],
  };
}

export async function seedServerPlayerProfile(page: Page, profile: TestPlayerProfileInput) {
  const response = await page.request.post("/__test/player-profile", {
    data: profile,
  });

  if (!response.ok()) {
    throw new Error(`Failed to seed server player profile: ${response.status()} ${await response.text()}`);
  }
}
