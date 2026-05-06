import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cards } from "../src/features/battle/model/cards";
import type { Card, Rarity } from "../src/features/battle/model/types";
import { handleBoosterCatalogGet, handleBoosterCatalogPost, handleBoosterOpenPost, handleStarterBoosterOpenPost } from "../src/features/boosters/api";
import { getBoosterById } from "../src/features/boosters/catalog";
import { BoosterOpeningError, chooseStarterWeightedRarity, prepareStarterBoosterOpening, type RandomSource } from "../src/features/boosters/opening";
import type { BoosterCatalogItem, BoosterOpeningRecord, BoosterOpeningStore, StoredBoosterOpeningRecord } from "../src/features/boosters/types";
import { addToInventory, getOwnedCount } from "../src/features/inventory/inventoryOps";
import { signGroupLaunchContext } from "../src/features/integrations/groupContext";
import { groupBoosterId, groupCardId, hydrateGroupRuntime, resetDynamicIntegrationRuntimeForTests, type GroupCardIntegrationRecord, type GroupIntegrationRecord } from "../src/features/integrations/runtime";
import { createPlayerSessionCookie } from "../src/features/player/profile/auth";
import { createNewStoredPlayerProfile, isSamePlayerIdentity, type PlayerIdentity, type PlayerProfile, type StoredPlayerProfile } from "../src/features/player/profile/types";

const guestIdentity: PlayerIdentity = {
  mode: "guest",
  guestId: "booster-guest",
};
const GROUP_CONTEXT_SECRET = "group-context-test-secret";

let previousGroupContextSecret: string | undefined;
beforeEach(() => {
  previousGroupContextSecret = process.env.GROUP_CONTEXT_SIGNING_SECRET;
  process.env.GROUP_CONTEXT_SIGNING_SECRET = GROUP_CONTEXT_SECRET;
});

afterEach(() => {
  resetDynamicIntegrationRuntimeForTests();
  if (previousGroupContextSecret === undefined) delete process.env.GROUP_CONTEXT_SIGNING_SECRET;
  else process.env.GROUP_CONTEXT_SIGNING_SECRET = previousGroupContextSecret;
});

describe("booster catalog", () => {
  test("returns thirteen curated boosters without C.O.R.R.", async () => {
    const response = await handleBoosterCatalogGet();
    const body = (await response.json()) as { boosters: { id: string; name: string; clans: string[] }[] };

    expect(response.status).toBe(200);
    expect(body.boosters).toHaveLength(13);
    expect(body.boosters.map((booster) => booster.name)).toEqual([
      "Vibe Drop",
      "Neon Breach",
      "Factory Shift",
      "Street Kings",
      "Carnival Vice",
      "Faith & Fury",
      "Biohazard",
      "Underworld",
      "Mind Games",
      "Toy Factory",
      "Metro Chase",
      "Desert Signal",
      "Street Plague",
    ]);
    expect(body.boosters[0]).toMatchObject({ id: "vibe-drop", presentation: "special" });

    for (const booster of body.boosters) {
      expect(booster.clans.length).toBeGreaterThanOrEqual(1);
      expect(booster.clans.length).toBeLessThanOrEqual(2);
      expect(booster.clans).not.toContain("C.O.R.R.");
    }
  });

  test("marks the first opened starter booster as disabled while the second remains selectable", async () => {
    const store = new MemoryBoosterOpeningStore();
    await openBooster(store, "neon-breach");

    const response = await postCatalog(store, guestIdentity);
    const body = (await response.json()) as { boosters: BoosterCatalogItem[]; player: PlayerProfile };
    const opened = body.boosters.find((booster) => booster.id === "neon-breach");
    const next = body.boosters.find((booster) => booster.id === "factory-shift");

    expect(response.status).toBe(200);
    expect(body.player.starterFreeBoostersRemaining).toBe(1);
    expect(opened?.starter).toEqual({
      opened: true,
      canOpen: false,
      disabledReason: "already_opened",
    });
    expect(opened?.paid).toEqual({
      crystalCost: 100,
      canOpen: false,
      disabledReason: "insufficient_crystals",
    });
    expect(next?.starter).toEqual({
      opened: false,
      canOpen: true,
    });
  });

  test("marks every booster as paid-openable when the player has enough crystals", async () => {
    const store = new MemoryBoosterOpeningStore();
    store.seedProfile(guestIdentity, {
      crystals: 100,
      starterFreeBoostersRemaining: 0,
      openedBoosterIds: ["neon-breach"],
    });

    const response = await postCatalog(store, guestIdentity);
    const body = (await response.json()) as { boosters: BoosterCatalogItem[]; player: PlayerProfile };

    expect(response.status).toBe(200);
    expect(body.player.crystals).toBe(100);
    expect(body.boosters.every((booster) => booster.paid.canOpen)).toBe(true);
    expect(body.boosters.every((booster) => booster.paid.crystalCost === 100)).toBe(true);
  });

  test("shows a group booster only for a valid signed context for that group", async () => {
    const store = new MemoryBoosterOpeningStore();
    store.seedProfile(guestIdentity, { crystals: 100 });
    store.seedGroup("-100visible", ["visible-a", "visible-b", "visible-c", "visible-d"]);
    store.seedGroup("-100other", ["other-a", "other-b", "other-c", "other-d"]);
    const visibleContext = signGroupLaunchContext({ chatId: "-100visible", now: new Date("2099-05-06T10:00:00.000Z") });
    const otherContext = signGroupLaunchContext({ chatId: "-100other", now: new Date("2099-05-06T10:00:00.000Z") });

    const noContextBody = (await (await postCatalog(store, guestIdentity)).json()) as { boosters: BoosterCatalogItem[] };
    const visibleBody = (await (await postCatalog(store, guestIdentity, visibleContext)).json()) as { boosters: BoosterCatalogItem[] };
    const otherBody = (await (await postCatalog(store, guestIdentity, otherContext)).json()) as { boosters: BoosterCatalogItem[] };

    expect(noContextBody.boosters.some((booster) => booster.id.startsWith("group-"))).toBe(false);
    expect(visibleBody.boosters.find((booster) => booster.id === groupBoosterId("-100visible"))).toMatchObject({
      id: groupBoosterId("-100visible"),
      groupChatId: "-100visible",
      presentation: "group",
      paid: {
        canOpen: true,
      },
    });
    expect(visibleBody.boosters.some((booster) => booster.id === groupBoosterId("-100other"))).toBe(false);
    expect(otherBody.boosters.some((booster) => booster.id === groupBoosterId("-100visible"))).toBe(false);
  });

  test("includes signed group booster metadata on the public paid-shop catalog GET", async () => {
    const store = new MemoryBoosterOpeningStore();
    const group = store.seedGroup("-100shop", ["shop-a", "shop-b", "shop-c", "shop-d"]);
    const context = signGroupLaunchContext({ chatId: "-100shop", now: new Date("2099-05-06T10:00:00.000Z") });

    const response = await handleBoosterCatalogGet(new Request(`http://localhost/api/boosters?groupContext=${encodeURIComponent(context)}`), store);
    const body = (await response.json()) as { boosters: { id: string; presentation?: string; groupChatId?: string }[] };

    expect(response.status).toBe(200);
    expect(body.boosters.at(0)).toMatchObject({ id: "vibe-drop", presentation: "special" });
    expect(body.boosters.at(-1)).toMatchObject({
      id: group.boosterId,
      presentation: "group",
      groupChatId: "-100shop",
    });
  });

  test("rejects expired, tampered, or unsigned group contexts for group catalog", async () => {
    const store = new MemoryBoosterOpeningStore();
    store.seedGroup("-100secure", ["secure-a"]);
    const expired = signGroupLaunchContext({ chatId: "-100secure", now: new Date("2000-05-06T10:00:00.000Z"), ttlSeconds: -1 });
    const tampered = `${expired.slice(0, -1)}x`;

    const expiredResponse = await postCatalog(store, guestIdentity, expired);
    const tamperedResponse = await postCatalog(store, guestIdentity, tampered);

    expect(expiredResponse.status).toBe(403);
    expect(((await expiredResponse.json()) as { error: string }).error).toBe("group_context_expired");
    expect(tamperedResponse.status).toBe(403);
    expect(((await tamperedResponse.json()) as { error: string }).error).toBe("group_context_invalid");
  });
});

describe("starter booster opening", () => {
  test("guarantees one Legend and one Unique, returns five unique cards from the booster clans, and persists history", async () => {
    const store = new MemoryBoosterOpeningStore();
    const response = await openBooster(store, "neon-breach");
    const body = (await response.json()) as OpenBoosterResponse;
    const rarities = body.cards.map((card) => card.rarity);
    const cardIds = body.cards.map((card) => card.id);

    expect(response.status).toBe(200);
    expect(body.booster.id).toBe("neon-breach");
    expect(body.cards).toHaveLength(5);
    expect(rarities).toContain("Legend");
    expect(rarities).toContain("Unique");
    expect(new Set(cardIds).size).toBe(5);
    expect(body.cards.every((card) => body.booster.clans.includes(card.clan))).toBe(true);
    expect(body.cards.some((card) => card.clan === "C.O.R.R." || card.id.startsWith("corr-"))).toBe(false);
    expect(body.player.ownedCards.map((entry) => entry.cardId)).toEqual(cardIds);
    expect(body.player.ownedCards.every((entry) => entry.count === 1)).toBe(true);
    expect(body.player.deckIds).toEqual(cardIds);
    expect(body.player.openedBoosterIds).toEqual(["neon-breach"]);
    expect(body.player.starterFreeBoostersRemaining).toBe(1);
    expect(store.openings).toHaveLength(1);
    expect(body.opening).toMatchObject({
      id: "opening-1",
      playerId: "player-1",
      boosterId: "neon-breach",
      source: "starter_free",
      cardIds,
      openedAt: "2026-05-02T12:00:00.000Z",
    });
  });

  test("uses Common 72%, Rare 23%, Unique 4%, Legend 1% for weighted starter slots", () => {
    expect(chooseStarterWeightedRarity(() => 0)).toBe("Common");
    expect(chooseStarterWeightedRarity(() => 0.7199)).toBe("Common");
    expect(chooseStarterWeightedRarity(() => 0.72)).toBe("Rare");
    expect(chooseStarterWeightedRarity(() => 0.9499)).toBe("Rare");
    expect(chooseStarterWeightedRarity(() => 0.95)).toBe("Unique");
    expect(chooseStarterWeightedRarity(() => 0.9899)).toBe("Unique");
    expect(chooseStarterWeightedRarity(() => 0.99)).toBe("Legend");
  });

  test("opens five within-pull-unique cards from the booster clans regardless of cross-pull ownership", () => {
    const booster = getBoosterById("neon-breach");
    if (!booster) throw new Error("Expected neon-breach booster.");

    // Owning every booster-clan card must NOT block opening — the multiset
    // simply increments counts. Within-pull uniqueness is still preserved.
    const boosterClans: readonly string[] = booster.clans;
    const allClanCardIds = cards.filter((card) => boosterClans.includes(card.clan)).map((card) => card.id);
    const opening = prepareStarterBoosterOpening({
      boosterId: booster.id,
      player: {
        ownedCards: allClanCardIds.map((cardId) => ({ cardId, count: 1 })),
        openedBoosterIds: [],
        starterFreeBoostersRemaining: 2,
      },
      rng: sequenceRng([0, 0, 0.8, 0, 0.8, 0, 0.8, 0]),
    });
    const cardIds = opening.cardIds;

    expect(opening.cards).toHaveLength(5);
    expect(opening.cards.map((card) => card.rarity)).toContain("Legend");
    expect(opening.cards.map((card) => card.rarity)).toContain("Unique");
    expect(new Set(cardIds).size).toBe(5);
    expect(cardIds.every((cardId) => allClanCardIds.includes(cardId))).toBe(true);
  });

  test("rejects unknown boosters and unavailable starter openings", async () => {
    const store = new MemoryBoosterOpeningStore();
    const unknown = await openBooster(store, "missing-booster");

    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { error: string }).error).toBe("invalid_booster_id");

    const unavailableStore = new MemoryBoosterOpeningStore();
    unavailableStore.seedProfile(guestIdentity, {
      starterFreeBoostersRemaining: 0,
    });
    const unavailable = await openBooster(unavailableStore, "neon-breach");

    expect(unavailable.status).toBe(409);
    expect(((await unavailable.json()) as { error: string }).error).toBe("starter_booster_unavailable");
    expect(unavailableStore.openings).toHaveLength(0);
  });

  test("rejects opening the same starter booster twice", async () => {
    const store = new MemoryBoosterOpeningStore();
    const first = await openBooster(store, "neon-breach");
    const second = await openBooster(store, "neon-breach");

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe("starter_booster_already_opened");
    expect(store.openings).toHaveLength(1);
  });

  test("appends a different second starter booster into the saved ten-card deck", async () => {
    const store = new MemoryBoosterOpeningStore();
    const first = await openBooster(store, "neon-breach");
    const firstBody = (await first.json()) as OpenBoosterResponse;
    const second = await openBooster(store, "factory-shift");
    const secondBody = (await second.json()) as OpenBoosterResponse;
    const firstCardIds = firstBody.cards.map((card) => card.id);
    const secondCardIds = secondBody.cards.map((card) => card.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody.player.ownedCards.map((entry) => entry.cardId)).toEqual([...firstCardIds, ...secondCardIds]);
    expect(secondBody.player.ownedCards.every((entry) => entry.count === 1)).toBe(true);
    expect(secondBody.player.deckIds).toEqual([...firstCardIds, ...secondCardIds]);
    expect(secondBody.player.deckIds).toHaveLength(10);
    expect(new Set(secondBody.player.deckIds).size).toBe(10);
    expect(secondBody.player.openedBoosterIds).toEqual(["neon-breach", "factory-shift"]);
    expect(secondBody.player.starterFreeBoostersRemaining).toBe(0);
    expect(store.openings).toHaveLength(2);
  });

  test("does not advance player state when history insert fails", async () => {
    const store = new MemoryBoosterOpeningStore();
    await store.findOrCreateByIdentity(guestIdentity);
    store.failNextHistoryInsert = true;

    const response = await withSuppressedConsoleError(() => openBooster(store, "neon-breach"));
    const body = (await response.json()) as { error: string };
    const profile = await store.findOrCreateByIdentity(guestIdentity);

    expect(response.status).toBe(500);
    expect(body.error).toBe("booster_unavailable");
    expect(profile.ownedCards).toEqual([]);
    expect(profile.deckIds).toEqual([]);
    expect(profile.openedBoosterIds).toEqual([]);
    expect(profile.starterFreeBoostersRemaining).toBe(2);
    expect(store.openings).toHaveLength(0);
  });

  test("two concurrent opens for different boosters retain every drawn card and zero-out the starter counter", async () => {
    const store = new MemoryBoosterOpeningStore();
    await store.findOrCreateByIdentity(guestIdentity);

    const [firstResponse, secondResponse] = await Promise.all([
      openBooster(store, "neon-breach"),
      openBooster(store, "factory-shift"),
    ]);
    const firstBody = (await firstResponse.json()) as OpenBoosterResponse;
    const secondBody = (await secondResponse.json()) as OpenBoosterResponse;
    const firstCardIds = firstBody.cards.map((card) => card.id);
    const secondCardIds = secondBody.cards.map((card) => card.id);
    const finalProfile = await store.findOrCreateByIdentity(guestIdentity);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(finalProfile.ownedCards).toHaveLength(10);
    expect(finalProfile.ownedCards.reduce((sum, entry) => sum + entry.count, 0)).toBe(10);
    expect(finalProfile.deckIds).toEqual([...firstCardIds, ...secondCardIds]);
    expect(finalProfile.starterFreeBoostersRemaining).toBe(0);
    expect(finalProfile.openedBoosterIds).toEqual(["neon-breach", "factory-shift"]);
  });

  test("opens a booster even when the player already owns every clan card and increments the count for the affected entries", async () => {
    const booster = getBoosterById("neon-breach");
    if (!booster) throw new Error("Expected neon-breach booster.");

    const boosterClans: readonly string[] = booster.clans;
    const allClanCardIds = cards.filter((card) => boosterClans.includes(card.clan)).map((card) => card.id);
    const store = new MemoryBoosterOpeningStore();
    store.seedProfile(guestIdentity, {
      ownedCards: allClanCardIds.map((cardId) => ({ cardId, count: 1 })),
    });

    const response = await openBooster(store, "neon-breach");
    const body = (await response.json()) as OpenBoosterResponse;
    const drawnIds = body.cards.map((card) => card.id);

    expect(response.status).toBe(200);
    expect(drawnIds).toHaveLength(5);
    expect(new Set(drawnIds).size).toBe(5);
    for (const cardId of drawnIds) {
      const entry = body.player.ownedCards.find((item) => item.cardId === cardId);
      expect(entry?.count).toBe(2);
    }
    const untouchedIds = allClanCardIds.filter((cardId) => !drawnIds.includes(cardId));
    for (const cardId of untouchedIds) {
      const entry = body.player.ownedCards.find((item) => item.cardId === cardId);
      expect(entry?.count).toBe(1);
    }
  });

  test("recovers a prewritten opening history record before advancing player state", async () => {
    const store = new MemoryBoosterOpeningStore();
    const profile = await store.findOrCreateByIdentity(guestIdentity);
    const pendingOpening = prepareStarterBoosterOpening({
      boosterId: "neon-breach",
      player: {
        ownedCards: [],
        openedBoosterIds: [],
        starterFreeBoostersRemaining: 2,
      },
      rng: sequenceRng(Array.from({ length: 16 }, () => 0)),
    });
    store.seedOpening({
      playerId: profile.id,
      boosterId: "neon-breach",
      cardIds: pendingOpening.cardIds,
      openedAt: new Date("2026-05-02T11:59:00.000Z"),
    });

    const response = await openBooster(store, "neon-breach");
    const body = (await response.json()) as OpenBoosterResponse;

    expect(response.status).toBe(200);
    expect(body.opening).toMatchObject({
      id: "opening-1",
      boosterId: "neon-breach",
      cardIds: pendingOpening.cardIds,
      openedAt: "2026-05-02T11:59:00.000Z",
    });
    expect(body.cards.map((card) => card.id)).toEqual(pendingOpening.cardIds);
    expect(body.player.ownedCards.map((entry) => entry.cardId)).toEqual(pendingOpening.cardIds);
    expect(body.player.deckIds).toEqual(pendingOpening.cardIds);
    expect(body.player.openedBoosterIds).toEqual(["neon-breach"]);
    expect(body.player.starterFreeBoostersRemaining).toBe(1);
    expect(store.openings).toHaveLength(1);
  });
});

describe("paid booster opening", () => {
  test("charges 100 crystals, allows reopening the same booster, and only increments inventory", async () => {
    const store = new MemoryBoosterOpeningStore();
    store.seedProfile(guestIdentity, {
      crystals: 250,
      starterFreeBoostersRemaining: 0,
      openedBoosterIds: ["neon-breach"],
      deckIds: ["saved-card"],
    });

    const first = await openPaidBooster(store, "neon-breach");
    const firstBody = (await first.json()) as OpenBoosterResponse;
    const second = await openPaidBooster(store, "neon-breach");
    const secondBody = (await second.json()) as OpenBoosterResponse;
    const firstDrawnIds = firstBody.cards.map((card) => card.id);
    const secondDrawnIds = secondBody.cards.map((card) => card.id);
    const firstRarities = firstBody.cards.map((card) => card.rarity);
    const secondRarities = secondBody.cards.map((card) => card.rarity);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.cards).toHaveLength(5);
    expect(secondBody.cards).toHaveLength(5);
    expect(firstRarities).toContain("Unique");
    expect(secondRarities).toContain("Unique");
    expect(firstRarities).not.toContain("Legend");
    expect(secondRarities).not.toContain("Legend");
    expect(firstBody.opening.source).toBe("paid_crystals");
    expect(secondBody.opening.source).toBe("paid_crystals");
    expect(firstBody.player.crystals).toBe(150);
    expect(secondBody.player.crystals).toBe(50);
    expect(secondBody.player.openedBoosterIds).toEqual(["neon-breach"]);
    expect(secondBody.player.starterFreeBoostersRemaining).toBe(0);
    expect(secondBody.player.deckIds).toEqual(["saved-card"]);
    expect(store.openings).toHaveLength(2);

    for (const cardId of firstDrawnIds) {
      const expectedCount = firstDrawnIds.filter((id) => id === cardId).length + secondDrawnIds.filter((id) => id === cardId).length;
      expect(getOwnedCount(secondBody.player.ownedCards, cardId)).toBe(expectedCount);
    }
  });

  test("rejects paid opening below 100 crystals without writing history", async () => {
    const store = new MemoryBoosterOpeningStore();
    store.seedProfile(guestIdentity, {
      crystals: 99,
      starterFreeBoostersRemaining: 0,
    });

    const response = await openPaidBooster(store, "neon-breach");
    const body = (await response.json()) as { error: string };
    const profile = await store.findOrCreateByIdentity(guestIdentity);

    expect(response.status).toBe(409);
    expect(body.error).toBe("insufficient_crystals");
    expect(profile.crystals).toBe(99);
    expect(profile.ownedCards).toEqual([]);
    expect(store.openings).toHaveLength(0);
  });

  test("opens all available group cards when the paid group pool has one to three cards", async () => {
    const store = new MemoryBoosterOpeningStore();
    const group = store.seedGroup("-100small", ["one", "two", "three"]);
    store.seedProfile(guestIdentity, { crystals: 100, starterFreeBoostersRemaining: 0 });
    const context = signGroupLaunchContext({ chatId: "-100small", now: new Date("2099-05-06T10:00:00.000Z") });

    const response = await openPaidBooster(store, group.boosterId, context);
    const body = (await response.json()) as OpenBoosterResponse;

    expect(response.status).toBe(200);
    expect(body.cards.map((card) => card.id)).toEqual(group.cardIds);
    expect(body.player.crystals).toBe(0);
    expect(body.player.ownedCards.map((entry) => [entry.cardId, entry.count])).toEqual(group.cardIds.map((cardId) => [cardId, 1]));
  });

  test("opens four weighted group cards from a larger paid group pool and increments duplicate ownership", async () => {
    const store = new MemoryBoosterOpeningStore();
    const group = store.seedGroup("-100large", ["low", "medium", "high", "top", "tail"], [1, 2, 3, 4, 5]);
    store.seedProfile(guestIdentity, {
      crystals: 200,
      starterFreeBoostersRemaining: 0,
      ownedCards: [{ cardId: group.cardIds[4], count: 1 }],
    });
    const context = signGroupLaunchContext({ chatId: "-100large", now: new Date("2099-05-06T10:00:00.000Z") });

    const response = await openPaidBooster(store, group.boosterId, context, [0.99, 0.99, 0.99, 0.99]);
    const body = (await response.json()) as OpenBoosterResponse;

    expect(response.status).toBe(200);
    expect(body.cards.map((card) => card.id)).toEqual([group.cardIds[4], group.cardIds[3], group.cardIds[2], group.cardIds[1]]);
    expect(body.cards).toHaveLength(4);
    expect(getOwnedCount(body.player.ownedCards, group.cardIds[4])).toBe(2);
    expect(body.player.crystals).toBe(100);
  });

  test("requires a matching signed group context to open a group booster", async () => {
    const store = new MemoryBoosterOpeningStore();
    const group = store.seedGroup("-100locked", ["locked-a"]);
    store.seedGroup("-100unrelated", ["unrelated-a"]);
    store.seedProfile(guestIdentity, { crystals: 300, starterFreeBoostersRemaining: 0 });
    const unrelatedContext = signGroupLaunchContext({ chatId: "-100unrelated", now: new Date("2099-05-06T10:00:00.000Z") });

    const missing = await openPaidBooster(store, group.boosterId);
    const unrelated = await openPaidBooster(store, group.boosterId, unrelatedContext);

    expect(missing.status).toBe(403);
    expect(((await missing.json()) as { error: string }).error).toBe("group_context_required");
    expect(unrelated.status).toBe(403);
    expect(((await unrelated.json()) as { error: string }).error).toBe("group_context_required");
    expect(store.openings).toHaveLength(0);
  });
});

class MemoryBoosterOpeningStore implements BoosterOpeningStore {
  private readonly profiles: StoredPlayerProfile[] = [];
  private readonly groups = new Map<string, GroupIntegrationRecord>();
  private readonly groupCards = new Map<string, GroupCardIntegrationRecord>();
  readonly openings: StoredBoosterOpeningRecord[] = [];
  private nextProfileId = 1;
  private nextOpeningId = 1;
  failNextHistoryInsert = false;

  async findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile> {
    const existing = this.profiles.find((profile) => isSamePlayerIdentity(profile.identity, identity));
    if (existing) return existing;

    const profile = createNewStoredPlayerProfile(`player-${this.nextProfileId}`, identity);
    this.nextProfileId += 1;
    this.profiles.push(profile);
    return profile;
  }

  async saveStarterBoosterOpening(input: {
    identity: PlayerIdentity;
    playerId: string;
    boosterId: string;
    cardIds: string[];
    openedAt: Date;
  }) {
    const profileIndex = this.profiles.findIndex((profile) => isSamePlayerIdentity(profile.identity, input.identity));
    const profile = this.profiles[profileIndex];
    let opening = this.openings.find((item) => item.playerId === input.playerId && item.boosterId === input.boosterId && item.source === "starter_free");
    let createdOpening = false;

    if (!profile) {
      throw new BoosterOpeningError("starter_booster_unavailable", "Starter booster opening could not be saved for the current player state.", 409);
    }

    if (!opening) {
      if (this.failNextHistoryInsert) {
        this.failNextHistoryInsert = false;
        throw new Error("Simulated boosterOpening insert failure.");
      }

      opening = {
        id: `opening-${this.nextOpeningId}`,
        playerId: input.playerId,
        boosterId: input.boosterId,
        source: "starter_free",
        cardIds: input.cardIds,
        openedAt: input.openedAt,
      };
      this.nextOpeningId += 1;
      this.openings.push(opening);
      createdOpening = true;
    }

    if (hasAppliedOpening(profile, input.boosterId, opening.cardIds)) {
      return {
        player: profile,
        opening,
      };
    }

    if (profile.starterFreeBoostersRemaining <= 0 || profile.openedBoosterIds.includes(input.boosterId)) {
      if (createdOpening) {
        this.removeOpening(opening.id);
      }
      throw new BoosterOpeningError("starter_booster_unavailable", "Starter booster opening could not be saved for the current player state.", 409);
    }

    const nextOwnedCards = opening.cardIds.reduce((acc, cardId) => addToInventory(acc, cardId, 1), profile.ownedCards);
    const updatedProfile: StoredPlayerProfile = {
      ...profile,
      ownedCards: nextOwnedCards,
      deckIds: unique([...profile.deckIds, ...opening.cardIds]),
      starterFreeBoostersRemaining: profile.starterFreeBoostersRemaining - 1,
      openedBoosterIds: [...profile.openedBoosterIds, input.boosterId],
    };

    this.profiles[profileIndex] = updatedProfile;

    return {
      player: updatedProfile,
      opening,
    };
  }

  async savePaidBoosterOpening(input: {
    identity: PlayerIdentity;
    playerId: string;
    boosterId: string;
    cardIds: string[];
    openedAt: Date;
    crystalCost: number;
  }) {
    const profileIndex = this.profiles.findIndex((profile) => isSamePlayerIdentity(profile.identity, input.identity));
    const profile = this.profiles[profileIndex];

    if (!profile || profile.crystals < input.crystalCost) {
      throw new BoosterOpeningError("insufficient_crystals", "Not enough crystals to open this booster.", 409);
    }

    if (this.failNextHistoryInsert) {
      this.failNextHistoryInsert = false;
      throw new Error("Simulated boosterOpening insert failure.");
    }

    const opening: StoredBoosterOpeningRecord = {
      id: `opening-${this.nextOpeningId}`,
      playerId: input.playerId,
      boosterId: input.boosterId,
      source: "paid_crystals",
      cardIds: input.cardIds,
      openedAt: input.openedAt,
    };
    this.nextOpeningId += 1;
    this.openings.push(opening);

    const updatedProfile: StoredPlayerProfile = {
      ...profile,
      ownedCards: opening.cardIds.reduce((acc, cardId) => addToInventory(acc, cardId, 1), profile.ownedCards),
      crystals: profile.crystals - input.crystalCost,
    };

    this.profiles[profileIndex] = updatedProfile;

    return {
      player: updatedProfile,
      opening,
    };
  }

  seedProfile(identity: PlayerIdentity, profile: Partial<StoredPlayerProfile>) {
    const stored = {
      ...createNewStoredPlayerProfile(`player-${this.nextProfileId}`, identity),
      ...profile,
      identity,
    };
    this.nextProfileId += 1;
    this.profiles.push(stored);
    return stored;
  }

  seedOpening(input: { playerId: string; boosterId: string; cardIds: string[]; openedAt: Date }) {
    const opening: StoredBoosterOpeningRecord = {
      id: `opening-${this.nextOpeningId}`,
      playerId: input.playerId,
      boosterId: input.boosterId,
      source: "starter_free",
      cardIds: input.cardIds,
      openedAt: input.openedAt,
    };
    this.nextOpeningId += 1;
    this.openings.push(opening);
    return opening;
  }

  seedGroup(chatId: string, idempotencyKeys: string[], dropWeights: number[] = []) {
    const group: GroupIntegrationRecord = {
      chatId,
      clan: `Clan ${chatId}`,
      boosterId: groupBoosterId(chatId),
      displayName: `Clan ${chatId}`,
      glyphUrl: `/nexus-assets/integrations/${encodeURIComponent(chatId)}/glyph.png`,
      bonus: {
        id: "test-bonus",
        name: "Test Bonus",
        description: "Test bonus.",
        effects: [{ key: "add-power", amount: 1 }],
      },
      cardIds: idempotencyKeys.map((key) => groupCardId(chatId, key)),
      createdAt: new Date("2099-05-06T10:00:00.000Z"),
      updatedAt: new Date("2099-05-06T10:00:00.000Z"),
    };
    this.groups.set(chatId, group);
    const cardInputs = idempotencyKeys.map((key, index) => ({
      chatId,
      creatorTelegramId: `creator-${index}`,
      idempotencyKey: key,
      name: `Group Card ${key}`,
      power: 10 + index,
      damage: 3 + index,
      ability: {
        id: "group-ability",
        name: "Group Ability",
        description: "Group ability.",
        effects: [{ key: "add-attack", amount: 1 }],
      },
      imageUrl: `https://assets.test/${key}.png`,
      artUrl: `/nexus-assets/integrations/${encodeURIComponent(chatId)}/${key}.webp`,
      dropWeight: dropWeights[index] ?? 1,
    }));
    for (const input of cardInputs) {
      this.groupCards.set(groupCardId(chatId, input.idempotencyKey), {
        id: groupCardId(chatId, input.idempotencyKey),
        chatId,
        creatorTelegramId: input.creatorTelegramId,
        idempotencyKey: input.idempotencyKey,
        dropWeight: input.dropWeight,
        createdAt: new Date("2099-05-06T10:00:00.000Z"),
      });
    }
    hydrateGroupRuntime([group], cardInputs);
    return group;
  }

  async findIntegrationGroupByChatId(chatId: string) {
    return this.groups.get(chatId);
  }

  async findIntegrationGroupCardsByChatId(chatId: string) {
    return [...this.groupCards.values()].filter((card) => card.chatId === chatId);
  }

  private removeOpening(openingId: string) {
    const openingIndex = this.openings.findIndex((opening) => opening.id === openingId);
    if (openingIndex >= 0) {
      this.openings.splice(openingIndex, 1);
    }
  }
}

function openBooster(store: BoosterOpeningStore, boosterId: string) {
  return handleStarterBoosterOpenPost(
    postRequest("http://localhost/api/player/open-booster", {
      identity: guestIdentity,
      boosterId,
    }),
    store,
    {
      rng: sequenceRng(Array.from({ length: 16 }, () => 0)),
      now: () => new Date("2026-05-02T12:00:00.000Z"),
    },
  );
}

function openPaidBooster(store: BoosterOpeningStore, boosterId: string, groupContext?: string, rngValues = Array.from({ length: 16 }, () => 0)) {
  return handleBoosterOpenPost(
    postRequest("http://localhost/api/player/open-booster", {
      identity: guestIdentity,
      boosterId,
      source: "paid_crystals",
      ...(groupContext ? { groupContext } : {}),
    }),
    store,
    {
      rng: sequenceRng(rngValues),
      now: () => new Date("2026-05-02T12:00:00.000Z"),
    },
  );
}

function postCatalog(store: BoosterOpeningStore, identity: PlayerIdentity, groupContext?: string) {
  return handleBoosterCatalogPost(
    postRequest("http://localhost/api/boosters", {
      identity,
      ...(groupContext ? { groupContext } : {}),
    }),
    store,
  );
}

function postRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(isRequestBodyWithIdentity(body) ? { Cookie: createPlayerSessionCookie(body.identity) } : {}),
    },
    body: JSON.stringify(body),
  });
}

function isRequestBodyWithIdentity(body: unknown): body is { identity: PlayerIdentity } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const identity = (body as { identity?: unknown }).identity;
  if (typeof identity !== "object" || identity === null || Array.isArray(identity)) return false;
  const mode = (identity as { mode?: unknown }).mode;
  if (mode === "telegram") return typeof (identity as { telegramId?: unknown }).telegramId === "string";
  if (mode === "guest") return typeof (identity as { guestId?: unknown }).guestId === "string";
  return false;
}

function sequenceRng(values: number[]): RandomSource {
  let index = 0;
  return () => values[index++] ?? 0;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function hasAppliedOpening(profile: StoredPlayerProfile, boosterId: string, cardIds: string[]) {
  const deckIds = new Set(profile.deckIds);
  return profile.openedBoosterIds.includes(boosterId) && cardIds.every((cardId) => getOwnedCount(profile.ownedCards, cardId) >= 1 && deckIds.has(cardId));
}

async function withSuppressedConsoleError<T>(callback: () => Promise<T>) {
  const originalConsoleError = console.error;
  console.error = () => undefined;

  try {
    return await callback();
  } finally {
    console.error = originalConsoleError;
  }
}

type OpenBoosterResponse = {
  booster: {
    id: string;
    name: string;
    clans: string[];
  };
  cards: (Card & { rarity: Rarity })[];
  opening: BoosterOpeningRecord;
  player: PlayerProfile;
};
