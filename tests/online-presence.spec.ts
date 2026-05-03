import { expect, test, type Locator, type Page } from "@playwright/test";
import type { PlayerIdentity } from "../src/features/player/profile/types";
import { mockDeckReadyProfile } from "./fixtures/playerProfile";

function presenceIdentity(slug: string): PlayerIdentity {
  return { mode: "guest", guestId: `guest-presence-${slug}` };
}

// The dev server is shared across the whole test run (Playwright's
// `reuseExistingServer: true`). Other tests' WebSocket connections take time
// to close after their browser context exits, so the absolute presence count
// drifts up and down asynchronously. We assert the *directional* behavior of
// our two contexts: opening pageB makes the slotA count ≥ baseline+1 at some
// observable moment; closing contextB makes the slotA count drop strictly
// below the post-connect peak.

async function readPresenceCount(slot: Locator): Promise<number> {
  const raw = await slot.getAttribute("data-online-count");
  if (raw === null || raw === "") return Number.NaN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function waitForPresenceCountAtLeast(slot: Locator, minimum: number, timeout = 15_000) {
  await expect
    .poll(
      async () => {
        const value = await readPresenceCount(slot);
        return Number.isFinite(value) && value >= minimum;
      },
      { timeout },
    )
    .toBe(true);
}

async function waitForCount(slot: Locator, predicate: (current: number) => boolean, timeout = 20_000) {
  await expect
    .poll(
      async () => {
        const value = await readPresenceCount(slot);
        return Number.isFinite(value) && predicate(value);
      },
      { timeout },
    )
    .toBe(true);
}

async function expectVisibleOnlineLabel(page: Page, slotTestId: string) {
  const slot = page.getByTestId(slotTestId);
  await expect(slot).toBeVisible({ timeout: 15_000 });
  return slot;
}

test("desktop sidebar HUD shows the live online count and increments on connect, decrements on disconnect", async ({ baseURL, browser }) => {
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await mockDeckReadyProfile(pageA, { identity: presenceIdentity("a"), eloRating: 1100 });
    await mockDeckReadyProfile(pageB, { identity: presenceIdentity("b"), eloRating: 1100 });

    await pageA.goto(baseURL ?? "/");
    const slotA = await expectVisibleOnlineLabel(pageA, "player-hud-online-slot");
    await waitForPresenceCountAtLeast(slotA, 1);

    const beforeConnect = await readPresenceCount(slotA);
    expect(beforeConnect).toBeGreaterThanOrEqual(1);
    await expect(pageA.getByTestId("player-hud-online-count")).toBeVisible();

    await pageB.goto(baseURL ?? "/");
    const slotB = await expectVisibleOnlineLabel(pageB, "player-hud-online-slot");

    // After pageB connects, both clients should observe a count ≥ baseline+1
    // at some point; absolute parity is racy because other tests' sockets are
    // closing in parallel.
    await waitForCount(slotA, (current) => current >= beforeConnect + 1);
    await waitForCount(slotB, (current) => current >= beforeConnect + 1);

    const peakA = await readPresenceCount(slotA);

    await contextB.close();

    // After pageB disconnects, slotA should observe a count strictly less than
    // its post-connect peak.
    await waitForCount(slotA, (current) => current < peakA);
  } finally {
    await contextA.close().catch(() => {});
    await contextB.close().catch(() => {});
  }
});

test("mobile top-strip HUD renders a compact online indicator that reflects connect/disconnect", async ({ baseURL, browser }) => {
  const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await mockDeckReadyProfile(pageA, { identity: presenceIdentity("mobile-a"), eloRating: 1100 });
    await mockDeckReadyProfile(pageB, { identity: presenceIdentity("mobile-b"), eloRating: 1100 });

    await pageA.goto(baseURL ?? "/");
    const slotA = await expectVisibleOnlineLabel(pageA, "player-hud-online-slot-mobile");
    await waitForPresenceCountAtLeast(slotA, 1);

    const beforeConnect = await readPresenceCount(slotA);
    expect(beforeConnect).toBeGreaterThanOrEqual(1);
    await expect(pageA.getByTestId("player-hud-online-count-mobile")).toBeVisible();

    await pageB.goto(baseURL ?? "/");

    await waitForCount(slotA, (current) => current >= beforeConnect + 1);
    const peakA = await readPresenceCount(slotA);

    await contextB.close();

    await waitForCount(slotA, (current) => current < peakA);
  } finally {
    await contextA.close().catch(() => {});
    await contextB.close().catch(() => {});
  }
});
