import { cards } from "@/features/battle/model/cards";
import type { Bonus, EffectCondition, EffectMode, EffectOutcomeCondition, EffectSpec, EffectTarget, StatusKind } from "@/features/battle/model/types";
import { toPlayerProfile, type PlayerIdentity, type PlayerProfile } from "@/features/player/profile/types";
import { IntegrationAssetError, ingestRemoteImage, type FetchAsset } from "./assets";
import {
  groupBoosterId,
  groupCardId,
  registerGroupCardRuntime,
  registerGroupRuntime,
  type GroupCardInput,
  type GroupCardIntegrationRecord,
  type GroupIntegrationRecord,
} from "./runtime";
import { GroupContextError, signGroupLaunchContext } from "./groupContext";

export type IntegrationStore = {
  upsertGroup(input: UpsertGroupInput): Promise<GroupIntegrationRecord>;
  findGroupCardByIdempotencyKey?(chatId: string, idempotencyKey: string): Promise<CreateGroupCardResult | undefined>;
  createGroupCard(input: CreateGroupCardInput): Promise<CreateGroupCardResult>;
  findOrCreateByIdentity(identity: PlayerIdentity): Promise<Parameters<typeof toPlayerProfile>[0]>;
};

export type UpsertGroupInput = {
  chatId: string;
  displayName: string;
  glyphUrl: string;
  bonus: Bonus;
};

export type CreateGroupCardInput = GroupCardInput;

export type CreateGroupCardResult = {
  group: GroupIntegrationRecord;
  groupCard: GroupCardIntegrationRecord;
  cardInput: CreateGroupCardInput;
  player: Parameters<typeof toPlayerProfile>[0];
  idempotent: boolean;
};

export async function handleGroupUpsertPut(
  request: Request,
  context: { params: Promise<{ chatId: string }> | { chatId: string } },
  store: IntegrationStore,
  options: { fetcher?: FetchAsset } = {},
) {
  try {
    requireIntegrationAuth(request);
    const { chatId } = await context.params;
    const body = await readJsonObject(request);
    const displayName = parseName(body.displayName ?? body.title ?? body.chatTitle, "displayName");
    const bonus = parseBonus(body.bonus);
    const glyphSourceUrl = parseUrlString(body.glyphUrl, "glyphUrl");
    const storedGlyphUrl = await ingestRemoteImage({
      url: glyphSourceUrl,
      kind: "glyph",
      ownerId: chatId,
      assetId: "glyph",
      fetcher: options.fetcher,
    });

    const group = await store.upsertGroup({
      chatId: parseId(chatId, "chatId"),
      displayName,
      glyphUrl: storedGlyphUrl,
      bonus,
    });
    registerGroupRuntime(group);

    return json({ group: serializeGroup(group) });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}

export async function handleGroupCardPost(request: Request, store: IntegrationStore, options: { fetcher?: FetchAsset } = {}) {
  try {
    requireIntegrationAuth(request);
    const body = await readJsonObject(request);
    const chatId = parseId(body.chatId, "chatId");
    const creatorTelegramId = parseId(body.creatorTelegramId, "creatorTelegramId");
    const idempotencyKey = parseId(body.idempotencyKey, "idempotencyKey");
    const imageSourceUrl = parseUrlString(body.imageUrl, "imageUrl");
    const dropWeight = parseDropWeight(body.dropWeight);
    const existing = await store.findGroupCardByIdempotencyKey?.(chatId, idempotencyKey);
    if (existing) {
      const card = registerGroupCardRuntime(existing.group, existing.cardInput);
      return json({
        card,
        group: serializeGroup(existing.group),
        player: toPlayerProfile(existing.player),
        idempotent: true,
      });
    }

    const artUrl = await ingestRemoteImage({
      url: imageSourceUrl,
      kind: "card",
      ownerId: chatId,
      assetId: idempotencyKey,
      fetcher: options.fetcher,
    });

    const result = await store.createGroupCard({
      chatId,
      creatorTelegramId,
      idempotencyKey,
      name: parseName(body.name, "name"),
      power: parseStat(body.power, "power"),
      damage: parseStat(body.damage, "damage"),
      ability: parseAbility(body.ability),
      imageUrl: imageSourceUrl,
      artUrl,
      dropWeight,
    });
    const card = registerGroupCardRuntime(result.group, {
      chatId,
      creatorTelegramId,
      idempotencyKey,
      name: parseName(body.name, "name"),
      power: parseStat(body.power, "power"),
      damage: parseStat(body.damage, "damage"),
      ability: parseAbility(body.ability),
      imageUrl: imageSourceUrl,
      artUrl,
      dropWeight,
    });

    return json({
      card,
      group: serializeGroup(result.group),
      player: toPlayerProfile(result.player),
      idempotent: result.idempotent,
    });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}

export async function handleGroupLaunchUrlPost(
  request: Request,
  context: { params: Promise<{ chatId: string }> | { chatId: string } },
  options: { now?: Date; ttlSeconds?: number } = {},
) {
  try {
    requireIntegrationAuth(request);
    const { chatId: rawChatId } = await context.params;
    const chatId = parseId(rawChatId, "chatId");
    const body = await readOptionalJsonObject(request);
    const baseUrl = parseOptionalUrlString(body?.baseUrl, "baseUrl") ?? getDefaultWebAppUrl(request);
    const url = new URL(baseUrl);
    url.searchParams.set("groupContext", signGroupLaunchContext({ chatId, now: options.now, ttlSeconds: options.ttlSeconds }));

    return json({ url: url.toString(), expiresInSeconds: options.ttlSeconds ?? 10 * 60 });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}

export async function serializeCreatorProfile(store: Pick<IntegrationStore, "findOrCreateByIdentity">, telegramId: string): Promise<PlayerProfile> {
  return toPlayerProfile(await store.findOrCreateByIdentity({ mode: "telegram", telegramId }));
}

export function validateGroupBonusChange(current: GroupIntegrationRecord | undefined, nextBonus: Bonus) {
  if (!current || current.cardIds.length === 0) return;
  if (JSON.stringify(current.bonus) !== JSON.stringify(nextBonus)) {
    throw new IntegrationValidationError("group_bonus_locked", "Group bonus cannot be changed after group cards exist.", 409);
  }
}

export function createNewGroup(input: UpsertGroupInput, now = new Date()): GroupIntegrationRecord {
  return {
    chatId: input.chatId,
    clan: input.displayName,
    boosterId: groupBoosterId(input.chatId),
    displayName: input.displayName,
    glyphUrl: input.glyphUrl,
    bonus: cloneBonus(input.bonus),
    cardIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createGroupCardRecord(input: CreateGroupCardInput, now = new Date()): GroupCardIntegrationRecord {
  return {
    id: groupCardId(input.chatId, input.idempotencyKey),
    chatId: input.chatId,
    creatorTelegramId: input.creatorTelegramId,
    idempotencyKey: input.idempotencyKey,
    dropWeight: input.dropWeight,
    createdAt: now,
  };
}

export function requireIntegrationAuth(request: Request) {
  const expected = process.env.INTEGRATION_API_TOKEN;
  if (!expected) {
    throw new IntegrationValidationError("integration_auth_unconfigured", "Integration API token is not configured.", 500);
  }

  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix) || header.slice(prefix.length) !== expected) {
    throw new IntegrationValidationError("unauthorized", "Missing or invalid integration bearer token.", 401);
  }
}

async function readOptionalJsonObject(request: Request) {
  const text = await request.text();
  if (!text.trim()) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new IntegrationValidationError("invalid_request", "request body must be valid JSON.", 400);
  }
  if (!isRecord(body)) {
    throw new IntegrationValidationError("invalid_request", "request body must be an object.", 400);
  }
  return body;
}

function parseBonus(value: unknown): Bonus {
  if (!isRecord(value)) throw new IntegrationValidationError("invalid_bonus", "bonus must be an object.", 400);
  const bonus = {
    id: parseName(value.id, "bonus.id"),
    name: parseName(value.name, "bonus.name"),
    description: parseName(value.description, "bonus.description"),
    effects: parseEffects(value.effects, "bonus.effects"),
  };
  return bonus;
}

function parseAbility(value: unknown) {
  if (!isRecord(value)) throw new IntegrationValidationError("invalid_ability", "ability must be an object.", 400);
  return {
    id: parseName(value.id, "ability.id"),
    name: parseName(value.name, "ability.name"),
    description: parseName(value.description, "ability.description"),
    effects: parseEffects(value.effects, "ability.effects"),
  };
}

function parseEffects(value: unknown, field: string): EffectSpec[] {
  if (!Array.isArray(value)) throw new IntegrationValidationError("invalid_effect", `${field} must be an array.`, 400);
  return value.map((entry) => parseEffect(entry));
}

const EFFECT_KEY_WHITELIST = new Set(cards.flatMap((card) => [...card.ability.effects, ...card.bonus.effects].map((effect) => effect.key)));
const EFFECT_TARGETS = new Set(["self", "opponent"]);
const EFFECT_CONDITIONS = new Set(["always", "owner_hp_below_opponent", "on_win", "on_loss"]);
const EFFECT_OUTCOMES = new Set(["always", "on_win", "on_loss"]);
const EFFECT_MODES = new Set(["add", "reduce_with_min", "mirror_opponent_card_damage", "mirror_opponent_card_power", "per_damage", "per_owner_energy", "per_opponent_energy", "per_owner_hp", "per_opponent_hp"]);
const STATUS_KINDS = new Set(["poison", "blessing"]);

function parseEffect(value: unknown): EffectSpec {
  if (!isRecord(value)) throw new IntegrationValidationError("invalid_effect", "effect must be an object.", 400);
  const key = parseName(value.key, "effect.key");
  if (!EFFECT_KEY_WHITELIST.has(key)) {
    throw new IntegrationValidationError("unsupported_effect", `Unsupported effect key: ${key}`, 400);
  }

  const effect: EffectSpec = { key };
  if (value.id !== undefined) effect.id = parseName(value.id, "effect.id");
  if (value.label !== undefined) effect.label = parseName(value.label, "effect.label");
  if (value.amount !== undefined) effect.amount = parseFinite(value.amount, "effect.amount");
  if (value.min !== undefined) effect.min = parseFinite(value.min, "effect.min");
  if (value.target !== undefined) effect.target = parseEnum<EffectTarget>(value.target, EFFECT_TARGETS, "effect.target");
  if (value.condition !== undefined) effect.condition = parseEnum<EffectCondition>(value.condition, EFFECT_CONDITIONS, "effect.condition");
  if (value.outcome !== undefined) effect.outcome = parseEnum<EffectOutcomeCondition>(value.outcome, EFFECT_OUTCOMES, "effect.outcome");
  if (value.mode !== undefined) effect.mode = parseEnum<EffectMode>(value.mode, EFFECT_MODES, "effect.mode");
  if (value.statusKind !== undefined) effect.statusKind = parseEnum<StatusKind>(value.statusKind, STATUS_KINDS, "effect.statusKind");
  if (value.unblockable !== undefined) {
    if (typeof value.unblockable !== "boolean") throw new IntegrationValidationError("invalid_effect", "effect.unblockable must be boolean.", 400);
    effect.unblockable = value.unblockable;
  }
  return effect;
}

function parseDropWeight(value: unknown) {
  if (value === undefined) return 1;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new IntegrationValidationError("invalid_drop_weight", "dropWeight must be a positive finite number.", 400);
  }
  return value;
}

function parseStat(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new IntegrationValidationError("invalid_card", `${field} must be a positive integer.`, 400);
  }
  return value;
}

function parseFinite(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new IntegrationValidationError("invalid_effect", `${field} must be finite.`, 400);
  }
  return value;
}

function parseEnum<T extends string>(value: unknown, allowed: Set<string>, field: string): T {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new IntegrationValidationError("invalid_effect", `${field} is unsupported.`, 400);
  }
  return value as T;
}

function parseId(value: unknown, field: string) {
  if (typeof value !== "string") throw new IntegrationValidationError("invalid_request", `${field} must be a string.`, 400);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) throw new IntegrationValidationError("invalid_request", `${field} must be 1-160 characters.`, 400);
  return trimmed;
}

function parseName(value: unknown, field: string) {
  if (typeof value !== "string") throw new IntegrationValidationError("invalid_request", `${field} must be a string.`, 400);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) throw new IntegrationValidationError("invalid_request", `${field} must be 1-160 characters.`, 400);
  return trimmed;
}

function parseUrlString(value: unknown, field: string) {
  const url = parseName(value, field);
  if (url.length > 2048) throw new IntegrationValidationError("invalid_request", `${field} must be 2048 characters or less.`, 400);
  return url;
}

function parseOptionalUrlString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  return parseUrlString(value, field);
}

function getDefaultWebAppUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_WEBAPP_URL || process.env.WEBAPP_URL || process.env.APP_URL;
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.origin}/`;
}

function serializeGroup(group: GroupIntegrationRecord) {
  return {
    chatId: group.chatId,
    clan: group.clan,
    boosterId: group.boosterId,
    booster: {
      id: group.boosterId,
      name: group.displayName,
      clans: [group.clan],
      cardCount: group.cardIds.length,
      opening: {
        available: false,
        reason: "group_booster_opening_out_of_scope",
      },
    },
    displayName: group.displayName,
    glyphUrl: group.glyphUrl,
    bonus: group.bonus,
    cardIds: group.cardIds,
  };
}

function integrationErrorResponse(error: unknown) {
  if (error instanceof IntegrationValidationError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  if (error instanceof IntegrationAssetError) {
    return json({ error: "invalid_asset", message: error.message }, 400);
  }
  if (error instanceof GroupContextError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  if (error instanceof SyntaxError) {
    return json({ error: "invalid_request", message: error.message }, 400);
  }

  console.error("Integration API failed.", error);
  return json({ error: "integration_unavailable", message: "Integration API is unavailable." }, 500);
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readJsonObject(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new SyntaxError("request body must be valid JSON.");
  }
  if (!isRecord(body)) throw new SyntaxError("request body must be an object.");
  return body;
}

function cloneBonus(bonus: Bonus): Bonus {
  return { ...bonus, effects: bonus.effects.map((effect) => ({ ...effect })) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class IntegrationValidationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "IntegrationValidationError";
  }
}
