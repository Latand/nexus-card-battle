// Screenshot the booster catalog for visual review.
// Usage: bun scripts/screenshot-booster-catalog.mjs [baseUrl]
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3011";
const outDir = "responsive-screenshots";

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

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });

    // Wait for booster catalog to render.
    await page.waitForSelector('[data-testid="starter-booster-catalog"]', { timeout: 15_000 });

    const path = `${outDir}/booster-catalog-${vp.name}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`captured ${path}`);

    await context.close();
  }
} finally {
  await browser.close();
}
