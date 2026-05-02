import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "phone portrait", width: 350, height: 760 },
  { name: "phone landscape", width: 844, height: 390 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`fits the full battle board on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openBattle(page);

    const metrics = await page.evaluate(() => {
      const board = document.querySelector(".battle-board")?.getBoundingClientRect();
      const top = document.querySelector('[data-testid="turn-timer"]')?.getBoundingClientRect();
      const bottom = document.querySelector('[data-testid="round-marker"]')?.getBoundingClientRect();
      const rect = (value?: DOMRect) =>
        value
          ? {
              top: value.top,
              bottom: value.bottom,
              left: value.left,
              right: value.right,
              width: value.width,
              height: value.height,
            }
          : null;

      return {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerWidth,
        innerHeight,
        board: rect(board),
        top: rect(top),
        bottom: rect(bottom),
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.board?.top ?? -1).toBeGreaterThanOrEqual(0);
    expect(metrics.board?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.top?.top ?? -1).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(metrics.innerHeight + 1);

    const cardLabelFailures = await getCardLabelFailures(page, ".battle-hand .battle-card-face");
    const cardRatios = await page.locator(".battle-hand .battle-card-face").evaluateAll((cards) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return rect.width / rect.height;
      }),
    );

    expect(cardLabelFailures).toEqual([]);
    if (viewport.name === "phone landscape") {
      for (const ratio of cardRatios) {
        expect(ratio).toBeGreaterThan(0.58);
        expect(ratio).toBeLessThan(0.74);
      }
    }
  });
}

test("keeps duel cards readable with enough portrait breathing room", async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 760 });
  await openBattle(page);

  await page.locator('[data-testid^="player-card-"]').first().click();
  await expect(page.getByTestId("selection-overlay")).toBeVisible();
  await page.getByTestId("selection-ok").click();
  await expect(page.getByTestId("battle-overlay")).toBeVisible({ timeout: 10_000 });

  const metrics = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="battle-overlay"] .battle-overlay-stage')?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('[data-testid="battle-overlay"] .battle-card-face')].map((card) => card.getBoundingClientRect());

    return {
      stageBottom: stage?.bottom ?? null,
      cardBottoms: cards.map((card) => card.bottom),
    };
  });
  const cardLabelFailures = await getCardLabelFailures(page, '[data-testid="battle-overlay"] .battle-card-face');

  expect(metrics.stageBottom).not.toBeNull();
  for (const cardBottom of metrics.cardBottoms) {
    expect(cardBottom).toBeLessThanOrEqual((metrics.stageBottom ?? 0) - 80);
  }
  expect(cardLabelFailures).toEqual([]);
});

test("keeps the desktop board compact on tall screens", async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 1536 });
  await openBattle(page);

  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const enemyHand = rect(".battle-hand--enemy");
    const arena = rect(".battle-arena-strip");
    const playerHand = rect(".battle-hand--player");
    const cards = [...document.querySelectorAll(".battle-hand .battle-card-face")].map((card) => {
      const bounds = card.getBoundingClientRect();
      return bounds.width / bounds.height;
    });

    return {
      enemyToArenaGap: arena && enemyHand ? arena.top - enemyHand.bottom : null,
      arenaToPlayerGap: playerHand && arena ? playerHand.top - arena.bottom : null,
      cardRatios: cards,
    };
  });

  expect(metrics.enemyToArenaGap).not.toBeNull();
  expect(metrics.arenaToPlayerGap).not.toBeNull();
  expect(metrics.enemyToArenaGap ?? Number.POSITIVE_INFINITY).toBeLessThan(180);
  expect(metrics.arenaToPlayerGap ?? Number.POSITIVE_INFINITY).toBeLessThan(180);
  for (const ratio of metrics.cardRatios) {
    expect(ratio).toBeGreaterThan(0.58);
    expect(ratio).toBeLessThan(0.74);
  }
});

async function openBattle(page: Page) {
  await page.goto("/");
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("phase-overlay")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("round-status")).toBeVisible();
}

async function getCardLabelFailures(page: Page, cardSelector: string) {
  return page.evaluate((selector) => {
    const rect = (value: Element) => value.getBoundingClientRect();

    return [...document.querySelectorAll(selector)].flatMap((card, cardIndex) => {
      const cardRect = rect(card);
      const labels = [...card.querySelectorAll("[data-card-ability], [data-card-bonus]")];

      if (labels.length !== 2) return [`card ${cardIndex}: missing labels`];

      return labels.flatMap((label) => {
        const labelRect = rect(label);
        const kind = label.hasAttribute("data-card-ability") ? "ability" : "bonus";
        const failures = [];

        if (labelRect.top < cardRect.top - 0.5) failures.push(`${kind} top clipped`);
        if (labelRect.bottom > cardRect.bottom + 0.5) failures.push(`${kind} bottom clipped`);
        if (labelRect.left < cardRect.left - 0.5) failures.push(`${kind} left clipped`);
        if (labelRect.right > cardRect.right + 0.5) failures.push(`${kind} right clipped`);
        if (labelRect.width < 20) failures.push(`${kind} too narrow`);
        if (labelRect.height < 10) failures.push(`${kind} too short`);

        return failures.map((failure) => `card ${cardIndex}: ${failure}`);
      });
    });
  }, cardSelector);
}
