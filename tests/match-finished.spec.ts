import { expect, test, type Page } from "@playwright/test";
import { mockDeckReadyProfile } from "./fixtures/playerProfile";

type MatchFinishedRequestBody = {
  identity?: { mode?: string; guestId?: string; telegramId?: string };
  mode?: string;
  result?: string;
};

const PVE_LEVEL_UP_REWARDS = {
  matchXp: 30,
  levelProgress: 12,
  cardRewards: [],
  deltaXp: 30,
  deltaCrystals: 50,
  leveledUp: true,
  levelUpBonusCrystals: 50,
  newTotals: { crystals: 50, totalXp: 225, level: 2 },
};

const PVE_NO_LEVEL_REWARDS = {
  matchXp: 30,
  levelProgress: 15,
  cardRewards: [],
  deltaXp: 30,
  deltaCrystals: 0,
  leveledUp: false,
  levelUpBonusCrystals: 0,
  newTotals: { crystals: 0, totalXp: 30, level: 1 },
};

test("PvE reward overlay renders the persisted XP tile and level-up tile from /api/player/match-finished", async ({ page }) => {
  await mockDeckReadyProfile(page);

  const matchFinishedRequests: MatchFinishedRequestBody[] = [];
  await page.route("**/api/player/match-finished", async (route) => {
    const body = route.request().postDataJSON() as MatchFinishedRequestBody;
    matchFinishedRequests.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rewards: PVE_LEVEL_UP_REWARDS,
        player: {
          id: "player-deck-ready-e2e",
          identity: body.identity,
          ownedCardIds: [],
          deckIds: [],
          starterFreeBoostersRemaining: 0,
          openedBoosterIds: ["neon-breach", "factory-shift"],
          crystals: PVE_LEVEL_UP_REWARDS.newTotals.crystals,
          totalXp: PVE_LEVEL_UP_REWARDS.newTotals.totalXp,
          level: PVE_LEVEL_UP_REWARDS.newTotals.level,
          wins: 1,
          losses: 0,
          draws: 0,
          onboarding: {
            starterBoostersAvailable: false,
            collectionReady: true,
            deckReady: true,
            completed: true,
          },
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("play-selected-deck")).toBeVisible();
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });

  // Play whatever the AI gives us; we only care about reaching the reward
  // overlay. The endpoint is mocked so the displayed delta + level-up are
  // independent of the RNG-driven match outcome.
  await playUntilRewardOverlay(page);

  await expect(page.getByTestId("reward-summary")).toBeVisible({ timeout: 60_000 });

  // The endpoint was called with the PvE mode and a valid result bucket.
  await expect.poll(() => matchFinishedRequests.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  expect(matchFinishedRequests[0]?.mode).toBe("pve");
  expect(["win", "draw", "loss"]).toContain(matchFinishedRequests[0]?.result);

  // Persisted XP tile reflects the +30 PvE win delta.
  const xpTile = page.getByTestId("reward-user-xp-tile");
  await expect(xpTile).toBeVisible();
  await expect(xpTile).toHaveAttribute("data-delta-xp", "30");
  await expect(page.getByTestId("reward-user-xp-line")).toContainText("+30 XP");
  await expect(page.getByTestId("reward-user-xp-line")).toContainText("рівень 2");

  // Level-up tile renders when leveledUp = true and shows the new_level * 25 crystal bonus.
  const levelUpTile = page.getByTestId("reward-level-up-tile");
  await expect(levelUpTile).toBeVisible();
  await expect(levelUpTile).toHaveAttribute("data-new-level", "2");
  await expect(levelUpTile).toHaveAttribute("data-level-up-bonus", "50");
  await expect(page.getByTestId("reward-level-up-headline")).toContainText("Рівень 2");
  await expect(page.getByTestId("reward-level-up-headline")).toContainText("+50 💎");
});

test("PvE reward overlay hides the level-up tile when leveledUp is false", async ({ page }) => {
  await mockDeckReadyProfile(page);

  await page.route("**/api/player/match-finished", async (route) => {
    const body = route.request().postDataJSON() as MatchFinishedRequestBody;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rewards: PVE_NO_LEVEL_REWARDS,
        player: {
          id: "player-deck-ready-e2e",
          identity: body.identity,
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
          onboarding: {
            starterBoostersAvailable: false,
            collectionReady: true,
            deckReady: true,
            completed: true,
          },
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });

  await playUntilRewardOverlay(page);
  await expect(page.getByTestId("reward-summary")).toBeVisible({ timeout: 60_000 });

  const xpTile = page.getByTestId("reward-user-xp-tile");
  await expect(xpTile).toBeVisible();
  await expect(xpTile).toHaveAttribute("data-delta-xp", "30");
  await expect(page.getByTestId("reward-level-up-tile")).toHaveCount(0);
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

    // Wait for the battle overlay sequence to clear (or for the reward overlay
    // to appear if this was the deciding round).
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
