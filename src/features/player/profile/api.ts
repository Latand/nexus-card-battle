import {
  PlayerIdentityValidationError,
  type PlayerIdentity,
  type PlayerProfile,
  type StoredPlayerProfile,
  parsePlayerIdentity,
  toPlayerProfile,
} from "./types";

export type PlayerProfileStore = {
  findOrCreateByIdentity(identity: PlayerIdentity): Promise<StoredPlayerProfile>;
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
