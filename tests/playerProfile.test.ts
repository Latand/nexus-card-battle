import { describe, expect, test } from "bun:test";
import { cards } from "../src/features/battle/model/cards";
import { handlePlayerDeckSavePost, handlePlayerProfileGet, handlePlayerProfilePost, type PlayerDeckStore, type PlayerProfileStore } from "../src/features/player/profile/api";
import { createNewStoredPlayerProfile, isSamePlayerIdentity, type PlayerIdentity, type PlayerProfile, type StoredPlayerProfile } from "../src/features/player/profile/types";

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

class MemoryPlayerProfileStore implements PlayerDeckStore {
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
