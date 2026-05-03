import { expect, test, type Page } from "@playwright/test";
import { mockDeckReadyProfile } from "./fixtures/playerProfile";

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const PVE_NO_LEVEL_REWARDS = {
  matchXp: 30,
  levelProgress: 15,
  cardRewards: [
    { cardId: "ignored-card", cardName: "Ігнорована картка", xp: 1, levelProgress: 1 },
  ],
  deltaXp: 30,
  deltaCrystals: 0,
  leveledUp: false,
  levelUpBonusCrystals: 0,
  newTotals: { crystals: 0, totalXp: 30, level: 1 },
};

test("PvE win overlay shows the avatar block + XP delta and hides 💎/🏆/⭐ tiles and the card section", async ({ page }) => {
  await mockDeckReadyProfile(page);

  await page.route("**/api/player/match-finished", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rewards: PVE_NO_LEVEL_REWARDS,
        player: {
          id: "player-deck-ready-e2e",
          identity: { mode: "guest", guestId: "guest-deck-ready-e2e" },
          ownedCardIds: [],
          deckIds: [],
          starterFreeBoostersRemaining: 0,
          openedBoosterIds: ["neon-breach", "factory-shift"],
          crystals: 0,
          totalXp: 30,
          level: 1,
          wins: 1,
          losses: 0,
          draws: 0,
          eloRating: 1000,
          onboarding: { starterBoostersAvailable: false, collectionReady: true, deckReady: true, completed: true },
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });

  await playUntilRewardOverlay(page);
  await expect(page.getByTestId("reward-summary")).toBeVisible({ timeout: 60_000 });

  await expect(page.getByTestId("reward-title")).toBeVisible();
  await expect(page.getByTestId("reward-avatar-block")).toBeVisible();
  await expect(page.getByTestId("reward-avatar-image")).toBeVisible();
  await expect(page.getByTestId("reward-player-name")).toBeVisible();
  await expect(page.getByTestId("reward-player-level")).toContainText("Lv");
  await expect(page.getByTestId("reward-xp-bar")).toBeVisible();
  await expect(page.getByTestId("reward-xp-bar-delta")).toBeVisible();
  await expect(page.getByTestId("reward-xp-label")).toContainText("+30 XP");

  await expect(page.getByTestId("reward-crystals-tile")).toHaveCount(0);
  await expect(page.getByTestId("reward-elo-tile")).toHaveCount(0);
  await expect(page.getByTestId("reward-level-up-tile")).toHaveCount(0);

  // Card-progress section is fully removed from the overlay JSX.
  await expect(page.locator('[data-testid^="reward-card-"]')).toHaveCount(0);

  // Both bottom buttons are present.
  await expect(page.getByTestId("reward-replay-ai")).toBeVisible();
  await expect(page.getByTestId("reward-replay-human")).toBeVisible();
});

test("PvE win overlay AI button restarts a new AI match in the same screen", async ({ page }) => {
  await mockDeckReadyProfile(page);
  await page.route("**/api/player/match-finished", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rewards: PVE_NO_LEVEL_REWARDS,
        player: {
          id: "player-deck-ready-e2e",
          identity: { mode: "guest", guestId: "guest-deck-ready-e2e" },
          ownedCardIds: [],
          deckIds: [],
          starterFreeBoostersRemaining: 0,
          openedBoosterIds: ["neon-breach", "factory-shift"],
          crystals: 0,
          totalXp: 30,
          level: 1,
          wins: 1,
          losses: 0,
          draws: 0,
          eloRating: 1000,
          onboarding: { starterBoostersAvailable: false, collectionReady: true, deckReady: true, completed: true },
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });

  await playUntilRewardOverlay(page);
  await expect(page.getByTestId("reward-summary")).toBeVisible({ timeout: 60_000 });

  await page.getByTestId("reward-replay-ai").click();
  await expect(page.getByTestId("reward-summary")).toBeHidden({ timeout: 5_000 });
  await expect(page.getByTestId("phase-overlay")).toHaveAttribute("data-phase", "match_intro");
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });
});

test("reward overlay renders the avatar src verbatim, not through Next image optimization", async ({ page }) => {
  const telegramAvatarUrl = "https://t.me/i/userpic/example.jpg";
  await mockDeckReadyProfile(page, { avatarUrl: telegramAvatarUrl });

  await page.route(telegramAvatarUrl, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PNG });
  });

  await page.route("**/api/player/match-finished", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rewards: PVE_NO_LEVEL_REWARDS,
        player: {
          id: "player-deck-ready-e2e",
          identity: { mode: "guest", guestId: "guest-deck-ready-e2e" },
          ownedCardIds: [],
          deckIds: [],
          starterFreeBoostersRemaining: 0,
          openedBoosterIds: ["neon-breach", "factory-shift"],
          crystals: 0,
          totalXp: 30,
          level: 1,
          wins: 1,
          losses: 0,
          draws: 0,
          eloRating: 1000,
          avatarUrl: telegramAvatarUrl,
          onboarding: { starterBoostersAvailable: false, collectionReady: true, deckReady: true, completed: true },
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });

  await playUntilRewardOverlay(page);
  await expect(page.getByTestId("reward-summary")).toBeVisible({ timeout: 60_000 });

  const avatar = page.getByTestId("reward-avatar-image");
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute("src", telegramAvatarUrl);
  await expect(avatar).not.toHaveAttribute("src", /\/_next\/image/);
});

test("reward overlay swaps to the default character art when the avatar URL fails to load", async ({ page }) => {
  const brokenAvatarUrl = "https://t.me/i/userpic/broken.jpg";
  await mockDeckReadyProfile(page, { avatarUrl: brokenAvatarUrl });

  await page.route(brokenAvatarUrl, async (route) => {
    await route.fulfill({ status: 404, body: "" });
  });

  await page.route("**/api/player/match-finished", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rewards: PVE_NO_LEVEL_REWARDS,
        player: {
          id: "player-deck-ready-e2e",
          identity: { mode: "guest", guestId: "guest-deck-ready-e2e" },
          ownedCardIds: [],
          deckIds: [],
          starterFreeBoostersRemaining: 0,
          openedBoosterIds: ["neon-breach", "factory-shift"],
          crystals: 0,
          totalXp: 30,
          level: 1,
          wins: 1,
          losses: 0,
          draws: 0,
          eloRating: 1000,
          avatarUrl: brokenAvatarUrl,
          onboarding: { starterBoostersAvailable: false, collectionReady: true, deckReady: true, completed: true },
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });

  await playUntilRewardOverlay(page);
  await expect(page.getByTestId("reward-summary")).toBeVisible({ timeout: 60_000 });

  const avatar = page.getByTestId("reward-avatar-image");
  await expect(avatar).toHaveAttribute("src", "/nexus-assets/characters/cyber-brawler-thumb.png", { timeout: 10_000 });
});

async function playUntilRewardOverlay(page: Page) {
  for (let round = 0; round < 12; round += 1) {
    if (await page.getByTestId("reward-summary").isVisible().catch(() => false)) return;

    await expect
      .poll(
        async () => {
          if (await page.getByTestId("reward-summary").isVisible().catch(() => false)) return "reward";
          if ((await countEnabledPlayerCards(page)) > 0) return "card";
          return "waiting";
        },
        { timeout: 30_000 },
      )
      .not.toBe("waiting");

    if (await page.getByTestId("reward-summary").isVisible().catch(() => false)) return;

    const cardButton = await getFirstEnabledPlayerCard(page);
    await cardButton.scrollIntoViewIfNeeded();
    await cardButton.click();
    await expect(page.getByTestId("selection-overlay")).toBeVisible();
    await page.getByTestId("selection-ok").click();

    await expect
      .poll(
        async () => {
          if (await page.getByTestId("reward-summary").isVisible().catch(() => false)) return "reward";
          if (await page.getByTestId("battle-overlay").isVisible().catch(() => false)) return "battle";
          return "next";
        },
        { timeout: 30_000 },
      )
      .not.toBe("next");

    if (await page.getByTestId("reward-summary").isVisible().catch(() => false)) return;
    await expect(page.getByTestId("battle-overlay")).toBeHidden({ timeout: 30_000 });
  }
}

async function getFirstEnabledPlayerCard(page: Page) {
  const cardButtons = page.locator('[data-testid^="player-card-"]');
  const count = await cardButtons.count();

  for (let index = 0; index < count; index += 1) {
    const cardButton = cardButtons.nth(index);
    if (await cardButton.isEnabled()) return cardButton;
  }

  throw new Error("No enabled player cards found.");
}

async function countEnabledPlayerCards(page: Page) {
  const cardButtons = page.locator('[data-testid^="player-card-"]');
  const count = await cardButtons.count();
  let enabled = 0;

  for (let index = 0; index < count; index += 1) {
    if (await cardButtons.nth(index).isEnabled()) enabled += 1;
  }

  return enabled;
}
