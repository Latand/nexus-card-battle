import { expect, test } from "@playwright/test";
import type { PlayerIdentity } from "../src/features/player/profile/types";
import { mockDeckReadyProfile, PROFILE_DECK_IDS, PROFILE_OWNED_CARD_IDS } from "./fixtures/playerProfile";

const HUD_PROFILE_FIELDS = {
  crystals: 247,
  totalXp: 350,
  eloRating: 1184,
  wins: 4,
  losses: 1,
  draws: 0,
} as const;

const TELEGRAM_PHOTO_URL = "https://t.me/i/userpic/320/cyber-brawler-test.jpg";

test("desktop sidebar HUD shows persisted crystals, level, and ELO on the Collection screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockDeckReadyProfile(page, {
    ...HUD_PROFILE_FIELDS,
  });
  await page.goto("/");

  const sidebar = page.getByTestId("player-hud-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute("data-profile-crystals", String(HUD_PROFILE_FIELDS.crystals));
  await expect(sidebar).toHaveAttribute("data-profile-level", "2");
  await expect(sidebar).toHaveAttribute("data-profile-elo", String(HUD_PROFILE_FIELDS.eloRating));

  await expect(page.getByTestId("player-hud-crystals")).toHaveAttribute("data-value", String(HUD_PROFILE_FIELDS.crystals));
  await expect(page.getByTestId("player-hud-elo")).toHaveAttribute("data-value", String(HUD_PROFILE_FIELDS.eloRating));
  await expect(page.getByTestId("player-hud-level")).toHaveText(/Lv\s+2/);

  await expect(page.getByTestId("player-hud-mobile")).toBeHidden();
  await expect(page.getByTestId("player-hud-online-slot")).toBeVisible();

  // Desktop sidebar PLAY button starts a match through the existing entry point.
  const playButton = page.getByTestId("player-hud-play");
  await expect(playButton).toBeEnabled();
  await playButton.click();

  await expect(page.getByTestId("player-profile-shell")).toHaveCount(0);
});

test("mobile top strip HUD renders inline stats and reserves the online dot", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDeckReadyProfile(page, {
    ...HUD_PROFILE_FIELDS,
  });
  await page.goto("/");

  const mobileStrip = page.getByTestId("player-hud-mobile");
  await expect(mobileStrip).toBeVisible();
  await expect(mobileStrip).toHaveAttribute("data-profile-crystals", String(HUD_PROFILE_FIELDS.crystals));
  await expect(mobileStrip).toHaveAttribute("data-profile-level", "2");
  await expect(mobileStrip).toHaveAttribute("data-profile-elo", String(HUD_PROFILE_FIELDS.eloRating));

  await expect(page.getByTestId("player-hud-crystals-mobile")).toHaveText(String(HUD_PROFILE_FIELDS.crystals));
  await expect(page.getByTestId("player-hud-elo-mobile")).toHaveText(String(HUD_PROFILE_FIELDS.eloRating));
  await expect(page.getByTestId("player-hud-level-mobile")).toHaveText(/Lv\s+2/);

  await expect(page.getByTestId("player-hud-sidebar")).toBeHidden();
  await expect(page.getByTestId("player-hud-online-slot-mobile")).toBeVisible();
});

test("HUD avatar prefers the persisted profile avatarUrl over the live Telegram photo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const persistedAvatar = "https://t.me/i/userpic/320/persisted-avatar.jpg";

  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: "" });
  });
  await page.addInitScript((photoUrl) => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: {
        WebApp: {
          initData: "mvp-hud-telegram-id",
          initDataUnsafe: {
            user: {
              id: 1010101,
              username: "hudtester",
              first_name: "Hud",
              last_name: "Tester",
              photo_url: photoUrl,
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
  }, TELEGRAM_PHOTO_URL);

  const identity: PlayerIdentity = { mode: "telegram", telegramId: "1010101" };
  await mockDeckReadyProfile(page, {
    identity,
    avatarUrl: persistedAvatar,
    ...HUD_PROFILE_FIELDS,
  });
  await page.goto("/");

  const avatar = page.getByTestId("player-hud-avatar-sidebar");
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute("data-avatar-src", persistedAvatar);
});

test("HUD avatar falls back to the live Telegram photo when no avatarUrl is persisted, then persists it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: "" });
  });
  await page.addInitScript((photoUrl) => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: {
        WebApp: {
          initData: "mvp-hud-telegram-id-2",
          initDataUnsafe: {
            user: {
              id: 2020202,
              username: "hudtester2",
              first_name: "Hud",
              last_name: "Two",
              photo_url: photoUrl,
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
  }, TELEGRAM_PHOTO_URL);

  const identity: PlayerIdentity = { mode: "telegram", telegramId: "2020202" };
  const persistedUrls: string[] = [];

  await page.route("**/api/player/avatar", async (route) => {
    const requestBody = route.request().postDataJSON() as { avatarUrl?: string };
    if (typeof requestBody.avatarUrl === "string") persistedUrls.push(requestBody.avatarUrl);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        player: {
          id: "player-hud-live",
          identity,
          ownedCardIds: [],
          deckIds: [],
          starterFreeBoostersRemaining: 0,
          openedBoosterIds: [],
          crystals: HUD_PROFILE_FIELDS.crystals,
          totalXp: HUD_PROFILE_FIELDS.totalXp,
          level: 2,
          wins: HUD_PROFILE_FIELDS.wins,
          losses: HUD_PROFILE_FIELDS.losses,
          draws: HUD_PROFILE_FIELDS.draws,
          eloRating: HUD_PROFILE_FIELDS.eloRating,
          avatarUrl: requestBody.avatarUrl,
          onboarding: { starterBoostersAvailable: false, collectionReady: false, deckReady: false, completed: true },
        },
      }),
    });
  });

  await mockDeckReadyProfile(page, {
    identity,
    avatarUrl: undefined,
    ...HUD_PROFILE_FIELDS,
  });
  await page.goto("/");

  const avatar = page.getByTestId("player-hud-avatar-sidebar");
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute("data-avatar-src", TELEGRAM_PHOTO_URL);

  await expect.poll(() => persistedUrls.length).toBeGreaterThanOrEqual(1);
  expect(persistedUrls[0]).toBe(TELEGRAM_PHOTO_URL);
});

test("a stale avatar-save response does not roll back deck mutations made while the save was in flight", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: "" });
  });
  await page.addInitScript((photoUrl) => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: {
        WebApp: {
          initData: "mvp-hud-stale-race",
          initDataUnsafe: {
            user: {
              id: 3030303,
              username: "stalerace",
              first_name: "Stale",
              last_name: "Race",
              photo_url: photoUrl,
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
  }, TELEGRAM_PHOTO_URL);

  const identity: PlayerIdentity = { mode: "telegram", telegramId: "3030303" };
  const extraOwnedCardId = PROFILE_OWNED_CARD_IDS.find((cardId) => !PROFILE_DECK_IDS.includes(cardId));
  if (!extraOwnedCardId) throw new Error("Fixture must include an owned card outside the deck.");

  const baseProfilePayload = {
    id: "player-hud-stale-race",
    identity,
    ownedCardIds: PROFILE_OWNED_CARD_IDS,
    deckIds: PROFILE_DECK_IDS,
    starterFreeBoostersRemaining: 0,
    openedBoosterIds: ["neon-breach", "factory-shift"],
    crystals: HUD_PROFILE_FIELDS.crystals,
    totalXp: HUD_PROFILE_FIELDS.totalXp,
    level: 2,
    wins: HUD_PROFILE_FIELDS.wins,
    losses: HUD_PROFILE_FIELDS.losses,
    draws: HUD_PROFILE_FIELDS.draws,
    eloRating: HUD_PROFILE_FIELDS.eloRating,
    onboarding: { starterBoostersAvailable: false, collectionReady: true, deckReady: true, completed: true },
  };

  let resolveAvatarRoute: (() => void) | undefined;
  const avatarRouteReady = new Promise<void>((resolve) => {
    resolveAvatarRoute = resolve;
  });

  await page.route("**/api/player/avatar", async (route) => {
    const requestBody = route.request().postDataJSON() as { avatarUrl?: string };
    await avatarRouteReady;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        player: { ...baseProfilePayload, deckIds: PROFILE_DECK_IDS, avatarUrl: requestBody.avatarUrl },
      }),
    });
  });

  await page.route("**/api/player/deck", async (route) => {
    const requestBody = route.request().postDataJSON() as { deckIds?: string[] };
    const nextDeckIds = requestBody.deckIds ?? PROFILE_DECK_IDS;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        player: { ...baseProfilePayload, deckIds: nextDeckIds },
      }),
    });
  });

  await page.route("**/api/player", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ player: baseProfilePayload }),
    });
  });

  await page.goto("/");

  await expect(page.getByTestId("player-hud-sidebar")).toBeVisible();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(PROFILE_DECK_IDS.length);

  const profileShell = page.getByTestId("player-profile-shell");

  await page.getByTestId(`collection-toggle-${extraOwnedCardId}`).click({ force: true });
  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "saved");
  await expect(profileShell).toHaveAttribute("data-profile-deck-count", String(PROFILE_DECK_IDS.length + 1));
  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeVisible();

  resolveAvatarRoute?.();

  await expect(page.getByTestId("player-hud-avatar-sidebar")).toHaveAttribute("data-avatar-src", TELEGRAM_PHOTO_URL);
  await expect(profileShell).toHaveAttribute("data-profile-deck-count", String(PROFILE_DECK_IDS.length + 1));
  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeVisible();
});

test("HUD is hidden during active battle phases", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockDeckReadyProfile(page, { ...HUD_PROFILE_FIELDS });
  await page.goto("/");

  await expect(page.getByTestId("player-hud-sidebar")).toBeVisible();

  await page.getByTestId("play-selected-deck").click();

  await expect(page.getByTestId("player-hud-sidebar")).toHaveCount(0);
  await expect(page.getByTestId("player-hud-mobile")).toHaveCount(0);
});
