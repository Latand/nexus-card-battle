import { expect, test } from "@playwright/test";

test("pairs two tabs and resolves the first human round", async ({ context, page }) => {
  const first = page;
  const second = await context.newPage();

  await first.goto("/");
  await second.goto("/");

  await expect(first.getByTestId("play-human-match")).toBeEnabled();
  await expect(second.getByTestId("play-human-match")).toBeEnabled();
  await expect.poll(() => readSavedDeckIds(first)).toHaveLength(9);
  await expect.poll(() => readSavedDeckIds(second)).toHaveLength(9);

  await first.getByTestId("play-human-match").click();
  await second.getByTestId("play-human-match").click();

  await expect(first.getByTestId("round-status")).toBeVisible({ timeout: 12_000 });
  await expect(second.getByTestId("round-status")).toBeVisible({ timeout: 12_000 });

  const firstMover = await resolveFirstMover(first, second);
  const secondMover = firstMover === first ? second : first;

  const firstMoverCardId = await pickFirstCard(firstMover);
  await expect(secondMover.getByTestId("round-status")).toContainText("Your Turn", { timeout: 8_000 });

  await pickFirstCard(secondMover, { knownEnemyCard: true });

  await expect(first.getByTestId("battle-overlay")).toHaveAttribute("data-phase", "battle_intro", { timeout: 8_000 });
  await expect(second.getByTestId("battle-overlay")).toHaveAttribute("data-phase", "battle_intro", { timeout: 8_000 });
  await expect(firstMover.getByTestId("battle-overlay")).toBeHidden({ timeout: 24_000 });
  await expect(firstMover.getByTestId(`player-card-${firstMoverCardId}`)).toHaveClass(/opacity-35/, { timeout: 12_000 });

  await second.close();
});

async function resolveFirstMover(
  first: import("@playwright/test").Page,
  second: import("@playwright/test").Page,
) {
  await expect
    .poll(
      async () => {
        const firstText = await first.getByTestId("round-status").textContent().catch(() => "");
        const secondText = await second.getByTestId("round-status").textContent().catch(() => "");

        if (firstText?.includes("Your Turn")) return "first";
        if (secondText?.includes("Your Turn")) return "second";
        return "waiting";
      },
      { timeout: 12_000 },
    )
    .not.toBe("waiting");

  return (await first.getByTestId("round-status").textContent())?.includes("Your Turn") ? first : second;
}

async function pickFirstCard(page: import("@playwright/test").Page, options: { knownEnemyCard?: boolean } = {}) {
  const cardButton = await getFirstEnabledPlayerCard(page);
  const testId = await cardButton.getAttribute("data-testid");
  const cardId = testId?.replace("player-card-", "");
  expect(cardId).toBeTruthy();
  await cardButton.click();

  await expect(page.getByTestId("selection-overlay")).toBeVisible();
  if (options.knownEnemyCard) {
    await expect(page.getByTestId("known-enemy-card")).toBeVisible();
  }

  await page.getByTestId("selection-ok").click();
  return cardId as string;
}

async function getFirstEnabledPlayerCard(page: import("@playwright/test").Page) {
  const cardButtons = page.locator('[data-testid^="player-card-"]');
  await expect.poll(async () => countEnabledPlayerCards(page), { timeout: 12_000 }).toBeGreaterThan(0);

  const count = await cardButtons.count();
  for (let index = 0; index < count; index += 1) {
    const cardButton = cardButtons.nth(index);
    if (await cardButton.isEnabled()) return cardButton;
  }

  throw new Error("No enabled player cards found.");
}

async function countEnabledPlayerCards(page: import("@playwright/test").Page) {
  const cardButtons = page.locator('[data-testid^="player-card-"]');
  const count = await cardButtons.count();
  let enabled = 0;

  for (let index = 0; index < count; index += 1) {
    if (await cardButtons.nth(index).isEnabled()) enabled += 1;
  }

  return enabled;
}

async function readSavedDeckIds(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem("nexus:deck-session:v1");
    return raw ? (JSON.parse(raw) as string[]) : [];
  });
}
