import { expect, test, type Page, type Route } from "@playwright/test";

const GUEST_ID_STORAGE_KEY = "nexus:player-guest-id:v1";
const PROFILE_DECK_IDS = [
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
const PROFILE_OWNED_CARD_IDS = [...PROFILE_DECK_IDS, "dahack-363"];

test("bootstraps a browser guest profile on first load", async ({ page }) => {
  const requests: unknown[] = [];
  await mockPlayerProfile(page, async (route) => {
    const requestBody = route.request().postDataJSON() as { identity: { mode: "guest"; guestId: string } };
    requests.push(requestBody);

    expect(requestBody.identity.mode).toBe("guest");
    expect(requestBody.identity.guestId).toMatch(/^guest_/);

    await fulfillPlayerProfile(route, {
      id: "player-guest-e2e",
      identity: requestBody.identity,
      ownedCardIds: [],
      deckIds: [],
      starterFreeBoostersRemaining: 2,
    });
  });

  await page.goto("/");

  const profileShell = page.getByTestId("player-profile-shell");
  await expect(profileShell).toHaveAttribute("data-profile-status", "ready");
  await expect(profileShell).toHaveAttribute("data-profile-identity-mode", "guest");
  await expect(profileShell).toHaveAttribute("data-profile-owned-card-count", "0");
  await expect(profileShell).toHaveAttribute("data-profile-deck-count", "0");
  await expect(profileShell).toHaveAttribute("data-starter-free-boosters-remaining", "2");
  await expect(profileShell).toHaveAttribute("data-deck-source", "starter-fallback");
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);

  expect(requests).toHaveLength(1);
  const storedGuestId = await page.evaluate((key) => window.localStorage.getItem(key), GUEST_ID_STORAGE_KEY);
  expect(storedGuestId).toBe((requests[0] as { identity: { guestId: string } }).identity.guestId);
});

test("bootstraps the Telegram MVP identity from client-provided telegramId", async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: "" });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: {
        WebApp: {
          initData: "mvp-client-provided-telegram-id",
          initDataUnsafe: {
            user: {
              id: 99887766,
              username: "profiletester",
              first_name: "Profile",
              last_name: "Tester",
            },
          },
          ready() {},
          expand() {},
          disableVerticalSwipes() {},
          isVersionAtLeast() {
            return false;
          },
        },
      },
    });
  });

  const requests: unknown[] = [];
  await mockPlayerProfile(page, async (route) => {
    const requestBody = route.request().postDataJSON() as { identity: { mode: "telegram"; telegramId: string } };
    requests.push(requestBody);

    await fulfillPlayerProfile(route, {
      id: "player-telegram-e2e",
      identity: requestBody.identity,
      ownedCardIds: PROFILE_OWNED_CARD_IDS,
      deckIds: PROFILE_DECK_IDS,
      starterFreeBoostersRemaining: 1,
    });
  });

  await page.goto("/");

  await expect.poll(() => requests.length).toBe(1);
  expect(requests).toHaveLength(1);
  expect((requests[0] as { identity: { mode: string; telegramId: string } }).identity).toEqual({
    mode: "telegram",
    telegramId: "99887766",
  });

  const profileShell = page.getByTestId("player-profile-shell");
  await expect(profileShell).toHaveAttribute("data-profile-status", "ready");
  await expect(profileShell).toHaveAttribute("data-profile-identity-mode", "telegram");
  await expect(profileShell).toHaveAttribute("data-profile-owned-card-count", String(PROFILE_OWNED_CARD_IDS.length));
  await expect(profileShell).toHaveAttribute("data-profile-deck-count", String(PROFILE_DECK_IDS.length));
  await expect(profileShell).toHaveAttribute("data-starter-free-boosters-remaining", "1");
  await expect(profileShell).toHaveAttribute("data-deck-source", "profile");
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(PROFILE_DECK_IDS.length);
  await expect(page.locator('[data-testid^="collection-card-"]')).toHaveCount(PROFILE_OWNED_CARD_IDS.length);
});

async function mockPlayerProfile(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route("**/api/player", handler);
}

async function fulfillPlayerProfile(
  route: Route,
  profile: {
    id: string;
    identity: { mode: "guest"; guestId: string } | { mode: "telegram"; telegramId: string };
    ownedCardIds: string[];
    deckIds: string[];
    starterFreeBoostersRemaining: number;
  },
) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      player: {
        ...profile,
        openedBoosterIds: [],
        onboarding: {
          starterBoostersAvailable: profile.starterFreeBoostersRemaining > 0,
          collectionReady: profile.ownedCardIds.length > 0,
          deckReady: profile.deckIds.length > 0,
          completed: false,
        },
      },
    }),
  });
}
