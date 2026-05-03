import { describe, expect, test } from "bun:test";
import { cards } from "../src/features/battle/model/cards";
import {
  SellError,
  applyAndSummarizeMatchRewards,
  applyPvpMatchRewardsForBothSides,
  handlePlayerDeckSavePost,
  handlePlayerMatchFinishedPost,
  handlePlayerProfileGet,
  handlePlayerProfilePost,
  handlePlayerSellPost,
  type ApplyMatchRewardsInput,
  type PlayerDeckStore,
  type PlayerMatchRewardsStore,
  type PlayerProfileStore,
  type PlayerSellStore,
} from "../src/features/player/profile/api";
import { computeSellRevenue } from "../src/features/economy/sellPricing";
import { addToInventory, getOwnedCount, getSellableCount, removeFromInventory } from "../src/features/inventory/inventoryOps";
import { computeLevelFromXp, createNewStoredPlayerProfile, isSamePlayerIdentity, type PlayerIdentity, type PlayerProfile, type StoredPlayerProfile } from "../src/features/player/profile/types";
import { computeLevelUpBonusForRange } from "../src/features/player/profile/progression";
import type { RewardSummary } from "../src/features/battle/model/types";

const ownedDeckIdentity: PlayerIdentity = {
  mode: "guest",
  guestId: "guest-owned-deck",
};
const ownedDeckCardIds = cards.slice(0, 10).map((card) => card.id);
const savedDeckCardIds = ownedDeckCardIds.slice(0, 9);
const nonOwnedCardId = cards.find((card) => !ownedDeckCardIds.includes(card.id))?.id ?? "missing-non-owned-card";

describe("player profile API", () => {
  test("creates a guest profile with empty durable state and starter boosters", async () => {
    const store = new MemoryPlayerProfileStore();
    const response = await postProfile(store, {
      identity: {
        mode: "guest",
        guestId: "guest-alpha",
      },
    });
    const body = await readPlayerResponse(response);

    expect(response.status).toBe(200);
    expect(body.player).toMatchObject({
      id: "player-1",
      identity: {
        mode: "guest",
        guestId: "guest-alpha",
      },
      ownedCards: [],
      deckIds: [],
      starterFreeBoostersRemaining: 2,
      openedBoosterIds: [],
      onboarding: {
        starterBoostersAvailable: true,
        collectionReady: false,
        deckReady: false,
        completed: false,
      },
    });

    const lookup = await handlePlayerProfileGet(new Request("http://localhost/api/player?mode=guest&guestId=guest-alpha"), store);
    const lookupBody = await readPlayerResponse(lookup);
    expect(lookupBody.player.id).toBe(body.player.id);
  });

  test("loads the same profile for repeated Telegram id lookup", async () => {
    const store = new MemoryPlayerProfileStore();
    const first = await postProfile(store, {
      identity: {
        mode: "telegram",
        telegramId: "123456789",
      },
    });
    const second = await postProfile(store, {
      identity: {
        mode: "telegram",
        telegramId: "123456789",
      },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await readPlayerResponse(second)).player.id).toBe((await readPlayerResponse(first)).player.id);
    expect(store.createdCount).toBe(1);
  });

  test("does not import legacy deck or collection values from the request", async () => {
    const store = new MemoryPlayerProfileStore();
    const response = await postProfile(store, {
      identity: {
        mode: "guest",
        guestId: "guest-legacy-storage",
      },
      deckIds: ["legacy-deck-card"],
      ownedCardIds: ["legacy-owned-card"],
      legacyDeckIds: ["legacy-cloud-card"],
      sessionStorage: {
        "nexus:deck-session:v1": ["legacy-session-card"],
      },
      cloudStorage: {
        nexus_deck_v1: ["legacy-cloud-storage-card"],
      },
    });
    const body = await readPlayerResponse(response);

    expect(response.status).toBe(200);
    expect(body.player.ownedCards).toEqual([]);
    expect(body.player.deckIds).toEqual([]);
    expect(body.player.openedBoosterIds).toEqual([]);
    expect(body.player.starterFreeBoostersRemaining).toBe(2);
  });

  test("rejects mixed identity modes", async () => {
    const response = await postProfile(new MemoryPlayerProfileStore(), {
      identity: {
        mode: "telegram",
        telegramId: "123456789",
        guestId: "guest-alpha",
      },
    });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_identity");
  });

  test("saves a known unique owned nine-card deck", async () => {
    const store = new MemoryPlayerProfileStore([createOwnedDeckProfile()]);
    const nextDeckIds = ownedDeckCardIds.slice(1, 10);
    const response = await postDeck(store, {
      identity: ownedDeckIdentity,
      deckIds: nextDeckIds,
    });
    const body = await readPlayerResponse(response);

    expect(response.status).toBe(200);
    expect(body.player.deckIds).toEqual(nextDeckIds);
    expect(body.player.ownedCards.map((entry) => entry.cardId)).toEqual(ownedDeckCardIds);
  });

  test("rejects deck saves below nine cards", async () => {
    const response = await postDeck(new MemoryPlayerProfileStore([createOwnedDeckProfile()]), {
      identity: ownedDeckIdentity,
      deckIds: savedDeckCardIds.slice(0, 8),
    });
    const body = (await response.json()) as { error?: string; message?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_deck");
    expect(body.message).toBe("Deck must contain at least 9 cards.");
  });

  test("lazy-migrates legacy ownedCardIds documents into the ownedCards multiset", async () => {
    const legacyIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-legacy-multiset" };
    const legacyProfile = {
      ...createNewStoredPlayerProfile("player-legacy", legacyIdentity),
    } as StoredPlayerProfile;
    // Simulate a pre-slice-1 document that only carries ownedCardIds.
    delete (legacyProfile as { ownedCards?: unknown }).ownedCards;
    (legacyProfile as { ownedCardIds?: string[] }).ownedCardIds = ["a", "b"];

    const store = new MemoryPlayerProfileStore([legacyProfile]);
    const response = await postProfile(store, { identity: legacyIdentity });
    const body = await readPlayerResponse(response);

    expect(response.status).toBe(200);
    expect(body.player.ownedCards).toEqual([
      { cardId: "a", count: 1 },
      { cardId: "b", count: 1 },
    ]);
    expect(body.player.onboarding.collectionReady).toBe(true);
  });

  test("rejects duplicate, unknown, and non-owned deck cards", async () => {
    const cases = [
      {
        deckIds: [...savedDeckCardIds.slice(0, 8), savedDeckCardIds[0]],
        message: `Duplicate deck card ids: ${savedDeckCardIds[0]}`,
      },
      {
        deckIds: [...savedDeckCardIds.slice(0, 8), "corr-1285"],
        message: "Unknown deck card ids: corr-1285",
      },
      {
        deckIds: [...savedDeckCardIds.slice(0, 8), nonOwnedCardId],
        message: `Deck contains non-owned card ids: ${nonOwnedCardId}`,
      },
    ];

    for (const testCase of cases) {
      const response = await postDeck(new MemoryPlayerProfileStore([createOwnedDeckProfile()]), {
        identity: ownedDeckIdentity,
        deckIds: testCase.deckIds,
      });
      const body = (await response.json()) as { error?: string; message?: string };

      expect(response.status).toBe(400);
      expect(body.error).toBe("invalid_deck");
      expect(body.message).toBe(testCase.message);
    }
  });
});

describe("player match-finished API (PvE)", () => {
  const identity: PlayerIdentity = { mode: "guest", guestId: "guest-pve-rewards" };

  test("a fresh profile + PvE win persists +30 XP, no crystals, no level-up, and increments wins", async () => {
    const store = new MemoryPlayerProfileStore();
    const response = await postMatchFinished(store, { identity, mode: "pve", result: "win" });
    const body = (await response.json()) as { rewards: RewardSummary; player: PlayerProfile };

    expect(response.status).toBe(200);
    expect(body.rewards.deltaXp).toBe(30);
    expect(body.rewards.deltaCrystals).toBe(0);
    expect(body.rewards.leveledUp).toBe(false);
    expect(body.rewards.levelUpBonusCrystals).toBe(0);
    expect(body.rewards.newTotals).toEqual({ crystals: 0, totalXp: 30, level: 1 });

    expect(body.player.totalXp).toBe(30);
    expect(body.player.crystals).toBe(0);
    expect(body.player.level).toBe(1);
    expect(body.player.wins).toBe(1);
    expect(body.player.losses).toBe(0);
    expect(body.player.draws).toBe(0);

    const persisted = store.snapshot(identity);
    expect(persisted?.totalXp).toBe(30);
    expect(persisted?.wins).toBe(1);
  });

  test("a single PvE win never crosses the level-1 boundary (50 * 2^2 = 200 XP needed)", async () => {
    const store = new MemoryPlayerProfileStore();
    const response = await postMatchFinished(store, { identity, mode: "pve", result: "win" });
    const body = (await response.json()) as { rewards: RewardSummary };

    expect(response.status).toBe(200);
    expect(body.rewards.leveledUp).toBe(false);
    expect(body.rewards.newTotals.level).toBe(1);
    expect(body.rewards.newTotals.crystals).toBe(0);
  });

  test("seven PvE wins accumulate to 210 XP and trigger level-up to level 2 with a 50-crystal bonus", async () => {
    const store = new MemoryPlayerProfileStore();

    let lastBody: { rewards: RewardSummary; player: PlayerProfile } | undefined;
    for (let i = 0; i < 7; i += 1) {
      const response = await postMatchFinished(store, { identity, mode: "pve", result: "win" });
      lastBody = (await response.json()) as { rewards: RewardSummary; player: PlayerProfile };
    }

    if (!lastBody) throw new Error("Expected at least one match finished response.");

    expect(lastBody.player.totalXp).toBe(210);
    expect(lastBody.player.level).toBe(2);
    expect(lastBody.player.crystals).toBe(50);
    expect(lastBody.player.wins).toBe(7);
    expect(lastBody.rewards.leveledUp).toBe(true);
    expect(lastBody.rewards.deltaCrystals).toBe(50);
    expect(lastBody.rewards.levelUpBonusCrystals).toBe(50);
    expect(lastBody.rewards.newTotals).toEqual({ crystals: 50, totalXp: 210, level: 2 });
  });

  test("PvE draws and losses persist their result counters and XP", async () => {
    const store = new MemoryPlayerProfileStore();
    await postMatchFinished(store, { identity, mode: "pve", result: "draw" });
    await postMatchFinished(store, { identity, mode: "pve", result: "loss" });
    await postMatchFinished(store, { identity, mode: "pve", result: "loss" });

    const persisted = store.snapshot(identity);
    expect(persisted?.totalXp).toBe(15 + 5 + 5);
    expect(persisted?.draws).toBe(1);
    expect(persisted?.losses).toBe(2);
    expect(persisted?.wins).toBe(0);
    expect(persisted?.crystals).toBe(0);
  });

  test("rejects a PvP request with a 400 invalid_match", async () => {
    const store = new MemoryPlayerProfileStore();
    const response = await postMatchFinished(store, { identity, mode: "pvp", result: "win" });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_match");
  });

  test("rejects an invalid result bucket with a 400 invalid_match", async () => {
    const store = new MemoryPlayerProfileStore();
    const response = await postMatchFinished(store, { identity, mode: "pve", result: "victory" });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_match");
  });

  test("rejects a missing identity with a 400 invalid_identity", async () => {
    const store = new MemoryPlayerProfileStore();
    const response = await postMatchFinished(store, { mode: "pve", result: "win" });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_identity");
  });

  test("applyAndSummarizeMatchRewards persists a PvP win and returns the authoritative summary", async () => {
    const winnerIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pvp-winner" };
    const loserIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pvp-loser" };
    const store = new MemoryPlayerProfileStore();

    const winner = await applyAndSummarizeMatchRewards(store, winnerIdentity, { mode: "pvp", result: "win" });
    const loser = await applyAndSummarizeMatchRewards(store, loserIdentity, { mode: "pvp", result: "loss" });

    expect(winner.summary.deltaXp).toBe(100);
    expect(winner.summary.deltaCrystals).toBe(10);
    expect(winner.summary.leveledUp).toBe(false);
    expect(winner.summary.newTotals).toEqual({ crystals: 10, totalXp: 100, level: 1 });
    expect(winner.persisted.crystals).toBe(10);
    expect(winner.persisted.totalXp).toBe(100);
    expect(winner.persisted.wins).toBe(1);

    expect(loser.summary.deltaXp).toBe(10);
    expect(loser.summary.deltaCrystals).toBe(0);
    expect(loser.summary.newTotals).toEqual({ crystals: 0, totalXp: 10, level: 1 });
    expect(loser.persisted.losses).toBe(1);

    const persistedWinner = store.snapshot(winnerIdentity);
    const persistedLoser = store.snapshot(loserIdentity);
    expect(persistedWinner?.crystals).toBe(10);
    expect(persistedWinner?.totalXp).toBe(100);
    expect(persistedWinner?.wins).toBe(1);
    expect(persistedLoser?.totalXp).toBe(10);
    expect(persistedLoser?.losses).toBe(1);
  });

  test("two concurrent PvP wins racing across a level threshold persist 2x match crystals + a single level-up bonus", async () => {
    const racyIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pvp-race" };
    const store = new MemoryPlayerProfileStore([
      { ...createNewStoredPlayerProfile("player-pvp-race", racyIdentity), totalXp: 195 },
    ]);

    await Promise.all([
      applyAndSummarizeMatchRewards(store, racyIdentity, { mode: "pvp", result: "win" }),
      applyAndSummarizeMatchRewards(store, racyIdentity, { mode: "pvp", result: "win" }),
    ]);

    const persisted = store.snapshot(racyIdentity);
    expect(persisted?.totalXp).toBe(195 + 100 + 100);
    // 10 (match win) * 2 + 50 (single level-up bonus to level 2)
    expect(persisted?.crystals).toBe(10 + 10 + 50);
    expect(persisted?.wins).toBe(2);
  });

  test("applyAndSummarizeMatchRewards persists matched ELO deltas for both PvP sides against the correct opponent rating", async () => {
    const winnerIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pvp-elo-winner" };
    const loserIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pvp-elo-loser" };
    const store = new MemoryPlayerProfileStore([
      { ...createNewStoredPlayerProfile("player-elo-winner", winnerIdentity), eloRating: 1000 },
      { ...createNewStoredPlayerProfile("player-elo-loser", loserIdentity), eloRating: 1000 },
    ]);

    const winnerOpponentElo = store.snapshot(loserIdentity)?.eloRating ?? 1000;
    const loserOpponentElo = store.snapshot(winnerIdentity)?.eloRating ?? 1000;

    const winner = await applyAndSummarizeMatchRewards(store, winnerIdentity, {
      mode: "pvp",
      result: "win",
      opponentEloBefore: winnerOpponentElo,
    });
    const loser = await applyAndSummarizeMatchRewards(store, loserIdentity, {
      mode: "pvp",
      result: "loss",
      opponentEloBefore: loserOpponentElo,
    });

    expect(winner.summary.deltaElo).toBe(16);
    expect(winner.summary.newTotals.eloRating).toBe(1016);
    expect(winner.persisted.eloRating).toBe(1016);

    expect(loser.summary.deltaElo).toBe(-16);
    expect(loser.summary.newTotals.eloRating).toBe(984);
    expect(loser.persisted.eloRating).toBe(984);

    expect(store.snapshot(winnerIdentity)?.eloRating).toBe(1016);
    expect(store.snapshot(loserIdentity)?.eloRating).toBe(984);
  });

  test("each side's PvP ELO delta uses the opponent's PRE-match rating, not a post-update one", async () => {
    // Asymmetric starting ratings so a wrong "use opponent's post-update ELO"
    // bug would visibly diverge from the +/- expected formula values.
    const stronger: PlayerIdentity = { mode: "guest", guestId: "guest-elo-asym-strong" };
    const weaker: PlayerIdentity = { mode: "guest", guestId: "guest-elo-asym-weak" };
    const store = new MemoryPlayerProfileStore([
      { ...createNewStoredPlayerProfile("player-strong", stronger), eloRating: 1400 },
      { ...createNewStoredPlayerProfile("player-weak", weaker), eloRating: 1000 },
    ]);

    // Snapshot both ELOs first so the second apply does not see the first apply's update.
    const strongerStartElo = store.snapshot(stronger)?.eloRating ?? 1000;
    const weakerStartElo = store.snapshot(weaker)?.eloRating ?? 1000;
    expect(strongerStartElo).toBe(1400);
    expect(weakerStartElo).toBe(1000);

    const upset = await applyAndSummarizeMatchRewards(store, weaker, {
      mode: "pvp",
      result: "win",
      opponentEloBefore: strongerStartElo,
    });
    const upsetVictim = await applyAndSummarizeMatchRewards(store, stronger, {
      mode: "pvp",
      result: "loss",
      opponentEloBefore: weakerStartElo,
    });

    // Symmetry: the underdog's win delta + the favourite's loss delta = 0.
    expect((upset.summary.deltaElo ?? 0) + (upsetVictim.summary.deltaElo ?? 0)).toBe(0);

    // Underdog gains substantially more than the equal-rating +16 baseline.
    expect(upset.summary.deltaElo).toBeGreaterThan(16);
    expect(upset.persisted.eloRating).toBe(1000 + (upset.summary.deltaElo ?? 0));

    // Favourite drops by the same magnitude.
    expect(upsetVictim.summary.deltaElo).toBeLessThan(-16);
    expect(upsetVictim.persisted.eloRating).toBe(1400 + (upsetVictim.summary.deltaElo ?? 0));
  });

  test("PvP ELO never drops below 100 even after a loss to a much stronger opponent", async () => {
    const flooredIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-elo-floor" };
    const store = new MemoryPlayerProfileStore([
      { ...createNewStoredPlayerProfile("player-floor", flooredIdentity), eloRating: 100 },
    ]);

    const result = await applyAndSummarizeMatchRewards(store, flooredIdentity, {
      mode: "pvp",
      result: "loss",
      opponentEloBefore: 2000,
    });

    expect(result.summary.newTotals.eloRating).toBe(100);
    expect(result.summary.deltaElo).toBe(0);
    expect(result.persisted.eloRating).toBe(100);
  });

  test("PvE applyAndSummarize does not surface deltaElo or newTotals.eloRating", async () => {
    const identityPve: PlayerIdentity = { mode: "guest", guestId: "guest-pve-no-elo" };
    const store = new MemoryPlayerProfileStore();

    const result = await applyAndSummarizeMatchRewards(store, identityPve, {
      mode: "pve",
      result: "win",
    });

    expect(result.summary.deltaElo).toBeUndefined();
    expect(result.summary.newTotals.eloRating).toBeUndefined();
    // The persisted profile still carries the default 1000 ELO; PvE just doesn't broadcast it.
    expect(result.persisted.eloRating).toBe(1000);
  });

  test("two concurrent PvE wins racing across a level threshold add 2x deltaXp and pay the bonus exactly once", async () => {
    // Both callers' pre-call view says "I crossed level 2"; the persistence
    // layer must still pay the bonus only once.
    const racyIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-pve-race" };
    const store = new MemoryPlayerProfileStore([
      { ...createNewStoredPlayerProfile("player-race", racyIdentity), totalXp: 195 },
    ]);

    const responses = await Promise.all([
      postMatchFinished(store, { identity: racyIdentity, mode: "pve", result: "win" }),
      postMatchFinished(store, { identity: racyIdentity, mode: "pve", result: "win" }),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(200);
    }

    const persisted = store.snapshot(racyIdentity);
    expect(persisted?.totalXp).toBe(195 + 30 + 30);
    expect(persisted?.crystals).toBe(50);
    expect(persisted?.wins).toBe(2);
  });

  test("applyPvpMatchRewardsForBothSides skips ELO on both sides when one pre-match read throws, but still persists XP and crystals", async () => {
    const winnerIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-elo-fail-winner" };
    const loserIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-elo-fail-loser" };
    const store = new ThrowingFindStore(
      [
        { ...createNewStoredPlayerProfile("player-fail-winner", winnerIdentity), eloRating: 1500 },
        { ...createNewStoredPlayerProfile("player-fail-loser", loserIdentity), eloRating: 1300 },
      ],
      (identity) => isSamePlayerIdentity(identity, loserIdentity),
    );

    const winnerEloBefore = store.snapshot(winnerIdentity)?.eloRating;
    const loserEloBefore = store.snapshot(loserIdentity)?.eloRating;
    expect(winnerEloBefore).toBe(1500);
    expect(loserEloBefore).toBe(1300);

    const failures: { key: string }[] = [];
    const outcomes = await applyPvpMatchRewardsForBothSides(
      store,
      [
        { key: "winner", identity: winnerIdentity, result: "win" },
        { key: "loser", identity: loserIdentity, result: "loss" },
      ],
      { onEloReadFailure: ({ key }) => failures.push({ key }) },
    );

    const winnerOutcome = outcomes.find((entry) => entry.key === "winner");
    const loserOutcome = outcomes.find((entry) => entry.key === "loser");

    expect(winnerOutcome?.summary).not.toBeNull();
    expect(loserOutcome?.summary).not.toBeNull();

    const winnerSummary = winnerOutcome!.summary as RewardSummary;
    const loserSummary = loserOutcome!.summary as RewardSummary;

    expect(winnerSummary.deltaXp).toBe(100);
    expect(winnerSummary.deltaCrystals).toBe(10);
    expect(loserSummary.deltaXp).toBe(10);
    expect(loserSummary.deltaCrystals).toBe(0);

    expect(winnerSummary.deltaElo).toBeUndefined();
    expect(winnerSummary.newTotals.eloRating).toBeUndefined();
    expect(loserSummary.deltaElo).toBeUndefined();
    expect(loserSummary.newTotals.eloRating).toBeUndefined();

    expect(store.snapshot(winnerIdentity)?.eloRating).toBe(1500);
    expect(store.snapshot(loserIdentity)?.eloRating).toBe(1300);

    expect(failures).toEqual([{ key: "loser" }]);
  });

  test("applyPvpMatchRewardsForBothSides applies ELO normally when both pre-match reads succeed", async () => {
    const winnerIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-elo-happy-winner" };
    const loserIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-elo-happy-loser" };
    const store = new MemoryPlayerProfileStore([
      { ...createNewStoredPlayerProfile("player-happy-winner", winnerIdentity), eloRating: 1000 },
      { ...createNewStoredPlayerProfile("player-happy-loser", loserIdentity), eloRating: 1000 },
    ]);

    const failures: unknown[] = [];
    const outcomes = await applyPvpMatchRewardsForBothSides(
      store,
      [
        { key: "winner", identity: winnerIdentity, result: "win" },
        { key: "loser", identity: loserIdentity, result: "loss" },
      ],
      { onEloReadFailure: (event) => failures.push(event) },
    );

    const winnerSummary = outcomes.find((entry) => entry.key === "winner")?.summary as RewardSummary;
    const loserSummary = outcomes.find((entry) => entry.key === "loser")?.summary as RewardSummary;

    expect(winnerSummary.deltaElo).toBe(16);
    expect(winnerSummary.newTotals.eloRating).toBe(1016);
    expect(loserSummary.deltaElo).toBe(-16);
    expect(loserSummary.newTotals.eloRating).toBe(984);

    expect(store.snapshot(winnerIdentity)?.eloRating).toBe(1016);
    expect(store.snapshot(loserIdentity)?.eloRating).toBe(984);
    expect(failures).toEqual([]);
  });
});

describe("player sell API", () => {
  const sellIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-sell-flow" };
  const commonCard = cards.find((card) => card.rarity === "Common");
  const legendCard = cards.find((card) => card.rarity === "Legend");
  if (!commonCard) throw new Error("Test fixture requires at least one Common card.");
  if (!legendCard) throw new Error("Test fixture requires at least one Legend card.");

  const commonSellPrice = 5;
  const legendSellPrice = 200;

  function createSellableProfile(options: {
    ownedCards: { cardId: string; count: number }[];
    deckIds?: string[];
    crystals?: number;
  }): StoredPlayerProfile {
    return {
      ...createNewStoredPlayerProfile("player-sell-flow", sellIdentity),
      ownedCards: options.ownedCards.map((entry) => ({ ...entry })),
      deckIds: options.deckIds ?? [],
      starterFreeBoostersRemaining: 0,
      openedBoosterIds: [],
      crystals: options.crystals ?? 0,
    };
  }

  test("happy path: sells two of a duplicated Common, removes the entry, credits 2 * 5 = 10 crystals", async () => {
    const store = new MemoryPlayerProfileStore([
      createSellableProfile({ ownedCards: [{ cardId: commonCard.id, count: 2 }], crystals: 100 }),
    ]);

    const response = await postSell(store, { identity: sellIdentity, cardId: commonCard.id, count: 2 });
    const body = (await response.json()) as { player: PlayerProfile };

    expect(response.status).toBe(200);
    expect(body.player.crystals).toBe(100 + 2 * commonSellPrice);
    expect(body.player.ownedCards.find((entry) => entry.cardId === commonCard.id)).toBeUndefined();

    const persisted = store.snapshot(sellIdentity);
    expect(persisted?.crystals).toBe(110);
    expect(getOwnedCount(persisted?.ownedCards ?? [], commonCard.id)).toBe(0);
  });

  test("happy path: count: 1 of a 3-stack decrements to 2 and credits one unit of revenue", async () => {
    const store = new MemoryPlayerProfileStore([
      createSellableProfile({ ownedCards: [{ cardId: commonCard.id, count: 3 }], crystals: 0 }),
    ]);

    const response = await postSell(store, { identity: sellIdentity, cardId: commonCard.id, count: 1 });
    const body = (await response.json()) as { player: PlayerProfile };

    expect(response.status).toBe(200);
    expect(getOwnedCount(body.player.ownedCards, commonCard.id)).toBe(2);
    expect(body.player.crystals).toBe(commonSellPrice);
  });

  test("Legend cards pay the Legend rarity (200 per copy)", async () => {
    const store = new MemoryPlayerProfileStore([
      createSellableProfile({ ownedCards: [{ cardId: legendCard.id, count: 2 }], crystals: 0 }),
    ]);

    const response = await postSell(store, { identity: sellIdentity, cardId: legendCard.id, count: 2 });
    const body = (await response.json()) as { player: PlayerProfile };

    expect(response.status).toBe(200);
    expect(body.player.crystals).toBe(2 * legendSellPrice);
    expect(getOwnedCount(body.player.ownedCards, legendCard.id)).toBe(0);
  });

  test("rejects sell when the card is in any saved deck (409 card_in_deck), profile unchanged", async () => {
    const profile = createSellableProfile({
      ownedCards: [{ cardId: commonCard.id, count: 5 }],
      deckIds: [commonCard.id],
      crystals: 12,
    });
    const store = new MemoryPlayerProfileStore([profile]);

    const response = await postSell(store, { identity: sellIdentity, cardId: commonCard.id, count: 1 });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("card_in_deck");

    const persisted = store.snapshot(sellIdentity);
    expect(persisted?.crystals).toBe(12);
    expect(getOwnedCount(persisted?.ownedCards ?? [], commonCard.id)).toBe(5);
  });

  test("rejects sell when count > sellable copies (409 insufficient_stock), profile unchanged", async () => {
    const store = new MemoryPlayerProfileStore([
      createSellableProfile({ ownedCards: [{ cardId: commonCard.id, count: 2 }], crystals: 7 }),
    ]);

    const response = await postSell(store, { identity: sellIdentity, cardId: commonCard.id, count: 3 });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("insufficient_stock");

    const persisted = store.snapshot(sellIdentity);
    expect(persisted?.crystals).toBe(7);
    expect(getOwnedCount(persisted?.ownedCards ?? [], commonCard.id)).toBe(2);
  });

  test("rejects sell against an unknown cardId (400 invalid_card_id), profile unchanged", async () => {
    const store = new MemoryPlayerProfileStore([
      createSellableProfile({ ownedCards: [{ cardId: commonCard.id, count: 2 }], crystals: 0 }),
    ]);

    const response = await postSell(store, { identity: sellIdentity, cardId: "not-a-real-card", count: 1 });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_card_id");

    const persisted = store.snapshot(sellIdentity);
    expect(getOwnedCount(persisted?.ownedCards ?? [], commonCard.id)).toBe(2);
  });

  test("rejects sell with count: 0 (400 invalid_sell_count)", async () => {
    const store = new MemoryPlayerProfileStore([
      createSellableProfile({ ownedCards: [{ cardId: commonCard.id, count: 2 }] }),
    ]);

    const response = await postSell(store, { identity: sellIdentity, cardId: commonCard.id, count: 0 });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_sell_count");
  });

  test("rejects sell with count: -1 (400 invalid_sell_count)", async () => {
    const store = new MemoryPlayerProfileStore([
      createSellableProfile({ ownedCards: [{ cardId: commonCard.id, count: 2 }] }),
    ]);

    const response = await postSell(store, { identity: sellIdentity, cardId: commonCard.id, count: -1 });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_sell_count");
  });

  test("rejects sell with non-integer count (400 invalid_sell_count)", async () => {
    const store = new MemoryPlayerProfileStore([
      createSellableProfile({ ownedCards: [{ cardId: commonCard.id, count: 2 }] }),
    ]);

    const response = await postSell(store, { identity: sellIdentity, cardId: commonCard.id, count: 1.5 });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_sell_count");
  });

  test("deck-protection: with 2 owned and the card in deck, sellableCount is 1 — selling 2 fails 409 insufficient_stock or card_in_deck", async () => {
    // Per slice-1 inventoryOps: a card in deck reserves exactly one copy.
    // With ownedCount = 2 and the card in deck, sellableCount = 1.
    const profile = createSellableProfile({
      ownedCards: [{ cardId: commonCard.id, count: 2 }],
      deckIds: [commonCard.id],
      crystals: 0,
    });
    const store = new MemoryPlayerProfileStore([profile]);
    expect(getSellableCount(profile.ownedCards, profile.deckIds, commonCard.id)).toBe(1);

    const response = await postSell(store, { identity: sellIdentity, cardId: commonCard.id, count: 2 });
    const body = (await response.json()) as { error: string };

    // The deck-membership guard fires first in our implementation.
    expect(response.status).toBe(409);
    expect(["card_in_deck", "insufficient_stock"]).toContain(body.error);

    const persisted = store.snapshot(sellIdentity);
    expect(persisted?.crystals).toBe(0);
    expect(getOwnedCount(persisted?.ownedCards ?? [], commonCard.id)).toBe(2);
  });

  test("the multiset addToInventory + sell round-trip is consistent with computeSellRevenue", () => {
    // Sanity check that the in-memory store mirrors what production does:
    // ownedCards updates flow through inventoryOps and crystals through the
    // pricing module, so the test exercises the same composition.
    const seedOwned = addToInventory([], commonCard.id, 4);
    expect(getOwnedCount(seedOwned, commonCard.id)).toBe(4);
    expect(computeSellRevenue(commonCard, 4)).toBe(20);
  });
});

class MemoryPlayerProfileStore implements PlayerDeckStore, PlayerMatchRewardsStore, PlayerSellStore {
  private readonly profiles: StoredPlayerProfile[];
  private nextId: number;
  createdCount = 0;

  constructor(profiles: StoredPlayerProfile[] = []) {
    this.profiles = profiles;
    this.nextId = profiles.length + 1;
  }

  async findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile> {
    const existing = this.profiles.find((profile) => isSamePlayerIdentity(profile.identity, identity));
    if (existing) return existing;

    const profile = createNewStoredPlayerProfile(`player-${this.nextId}`, identity);
    this.nextId += 1;
    this.createdCount += 1;
    this.profiles.push(profile);
    return profile;
  }

  async saveDeck(identity: PlayerIdentity, deckIds: string[]): Promise<StoredPlayerProfile> {
    const profile = this.profiles.find((item) => isSamePlayerIdentity(item.identity, identity));
    if (!profile) throw new Error("Profile does not exist.");

    profile.deckIds = [...deckIds];
    return profile;
  }

  async applyMatchRewards(identity: PlayerIdentity, rewards: ApplyMatchRewardsInput): Promise<StoredPlayerProfile> {
    const index = this.profiles.findIndex((profile) => isSamePlayerIdentity(profile.identity, identity));
    if (index < 0) throw new Error("Profile does not exist.");

    const current = this.profiles[index];
    const counterField =
      rewards.result === "win" ? "wins" : rewards.result === "loss" ? "losses" : "draws";

    const afterIncrement: StoredPlayerProfile = {
      ...current,
      totalXp: current.totalXp + rewards.deltaXp,
      crystals: current.crystals + rewards.matchCrystals,
      [counterField]: (current[counterField] ?? 0) + 1,
      ...(typeof rewards.eloRating === "number" && Number.isFinite(rewards.eloRating)
        ? { eloRating: Math.max(0, Math.round(rewards.eloRating)) }
        : {}),
    };
    this.profiles[index] = afterIncrement;

    // Yield so concurrent callers can interleave their own Op A — mirrors
    // the Mongo round-trip and lets the race test exercise the real window.
    await Promise.resolve();

    const xpBeforeThisMatch = Math.max(0, afterIncrement.totalXp - rewards.deltaXp);
    const oldLevel = computeLevelFromXp(xpBeforeThisMatch).level;
    const newLevel = computeLevelFromXp(afterIncrement.totalXp).level;
    if (newLevel <= oldLevel) return this.profiles[index];

    const bonus = computeLevelUpBonusForRange(oldLevel, newLevel);
    if (bonus <= 0) return this.profiles[index];

    const latest = this.profiles[index];
    const afterBonus: StoredPlayerProfile = { ...latest, crystals: latest.crystals + bonus };
    this.profiles[index] = afterBonus;
    return afterBonus;
  }

  async applySellCards(identity: PlayerIdentity, cardId: string, count: number): Promise<StoredPlayerProfile> {
    if (!Number.isInteger(count) || count <= 0) {
      throw new SellError("invalid_sell_count", "count must be a positive integer.", 400);
    }

    const card = cards.find((entry) => entry.id === cardId);
    if (!card) {
      throw new SellError("invalid_card_id", `Unknown card id: ${cardId}`, 400);
    }

    const index = this.profiles.findIndex((profile) => isSamePlayerIdentity(profile.identity, identity));
    if (index < 0) {
      throw new SellError("insufficient_stock", "Profile does not exist.", 409);
    }

    const current = this.profiles[index];
    if (current.deckIds.includes(cardId)) {
      throw new SellError("card_in_deck", "Cannot sell a card that is in a saved deck.", 409);
    }

    if (count > getSellableCount(current.ownedCards, current.deckIds, cardId)) {
      throw new SellError("insufficient_stock", "Not enough sellable copies.", 409);
    }

    const revenue = computeSellRevenue(card, count);
    const next: StoredPlayerProfile = {
      ...current,
      ownedCards: removeFromInventory(current.ownedCards, cardId, count),
      crystals: current.crystals + revenue,
    };
    this.profiles[index] = next;
    return next;
  }

  snapshot(identity: PlayerIdentity): StoredPlayerProfile | undefined {
    return this.profiles.find((profile) => isSamePlayerIdentity(profile.identity, identity));
  }
}

class ThrowingFindStore extends MemoryPlayerProfileStore {
  private readonly thrownFor = new Set<string>();

  constructor(profiles: StoredPlayerProfile[], private readonly shouldThrowOnFirstRead: (identity: PlayerIdentity) => boolean) {
    super(profiles);
  }

  override async findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile> {
    const key = identityKey(identity);
    if (this.shouldThrowOnFirstRead(identity) && !this.thrownFor.has(key)) {
      this.thrownFor.add(key);
      throw new Error("simulated transient mongo read failure");
    }
    return super.findOrCreateByIdentity(identity);
  }
}

function identityKey(identity: PlayerIdentity) {
  return identity.mode === "telegram" ? `telegram:${identity.telegramId}` : `guest:${identity.guestId}`;
}

function postProfile(store: PlayerProfileStore, body: unknown) {
  return handlePlayerProfilePost(
    new Request("http://localhost/api/player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    store,
  );
}

function postMatchFinished(store: PlayerMatchRewardsStore, body: unknown) {
  return handlePlayerMatchFinishedPost(
    new Request("http://localhost/api/player/match-finished", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    store,
  );
}

function postDeck(store: PlayerDeckStore, body: unknown) {
  return handlePlayerDeckSavePost(
    new Request("http://localhost/api/player/deck", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    store,
  );
}

function postSell(store: PlayerSellStore, body: unknown) {
  return handlePlayerSellPost(
    new Request("http://localhost/api/player/sell", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    store,
  );
}

function createOwnedDeckProfile() {
  return {
    ...createNewStoredPlayerProfile("player-owned-deck", ownedDeckIdentity),
    ownedCards: ownedDeckCardIds.map((cardId) => ({ cardId, count: 1 })),
    deckIds: [...savedDeckCardIds],
    starterFreeBoostersRemaining: 0,
    openedBoosterIds: ["neon-breach", "factory-shift"],
  };
}

async function readPlayerResponse(response: Response) {
  return (await response.json()) as { player: PlayerProfile };
}
