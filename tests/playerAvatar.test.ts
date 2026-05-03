import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PLAYER_AVATAR_URL,
  resolveAvatarUrl,
} from "../src/features/player/profile/avatar";
import {
  handlePlayerAvatarPost,
  type PlayerAvatarStore,
} from "../src/features/player/profile/api";
import {
  createNewStoredPlayerProfile,
  isSamePlayerIdentity,
  normalizeAvatarUrl,
  toPlayerProfile,
  type PlayerIdentity,
  type PlayerProfile,
  type StoredPlayerProfile,
} from "../src/features/player/profile/types";

describe("resolveAvatarUrl priority", () => {
  test("prefers the persisted profile avatarUrl over the live Telegram photo", () => {
    expect(
      resolveAvatarUrl({
        storedAvatarUrl: "https://t.me/i/userpic/stored.jpg",
        liveAvatarUrl: "https://t.me/i/userpic/live.jpg",
      }),
    ).toBe("https://t.me/i/userpic/stored.jpg");
  });

  test("falls back to the live Telegram photo when no value is persisted", () => {
    expect(
      resolveAvatarUrl({
        storedAvatarUrl: undefined,
        liveAvatarUrl: "https://t.me/i/userpic/live.jpg",
      }),
    ).toBe("https://t.me/i/userpic/live.jpg");
  });

  test("falls back to the default character art when neither is available", () => {
    expect(resolveAvatarUrl({ storedAvatarUrl: null, liveAvatarUrl: null })).toBe(
      DEFAULT_PLAYER_AVATAR_URL,
    );
  });

  test("treats empty / whitespace-only values as missing", () => {
    expect(resolveAvatarUrl({ storedAvatarUrl: "   ", liveAvatarUrl: "   " })).toBe(
      DEFAULT_PLAYER_AVATAR_URL,
    );
    expect(
      resolveAvatarUrl({ storedAvatarUrl: "  ", liveAvatarUrl: "https://t.me/i/userpic/live.jpg" }),
    ).toBe("https://t.me/i/userpic/live.jpg");
  });
});

describe("normalizeAvatarUrl", () => {
  test("accepts trimmed https URLs and rejects http or non-string values", () => {
    expect(normalizeAvatarUrl("  https://t.me/i/userpic/abc.jpg  ")).toBe(
      "https://t.me/i/userpic/abc.jpg",
    );
    expect(normalizeAvatarUrl("http://insecure.example/photo.jpg")).toBeUndefined();
    expect(normalizeAvatarUrl("")).toBeUndefined();
    expect(normalizeAvatarUrl(undefined)).toBeUndefined();
    expect(normalizeAvatarUrl(42)).toBeUndefined();
    expect(normalizeAvatarUrl({ url: "https://t.me/photo.jpg" })).toBeUndefined();
  });

  test("rejects suspiciously long URLs to keep the persisted field bounded", () => {
    const longUrl = `https://t.me/${"x".repeat(2100)}`;
    expect(normalizeAvatarUrl(longUrl)).toBeUndefined();
  });
});

describe("toPlayerProfile avatar default", () => {
  test("defaults avatarUrl to undefined when the stored profile lacks the field", () => {
    const profile = toPlayerProfile({
      id: "player-1",
      identity: { mode: "guest", guestId: "guest-1" },
      ownedCards: [],
      deckIds: [],
      starterFreeBoostersRemaining: 0,
      openedBoosterIds: [],
      crystals: 0,
      totalXp: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      eloRating: 1000,
    });

    expect(profile.avatarUrl).toBeUndefined();
  });

  test("preserves a normalized avatarUrl through toPlayerProfile", () => {
    const profile = toPlayerProfile({
      id: "player-2",
      identity: { mode: "telegram", telegramId: "9000" },
      ownedCards: [],
      deckIds: [],
      starterFreeBoostersRemaining: 0,
      openedBoosterIds: [],
      crystals: 0,
      totalXp: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      eloRating: 1000,
      avatarUrl: "https://t.me/i/userpic/abc.jpg",
    });

    expect(profile.avatarUrl).toBe("https://t.me/i/userpic/abc.jpg");
  });

  test("drops an invalid stored avatarUrl rather than surfacing it to the client", () => {
    const profile = toPlayerProfile({
      id: "player-3",
      identity: { mode: "telegram", telegramId: "9001" },
      ownedCards: [],
      deckIds: [],
      starterFreeBoostersRemaining: 0,
      openedBoosterIds: [],
      crystals: 0,
      totalXp: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      eloRating: 1000,
      avatarUrl: "javascript:alert(1)",
    });

    expect(profile.avatarUrl).toBeUndefined();
  });
});

describe("handlePlayerAvatarPost", () => {
  test("persists a valid https avatar URL and returns the normalized profile", async () => {
    const identity: PlayerIdentity = { mode: "telegram", telegramId: "55501" };
    const store = new MemoryAvatarStore([
      { ...createNewStoredPlayerProfile("player-avatar-1", identity) },
    ]);

    const response = await postAvatar(store, {
      identity,
      avatarUrl: "  https://t.me/i/userpic/abc.jpg  ",
    });
    const body = (await response.json()) as { player: PlayerProfile };

    expect(response.status).toBe(200);
    expect(body.player.avatarUrl).toBe("https://t.me/i/userpic/abc.jpg");
    expect(store.snapshot(identity)?.avatarUrl).toBe("https://t.me/i/userpic/abc.jpg");
  });

  test("rejects an http URL with a 400 invalid_avatar", async () => {
    const identity: PlayerIdentity = { mode: "telegram", telegramId: "55502" };
    const store = new MemoryAvatarStore([
      { ...createNewStoredPlayerProfile("player-avatar-2", identity) },
    ]);

    const response = await postAvatar(store, {
      identity,
      avatarUrl: "http://insecure.example/photo.jpg",
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_avatar");
    expect(store.snapshot(identity)?.avatarUrl).toBeUndefined();
  });

  test("rejects a missing identity with a 400 invalid_identity", async () => {
    const store = new MemoryAvatarStore();
    const response = await postAvatar(store, { avatarUrl: "https://t.me/i/userpic/abc.jpg" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_identity");
  });
});

class MemoryAvatarStore implements PlayerAvatarStore {
  private readonly profiles: StoredPlayerProfile[];
  private nextId: number;

  constructor(profiles: StoredPlayerProfile[] = []) {
    this.profiles = profiles;
    this.nextId = profiles.length + 1;
  }

  async findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile> {
    const existing = this.profiles.find((profile) => isSamePlayerIdentity(profile.identity, identity));
    if (existing) return existing;

    const profile = createNewStoredPlayerProfile(`player-${this.nextId}`, identity);
    this.nextId += 1;
    this.profiles.push(profile);
    return profile;
  }

  async setAvatarUrl(identity: PlayerIdentity, avatarUrl: string): Promise<StoredPlayerProfile> {
    const index = this.profiles.findIndex((profile) => isSamePlayerIdentity(profile.identity, identity));
    if (index < 0) throw new Error("Profile does not exist.");
    this.profiles[index] = { ...this.profiles[index], avatarUrl };
    return this.profiles[index];
  }

  snapshot(identity: PlayerIdentity): StoredPlayerProfile | undefined {
    return this.profiles.find((profile) => isSamePlayerIdentity(profile.identity, identity));
  }
}

function postAvatar(store: PlayerAvatarStore, body: unknown) {
  return handlePlayerAvatarPost(
    new Request("http://localhost/api/player/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    store,
  );
}
