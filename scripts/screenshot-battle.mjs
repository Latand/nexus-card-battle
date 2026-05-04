// Screenshot the BattleGame against AI by mocking a complete profile and clicking "Грати".
import { chromium } from "playwright";
import { cards } from "../src/features/battle/model/cards.js";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3011";
const outDir = "responsive-screenshots";

const deckIds = cards
  .filter((c) => c.clan === "Workers")
  .slice(0, 9)
  .map((c) => c.id);
const ownedCardIds = [
  ...deckIds,
  ...cards
    .filter((c) => !deckIds.includes(c.id))
    .slice(0, 30)
    .map((c) => c.id),
];

const playerBody = {
  player: {
    id: "screenshot-battle",
    identity: { mode: "guest", guestId: "screenshot-battle" },
    ownedCardIds,
    ownedCards: ownedCardIds.map((cardId) => ({ cardId, count: 1 })),
    deckIds,
    starterFreeBoostersRemaining: 0,
    openedBoosterIds: ["neon-breach", "factory-shift"],
    onboarding: {
      starterBoostersAvailable: false,
      collectionReady: true,
      deckReady: true,
      completed: true,
    },
  },
};

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-350", width: 350, height: 800 },
];

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/home/latand/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
});
try {
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    await page.route("**/api/player", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(playerBody),
      });
    });
    await page.route("**/api/player/deck", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(playerBody),
      });
    });

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForSelector('[data-testid="play-selected-deck"]', { timeout: 15_000 });
    await page.click('[data-testid="play-selected-deck"]');
    await page.waitForSelector('[data-testid="round-status"]', { timeout: 15_000 });
    await page.waitForTimeout(800);

    const path = `${outDir}/battle-${vp.name}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(`captured ${path}`);

    await context.close();
  }
} finally {
  await browser.close();
}
