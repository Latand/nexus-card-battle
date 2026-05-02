import type { Card } from "@/features/battle/model/types";
import type { PlayerIdentity, PlayerProfile } from "@/features/player/profile/types";
import type { BoosterOpeningRecord, BoosterResponse } from "./types";

export type OpenStarterBoosterResponse = {
  booster: BoosterResponse;
  cards: Card[];
  opening: BoosterOpeningRecord;
  player: PlayerProfile;
};

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
