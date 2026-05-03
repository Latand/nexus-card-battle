import type { RewardSummary } from "@/features/battle/model/types";
import type { PlayerIdentity, PlayerProfile } from "./types";

export const PLAYER_GUEST_ID_STORAGE_KEY = "nexus:player-guest-id:v1";

export type MatchFinishedRequest = {
  identity: PlayerIdentity;
  mode: "pve";
  result: "win" | "draw" | "loss";
};

export type MatchFinishedResponse = {
  rewards: RewardSummary;
  player: PlayerProfile;
};

type TelegramProfileWindow = Window & {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: {
        user?: {
          id?: number | string;
        };
      };
    };
  };
};

export function resolveClientPlayerIdentity(): PlayerIdentity {
  const telegramId = readTelegramId();
  if (telegramId) {
    return {
      mode: "telegram",
      telegramId,
    };
  }

  return {
    mode: "guest",
    guestId: getOrCreateGuestId(),
  };
}

export async function fetchPlayerProfile(identity: PlayerIdentity = resolveClientPlayerIdentity()): Promise<PlayerProfile> {
  const response = await fetch("/api/player", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identity }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load player profile: ${response.status}`);
  }

  const body = (await response.json()) as { player?: PlayerProfile };
  if (!body.player) {
    throw new Error("Player profile response did not include player.");
  }

  return body.player;
}

export async function postMatchFinished(input: MatchFinishedRequest): Promise<MatchFinishedResponse> {
  const response = await fetch("/api/player/match-finished", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
    throw new Error(body?.message ?? `Failed to apply match rewards: ${response.status}`);
  }

  const body = (await response.json()) as MatchFinishedResponse;
  if (!body.rewards || !body.player) {
    throw new Error("Match-finished response was malformed.");
  }

  return body;
}

export async function savePlayerDeck(identity: PlayerIdentity, deckIds: string[]): Promise<PlayerProfile> {
  const response = await fetch("/api/player/deck", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identity, deckIds }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
    throw new Error(body?.message ?? `Failed to save player deck: ${response.status}`);
  }

  const body = (await response.json()) as { player?: PlayerProfile };
  if (!body.player) {
    throw new Error("Player deck response did not include player.");
  }

  return body.player;
}

function readTelegramId() {
  if (typeof window === "undefined") return undefined;

  const telegramId = (window as TelegramProfileWindow).Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (telegramId === undefined || telegramId === null) return undefined;

  const value = String(telegramId).trim();
  return value || undefined;
}

function getOrCreateGuestId() {
  if (typeof window === "undefined") return createGuestId();

  try {
    const existing = window.localStorage.getItem(PLAYER_GUEST_ID_STORAGE_KEY)?.trim();
    if (existing) return existing;

    const guestId = createGuestId();
    window.localStorage.setItem(PLAYER_GUEST_ID_STORAGE_KEY, guestId);
    return guestId;
  } catch {
    return createGuestId();
  }
}

function createGuestId() {
  const cryptoApi = typeof crypto !== "undefined" ? crypto : undefined;
  return `guest_${cryptoApi?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}
