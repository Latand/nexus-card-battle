import type { Card } from "@/features/battle/model/types";
import type { PlayerIdentity, PlayerProfile } from "@/features/player/profile/types";
import type { BoosterCatalogItem, BoosterOpeningRecord, BoosterResponse } from "./types";

export type BoosterCatalogResponse = {
  boosters: BoosterCatalogItem[];
  player?: PlayerProfile;
};

export type PublicBoosterCatalogResponse = {
  boosters: BoosterResponse[];
};

export type StarterBoosterCatalogResponse = {
  boosters: BoosterCatalogItem[];
  player: PlayerProfile;
};

export type OpenStarterBoosterResponse = {
  booster: BoosterResponse;
  cards: Card[];
  opening: BoosterOpeningRecord;
  player: PlayerProfile;
  crystalCost?: number;
};

export function fetchBoosterCatalog(identity: PlayerIdentity, groupContext?: string | null): Promise<BoosterCatalogResponse>;
export function fetchBoosterCatalog(groupContext?: string | null): Promise<PublicBoosterCatalogResponse>;
export async function fetchBoosterCatalog(
  identityOrGroupContext?: PlayerIdentity | string | null,
  groupContext?: string | null,
): Promise<BoosterCatalogResponse | PublicBoosterCatalogResponse> {
  const identity = isPlayerIdentity(identityOrGroupContext) ? identityOrGroupContext : null;
  const resolvedGroupContext = identity ? groupContext : typeof identityOrGroupContext === "string" ? identityOrGroupContext : null;
  const response = identity
    ? await fetch("/api/boosters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identity, ...(resolvedGroupContext ? { groupContext: resolvedGroupContext } : {}) }),
      })
    : await fetch(`/api/boosters${resolvedGroupContext ? `?groupContext=${encodeURIComponent(resolvedGroupContext)}` : ""}`, {
        method: "GET",
      });
  const body = (await response.json().catch(() => undefined)) as {
    boosters?: BoosterCatalogItem[] | BoosterResponse[];
    player?: PlayerProfile;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(body?.message || `Booster catalog could not be loaded: ${response.status}`);
  }

  if (!Array.isArray(body?.boosters)) {
    throw new Error("Booster catalog response is incomplete.");
  }

  return {
    boosters: body.boosters,
    ...(body.player ? { player: body.player } : {}),
  };
}

export async function fetchStarterBoosterCatalog(identity: PlayerIdentity, groupContext?: string | null): Promise<StarterBoosterCatalogResponse> {
  const response = await fetch("/api/boosters", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identity, ...(groupContext ? { groupContext } : {}) }),
  });
  const body = (await response.json().catch(() => undefined)) as Partial<StarterBoosterCatalogResponse> & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(body?.message || `Starter booster catalog could not be loaded: ${response.status}`);
  }

  if (!Array.isArray(body?.boosters) || !body.player) {
    throw new Error("Starter booster catalog response is incomplete.");
  }

  return {
    boosters: body.boosters,
    player: body.player,
  };
}

export async function openStarterBooster(identity: PlayerIdentity, boosterId: string): Promise<OpenStarterBoosterResponse> {
  const response = await fetch("/api/player/open-booster", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identity, boosterId }),
  });
  const body = (await response.json().catch(() => undefined)) as Partial<OpenStarterBoosterResponse> & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(body?.message || `Starter booster could not be opened: ${response.status}`);
  }

  if (!body?.booster || !Array.isArray(body.cards) || !body.player || !body.opening) {
    throw new Error("Starter booster response is incomplete.");
  }

  return {
    booster: body.booster,
    cards: body.cards,
    opening: body.opening,
    player: body.player,
  };
}

export async function openPaidBooster(identity: PlayerIdentity, boosterId: string, groupContext?: string | null): Promise<OpenStarterBoosterResponse> {
  const response = await fetch("/api/player/open-booster", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identity, boosterId, source: "paid_crystals", ...(groupContext ? { groupContext } : {}) }),
  });
  const body = (await response.json().catch(() => undefined)) as Partial<OpenStarterBoosterResponse> & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(body?.message || `Booster could not be opened: ${response.status}`);
  }

  if (!body?.booster || !Array.isArray(body.cards) || !body.player || !body.opening) {
    throw new Error("Booster response is incomplete.");
  }

  return {
    booster: body.booster,
    cards: body.cards,
    opening: body.opening,
    player: body.player,
    crystalCost: body.crystalCost,
  };
}

function isPlayerIdentity(value: unknown): value is PlayerIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const mode = (value as { mode?: unknown }).mode;
  return mode === "guest" || mode === "telegram";
}
