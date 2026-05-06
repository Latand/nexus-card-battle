import { DAMAGE_BOOST_COST } from "../model/constants";
import type { EnemyMove } from "../model/game";
import type { Card, GameState } from "../model/types";
import {
  createBattleAiMoveRequest,
  type BattleAiMoveResponse,
} from "./publicState";

export async function requestBattleAiMove(game: GameState, options: { visiblePlayerCard?: Card } = {}): Promise<EnemyMove> {
  const response = await fetch("/api/battle/ai-move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createBattleAiMoveRequest(game, options)),
  });

  if (!response.ok) {
    throw new Error(`AI move request failed with ${response.status}`);
  }

  const body = (await response.json()) as BattleAiMoveResponse;
  const card = game.enemy.hand.find((item) => item.id === body.cardId && !item.used && !game.enemy.usedCardIds.includes(item.id));

  if (!card) {
    throw new Error("AI move returned an unavailable card.");
  }

  const energy = normalizeEnergy(body.energy, game.enemy.energy);
  const damageBoost = Boolean(body.damageBoost) && energy + DAMAGE_BOOST_COST <= game.enemy.energy;

  return { card, energy, damageBoost };
}

function normalizeEnergy(value: unknown, maxEnergy: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maxEnergy, Math.floor(value)));
}
