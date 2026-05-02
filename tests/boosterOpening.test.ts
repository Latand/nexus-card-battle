import { describe, expect, test } from "bun:test";
import { cards } from "../src/features/battle/model/cards";
import type { Card, Rarity } from "../src/features/battle/model/types";
import { handleBoosterCatalogGet, handleBoosterCatalogPost, handleStarterBoosterOpenPost } from "../src/features/boosters/api";
import { getBoosterById } from "../src/features/boosters/catalog";
import { BoosterOpeningError, chooseStarterWeightedRarity, prepareStarterBoosterOpening, type RandomSource } from "../src/features/boosters/opening";
import type { BoosterCatalogItem, BoosterOpeningRecord, BoosterOpeningStore, StoredBoosterOpeningRecord } from "../src/features/boosters/types";
import { createNewStoredPlayerProfile, isSamePlayerIdentity, type PlayerIdentity, type PlayerProfile, type StoredPlayerProfile } from "../src/features/player/profile/types";

const guestIdentity: PlayerIdentity = {
  mode: "guest",
  guestId: "booster-guest",
};

describe("booster catalog", () => {
  test("returns twelve curated two-clan boosters without C.O.R.R.", async () => {
    const response = await handleBoosterCatalogGet();
    const body = (await response.json()) as { boosters: { id: string; name: string; clans: string[] }[] };

    expect(response.status).toBe(200);
    expect(body.boosters).toHaveLength(12);
    expect(body.boosters.map((booster) => booster.name)).toEqual([
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

    for (const booster of body.boosters) {
      expect(booster.clans).toHaveLength(2);
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
    expect(next?.starter).toEqual({
      opened: false,
      canOpen: true,
    });
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
    expect(body.player.ownedCardIds).toEqual(cardIds);
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

  test("falls back when a weighted rarity bucket is unavailable without duplicating cards or owned cards", () => {
    const booster = getBoosterById("neon-breach");
    if (!booster) throw new Error("Expected neon-breach booster.");

    const boosterClans: readonly string[] = booster.clans;
    const ownedRareIds = cards.filter((card) => boosterClans.includes(card.clan) && card.rarity === "Rare").map((card) => card.id);
    const opening = prepareStarterBoosterOpening({
      boosterId: booster.id,
      player: {
        ownedCardIds: ownedRareIds,
        openedBoosterIds: [],
        starterFreeBoostersRemaining: 2,
      },
      rng: sequenceRng([0, 0, 0.8, 0, 0.8, 0, 0.8, 0]),
    });
    const cardIds = opening.cardIds;

    expect(opening.cards).toHaveLength(5);
    expect(opening.cards.map((card) => card.rarity)).toContain("Legend");
    expect(opening.cards.map((card) => card.rarity)).toContain("Unique");
    expect(opening.cards.some((card) => card.rarity === "Rare")).toBe(false);
    expect(cardIds.some((cardId) => ownedRareIds.includes(cardId))).toBe(false);
    expect(new Set(cardIds).size).toBe(5);
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
    expect(secondBody.player.ownedCardIds).toEqual([...firstCardIds, ...secondCardIds]);
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
    expect(profile.ownedCardIds).toEqual([]);
    expect(profile.deckIds).toEqual([]);
    expect(profile.openedBoosterIds).toEqual([]);
    expect(profile.starterFreeBoostersRemaining).toBe(2);
    expect(store.openings).toHaveLength(0);
  });

  test("recovers a prewritten opening history record before advancing player state", async () => {
    const store = new MemoryBoosterOpeningStore();
    const profile = await store.findOrCreateByIdentity(guestIdentity);
    const pendingOpening = prepareStarterBoosterOpening({
      boosterId: "neon-breach",
      player: {
        ownedCardIds: [],
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
    expect(body.player.ownedCardIds).toEqual(pendingOpening.cardIds);
    expect(body.player.deckIds).toEqual(pendingOpening.cardIds);
    expect(body.player.openedBoosterIds).toEqual(["neon-breach"]);
    expect(body.player.starterFreeBoostersRemaining).toBe(1);
    expect(store.openings).toHaveLength(1);
  });
});

class MemoryBoosterOpeningStore implements BoosterOpeningStore {
  private readonly profiles: StoredPlayerProfile[] = [];
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

    if (profile.starterFreeBoostersRemaining <= 0 || profile.openedBoosterIds.includes(input.boosterId) || opening.cardIds.some((cardId) => profile.ownedCardIds.includes(cardId))) {
      if (createdOpening) {
        this.removeOpening(opening.id);
      }
      throw new BoosterOpeningError("starter_booster_unavailable", "Starter booster opening could not be saved for the current player state.", 409);
    }

    const updatedProfile: StoredPlayerProfile = {
      ...profile,
      ownedCardIds: unique([...profile.ownedCardIds, ...opening.cardIds]),
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

function postCatalog(store: BoosterOpeningStore, identity: PlayerIdentity) {
  return handleBoosterCatalogPost(
    postRequest("http://localhost/api/boosters", {
      identity,
    }),
    store,
  );
}

function postRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function sequenceRng(values: number[]): RandomSource {
  let index = 0;
  return () => values[index++] ?? 0;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function hasAppliedOpening(profile: StoredPlayerProfile, boosterId: string, cardIds: string[]) {
  const ownedCardIds = new Set(profile.ownedCardIds);
  const deckIds = new Set(profile.deckIds);
  return profile.openedBoosterIds.includes(boosterId) && cardIds.every((cardId) => ownedCardIds.has(cardId) && deckIds.has(cardId));
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
    clans: [string, string];
  };
  cards: (Card & { rarity: Rarity })[];
  opening: BoosterOpeningRecord;
  player: PlayerProfile;
};
