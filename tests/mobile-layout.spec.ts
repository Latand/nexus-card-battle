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
  });
}

async function openBattle(page: Page) {
  await page.goto("/");
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("phase-overlay")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("round-status")).toBeVisible();
}
