import { expect, test, type Page } from "@playwright/test";
import { cards } from "../src/features/battle/model/cards";
import { mockDeckReadyProfile, PROFILE_DECK_IDS } from "./fixtures/playerProfile";

const PROTOCOL_OWNED_COLLECTION_IDS = cards.slice(0, 10).map((card) => card.id);
const PROTOCOL_OWNED_DECK_IDS = PROTOCOL_OWNED_COLLECTION_IDS.slice(0, 9);

test("pairs two tabs and resolves the first human round", async ({ context, page }) => {
  const first = page;
  const second = await context.newPage();
  await mockDeckReadyProfile(first);
  await mockDeckReadyProfile(second);

  await first.goto("/");
  await second.goto("/");

  await expect(first.getByTestId("player-profile-shell")).toHaveAttribute("data-deck-source", "profile", { timeout: 15_000 });
  await expect(second.getByTestId("player-profile-shell")).toHaveAttribute("data-deck-source", "profile", { timeout: 15_000 });
  await expect(first.getByTestId("play-human-match")).toBeEnabled({ timeout: 15_000 });
  await expect(second.getByTestId("play-human-match")).toBeEnabled({ timeout: 15_000 });

  await first.getByTestId("play-human-match").click();
  await second.getByTestId("play-human-match").click();

  await expect(first.getByTestId("round-status")).toBeVisible({ timeout: 12_000 });
  await expect(second.getByTestId("round-status")).toBeVisible({ timeout: 12_000 });
  await expectPlayerHandToUseDeck(first, PROFILE_DECK_IDS);
  await expectPlayerHandToUseDeck(second, PROFILE_DECK_IDS);

  const firstMover = await resolveFirstMover(first, second);
  const secondMover = firstMover === first ? second : first;

  const firstMoverCardId = await pickFirstCard(firstMover);
  await expect(secondMover.getByTestId("round-status")).toBeVisible({ timeout: 8_000 });

  await pickFirstCard(secondMover, { knownEnemyCard: true, hiddenEnemyEnergy: true });

  await expect(first.getByTestId("battle-overlay")).toHaveAttribute("data-phase", "battle_intro", { timeout: 8_000 });
  await expect(second.getByTestId("battle-overlay")).toHaveAttribute("data-phase", "battle_intro", { timeout: 8_000 });
  await expect(firstMover.getByTestId("battle-overlay")).toBeHidden({ timeout: 24_000 });
  await expect(firstMover.getByTestId(`player-card-${firstMoverCardId}`)).toHaveClass(/opacity-35/, { timeout: 12_000 });

  await second.close();
});

test("forfeits the active PvP player when their turn times out", async ({ baseURL }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const deckIds = PROTOCOL_OWNED_DECK_IDS;
  const first = await connectRealtimeClient(wsUrl, "Timer A", deckIds);
  const second = await connectRealtimeClient(wsUrl, "Timer B", deckIds);

  const firstReady = await first.waitFor("match_ready");
  const secondReady = await second.waitFor("match_ready");
  const firstMover = firstReady.firstPlayerId === firstReady.playerId ? first : second;
  const firstMoverReady = firstMover === first ? firstReady : secondReady;
  const otherReady = firstMover === first ? secondReady : firstReady;

  firstMover.send({
    type: "turn_timeout",
    matchId: firstMoverReady.matchId,
    round: firstMoverReady.round,
  });

  const firstResult = await first.waitFor("match_forfeit");
  const secondResult = await second.waitFor("match_forfeit");

  expect(firstResult.loserId).toBe(firstMoverReady.playerId);
  expect(secondResult.loserId).toBe(firstMoverReady.playerId);
  expect(firstResult.winnerId).toBe(otherReady.playerId);
  expect(secondResult.winnerId).toBe(otherReady.playerId);

  first.close();
  second.close();
});

test("does not leak the first PvP mover energy before reveal", async ({ baseURL }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const deckIds = PROTOCOL_OWNED_DECK_IDS;
  const first = await connectRealtimeClient(wsUrl, "Secret A", deckIds);
  const second = await connectRealtimeClient(wsUrl, "Secret B", deckIds);

  const firstReady = await first.waitFor("match_ready");
  const secondReady = await second.waitFor("match_ready");
  const firstMover = firstReady.firstPlayerId === firstReady.playerId ? first : second;
  const secondMover = firstMover === first ? second : first;
  const firstMoverReady = firstMover === first ? firstReady : secondReady;
  const firstMoverReadyPayload = firstMoverReady as unknown as { playerId: string; players: Record<string, { handIds?: string[] }> };
  const firstMoverPlayer = firstMoverReadyPayload.players[firstMoverReadyPayload.playerId];
  const cardId = firstMoverPlayer.handIds?.[0] ?? deckIds[0];

  firstMover.send({
    type: "submit_move",
    matchId: firstMoverReady.matchId,
    round: firstMoverReady.round,
    move: {
      cardId,
      energy: 6,
      boosted: true,
    },
  });

  const previewMessage = await secondMover.waitFor("first_move");

  expect(previewMessage.move).toEqual({ cardId });
  expect(previewMessage.move).not.toHaveProperty("energy");
  expect(previewMessage.move).not.toHaveProperty("boosted");

  first.close();
  second.close();
});

test("rejects removed PvP card ids before matchmaking", async ({ baseURL }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const deckIds = PROTOCOL_OWNED_DECK_IDS;
  const staleDeckIds = ["corr-1285", ...deckIds.slice(0, 8)];
  const staleDeckClient = await connectRealtimeClient(wsUrl, "Stale Deck", staleDeckIds);

  const staleDeckError = await staleDeckClient.waitFor("error", { timeoutMs: 2_000 });
  expect(staleDeckError.message).toBe("Unknown deck card ids: corr-1285");
  await expectNoRealtimeMessage(staleDeckClient, "queued");
  await expectNoRealtimeMessage(staleDeckClient, "match_ready");

  const staleCollectionClient = await connectRealtimeClient(wsUrl, "Stale Collection", deckIds, {
    collectionIds: [...deckIds, "corr-1285"],
  });

  const staleCollectionError = await staleCollectionClient.waitFor("error", { timeoutMs: 2_000 });
  expect(staleCollectionError.message).toBe("Unknown collection card ids: corr-1285");
  await expectNoRealtimeMessage(staleCollectionClient, "queued");
  await expectNoRealtimeMessage(staleCollectionClient, "match_ready");

  const validClient = await connectRealtimeClient(wsUrl, "Valid", deckIds);
  await expect(validClient.waitFor("queued", { timeoutMs: 2_000 })).resolves.toMatchObject({ type: "queued" });
  await expectNoRealtimeMessage(validClient, "match_ready");

  staleDeckClient.close();
  staleCollectionClient.close();
  validClient.close();
});

test("rejects PvP decks below the nine-card minimum", async ({ baseURL }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const shortDeckIds = PROTOCOL_OWNED_DECK_IDS.slice(0, 8);
  const client = await connectRealtimeClient(wsUrl, "Short Deck", shortDeckIds);

  const error = await client.waitFor("error", { timeoutMs: 2_000 });
  expect(error.message).toBe("Deck must contain at least 9 cards.");
  await expectNoRealtimeMessage(client, "queued");
  await expectNoRealtimeMessage(client, "match_ready");

  client.close();
});

test("rejects PvP deck cards outside the provided collection", async ({ baseURL }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const deckIds = PROTOCOL_OWNED_DECK_IDS;
  const missingCollectionCardId = deckIds[8];
  const client = await connectRealtimeClient(wsUrl, "Non Owned Deck", deckIds, {
    collectionIds: deckIds.slice(0, 8),
  });

  const error = await client.waitFor("error", { timeoutMs: 2_000 });
  expect(error.message).toBe(`Deck contains cards outside the collection: ${missingCollectionCardId}`);
  await expectNoRealtimeMessage(client, "queued");
  await expectNoRealtimeMessage(client, "match_ready");

  client.close();
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

async function pickFirstCard(page: Page, options: { knownEnemyCard?: boolean; hiddenEnemyEnergy?: boolean } = {}) {
  const cardButton = await getFirstEnabledPlayerCard(page);
  const testId = await cardButton.getAttribute("data-testid");
  const cardId = testId?.replace("player-card-", "");
  expect(cardId).toBeTruthy();
  await cardButton.click();

  await expect(page.getByTestId("selection-overlay")).toBeVisible();
  if (options.knownEnemyCard) {
    await expect(page.getByTestId("known-enemy-card")).toBeVisible();
  }
  if (options.hiddenEnemyEnergy) {
    await expect(page.getByTestId("known-enemy-card").getByText(/енергія/i)).toHaveCount(0);
  }

  await page.getByTestId("selection-ok").click();
  return cardId as string;
}

async function getFirstEnabledPlayerCard(page: Page) {
  const cardButtons = page.locator('[data-testid^="player-card-"]');
  await expect.poll(async () => countEnabledPlayerCards(page), { timeout: 12_000 }).toBeGreaterThan(0);

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

type RealtimeMessage = {
  type: string;
  [key: string]: unknown;
};

type RealtimeClient = Awaited<ReturnType<typeof connectRealtimeClient>>;

async function connectRealtimeClient(url: string, name: string, deckIds: string[], options: { collectionIds?: string[] } = {}) {
  const socket = new WebSocket(url);
  const messages: RealtimeMessage[] = [];
  const waiters = new Map<string, ((message: RealtimeMessage) => void)[]>();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as RealtimeMessage;
    messages.push(message);
    const handlers = waiters.get(message.type) ?? [];
    waiters.delete(message.type);
    handlers.forEach((handler) => handler(message));
  });

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error(`WebSocket failed for ${name}`)), { once: true });
  });

  socket.send(
    JSON.stringify({
      type: "join_human",
      deckIds,
      collectionIds: options.collectionIds ?? deckIds,
      user: { name },
    }),
  );

  return {
    send(message: RealtimeMessage) {
      socket.send(JSON.stringify(message));
    },
    close() {
      socket.close();
    },
    messages() {
      return messages;
    },
    waitFor(type: string, waitOptions: { timeoutMs?: number } = {}) {
      const existing = messages.find((message) => message.type === type);
      if (existing) return Promise.resolve(existing);

      return new Promise<RealtimeMessage>((resolve, reject) => {
        const handlers = waiters.get(type) ?? [];
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const handler = (message: RealtimeMessage) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          resolve(message);
        };

        handlers.push(handler);
        waiters.set(type, handlers);

        if (waitOptions.timeoutMs !== undefined) {
          timeoutHandle = setTimeout(() => {
            const nextHandlers = waiters.get(type)?.filter((item) => item !== handler) ?? [];
            if (nextHandlers.length > 0) waiters.set(type, nextHandlers);
            else waiters.delete(type);
            reject(new Error(`Timed out waiting for ${type}.`));
          }, waitOptions.timeoutMs);
        }
      });
    },
  };
}

async function expectNoRealtimeMessage(client: RealtimeClient, type: string) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(client.messages().some((message) => message.type === type)).toBe(false);
}

async function expectPlayerHandToUseDeck(page: Page, deckIds: string[]) {
  const playerCards = page.locator('[data-testid^="player-card-"]');
  await expect(playerCards).toHaveCount(4);

  const handIds = await playerCards.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-testid")?.replace("player-card-", "")),
  );

  expect(handIds).toHaveLength(4);
  expect(handIds.every((cardId) => Boolean(cardId) && deckIds.includes(cardId))).toBe(true);
}
