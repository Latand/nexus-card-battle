import {
  PlayerIdentityValidationError,
  type PlayerIdentity,
  type PlayerProfile,
  type StoredPlayerProfile,
  parsePlayerIdentity,
  toPlayerProfile,
} from "./types";
import { cards } from "@/features/battle/model/cards";
import { MIN_DECK_SIZE } from "@/features/battle/model/constants";

export type PlayerProfileStore = {
  findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile>;
};

export type PlayerDeckStore = PlayerProfileStore & {
  saveDeck(identity: PlayerIdentity, deckIds: string[]): Promise<StoredPlayerProfile>;
};

export async function handlePlayerProfilePost(request: Request, store: PlayerProfileStore) {
  try {
    const body = await readJsonObject(request);
    const identity = parsePlayerIdentity(body.identity);
    const profile = await store.findOrCreateByIdentity(identity);

    return playerProfileResponse(toPlayerProfile(profile));
  } catch (error) {
    return playerProfileErrorResponse(error);
  }
}

export async function handlePlayerProfileGet(request: Request, store: PlayerProfileStore) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const identity =
      mode === "telegram"
        ? parsePlayerIdentity({ mode, telegramId: url.searchParams.get("telegramId") })
        : parsePlayerIdentity({ mode, guestId: url.searchParams.get("guestId") });
    const profile = await store.findOrCreateByIdentity(identity);

    return playerProfileResponse(toPlayerProfile(profile));
  } catch (error) {
    return playerProfileErrorResponse(error);
  }
}

export async function handlePlayerDeckSavePost(request: Request, store: PlayerDeckStore) {
  try {
    const body = await readJsonObject(request);
    const identity = parsePlayerIdentity(body.identity);
    const deckIds = parseDeckIds(body.deckIds);
    const profile = await store.findOrCreateByIdentity(identity);

    validateDeckSave(deckIds, profile.ownedCardIds);

    const savedProfile = await store.saveDeck(identity, deckIds);
    return playerProfileResponse(toPlayerProfile(savedProfile));
  } catch (error) {
    return playerProfileErrorResponse(error);
  }
}

function playerProfileResponse(player: PlayerProfile) {
  return Response.json(
    { player },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function playerProfileErrorResponse(error: unknown) {
  if (error instanceof PlayerDeckValidationError) {
    return Response.json(
      {
        error: "invalid_deck",
        message: error.message,
      },
      { status: 400 },
    );
  }

  if (error instanceof PlayerIdentityValidationError || error instanceof SyntaxError) {
    return Response.json(
      {
        error: "invalid_identity",
        message: error.message,
      },
      { status: 400 },
    );
  }

  console.error("Player profile API failed.", error);
  return Response.json(
    {
      error: "profile_unavailable",
      message: "Player profile is unavailable.",
    },
    { status: 500 },
  );
}

class PlayerDeckValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerDeckValidationError";
  }
}

function parseDeckIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new PlayerDeckValidationError("deckIds must be an array.");
  }

  return value.map((item) => {
    if (typeof item !== "string") {
      throw new PlayerDeckValidationError("deckIds must contain only strings.");
    }

    const cardId = item.trim();
    if (!cardId) {
      throw new PlayerDeckValidationError("deckIds must not contain empty card ids.");
    }

    return cardId;
  });
}

function validateDeckSave(deckIds: string[], ownedCardIds: string[]) {
  const duplicateIds = duplicateValues(deckIds);
  if (duplicateIds.length > 0) {
    throw new PlayerDeckValidationError(`Duplicate deck card ids: ${duplicateIds.join(", ")}`);
  }

  const knownCardIds = new Set(cards.map((card) => card.id));
  const unknownIds = deckIds.filter((cardId) => !knownCardIds.has(cardId));
  if (unknownIds.length > 0) {
    throw new PlayerDeckValidationError(`Unknown deck card ids: ${unknownIds.join(", ")}`);
  }

  const owned = new Set(ownedCardIds);
  const missingOwnedIds = deckIds.filter((cardId) => !owned.has(cardId));
  if (missingOwnedIds.length > 0) {
    throw new PlayerDeckValidationError(`Deck contains non-owned card ids: ${missingOwnedIds.join(", ")}`);
  }

  if (deckIds.length < MIN_DECK_SIZE) {
    throw new PlayerDeckValidationError(`Deck must contain at least ${MIN_DECK_SIZE} cards.`);
  }
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates];
}

async function readJsonObject(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new SyntaxError("request body must be valid JSON.");
  }

  if (!isRecord(body)) {
    throw new PlayerIdentityValidationError("request body must be an object.");
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
