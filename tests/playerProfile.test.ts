import { describe, expect, test } from "bun:test";
import { cards } from "../src/features/battle/model/cards";
import {
  handlePlayerDeckSavePost,
  handlePlayerMatchFinishedPost,
  handlePlayerProfileGet,
  handlePlayerProfilePost,
  type ApplyMatchRewardsInput,
  type PlayerDeckStore,
  type PlayerMatchRewardsStore,
  type PlayerProfileStore,
} from "../src/features/player/profile/api";
import { createNewStoredPlayerProfile, isSamePlayerIdentity, type PlayerIdentity, type PlayerProfile, type StoredPlayerProfile } from "../src/features/player/profile/types";
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
      ownedCardIds: [],
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
    expect(body.player.ownedCardIds).toEqual([]);
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
    expect(body.player.ownedCardIds).toEqual(ownedDeckCardIds);
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

  test("rejects a PvP request in slice 1 with a 400 invalid_match", async () => {
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
});

class MemoryPlayerProfileStore implements PlayerDeckStore, PlayerMatchRewardsStore {
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
    const updated: StoredPlayerProfile = {
      ...current,
      crystals: rewards.newTotals.crystals,
      totalXp: rewards.newTotals.totalXp,
      level: rewards.newTotals.level,
      [counterField]: (current[counterField] ?? 0) + 1,
    };
    this.profiles[index] = updated;
    return updated;
  }

  snapshot(identity: PlayerIdentity): StoredPlayerProfile | undefined {
    return this.profiles.find((profile) => isSamePlayerIdentity(profile.identity, identity));
  }
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

function createOwnedDeckProfile() {
  return {
    ...createNewStoredPlayerProfile("player-owned-deck", ownedDeckIdentity),
    ownedCardIds: [...ownedDeckCardIds],
    deckIds: [...savedDeckCardIds],
    starterFreeBoostersRemaining: 0,
    openedBoosterIds: ["neon-breach", "factory-shift"],
  };
}

async function readPlayerResponse(response: Response) {
  return (await response.json()) as { player: PlayerProfile };
}
