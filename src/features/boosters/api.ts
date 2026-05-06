import { cards as activeCards } from "@/features/battle/model/cards";
import type { Card } from "@/features/battle/model/types";
import { GroupContextError, verifyGroupLaunchContext } from "@/features/integrations/groupContext";
import { PlayerAuthError, resolveAuthenticatedPlayerIdentity, type PlayerAuthResult } from "@/features/player/profile/auth";
import { PlayerIdentityValidationError, toPlayerProfile } from "@/features/player/profile/types";
import { boosterCatalog, getBoosterCatalogForPlayerWithBoosters, getBoosterCatalogResponse, serializeBooster, validateBoosterCatalog } from "./catalog";
import { BoosterOpeningError, createGroupBooster, preparePaidBoosterOpening, prepareStarterBoosterOpening, type RandomSource } from "./opening";
import type { Booster, BoosterOpeningRecord, BoosterOpeningStore, StoredBoosterOpeningRecord } from "./types";

export async function handleBoosterCatalogGet(request?: Request, store?: BoosterOpeningStore) {
  try {
    validateBoosterCatalog();
    const groupBooster = request && store ? await resolveGroupBoosterFromRequest(request, store, { required: false }) : undefined;
    return noStoreJson({ boosters: groupBooster ? [...getBoosterCatalogResponse(), serializeBooster(groupBooster)] : getBoosterCatalogResponse() });
  } catch (error) {
    return boosterApiErrorResponse(error);
  }
}

export async function handleBoosterCatalogPost(request: Request, store: BoosterOpeningStore) {
  try {
    validateBoosterCatalog();
    const body = await readJsonObject(request);
    const auth = resolveAuthenticatedPlayerIdentity(request, body, { allowGuestCreation: true });
    const identity = auth.identity;
    const profile = toPlayerProfile(await store.findOrCreateByIdentity(identity));
    const groupBooster = await resolveGroupBoosterFromBody(body, store, { required: false });
    const boosters: readonly Booster[] = groupBooster ? [...boosterCatalog, groupBooster] : boosterCatalog;

    return noStoreJson({
      boosters: getBoosterCatalogForPlayerWithBoosters(profile, boosters),
      player: profile,
    }, auth);
  } catch (error) {
    return boosterApiErrorResponse(error);
  }
}

export async function handleStarterBoosterOpenPost(
  request: Request,
  store: BoosterOpeningStore,
  options: {
    rng?: RandomSource;
    now?: () => Date;
  } = {},
) {
  try {
    validateBoosterCatalog();
    const body = await readJsonObject(request);
    return await openStarterBooster(request, body, store, options);
  } catch (error) {
    return boosterApiErrorResponse(error);
  }
}

export async function handleBoosterOpenPost(
  request: Request,
  store: BoosterOpeningStore,
  options: {
    rng?: RandomSource;
    now?: () => Date;
  } = {},
) {
  try {
    validateBoosterCatalog();
    const body = await readJsonObject(request);
    const source = parseOpeningSource(body.source ?? body.purchaseMode);

    if (source === "paid_crystals") {
      return await openPaidBooster(request, body, store, options);
    }

    return await openStarterBooster(request, body, store, options);
  } catch (error) {
    return boosterApiErrorResponse(error);
  }
}

async function openStarterBooster(
  request: Request,
  body: Record<string, unknown>,
  store: BoosterOpeningStore,
  options: {
    rng?: RandomSource;
    now?: () => Date;
  },
) {
  const { identity } = resolveAuthenticatedPlayerIdentity(request, body);
  const boosterId = parseBoosterId(body.boosterId);
  if (boosterId.startsWith("group-")) {
    throw new BoosterOpeningError("group_context_required", "Group boosters cannot be opened as starter boosters.", 403);
  }
  const profile = toPlayerProfile(await store.findOrCreateByIdentity(identity));
  const prepared = prepareStarterBoosterOpening({
    boosterId,
    player: profile,
    rng: options.rng,
  });
  const openedAt = options.now?.() ?? new Date();
  const persisted = await store.saveStarterBoosterOpening({
    identity,
    playerId: profile.id,
    boosterId,
    cardIds: prepared.cardIds,
    openedAt,
  });

  return noStoreJson({
    booster: prepared.booster,
    cards: getPersistedOpeningCards(persisted.opening.cardIds),
    opening: serializeOpeningRecord(persisted.opening),
    player: toPlayerProfile(persisted.player),
  });
}

async function openPaidBooster(
  request: Request,
  body: Record<string, unknown>,
  store: BoosterOpeningStore,
  options: {
    rng?: RandomSource;
    now?: () => Date;
  },
) {
  const { identity } = resolveAuthenticatedPlayerIdentity(request, body);
  const boosterId = parseBoosterId(body.boosterId);
  const groupOpening = boosterId.startsWith("group-") ? await resolveGroupOpening(body, store, boosterId) : undefined;
  const profile = toPlayerProfile(await store.findOrCreateByIdentity(identity));
  const prepared = preparePaidBoosterOpening({
    boosterId,
    player: profile,
    rng: options.rng,
    booster: groupOpening?.booster,
    groupCards: groupOpening?.groupCards,
  });
  const openedAt = options.now?.() ?? new Date();
  const persisted = await store.savePaidBoosterOpening({
    identity,
    playerId: profile.id,
    boosterId,
    cardIds: prepared.cardIds,
    openedAt,
    crystalCost: prepared.crystalCost,
  });

  return noStoreJson({
    booster: prepared.booster,
    cards: getPersistedOpeningCards(persisted.opening.cardIds),
    opening: serializeOpeningRecord(persisted.opening),
    player: toPlayerProfile(persisted.player),
    crystalCost: prepared.crystalCost,
  });
}

async function resolveGroupOpening(body: Record<string, unknown>, store: BoosterOpeningStore, boosterId: string) {
  const groupBooster = await resolveGroupBoosterFromBody(body, store, { required: true });
  if (!groupBooster || groupBooster.id !== boosterId || !groupBooster.group) {
    throw new BoosterOpeningError("group_context_required", "Valid signed group context is required for this booster.", 403);
  }
  const groupCards = await store.findIntegrationGroupCardsByChatId?.(groupBooster.group.chatId);
  if (!groupCards) {
    throw new BoosterOpeningError("group_booster_unavailable", "Group booster is unavailable.", 404);
  }
  return { booster: groupBooster, groupCards };
}

async function resolveGroupBoosterFromRequest(request: Request, store: BoosterOpeningStore, options: { required: boolean }) {
  const context = new URL(request.url).searchParams.get("groupContext");
  return resolveGroupBooster(context, store, options);
}

async function resolveGroupBoosterFromBody(body: Record<string, unknown>, store: BoosterOpeningStore, options: { required: boolean }) {
  return resolveGroupBooster(body.groupContext, store, options);
}

async function resolveGroupBooster(value: unknown, store: BoosterOpeningStore, options: { required: boolean }) {
  if (value === undefined || value === null || value === "") {
    if (!options.required) return undefined;
    throw new BoosterOpeningError("group_context_required", "Valid signed group context is required for group boosters.", 403);
  }
  const context = verifyGroupLaunchContext(value);
  const group = await store.findIntegrationGroupByChatId?.(context.chatId);
  if (!group) {
    throw new BoosterOpeningError("group_booster_unavailable", "Group booster is unavailable.", 404);
  }
  return createGroupBooster({
    chatId: group.chatId,
    boosterId: group.boosterId,
    name: group.displayName,
    clan: group.clan,
    cardCount: group.cardIds.length,
  });
}

function getPersistedOpeningCards(cardIds: string[]): Card[] {
  const cardsById = new Map(activeCards.map((card) => [card.id, card]));
  return cardIds.map((cardId) => {
    const card = cardsById.get(cardId);
    if (!card) {
      throw new BoosterOpeningError("invalid_booster_opening", "Persisted booster opening contains an inactive card.", 500);
    }

    return card;
  });
}

function parseBoosterId(value: unknown) {
  if (typeof value !== "string") {
    throw new BoosterOpeningError("invalid_booster_id", "boosterId must be a string.");
  }

  const boosterId = value.trim();
  if (!boosterId) {
    throw new BoosterOpeningError("invalid_booster_id", "boosterId must not be empty.");
  }

  return boosterId;
}

function parseOpeningSource(value: unknown) {
  if (value === undefined || value === "starter" || value === "starter_free") {
    return "starter_free";
  }

  if (value === "paid" || value === "paid_crystals") {
    return "paid_crystals";
  }

  throw new SyntaxError("source must be starter_free or paid_crystals.");
}

function serializeOpeningRecord(opening: StoredBoosterOpeningRecord): BoosterOpeningRecord {
  return {
    ...opening,
    cardIds: [...opening.cardIds],
    openedAt: opening.openedAt.toISOString(),
  };
}

function noStoreJson(body: unknown, init?: ResponseInit | PlayerAuthResult, auth?: PlayerAuthResult) {
  const responseInit = isAuthResult(init) ? undefined : init;
  const authResult = isAuthResult(init) ? init : auth;
  return Response.json(body, {
    ...responseInit,
    headers: {
      ...responseInit?.headers,
      "Cache-Control": "no-store",
      ...(authResult?.setCookie ? { "Set-Cookie": authResult.setCookie } : {}),
    },
  });
}

function boosterApiErrorResponse(error: unknown) {
  if (error instanceof PlayerAuthError) {
    return noStoreJson(
      {
        error: error.code,
        message: error.message,
      },
      { status: error.status },
    );
  }

  if (error instanceof PlayerIdentityValidationError) {
    return noStoreJson(
      {
        error: "invalid_identity",
        message: error.message,
      },
      { status: 400 },
    );
  }

  if (error instanceof GroupContextError) {
    return noStoreJson(
      {
        error: error.code,
        message: error.message,
      },
      { status: error.status },
    );
  }

  if (error instanceof SyntaxError) {
    return noStoreJson(
      {
        error: "invalid_request",
        message: error.message,
      },
      { status: 400 },
    );
  }

  if (error instanceof BoosterOpeningError) {
    return noStoreJson(
      {
        error: error.code,
        message: error.message,
      },
      { status: error.status },
    );
  }

  console.error("Booster API failed.", error);
  return noStoreJson(
    {
      error: "booster_unavailable",
      message: "Booster service is unavailable.",
    },
    { status: 500 },
  );
}

async function readJsonObject(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new SyntaxError("request body must be valid JSON.");
  }

  if (!isRecord(body)) {
    throw new SyntaxError("request body must be an object.");
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthResult(value: unknown): value is PlayerAuthResult {
  return isRecord(value) && "identity" in value;
}
