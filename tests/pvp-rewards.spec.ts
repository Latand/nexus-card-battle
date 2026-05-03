import { expect, test, type Page } from "@playwright/test";
import type { PlayerIdentity } from "../src/features/player/profile/types";
import { mockDeckReadyProfile } from "./fixtures/playerProfile";

test("PvP reward overlay renders the crystal tile after a server-pushed forfeit win", async ({ baseURL, browser }) => {
  const winnerContext = await browser.newContext();
  const loserContext = await browser.newContext();
  const winnerPage = await winnerContext.newPage();
  const loserPage = await loserContext.newPage();
  const winnerIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pvp-overlay-win" };
  const loserIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pvp-overlay-loss" };

  try {
    await mockDeckReadyProfile(winnerPage, { identity: winnerIdentity });
    await mockDeckReadyProfile(loserPage, { identity: loserIdentity });

    // Inject a global hook that captures the BattleGame WebSocket so the test
    // can drive a server-authoritative match end without relying on the
    // 75-second turn timer.
    await Promise.all([
      installSocketCapture(winnerPage),
      installSocketCapture(loserPage),
    ]);

    await winnerPage.goto(baseURL ?? "/");
    await loserPage.goto(baseURL ?? "/");

    await expect(winnerPage.getByTestId("play-human-match")).toBeEnabled({ timeout: 15_000 });
    await expect(loserPage.getByTestId("play-human-match")).toBeEnabled({ timeout: 15_000 });

    await Promise.all([
      winnerPage.getByTestId("play-human-match").click(),
      loserPage.getByTestId("play-human-match").click(),
    ]);

    await expect(winnerPage.getByTestId("round-status")).toBeVisible({ timeout: 20_000 });
    await expect(loserPage.getByTestId("round-status")).toBeVisible({ timeout: 20_000 });

    // Server promotes the active player; whichever tab has enabled cards is
    // the one whose turn_timeout will be accepted.
    const firstMover = await resolveFirstMover(winnerPage, loserPage);

    const matchInfo = await firstMover.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const captured = (window as any).__nexusBattleSocket as { send: (m: unknown) => void; matchId: string; round: number } | undefined;
      if (!captured) throw new Error("Battle socket capture missing.");
      captured.send({ type: "turn_timeout", matchId: captured.matchId, round: captured.round });
      return { matchId: captured.matchId };
    });
    expect(matchInfo.matchId).toBeTruthy();

    await expect(winnerPage.getByTestId("reward-summary")).toBeVisible({ timeout: 30_000 });
    await expect(loserPage.getByTestId("reward-summary")).toBeVisible({ timeout: 30_000 });

    // Whoever the server declared the winner sees the 💎 tile.
    const winnerTileCount = await winnerPage.getByTestId("reward-crystals-tile").count();
    const loserTileCount = await loserPage.getByTestId("reward-crystals-tile").count();
    expect(winnerTileCount + loserTileCount).toBeGreaterThanOrEqual(1);

    const winningPage = winnerTileCount === 1 ? winnerPage : loserPage;
    const losingPage = winnerTileCount === 1 ? loserPage : winnerPage;

    const crystalsTile = winningPage.getByTestId("reward-crystals-tile");
    await expect(crystalsTile).toHaveAttribute("data-delta-crystals", "50");
    await expect(crystalsTile).toHaveAttribute("data-new-crystals", "50");
    await expect(winningPage.getByTestId("reward-crystals-line")).toContainText("всього 50");

    // Match-result title is color-coded per outcome (victory / defeat tone).
    await expect(winningPage.getByTestId("reward-title")).toHaveText("ПЕРЕМОГА");
    await expect(losingPage.getByTestId("reward-title")).toHaveText("ПОРАЗКА");
    await expect(winningPage.getByTestId("reward-title-block")).toHaveAttribute("data-tone", "victory");
    await expect(losingPage.getByTestId("reward-title-block")).toHaveAttribute("data-tone", "defeat");

    // Avatar block: both sides see avatar + name + level + XP bar.
    await expect(winningPage.getByTestId("reward-avatar-block")).toBeVisible();
    await expect(losingPage.getByTestId("reward-avatar-block")).toBeVisible();
    await expect(winningPage.getByTestId("reward-xp-label")).toContainText("+100 XP");
    await expect(losingPage.getByTestId("reward-xp-label")).toContainText("+10 XP");

    // Both PvP sides see the ELO tile with matching equal-and-opposite deltas
    // (default 1000 vs 1000 → winner +16 → 1016, loser -16 → 984).
    const winnerEloTile = winningPage.getByTestId("reward-elo-tile");
    const loserEloTile = losingPage.getByTestId("reward-elo-tile");
    await expect(winnerEloTile).toBeVisible();
    await expect(loserEloTile).toBeVisible();
    await expect(winnerEloTile).toHaveAttribute("data-delta-elo", "16");
    await expect(winnerEloTile).toHaveAttribute("data-new-elo", "1016");
    await expect(winnerEloTile).toHaveAttribute("data-tone", "elo");
    await expect(loserEloTile).toHaveAttribute("data-delta-elo", "-16");
    await expect(loserEloTile).toHaveAttribute("data-new-elo", "984");
    await expect(loserEloTile).toHaveAttribute("data-tone", "loss");
    await expect(winningPage.getByTestId("reward-elo-line")).toContainText("1000 → 1016");
    await expect(losingPage.getByTestId("reward-elo-line")).toContainText("1000 → 984");

    // Loser sees no crystals tile (delta = 0) and no level-up tile.
    await expect(losingPage.getByTestId("reward-crystals-tile")).toHaveCount(0);
    await expect(losingPage.getByTestId("reward-level-up-tile")).toHaveCount(0);

    // Card-progress section is fully hidden on the new overlay.
    const cardRewardLocator = losingPage.locator('[data-testid^="reward-card-"]');
    await expect(cardRewardLocator).toHaveCount(0);

    // Both action buttons are present on every reward overlay.
    await expect(winningPage.getByTestId("reward-replay-ai")).toBeVisible();
    await expect(winningPage.getByTestId("reward-replay-human")).toBeVisible();
    await expect(losingPage.getByTestId("reward-replay-ai")).toBeVisible();
    await expect(losingPage.getByTestId("reward-replay-human")).toBeVisible();

    // Clicking PvP from a finished PvP match re-enters the queue immediately.
    const winnerReplayPvp = winningPage.getByTestId("reward-replay-human");
    await expect(winnerReplayPvp).toContainText("PvP");
    await winnerReplayPvp.click();
    await expect(winningPage.getByTestId("reward-summary")).toBeHidden({ timeout: 5_000 });
    const humanOverlay = winningPage.getByTestId("human-match-overlay");
    await expect(humanOverlay).toBeVisible({ timeout: 5_000 });
    await expect(humanOverlay).toContainText(/Пошук суперника|Підключення/);

    // Drain the queue before the test exits so the next spec's matchmaking
    // assertions don't see a leftover session from this PvP re-entry.
    await winningPage.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const captured = (window as any).__nexusBattleSocket as { send: (m: unknown) => void } | undefined;
      captured?.send({ type: "cancel_queue" });
    });
  } finally {
    await winnerContext.close();
    await loserContext.close();
  }
});

async function installSocketCapture(page: Page) {
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    class CapturedWebSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (String(url).endsWith("/ws")) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const captured: any = {
            send: (message: unknown) => super.send(JSON.stringify(message)),
            matchId: "",
            round: 1,
            inject: (message: unknown) => {
              this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
            },
          };
          this.addEventListener("message", (event) => {
            try {
              const parsed = JSON.parse(String((event as MessageEvent).data));
              if (parsed?.type === "match_ready") {
                captured.matchId = parsed.matchId;
              }
              if (parsed?.type === "round_resolved") {
                captured.round = (parsed.round || captured.round) + 1;
              }
            } catch {}
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__nexusBattleSocket = captured;
        }
      }
    }
    window.WebSocket = CapturedWebSocket as unknown as typeof WebSocket;
  });
}

test("ignores reward_summary payloads that arrive for a different matchId", async ({ baseURL, browser }) => {
  const winnerContext = await browser.newContext();
  const loserContext = await browser.newContext();
  const winnerPage = await winnerContext.newPage();
  const loserPage = await loserContext.newPage();
  const winnerIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pvp-stale-win" };
  const loserIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pvp-stale-loss" };

  try {
    await mockDeckReadyProfile(winnerPage, { identity: winnerIdentity });
    await mockDeckReadyProfile(loserPage, { identity: loserIdentity });

    await Promise.all([installSocketCapture(winnerPage), installSocketCapture(loserPage)]);

    await winnerPage.goto(baseURL ?? "/");
    await loserPage.goto(baseURL ?? "/");

    await expect(winnerPage.getByTestId("play-human-match")).toBeEnabled({ timeout: 15_000 });
    await expect(loserPage.getByTestId("play-human-match")).toBeEnabled({ timeout: 15_000 });

    await Promise.all([
      winnerPage.getByTestId("play-human-match").click(),
      loserPage.getByTestId("play-human-match").click(),
    ]);

    await expect(winnerPage.getByTestId("round-status")).toBeVisible({ timeout: 20_000 });
    await expect(loserPage.getByTestId("round-status")).toBeVisible({ timeout: 20_000 });

    await winnerPage.evaluate(() => {
      const stalePayload = {
        matchXp: 999,
        levelProgress: 100,
        cardRewards: [],
        milestoneCardRewards: [],
        deltaXp: 999,
        deltaCrystals: 999,
        leveledUp: true,
        levelUpBonusCrystals: 999,
        newTotals: { crystals: 9999, totalXp: 9999, level: 99 },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const captured = (window as any).__nexusBattleSocket as { inject: (m: unknown) => void };
      captured.inject({ type: "reward_summary", matchId: "match_stale_id_not_real", payload: stalePayload });
    });

    await winnerPage.waitForTimeout(200);

    await expect(winnerPage.getByTestId("reward-summary")).toHaveCount(0);
    await expect(winnerPage.getByTestId("reward-crystals-tile")).toHaveCount(0);
    await expect(winnerPage.getByTestId("reward-elo-tile")).toHaveCount(0);
  } finally {
    await winnerContext.close();
    await loserContext.close();
  }
});

async function resolveFirstMover(first: Page, second: Page) {
  await expect
    .poll(
      async () => {
        const firstEnabled = await countEnabledPlayerCards(first);
        const secondEnabled = await countEnabledPlayerCards(second);

        if (firstEnabled > 0) return "first";
        if (secondEnabled > 0) return "second";
        return "waiting";
      },
      { timeout: 12_000 },
    )
    .not.toBe("waiting");

  return (await countEnabledPlayerCards(first)) > 0 ? first : second;
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
