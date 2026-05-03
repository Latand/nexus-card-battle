import { expect, test } from "@playwright/test";
import { mockDeckReadyProfile } from "./fixtures/playerProfile";

const SECTION_TITLES = [
  "Як грати в бій",
  "Формула атаки",
  "Здібності та бонуси",
  "Статуси",
  "Карти і колекція",
  "Бустери",
  "Кристали і рівні",
  "PvP та рейтинг",
] as const;

test("renders the guide page with all eight uk-UA sections", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/guide");

  await expect(page.getByRole("heading", { level: 1, name: /Як грати/ })).toBeVisible();

  for (const title of SECTION_TITLES) {
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  }
});

test("anchor nav scrolls the matching section into view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/guide");

  await page.getByTestId("guide-nav-pvp-and-rating").click();

  const target = page.getByTestId("guide-section-pvp-and-rating");
  await expect(target).toBeVisible();
  await expect.poll(async () => isInViewport(page, "guide-section-pvp-and-rating")).toBeTruthy();
});

test("PlayerHud sidebar exposes a Як грати link that routes to /guide", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockDeckReadyProfile(page);
  await page.goto("/");

  const sidebarLink = page.getByTestId("player-hud-guide-link");
  await expect(sidebarLink).toBeVisible();
  await expect(sidebarLink).toHaveText(/Як грати/);

  await sidebarLink.click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("heading", { level: 1, name: /Як грати/ })).toBeVisible();
});

test("PlayerHud mobile strip exposes a Як грати link that routes to /guide", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDeckReadyProfile(page);
  await page.goto("/");

  const mobileLink = page.getByTestId("player-hud-guide-link-mobile");
  await expect(mobileLink).toBeVisible();

  await mobileLink.click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("heading", { level: 1, name: /Як грати/ })).toBeVisible();
});

test("Як грати link is hidden during an active battle", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockDeckReadyProfile(page);
  await page.goto("/");

  await expect(page.getByTestId("player-hud-guide-link")).toBeVisible();

  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("round-status")).toBeVisible({ timeout: 10_000 });

  await expect(page.getByTestId("player-hud-guide-link")).toHaveCount(0);
  await expect(page.getByTestId("player-hud-guide-link-mobile")).toHaveCount(0);
});

async function isInViewport(page: import("@playwright/test").Page, testId: string) {
  return page.evaluate((selector) => {
    const node = document.querySelector(selector);
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    return rect.top < viewportHeight && rect.bottom > 0;
  }, `[data-testid="${testId}"]`);
}
