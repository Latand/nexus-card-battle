import { expect, test, type Page, type Route } from "@playwright/test";
import { fulfillBoosterCatalog, fulfillPlayerProfile, PROFILE_DECK_IDS, PROFILE_OWNED_CARD_IDS, type TestPlayerProfileInput } from "./fixtures/playerProfile";

const GUEST_ID_STORAGE_KEY = "nexus:player-guest-id:v1";

test("bootstraps a browser guest profile on first load", async ({ page }) => {
  const requests: unknown[] = [];
  let profile: TestPlayerProfileInput | undefined;
  await mockPlayerProfile(page, async (route) => {
    const requestBody = route.request().postDataJSON() as { identity: { mode: "guest"; guestId: string } };
    requests.push(requestBody);

    expect(requestBody.identity.mode).toBe("guest");
    expect(requestBody.identity.guestId).toMatch(/^guest_/);

    profile = {
      id: "player-guest-e2e",
      identity: requestBody.identity,
      ownedCardIds: [],
      deckIds: [],
      starterFreeBoostersRemaining: 2,
      openedBoosterIds: [],
    };
    await fulfillPlayerProfile(route, profile);
  });
  await page.route("**/api/boosters", async (route) => {
    if (!profile) throw new Error("Profile must load before booster catalog.");
    await fulfillBoosterCatalog(route, profile);
  });

  await page.goto("/");

  const profileShell = page.getByTestId("player-profile-shell");
  await expect(profileShell).toHaveAttribute("data-profile-status", "ready");
  await expect(profileShell).toHaveAttribute("data-profile-identity-mode", "guest");
  await expect(profileShell).toHaveAttribute("data-profile-owned-card-count", "0");
  await expect(profileShell).toHaveAttribute("data-profile-deck-count", "0");
  await expect(profileShell).toHaveAttribute("data-starter-free-boosters-remaining", "2");
  await expect(profileShell).toHaveAttribute("data-deck-source", "starter-fallback");
  await expect(page.getByTestId("starter-onboarding-shell")).toBeVisible();
  await expect(page.getByTestId("starter-onboarding-shell")).toHaveAttribute("data-opened-booster-count", "0");
  await expect(page.locator('[data-testid^="starter-booster-card-"]')).toHaveCount(12);
  await expect(page.getByTestId("collection-search")).toHaveCount(0);
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(0);

  expect(requests).toHaveLength(1);
  const storedGuestId = await page.evaluate((key) => window.localStorage.getItem(key), GUEST_ID_STORAGE_KEY);
  expect(storedGuestId).toBe((requests[0] as { identity: { guestId: string } }).identity.guestId);
});

test("blocks collection access and retries when profile bootstrap fails", async ({ page }) => {
  let profileRequests = 0;
  let catalogRequests = 0;
  let profile: TestPlayerProfileInput | undefined;

  await mockPlayerProfile(page, async (route) => {
    profileRequests += 1;
    const requestBody = route.request().postDataJSON() as { identity: { mode: "guest"; guestId: string } };

    if (profileRequests === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "profile_unavailable" }) });
      return;
    }

    profile = {
      id: "player-retry-e2e",
      identity: requestBody.identity,
      ownedCardIds: [],
      deckIds: [],
      starterFreeBoostersRemaining: 2,
      openedBoosterIds: [],
    };
    await fulfillPlayerProfile(route, profile);
  });
  await page.route("**/api/boosters", async (route) => {
    catalogRequests += 1;
    if (!profile) throw new Error("Profile must load before booster catalog.");
    await fulfillBoosterCatalog(route, profile);
  });

  await page.goto("/");

  const profileShell = page.getByTestId("player-profile-shell");
  await expect(profileShell).toHaveAttribute("data-profile-status", "unavailable");
  await expect(page.getByTestId("profile-unavailable")).toBeVisible();
  await expect(page.getByTestId("profile-retry")).toBeVisible();
  await expect(page.getByTestId("collection-search")).toHaveCount(0);
  await expect(page.getByTestId("play-selected-deck")).toHaveCount(0);
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(0);
  await expect(page.getByTestId("starter-onboarding-shell")).toHaveCount(0);
  expect(catalogRequests).toBe(0);

  await page.getByTestId("profile-retry").click();

  await expect(profileShell).toHaveAttribute("data-profile-status", "ready");
  await expect(page.getByTestId("starter-onboarding-shell")).toBeVisible();
  await expect(page.locator('[data-testid^="starter-booster-card-"]')).toHaveCount(12);
  await expect(page.getByTestId("collection-search")).toHaveCount(0);
  expect(profileRequests).toBe(2);
  expect(catalogRequests).toBeGreaterThanOrEqual(1);
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
      starterFreeBoostersRemaining: 0,
      openedBoosterIds: ["neon-breach", "factory-shift"],
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
  await expect(profileShell).toHaveAttribute("data-starter-free-boosters-remaining", "0");
  await expect(profileShell).toHaveAttribute("data-deck-source", "profile");
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(PROFILE_DECK_IDS.length);
  await expect(page.locator('[data-testid^="collection-card-"]')).toHaveCount(PROFILE_OWNED_CARD_IDS.length);
});

async function mockPlayerProfile(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route("**/api/player", handler);
}
