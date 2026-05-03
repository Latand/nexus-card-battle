import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { cards } from "../src/features/battle/model/cards";
import type { RewardSummary } from "../src/features/battle/model/types";
import type { PlayerIdentity } from "../src/features/player/profile/types";
import { mockDeckReadyProfile, PROFILE_DECK_IDS } from "./fixtures/playerProfile";

const PROTOCOL_OWNED_COLLECTION_IDS = cards.slice(0, 10).map((card) => card.id);
const PROTOCOL_OWNED_DECK_IDS = PROTOCOL_OWNED_COLLECTION_IDS.slice(0, 9);

test("pairs two tabs and resolves the first human round", async ({ baseURL, browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await mockDeckReadyProfile(first, { identity: testIdentity("ui-a") });
    await mockDeckReadyProfile(second, { identity: testIdentity("ui-b") });

    await first.goto(baseURL ?? "/");
    await second.goto(baseURL ?? "/");

    await expect(first.getByTestId("player-profile-shell")).toHaveAttribute("data-deck-source", "profile", { timeout: 15_000 });
    await expect(second.getByTestId("player-profile-shell")).toHaveAttribute("data-deck-source", "profile", { timeout: 15_000 });
    await expect(first.getByTestId("play-human-match")).toBeEnabled({ timeout: 15_000 });
    await expect(second.getByTestId("play-human-match")).toBeEnabled({ timeout: 15_000 });

    await Promise.all([
      first.getByTestId("play-human-match").click(),
      second.getByTestId("play-human-match").click(),
    ]);

    await expect(first.getByTestId("round-status")).toBeVisible({ timeout: 20_000 });
    await expect(second.getByTestId("round-status")).toBeVisible({ timeout: 20_000 });
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
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test("matches direct PvP clients with saved profile decks", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const firstIdentity = testIdentity("protocol-valid-a");
  const secondIdentity = testIdentity("protocol-valid-b");
  const firstProfile = await seedRealtimeProfile(request, firstIdentity);
  const secondProfile = await seedRealtimeProfile(request, secondIdentity);
  const first = await connectRealtimeClient(wsUrl, "Profile A", firstProfile.deckIds, { identity: firstIdentity });
  const second = await connectRealtimeClient(wsUrl, "Profile B", secondProfile.deckIds, { identity: secondIdentity });

  const firstReady = await first.waitFor("match_ready");
  const secondReady = await second.waitFor("match_ready");
  expectMatchReadyPlayerLoadout(firstReady, firstProfile.deckIds, firstProfile.ownedCardIds);
  expectMatchReadyPlayerLoadout(secondReady, secondProfile.deckIds, secondProfile.ownedCardIds);

  first.close();
  second.close();
});

test("matches valid saved decks while filtering stale owned cards out of PvP collection", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const staleOwnedIdentity = testIdentity("stale-owned-valid-deck");
  const opponentIdentity = testIdentity("stale-owned-opponent");
  const staleOwnedProfile = await seedRealtimeProfile(request, staleOwnedIdentity, {
    ownedCardIds: [...PROTOCOL_OWNED_COLLECTION_IDS, "corr-1285"],
    deckIds: PROTOCOL_OWNED_DECK_IDS,
  });
  const opponentProfile = await seedRealtimeProfile(request, opponentIdentity);
  const staleOwnedClient = await connectRealtimeClient(wsUrl, "Stale Owned", staleOwnedProfile.deckIds, { identity: staleOwnedIdentity });
  const opponentClient = await connectRealtimeClient(wsUrl, "Opponent", opponentProfile.deckIds, { identity: opponentIdentity });

  const staleOwnedReady = await staleOwnedClient.waitFor("match_ready");
  const opponentReady = await opponentClient.waitFor("match_ready");
  expectMatchReadyPlayerLoadout(staleOwnedReady, staleOwnedProfile.deckIds, PROTOCOL_OWNED_COLLECTION_IDS);
  expectMatchReadyPlayerLoadout(opponentReady, opponentProfile.deckIds, opponentProfile.ownedCardIds);

  staleOwnedClient.close();
  opponentClient.close();
});

test("forfeits the active PvP player when their turn times out", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const firstIdentity = testIdentity("timer-a");
  const secondIdentity = testIdentity("timer-b");
  await seedRealtimeProfile(request, firstIdentity);
  await seedRealtimeProfile(request, secondIdentity);
  const first = await connectRealtimeClient(wsUrl, "Timer A", PROTOCOL_OWNED_DECK_IDS, { identity: firstIdentity });
  const second = await connectRealtimeClient(wsUrl, "Timer B", PROTOCOL_OWNED_DECK_IDS, { identity: secondIdentity });

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

test("emits server-authoritative reward_summary to both PvP sessions on a forfeit", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const winnerIdentity = testIdentity("rewards-winner");
  const loserIdentity = testIdentity("rewards-loser");
  await seedRealtimeProfile(request, winnerIdentity);
  await seedRealtimeProfile(request, loserIdentity);
  const first = await connectRealtimeClient(wsUrl, "Rewards A", PROTOCOL_OWNED_DECK_IDS, { identity: winnerIdentity });
  const second = await connectRealtimeClient(wsUrl, "Rewards B", PROTOCOL_OWNED_DECK_IDS, { identity: loserIdentity });

  const firstReady = await first.waitFor("match_ready");
  const secondReady = await second.waitFor("match_ready");
  const firstMover = firstReady.firstPlayerId === firstReady.playerId ? first : second;
  const firstMoverIdentity = firstMover === first ? winnerIdentity : loserIdentity;
  const otherIdentity = firstMover === first ? loserIdentity : winnerIdentity;
  const firstMoverReady = firstMover === first ? firstReady : secondReady;

  firstMover.send({
    type: "turn_timeout",
    matchId: firstMoverReady.matchId,
    round: firstMoverReady.round,
  });

  const firstReward = await first.waitFor("reward_summary", { timeoutMs: 5_000 });
  const secondReward = await second.waitFor("reward_summary", { timeoutMs: 5_000 });

  const moverReward = firstMover === first ? firstReward : secondReward;
  const otherReward = firstMover === first ? secondReward : firstReward;

  const moverPayload = moverReward.payload as RewardSummary;
  const otherPayload = otherReward.payload as RewardSummary;

  expect(moverPayload.deltaXp).toBe(10);
  expect(moverPayload.deltaCrystals).toBe(0);
  expect(moverPayload.newTotals).toMatchObject({ crystals: 0, totalXp: 10, level: 1 });

  expect(otherPayload.deltaXp).toBe(100);
  expect(otherPayload.deltaCrystals).toBe(50);
  expect(otherPayload.newTotals).toMatchObject({ crystals: 50, totalXp: 100, level: 1 });

  expect(firstMoverIdentity).toBeDefined();
  expect(otherIdentity).toBeDefined();

  first.close();
  second.close();
});

test("PvP forfeit emits matched ELO deltas computed against each opponent's pre-match rating", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const winnerIdentity = testIdentity("elo-winner");
  const loserIdentity = testIdentity("elo-loser");

  // Seed asymmetric ELOs so the test would visibly fail if either side used
  // its own rating as the opponent rating, or used a post-update value.
  await seedRealtimeProfile(request, winnerIdentity, { eloRating: 1200 });
  await seedRealtimeProfile(request, loserIdentity, { eloRating: 1000 });

  const first = await connectRealtimeClient(wsUrl, "ELO A", PROTOCOL_OWNED_DECK_IDS, { identity: winnerIdentity });
  const second = await connectRealtimeClient(wsUrl, "ELO B", PROTOCOL_OWNED_DECK_IDS, { identity: loserIdentity });

  const firstReady = await first.waitFor("match_ready");
  const secondReady = await second.waitFor("match_ready");
  const firstMover = firstReady.firstPlayerId === firstReady.playerId ? first : second;
  const firstMoverReady = firstMover === first ? firstReady : secondReady;
  const firstMoverIdentity = firstMover === first ? winnerIdentity : loserIdentity;

  firstMover.send({
    type: "turn_timeout",
    matchId: firstMoverReady.matchId,
    round: firstMoverReady.round,
  });

  const firstReward = await first.waitFor("reward_summary", { timeoutMs: 5_000 });
  const secondReward = await second.waitFor("reward_summary", { timeoutMs: 5_000 });

  const firstPayload = firstReward.payload as RewardSummary;
  const secondPayload = secondReward.payload as RewardSummary;

  // Whoever timed out is the loser; the other is the server-declared winner.
  const losingPayload = firstMoverIdentity === winnerIdentity ? firstPayload : secondPayload;
  const winningPayload = firstMoverIdentity === winnerIdentity ? secondPayload : firstPayload;
  const winningStartElo = firstMoverIdentity === winnerIdentity ? 1000 : 1200;
  const losingStartElo = firstMoverIdentity === winnerIdentity ? 1200 : 1000;

  // Both sides receive a finite ELO delta and absolute new rating.
  expect(typeof winningPayload.deltaElo).toBe("number");
  expect(typeof losingPayload.deltaElo).toBe("number");
  expect(typeof winningPayload.newTotals.eloRating).toBe("number");
  expect(typeof losingPayload.newTotals.eloRating).toBe("number");

  // Symmetry: zero-sum across the match.
  expect((winningPayload.deltaElo ?? 0) + (losingPayload.deltaElo ?? 0)).toBe(0);

  // Each new rating equals start + delta — proves both sides used the
  // opposite side's PRE-match rating, not their own and not a post-update one.
  expect(winningPayload.newTotals.eloRating).toBe(winningStartElo + (winningPayload.deltaElo ?? 0));
  expect(losingPayload.newTotals.eloRating).toBe(losingStartElo + (losingPayload.deltaElo ?? 0));

  // Sign sanity: the winner gains, the loser drops.
  expect(winningPayload.deltaElo ?? 0).toBeGreaterThan(0);
  expect(losingPayload.deltaElo ?? 0).toBeLessThan(0);

  first.close();
  second.close();
});

test("disconnect mid-match forfeits the disconnecting side and emits a win reward_summary to the opponent", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const quitterIdentity = testIdentity("disconnect-quitter");
  const survivorIdentity = testIdentity("disconnect-survivor");
  await seedRealtimeProfile(request, quitterIdentity, { eloRating: 1100 });
  await seedRealtimeProfile(request, survivorIdentity, { eloRating: 1100 });

  const quitter = await connectRealtimeClient(wsUrl, "Quitter", PROTOCOL_OWNED_DECK_IDS, { identity: quitterIdentity });
  const survivor = await connectRealtimeClient(wsUrl, "Survivor", PROTOCOL_OWNED_DECK_IDS, { identity: survivorIdentity });

  await quitter.waitFor("match_ready");
  const survivorReady = await survivor.waitFor("match_ready") as unknown as { playerId: string; opponentId: string; matchId: string };

  // Quitter rage-quits before any move lands.
  quitter.close();

  const survivorForfeit = await survivor.waitFor("match_forfeit", { timeoutMs: 5_000 }) as unknown as { matchId: string; loserId: string; winnerId: string; reason: string };
  expect(survivorForfeit.matchId).toBe(survivorReady.matchId);
  expect(survivorForfeit.winnerId).toBe(survivorReady.playerId);
  expect(survivorForfeit.loserId).toBe(survivorReady.opponentId);
  expect(survivorForfeit.reason).toBe("disconnect");

  const survivorReward = await survivor.waitFor("reward_summary", { timeoutMs: 5_000 });
  const survivorPayload = survivorReward.payload as RewardSummary;

  expect(survivorPayload.deltaXp).toBe(100);
  expect(survivorPayload.deltaCrystals).toBe(50);
  expect(survivorPayload.newTotals).toMatchObject({ crystals: 50, totalXp: 100, level: 1 });
  // Equal pre-match ELOs → +16 / -16 zero-sum.
  expect(survivorPayload.deltaElo).toBe(16);
  expect(survivorPayload.newTotals.eloRating).toBe(1116);

  survivor.close();
});

test("matchmaking pairs three asymmetric ELO sessions in the order the expanding window allows", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const lowIdentity = testIdentity("expanding-1000");
  const midIdentity = testIdentity("expanding-1300");
  const highIdentity = testIdentity("expanding-1600");

  await seedRealtimeProfile(request, lowIdentity, { eloRating: 1000 });
  await seedRealtimeProfile(request, midIdentity, { eloRating: 1300 });
  await seedRealtimeProfile(request, highIdentity, { eloRating: 1600 });

  // All three queue effectively simultaneously. Pairwise distances are 300
  // (low↔mid), 300 (mid↔high), 600 (low↔high). Initial windows are ±100,
  // so none should pair on first contact — every pair is too far apart.
  const low = await connectRealtimeClient(wsUrl, "Low", PROTOCOL_OWNED_DECK_IDS, { identity: lowIdentity });
  const mid = await connectRealtimeClient(wsUrl, "Mid", PROTOCOL_OWNED_DECK_IDS, { identity: midIdentity });
  const high = await connectRealtimeClient(wsUrl, "High", PROTOCOL_OWNED_DECK_IDS, { identity: highIdentity });

  await low.waitFor("queued", { timeoutMs: 2_000 });
  await mid.waitFor("queued", { timeoutMs: 2_000 });
  await high.waitFor("queued", { timeoutMs: 2_000 });

  // The closest-ELO pair is low↔mid OR mid↔high (both 300 apart). Once both
  // sides' windows hit ±300 (~10s wait) one of those pairs fires; high↔low
  // (600 apart) is always farther, so it never beats either neighbor pair.
  // Wait for the first pair, then assert who got matched.
  const sources = { low, mid, high } as const;
  const matchedBySource: Record<string, { matchId: string }> = {};

  await expect.poll(
    () => {
      for (const [name, client] of Object.entries(sources)) {
        const ready = client.messages().find((message) => message.type === "match_ready");
        if (ready) matchedBySource[name] = ready as unknown as { matchId: string };
      }
      return Object.keys(matchedBySource).length;
    },
    { timeout: 30_000 },
  ).toBeGreaterThanOrEqual(2);

  // Exactly two sockets must have paired in this first round; high (600 away
  // from low) cannot beat the closer mid neighbor.
  const matchedNames = Object.keys(matchedBySource).sort();
  expect(matchedNames).toHaveLength(2);
  expect(matchedNames.includes("mid")).toBe(true);

  // Both sockets reference the same matchId (one match, two notifications).
  const ids = Object.values(matchedBySource).map((m) => m.matchId);
  expect(ids[0]).toBe(ids[1]);

  low.close();
  mid.close();
  high.close();
});

test("match_ready never carries server-only identity or fighter state", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const firstIdentity = testIdentity("payload-leak-a");
  const secondIdentity = testIdentity("payload-leak-b");
  await seedRealtimeProfile(request, firstIdentity);
  await seedRealtimeProfile(request, secondIdentity);
  const first = await connectRealtimeClient(wsUrl, "Leak A", PROTOCOL_OWNED_DECK_IDS, { identity: firstIdentity });
  const second = await connectRealtimeClient(wsUrl, "Leak B", PROTOCOL_OWNED_DECK_IDS, { identity: secondIdentity });

  const firstReady = await first.waitFor("match_ready") as unknown as { players: Record<string, Record<string, unknown>> };
  const secondReady = await second.waitFor("match_ready") as unknown as { players: Record<string, Record<string, unknown>> };

  for (const ready of [firstReady, secondReady]) {
    for (const player of Object.values(ready.players)) {
      expect(player).not.toHaveProperty("identity");
      expect(player).not.toHaveProperty("fighter");
    }
  }

  first.close();
  second.close();
});

test("rejects PvP moves with energy bids exceeding the fighter's remaining energy after a prior round", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const firstIdentity = testIdentity("tamper-energy-a");
  const secondIdentity = testIdentity("tamper-energy-b");
  await seedRealtimeProfile(request, firstIdentity);
  await seedRealtimeProfile(request, secondIdentity);
  const first = await connectRealtimeClient(wsUrl, "Tamper A", PROTOCOL_OWNED_DECK_IDS, { identity: firstIdentity });
  const second = await connectRealtimeClient(wsUrl, "Tamper B", PROTOCOL_OWNED_DECK_IDS, { identity: secondIdentity });

  const firstReady = await first.waitFor("match_ready") as unknown as { matchId: string; round: number; firstPlayerId: string; opponentId: string; playerId: string; players: Record<string, { handIds: string[] }> };
  const secondReady = await second.waitFor("match_ready") as typeof firstReady;

  const firstMover = firstReady.firstPlayerId === firstReady.playerId ? first : second;
  const secondMover = firstMover === first ? second : first;
  const firstMoverReady = firstMover === first ? firstReady : secondReady;
  const secondMoverReady = secondMover === first ? firstReady : secondReady;

  // Both fighters start at 12 energy. Spend down by playing a regular round
  // first so the next-round energy check has something tighter than 12 to
  // catch.
  const firstCard = firstMoverReady.players[firstMoverReady.playerId].handIds[0];
  const secondCard = secondMoverReady.players[secondMoverReady.playerId].handIds[0];

  firstMover.send({
    type: "submit_move",
    matchId: firstMoverReady.matchId,
    round: firstMoverReady.round,
    move: { cardId: firstCard, energy: 6, boosted: false },
  });
  await secondMover.waitFor("first_move", { timeoutMs: 5_000 });

  secondMover.send({
    type: "submit_move",
    matchId: secondMoverReady.matchId,
    round: secondMoverReady.round,
    move: { cardId: secondCard, energy: 6, boosted: false },
  });

  await first.waitFor("round_resolved", { timeoutMs: 5_000 });
  await second.waitFor("round_resolved", { timeoutMs: 5_000 });

  // It is now the second mover's turn (initiative flips). They have 6 energy
  // remaining; a bid of 12 is sanitized clean but rejected by the
  // server-fighter check.
  const newFirstMoverHand = secondMoverReady.players[secondMoverReady.playerId].handIds;
  const newCard = newFirstMoverHand.find((id) => id !== secondCard) ?? newFirstMoverHand[0];

  secondMover.send({
    type: "submit_move",
    matchId: secondMoverReady.matchId,
    round: secondMoverReady.round + 1,
    move: { cardId: newCard, energy: 12, boosted: false },
  });

  const error = await secondMover.waitFor("error", { timeoutMs: 2_000 });
  expect(error.message).toBe("Energy bid exceeds the fighter's available energy.");

  first.close();
  second.close();
});

test("rejects PvP moves whose boost cost exceeds the fighter's energy", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const firstIdentity = testIdentity("tamper-boost-a");
  const secondIdentity = testIdentity("tamper-boost-b");
  await seedRealtimeProfile(request, firstIdentity);
  await seedRealtimeProfile(request, secondIdentity);
  const first = await connectRealtimeClient(wsUrl, "Boost A", PROTOCOL_OWNED_DECK_IDS, { identity: firstIdentity });
  const second = await connectRealtimeClient(wsUrl, "Boost B", PROTOCOL_OWNED_DECK_IDS, { identity: secondIdentity });

  const firstReady = await first.waitFor("match_ready") as unknown as { matchId: string; round: number; firstPlayerId: string; playerId: string; players: Record<string, { handIds: string[] }> };
  const secondReady = await second.waitFor("match_ready") as typeof firstReady;

  const firstMover = firstReady.firstPlayerId === firstReady.playerId ? first : second;
  const firstMoverReady = firstMover === first ? firstReady : secondReady;
  const moverPlayer = firstMoverReady.players[firstMoverReady.playerId];
  const moverCard = moverPlayer.handIds[0];

  // Fighter starts with 12 energy. Bid 12 + boost (cost 3) = 15 → must be rejected.
  firstMover.send({
    type: "submit_move",
    matchId: firstMoverReady.matchId,
    round: firstMoverReady.round,
    move: { cardId: moverCard, energy: 12, boosted: true },
  });

  const error = await firstMover.waitFor("error", { timeoutMs: 2_000 });
  expect(error.message).toBe("Damage boost requires more energy than the fighter has.");

  await expectNoRealtimeMessage(firstMover, "first_move");
  await expectNoRealtimeMessage(firstMover, "round_resolved");

  first.close();
  second.close();
});

test("rejects PvP moves for cards not in the fighter's hand", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const firstIdentity = testIdentity("tamper-card-a");
  const secondIdentity = testIdentity("tamper-card-b");
  await seedRealtimeProfile(request, firstIdentity);
  await seedRealtimeProfile(request, secondIdentity);
  const first = await connectRealtimeClient(wsUrl, "Card A", PROTOCOL_OWNED_DECK_IDS, { identity: firstIdentity });
  const second = await connectRealtimeClient(wsUrl, "Card B", PROTOCOL_OWNED_DECK_IDS, { identity: secondIdentity });

  const firstReady = await first.waitFor("match_ready") as unknown as { matchId: string; round: number; firstPlayerId: string; playerId: string; opponentId: string; players: Record<string, { handIds: string[] }> };
  const secondReady = await second.waitFor("match_ready") as typeof firstReady;

  const firstMover = firstReady.firstPlayerId === firstReady.playerId ? first : second;
  const firstMoverReady = firstMover === first ? firstReady : secondReady;
  const moverPlayer = firstMoverReady.players[firstMoverReady.playerId];
  const otherCardId = PROTOCOL_OWNED_DECK_IDS.find((id) => !moverPlayer.handIds.includes(id));
  expect(otherCardId).toBeTruthy();

  firstMover.send({
    type: "submit_move",
    matchId: firstMoverReady.matchId,
    round: firstMoverReady.round,
    move: { cardId: otherCardId as string, energy: 0, boosted: false },
  });

  const error = await firstMover.waitFor("error", { timeoutMs: 2_000 });
  expect(error.message).toBe("Card is not in the battle hand.");

  await expectNoRealtimeMessage(firstMover, "first_move");
  await expectNoRealtimeMessage(firstMover, "round_resolved");

  first.close();
  second.close();
});

test("does not leak the first PvP mover energy before reveal", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const firstIdentity = testIdentity("secret-a");
  const secondIdentity = testIdentity("secret-b");
  await seedRealtimeProfile(request, firstIdentity);
  await seedRealtimeProfile(request, secondIdentity);
  const deckIds = PROTOCOL_OWNED_DECK_IDS;
  const first = await connectRealtimeClient(wsUrl, "Secret A", deckIds, { identity: firstIdentity });
  const second = await connectRealtimeClient(wsUrl, "Secret B", deckIds, { identity: secondIdentity });

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

test("rejects removed PvP card ids before matchmaking", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const deckIds = PROTOCOL_OWNED_DECK_IDS;
  const staleDeckIds = ["corr-1285", ...deckIds.slice(0, 8)];
  const staleDeckIdentity = testIdentity("stale-deck");
  await seedRealtimeProfile(request, staleDeckIdentity);
  const staleDeckClient = await connectRealtimeClient(wsUrl, "Stale Deck", staleDeckIds, { identity: staleDeckIdentity });

  const staleDeckError = await staleDeckClient.waitFor("error", { timeoutMs: 2_000 });
  expect(staleDeckError.message).toBe("Unknown deck card ids: corr-1285");
  await expectNoRealtimeMessage(staleDeckClient, "queued");
  await expectNoRealtimeMessage(staleDeckClient, "match_ready");

  const staleCollectionIdentity = testIdentity("stale-collection");
  await seedRealtimeProfile(request, staleCollectionIdentity);
  const staleCollectionClient = await connectRealtimeClient(wsUrl, "Stale Collection", deckIds, {
    identity: staleCollectionIdentity,
    collectionIds: [...deckIds, "corr-1285"],
  });

  const staleCollectionError = await staleCollectionClient.waitFor("error", { timeoutMs: 2_000 });
  expect(staleCollectionError.message).toBe("Unknown collection card ids: corr-1285");
  await expectNoRealtimeMessage(staleCollectionClient, "queued");
  await expectNoRealtimeMessage(staleCollectionClient, "match_ready");

  const validIdentity = testIdentity("valid-after-stale");
  await seedRealtimeProfile(request, validIdentity);
  const validClient = await connectRealtimeClient(wsUrl, "Valid", deckIds, { identity: validIdentity });
  await expect(validClient.waitFor("queued", { timeoutMs: 2_000 })).resolves.toMatchObject({ type: "queued" });
  await expectNoRealtimeMessage(validClient, "match_ready");

  staleDeckClient.close();
  staleCollectionClient.close();
  validClient.close();
});

test("rejects PvP decks below the nine-card minimum", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const shortDeckIds = PROTOCOL_OWNED_DECK_IDS.slice(0, 8);
  const identity = testIdentity("short-client-deck");
  await seedRealtimeProfile(request, identity);
  const client = await connectRealtimeClient(wsUrl, "Short Deck", shortDeckIds, { identity });

  const error = await client.waitFor("error", { timeoutMs: 2_000 });
  expect(error.message).toBe("Deck must contain at least 9 cards.");
  await expectNoRealtimeMessage(client, "queued");
  await expectNoRealtimeMessage(client, "match_ready");

  client.close();
});

test("rejects PvP deck cards outside the provided collection", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const deckIds = PROTOCOL_OWNED_DECK_IDS;
  const missingCollectionCardId = deckIds[8];
  const identity = testIdentity("client-collection-miss");
  await seedRealtimeProfile(request, identity);
  const client = await connectRealtimeClient(wsUrl, "Non Owned Deck", deckIds, {
    identity,
    collectionIds: deckIds.slice(0, 8),
  });

  const error = await client.waitFor("error", { timeoutMs: 2_000 });
  expect(error.message).toBe(`Deck contains cards outside the collection: ${missingCollectionCardId}`);
  await expectNoRealtimeMessage(client, "queued");
  await expectNoRealtimeMessage(client, "match_ready");

  client.close();
});

test("rejects direct PvP clients that try to bypass the saved profile deck", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const identity = testIdentity("bypass");
  const bypassDeckIds = cards
    .filter((card) => card.clan === "Toyz")
    .slice(0, 9)
    .map((card) => card.id);
  await seedRealtimeProfile(request, identity);

  const client = await connectRealtimeClient(wsUrl, "Bypass", bypassDeckIds, {
    identity,
    collectionIds: bypassDeckIds,
  });

  const error = await client.waitFor("error", { timeoutMs: 2_000 });
  expect(error.message).toBe("PvP deck must match the saved profile deck.");
  await expectNoRealtimeMessage(client, "queued");
  await expectNoRealtimeMessage(client, "match_ready");

  client.close();
});

test("rejects invalid saved profile decks before PvP matchmaking", async ({ baseURL, request }) => {
  const wsUrl = `${baseURL?.replace(/^http/, "ws") ?? "ws://127.0.0.1:3000"}/ws`;
  const nonOwnedCardId = PROTOCOL_OWNED_COLLECTION_IDS[9];
  const cases = [
    {
      name: "empty",
      profile: { ownedCardIds: PROTOCOL_OWNED_COLLECTION_IDS, deckIds: [] },
      message: "Saved deck must contain at least 9 cards.",
    },
    {
      name: "short",
      profile: { ownedCardIds: PROTOCOL_OWNED_COLLECTION_IDS, deckIds: PROTOCOL_OWNED_DECK_IDS.slice(0, 8) },
      message: "Saved deck must contain at least 9 cards.",
    },
    {
      name: "duplicate",
      profile: { ownedCardIds: PROTOCOL_OWNED_COLLECTION_IDS, deckIds: [...PROTOCOL_OWNED_DECK_IDS.slice(0, 8), PROTOCOL_OWNED_DECK_IDS[0]] },
      message: `Saved deck contains duplicate card ids: ${PROTOCOL_OWNED_DECK_IDS[0]}`,
    },
    {
      name: "unknown",
      profile: { ownedCardIds: PROTOCOL_OWNED_COLLECTION_IDS, deckIds: [...PROTOCOL_OWNED_DECK_IDS.slice(0, 8), "corr-1285"] },
      message: "Unknown saved deck card ids: corr-1285",
    },
    {
      name: "non-owned",
      profile: { ownedCardIds: PROTOCOL_OWNED_DECK_IDS, deckIds: [...PROTOCOL_OWNED_DECK_IDS.slice(0, 8), nonOwnedCardId] },
      message: `Saved deck contains non-owned card ids: ${nonOwnedCardId}`,
    },
  ];

  for (const testCase of cases) {
    const identity = testIdentity(`saved-${testCase.name}`);
    await seedRealtimeProfile(request, identity, testCase.profile);
    const client = await connectRealtimeClient(wsUrl, `Saved ${testCase.name}`, undefined, { identity });

    const error = await client.waitFor("error", { timeoutMs: 2_000 });
    expect(error.message).toBe(testCase.message);
    await expectNoRealtimeMessage(client, "queued");
    await expectNoRealtimeMessage(client, "match_ready");
    client.close();
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

async function connectRealtimeClient(
  url: string,
  name: string,
  deckIds: string[] | undefined,
  options: { collectionIds?: string[]; identity?: PlayerIdentity } = {},
) {
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
      ...(deckIds ? { deckIds } : {}),
      ...(options.collectionIds ? { collectionIds: options.collectionIds } : deckIds ? { collectionIds: deckIds } : {}),
      identity: options.identity,
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

function testIdentity(slug: string): PlayerIdentity {
  return {
    mode: "guest",
    guestId: `guest-ws-${slug}`,
  };
}

async function seedRealtimeProfile(
  request: APIRequestContext,
  identity: PlayerIdentity,
  overrides: Partial<{
    ownedCardIds: string[];
    deckIds: string[];
    starterFreeBoostersRemaining: number;
    openedBoosterIds: string[];
    eloRating: number;
  }> = {},
) {
  const profile: Record<string, unknown> = {
    id: `player-${identity.mode === "guest" ? identity.guestId : identity.telegramId}`,
    identity,
    ownedCardIds: overrides.ownedCardIds ?? PROTOCOL_OWNED_COLLECTION_IDS,
    deckIds: overrides.deckIds ?? PROTOCOL_OWNED_DECK_IDS,
    starterFreeBoostersRemaining: overrides.starterFreeBoostersRemaining ?? 0,
    openedBoosterIds: overrides.openedBoosterIds ?? ["neon-breach", "factory-shift"],
  };
  if (typeof overrides.eloRating === "number") {
    profile.eloRating = overrides.eloRating;
  }
  const response = await request.post("/__test/player-profile", {
    data: profile,
  });

  expect(response.ok()).toBe(true);
  return profile as typeof profile & { ownedCardIds: string[]; deckIds: string[] };
}

function expectMatchReadyPlayerLoadout(message: RealtimeMessage, deckIds: string[], collectionIds: string[]) {
  const payload = message as unknown as { playerId: string; players: Record<string, { deckIds?: string[]; collectionIds?: string[] }> };
  const player = payload.players[payload.playerId];

  expect(player.deckIds).toEqual(deckIds);
  expect(player.collectionIds).toEqual(collectionIds);
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
