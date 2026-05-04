// Screenshot the CollectionDeckScreen with a mocked completed-onboarding profile.
import { chromium } from "playwright";
import { cards } from "../src/features/battle/model/cards.js";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3011";
const outDir = "responsive-screenshots";

// Pick a varied 10-card deck from real cards (for visual variety).
const deckIds = [
  "dahack-1645",
  "dahack-110",
  "aliens-201",
  "workers-401",
  "micron-1",
  "street-301",
  "kingpin-1701",
  "circus-501",
  "gamblers-1401",
  "saints-1101",
].filter((id) => cards.some((c) => c.id === id));

// Add fallback if some IDs don't exist — just use the first 10 cards.
if (deckIds.length < 10) {
  deckIds.length = 0;
  deckIds.push(...cards.slice(0, 10).map((c) => c.id));
}

// Owned collection: deck + 30 more random cards for variety.
const ownedCardIds = [
  ...deckIds,
  ...cards
    .filter((c) => !deckIds.includes(c.id))
    .slice(0, 30)
    .map((c) => c.id),
];

const playerBody = {
  player: {
    id: "screenshot-collection",
    identity: { mode: "guest", guestId: "screenshot-collection" },
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
  { name: "mobile-350", width: 350, height: 900 },
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
    await page.waitForSelector('[data-testid="collection-search"]', { timeout: 15_000 });

    const path = `${outDir}/collection-${vp.name}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`captured ${path}`);

    await context.close();
  }
} finally {
  await browser.close();
}
