import { expect, test, type Page } from "@playwright/test";
import { mockDeckReadyProfile } from "./fixtures/playerProfile";

type MatchFinishedRequestBody = {
  identity?: { mode?: string; guestId?: string; telegramId?: string };
  mode?: string;
  result?: string;
};

const MILESTONE_REWARDS_PAYLOAD = {
  matchXp: 100,
  levelProgress: 12,
  cardRewards: [],
  milestoneCardRewards: [
    { cardId: "milestone-unique-1", cardName: "Тестовий легіонер", rarity: "Unique" as const },
  ],
  deltaXp: 100,
  deltaCrystals: 50 + 125,
  leveledUp: true,
  levelUpBonusCrystals: 125,
  newTotals: { crystals: 175, totalXp: 2700, level: 5 },
};

test("PvE reward overlay renders the milestone-card tile when milestoneCardRewards is non-empty", async ({ page }) => {
  await mockDeckReadyProfile(page);

  await page.route("**/api/player/match-finished", async (route) => {
    const body = route.request().postDataJSON() as MatchFinishedRequestBody;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rewards: MILESTONE_REWARDS_PAYLOAD,
        player: {
          id: "player-deck-ready-e2e",
          identity: body.identity,
          ownedCards: [],
          deckIds: [],
          starterFreeBoostersRemaining: 0,
          openedBoosterIds: ["neon-breach", "factory-shift"],
          crystals: MILESTONE_REWARDS_PAYLOAD.newTotals.crystals,
          totalXp: MILESTONE_REWARDS_PAYLOAD.newTotals.totalXp,
          level: MILESTONE_REWARDS_PAYLOAD.newTotals.level,
          wins: 1,
          losses: 0,
          draws: 0,
          eloRating: 1000,
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

  await playUntilRewardOverlay(page);
  await expect(page.getByTestId("reward-summary")).toBeVisible({ timeout: 60_000 });

  // Milestone tile is present and tagged with the right rarity / cardId.
  const milestoneTiles = page.getByTestId("reward-milestone-tile");
  await expect(milestoneTiles).toHaveCount(1);
  await expect(milestoneTiles.first()).toHaveAttribute("data-rarity", "Unique");
  await expect(milestoneTiles.first()).toHaveAttribute("data-card-id", "milestone-unique-1");
  await expect(milestoneTiles.first()).toContainText("Тестовий легіонер");
  // uk-UA rarity translation.
  await expect(milestoneTiles.first()).toContainText("Унікальна");
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
