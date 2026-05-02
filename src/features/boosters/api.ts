import { cards as activeCards } from "@/features/battle/model/cards";
import type { Card } from "@/features/battle/model/types";
import { PlayerIdentityValidationError, parsePlayerIdentity, toPlayerProfile } from "@/features/player/profile/types";
import { getBoosterCatalogForPlayer, getBoosterCatalogResponse, validateBoosterCatalog } from "./catalog";
import { BoosterOpeningError, prepareStarterBoosterOpening, type RandomSource } from "./opening";
import type { BoosterOpeningRecord, BoosterOpeningStore, StoredBoosterOpeningRecord } from "./types";

export async function handleBoosterCatalogGet() {
  try {
    validateBoosterCatalog();
    return noStoreJson({ boosters: getBoosterCatalogResponse() });
  } catch (error) {
    return boosterApiErrorResponse(error);
  }
}

export async function handleBoosterCatalogPost(request: Request, store: BoosterOpeningStore) {
  try {
    validateBoosterCatalog();
    const body = await readJsonObject(request);
    const identity = parsePlayerIdentity(body.identity);
    const profile = toPlayerProfile(await store.findOrCreateByIdentity(identity));

    return noStoreJson({
      boosters: getBoosterCatalogForPlayer(profile),
      player: profile,
    });
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
    const identity = parsePlayerIdentity(body.identity);
    const boosterId = parseBoosterId(body.boosterId);
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
  } catch (error) {
    return boosterApiErrorResponse(error);
  }
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

function serializeOpeningRecord(opening: StoredBoosterOpeningRecord): BoosterOpeningRecord {
  return {
    ...opening,
    cardIds: [...opening.cardIds],
    openedAt: opening.openedAt.toISOString(),
  };
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      "Cache-Control": "no-store",
    },
  });
}

function boosterApiErrorResponse(error: unknown) {
  if (error instanceof PlayerIdentityValidationError) {
    return noStoreJson(
      {
        error: "invalid_identity",
        message: error.message,
      },
      { status: 400 },
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
