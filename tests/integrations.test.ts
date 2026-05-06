import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import sharp from "sharp";
import { cards } from "../src/features/battle/model/cards";
import { createBattleHand, createCardCollection, createDeck, findCard } from "../src/features/battle/model/domain/decks";
import type { Bonus } from "../src/features/battle/model/types";
import { handleGroupCardPost, handleGroupUpsertPut, createGroupCardRecord, createNewGroup, validateGroupBonusChange, type CreateGroupCardInput, type CreateGroupCardResult, type IntegrationStore, type UpsertGroupInput } from "../src/features/integrations/api";
import { groupCardId, hydrateGroupRuntime, resetDynamicIntegrationRuntimeForTests } from "../src/features/integrations/runtime";
import { addToInventory, getOwnedCount } from "../src/features/inventory/inventoryOps";
import { handlePlayerDeckSavePost } from "../src/features/player/profile/api";
import { createPlayerSessionCookie } from "../src/features/player/profile/auth";
import { createNewStoredPlayerProfile, type PlayerIdentity, type StoredPlayerProfile } from "../src/features/player/profile/types";

const TOKEN = "integration-test-token";
const bonus: Bonus = {
  id: "plus2-power",
  name: "+2 power",
  description: "Power increases by 2.",
  effects: [{ key: "add-power", amount: 2 }],
};

const ability = {
  id: "plus1-attack",
  name: "+1 attack",
  description: "Attack increases by 1.",
  effects: [{ key: "add-attack", amount: 1 }],
};

describe("integration API", () => {
  let previousToken: string | undefined;

  beforeEach(() => {
    previousToken = process.env.INTEGRATION_API_TOKEN;
    process.env.INTEGRATION_API_TOKEN = TOKEN;
    resetDynamicIntegrationRuntimeForTests();
  });

  afterEach(() => {
    resetDynamicIntegrationRuntimeForTests();
    if (previousToken === undefined) {
      delete process.env.INTEGRATION_API_TOKEN;
    } else {
      process.env.INTEGRATION_API_TOKEN = previousToken;
    }
  });

  test("requires bearer auth for every integration endpoint", async () => {
    const store = new MemoryIntegrationStore();
    const groupResponse = await handleGroupUpsertPut(
      jsonRequest("http://localhost/api/integrations/groups/-100", { displayName: "Group", glyphUrl: "https://assets.test/glyph.png", bonus }),
      { params: { chatId: "-100" } },
      store,
      { fetcher: imageFetcher() },
    );
    const cardResponse = await handleGroupCardPost(
      jsonRequest("http://localhost/api/integrations/group-cards", cardBody({ chatId: "-100" })),
      store,
      { fetcher: imageFetcher() },
    );

    expect(groupResponse.status).toBe(401);
    expect(cardResponse.status).toBe(401);
  });

  test("upserts a group clan and booster with Nexus-owned glyph URL", async () => {
    const store = new MemoryIntegrationStore();
    const response = await putGroup(store, "-100777", { displayName: "The Chat" });
    const body = (await response.json()) as { group: { chatId: string; clan: string; boosterId: string; booster: { opening: { available: boolean; reason: string } }; displayName: string; glyphUrl: string; bonus: Bonus } };

    expect(response.status).toBe(200);
    expect(body.group).toMatchObject({
      chatId: "-100777",
      clan: "The Chat",
      boosterId: "group--100777",
      displayName: "The Chat",
      bonus,
    });
    expect(body.group.booster).toMatchObject({
      id: "group--100777",
      name: "The Chat",
      clans: ["The Chat"],
      opening: {
        available: false,
        reason: "group_booster_opening_out_of_scope",
      },
    });
    expect(body.group.glyphUrl).toMatch(/^\/nexus-assets\/integrations\/100777\/glyph\.png$/);
    expect(store.groups.get("-100777")?.displayName).toBe("The Chat");
  });

  test("rejects bonus changes after group pool has cards but still accepts metadata updates with same bonus", async () => {
    const store = new MemoryIntegrationStore();
    await putGroup(store, "-100locked", { displayName: "Locked" });
    await postCard(store, { chatId: "-100locked", idempotencyKey: "first" });

    const changed = await putGroup(store, "-100locked", {
      displayName: "Locked New",
      bonus: { ...bonus, effects: [{ key: "add-power", amount: 3 }] },
    });
    const unchanged = await putGroup(store, "-100locked", { displayName: "Locked New", bonus });

    expect(changed.status).toBe(409);
    expect(((await changed.json()) as { error: string }).error).toBe("group_bonus_locked");
    expect(unchanged.status).toBe(200);
    expect(store.groups.get("-100locked")?.displayName).toBe("Locked New");
  });

  test("creates a Legend group card, adds it to the pool, grants one creator copy, and registers domain lookup", async () => {
    const store = new MemoryIntegrationStore();
    await putGroup(store, "-100cards", { displayName: "Card Chat" });

    const response = await postCard(store, { chatId: "-100cards", creatorTelegramId: "4242", idempotencyKey: "unique-card" });
    const body = (await response.json()) as { card: { id: string; rarity: string; clan: string; bonus: Bonus; artUrl: string }; player: { ownedCards: { cardId: string; count: number }[] }; group: { cardIds: string[] } };
    const cardId = groupCardId("-100cards", "unique-card");

    expect(response.status).toBe(200);
    expect(body.card).toMatchObject({
      id: cardId,
      rarity: "Legend",
      clan: "Card Chat",
      bonus,
    });
    expect(body.card.artUrl).toMatch(/^\/nexus-assets\/integrations\/100cards\/unique-card\.png$/);
    expect(body.group.cardIds).toEqual([cardId]);
    expect(getOwnedCount(body.player.ownedCards, cardId)).toBe(1);
    expect(findCard(cardId).id).toBe(cardId);
  });

  test("is idempotent by idempotencyKey and does not double grant", async () => {
    const store = new MemoryIntegrationStore();
    await putGroup(store, "-100idem", { displayName: "Idem Chat" });

    const first = await postCard(store, { chatId: "-100idem", creatorTelegramId: "4242", idempotencyKey: "same" });
    let retryFetched = false;
    const second = await handleGroupCardPost(
      jsonRequest("http://localhost/api/integrations/group-cards", cardBody({ chatId: "-100idem", creatorTelegramId: "4242", idempotencyKey: "same", imageUrl: "https://assets.test/missing.png" }), authHeaders()),
      store,
      {
        fetcher: async () => {
          retryFetched = true;
          return new Response("missing", { status: 404 });
        },
      },
    );
    const firstBody = (await first.json()) as { card: { id: string }; idempotent: boolean };
    const secondBody = (await second.json()) as { card: { id: string }; player: { ownedCards: { cardId: string; count: number }[] }; idempotent: boolean };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.idempotent).toBe(false);
    expect(secondBody.idempotent).toBe(true);
    expect(retryFetched).toBe(false);
    expect(secondBody.card.id).toBe(firstBody.card.id);
    expect(getOwnedCount(secondBody.player.ownedCards, firstBody.card.id)).toBe(1);
  });

  test("scopes card idempotency by group so different chats can reuse a key", async () => {
    const store = new MemoryIntegrationStore();
    await putGroup(store, "-100a", { displayName: "Group A" });
    await putGroup(store, "-100b", { displayName: "Group B" });

    const first = await postCard(store, { chatId: "-100a", creatorTelegramId: "101", idempotencyKey: "shared-key", name: "A Card" });
    const second = await postCard(store, { chatId: "-100b", creatorTelegramId: "202", idempotencyKey: "shared-key", name: "B Card" });
    const firstBody = (await first.json()) as { card: { id: string; clan: string }; player: { ownedCards: { cardId: string; count: number }[] }; idempotent: boolean };
    const secondBody = (await second.json()) as { card: { id: string; clan: string }; player: { ownedCards: { cardId: string; count: number }[] }; idempotent: boolean };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.idempotent).toBe(false);
    expect(secondBody.idempotent).toBe(false);
    expect(firstBody.card.id).toBe(groupCardId("-100a", "shared-key"));
    expect(secondBody.card.id).toBe(groupCardId("-100b", "shared-key"));
    expect(firstBody.card.id).not.toBe(secondBody.card.id);
    expect(firstBody.card.clan).toBe("Group A");
    expect(secondBody.card.clan).toBe("Group B");
    expect(getOwnedCount(firstBody.player.ownedCards, firstBody.card.id)).toBe(1);
    expect(getOwnedCount(secondBody.player.ownedCards, secondBody.card.id)).toBe(1);
  });

  test("hydrates persisted dynamic cards before profile, deck, and battle lookups", async () => {
    const store = new MemoryIntegrationStore();
    const group = createNewGroup({
      chatId: "-100persist",
      displayName: "Persisted Chat",
      glyphUrl: "/nexus-assets/integrations/100persist/glyph.png",
      bonus,
    });
    const cardInput = {
      ...cardBody({
        chatId: "-100persist",
        creatorTelegramId: "303",
        idempotencyKey: "persist-card",
        imageUrl: "https://assets.test/persist.png",
      }),
      artUrl: "/nexus-assets/integrations/100persist/persist-card.png",
      dropWeight: 1,
    } as CreateGroupCardInput;
    const groupCard = createGroupCardRecord(cardInput);
    group.cardIds.push(groupCard.id);
    const identity: PlayerIdentity = { mode: "telegram", telegramId: "303" };
    const staticDeckIds = cards.filter((card) => !card.id.startsWith("group-")).slice(0, 8).map((card) => card.id);
    const deckIds = [...staticDeckIds, groupCard.id];
    store.groups.set(group.chatId, group);
    store.groupCards.set(store.groupCardKey(group.chatId, groupCard.idempotencyKey), groupCard);
    store.groupCardInputs.set(store.groupCardKey(group.chatId, groupCard.idempotencyKey), cardInput);
    store.players.set(store.playerKey(identity), {
      ...createNewStoredPlayerProfile("player-persisted", identity),
      ownedCards: deckIds.map((cardId) => ({ cardId, count: 1 })),
      deckIds,
    });

    resetDynamicIntegrationRuntimeForTests();
    expect(() => findCard(groupCard.id)).toThrow("Unknown card id");

    await store.findOrCreateByIdentity(identity);
    expect(findCard(groupCard.id)).toMatchObject({
      id: groupCard.id,
      clan: "Persisted Chat",
      rarity: "Legend",
    });

    const collection = createCardCollection("player-persisted", deckIds);
    const deck = createDeck("player-persisted", collection, deckIds);
    expect(deck.cardIds).toContain(groupCard.id);
    expect(createBattleHand({ ownerId: "player-persisted", cardIds: [groupCard.id] }).map((card) => card.id)).toEqual([groupCard.id]);

    const deckSave = await handlePlayerDeckSavePost(
      jsonRequest("http://localhost/api/player/deck", { identity, deckIds }, {
        "Content-Type": "application/json",
        Cookie: createPlayerSessionCookie(identity),
      }),
      store,
    );
    expect(deckSave.status).toBe(200);
  });

  test("rejects invalid assets and invalid dropWeight atomically", async () => {
    const store = new MemoryIntegrationStore();
    await putGroup(store, "-100atomic", { displayName: "Atomic" });

    const badImage = await handleGroupCardPost(
      jsonRequest("http://localhost/api/integrations/group-cards", cardBody({ chatId: "-100atomic", idempotencyKey: "bad-image" }), authHeaders()),
      store,
      { fetcher: async () => new Response("not image") },
    );
    const badWeight = await postCard(store, { chatId: "-100atomic", idempotencyKey: "bad-weight", dropWeight: 0 });

    expect(badImage.status).toBe(400);
    expect(badWeight.status).toBe(400);
    expect(store.groupCards.size).toBe(0);
    expect(store.groups.get("-100atomic")?.cardIds).toEqual([]);
    expect(store.players.size).toBe(0);
  });
});

class MemoryIntegrationStore implements IntegrationStore {
  groups = new Map<string, ReturnType<typeof createNewGroup>>();
  groupCards = new Map<string, ReturnType<typeof createGroupCardRecord>>();
  players = new Map<string, StoredPlayerProfile>();

  groupCardKey(chatId: string, idempotencyKey: string) {
    return `${chatId}\u0000${idempotencyKey}`;
  }

  playerKey(identity: PlayerIdentity) {
    return `${identity.mode}:${identity.mode === "telegram" ? identity.telegramId : identity.guestId}`;
  }

  async upsertGroup(input: UpsertGroupInput) {
    const current = this.groups.get(input.chatId);
    validateGroupBonusChange(current, input.bonus);
    const next = {
      ...(current ?? createNewGroup(input)),
      displayName: input.displayName,
      glyphUrl: input.glyphUrl,
      bonus: input.bonus,
      updatedAt: new Date(),
    };
    this.groups.set(input.chatId, next);
    return next;
  }

  async createGroupCard(input: CreateGroupCardInput): Promise<CreateGroupCardResult> {
    const existing = await this.findGroupCardByIdempotencyKey(input.chatId, input.idempotencyKey);
    if (existing) return existing;

    const group = this.groups.get(input.chatId);
    if (!group) throw new Error("missing group");
    const player = await this.findOrCreateByIdentity({ mode: "telegram", telegramId: input.creatorTelegramId });
    const groupCard = createGroupCardRecord(input);
    this.groupCards.set(this.groupCardKey(input.chatId, input.idempotencyKey), groupCard);
    this.groupCardInputs.set(this.groupCardKey(input.chatId, input.idempotencyKey), input);
    group.cardIds.push(groupCard.id);
    player.ownedCards = addToInventory(player.ownedCards, groupCard.id, 1);

    return { group, groupCard, cardInput: input, player, idempotent: false };
  }

  groupCardInputs = new Map<string, CreateGroupCardInput>();

  async findGroupCardByIdempotencyKey(chatId: string, idempotencyKey: string): Promise<CreateGroupCardResult | undefined> {
    const existing = this.groupCards.get(this.groupCardKey(chatId, idempotencyKey));
    const cardInput = this.groupCardInputs.get(this.groupCardKey(chatId, idempotencyKey));
    if (!existing || !cardInput) return undefined;
    const group = this.groups.get(existing.chatId);
    if (!group) throw new Error("missing group");
    return {
      group,
      groupCard: existing,
      cardInput,
      player: await this.findOrCreateByIdentity({ mode: "telegram", telegramId: existing.creatorTelegramId }),
      idempotent: true,
    };
  }

  async findOrCreateByIdentity(identity: PlayerIdentity) {
    hydrateGroupRuntime([...this.groups.values()], [...this.groupCardInputs.values()]);
    const key = this.playerKey(identity);
    const existing = this.players.get(key);
    if (existing) return existing;
    const created = createNewStoredPlayerProfile(`player-${this.players.size + 1}`, identity);
    this.players.set(key, created);
    return created;
  }

  async saveDeck(identity: PlayerIdentity, deckIds: string[]) {
    const profile = await this.findOrCreateByIdentity(identity);
    profile.deckIds = deckIds;
    return profile;
  }
}

function putGroup(store: IntegrationStore, chatId: string, overrides: Partial<{ displayName: string; bonus: Bonus }> = {}) {
  return handleGroupUpsertPut(
    jsonRequest(
      `http://localhost/api/integrations/groups/${encodeURIComponent(chatId)}`,
      {
        displayName: overrides.displayName ?? "Test Chat",
        glyphUrl: "https://assets.test/glyph.png",
        bonus: overrides.bonus ?? bonus,
      },
      authHeaders(),
    ),
    { params: { chatId } },
    store,
    { fetcher: imageFetcher() },
  );
}

function postCard(store: IntegrationStore, overrides: Partial<Record<string, unknown>> = {}) {
  return handleGroupCardPost(
    jsonRequest("http://localhost/api/integrations/group-cards", cardBody(overrides), authHeaders()),
    store,
    { fetcher: imageFetcher() },
  );
}

function cardBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    chatId: "-100",
    creatorTelegramId: "111",
    idempotencyKey: "idem-1",
    name: "Creator Card",
    power: 7,
    damage: 5,
    ability,
    imageUrl: "https://assets.test/card.png",
    ...overrides,
  };
}

function jsonRequest(url: string, body: unknown, headers: HeadersInit = { "Content-Type": "application/json" }) {
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
  };
}

function imageFetcher() {
  return async () => {
    const bytes = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: "#ff00aa",
      },
    }).png().toBuffer();
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "Content-Type": "image/png" },
    });
  };
}
