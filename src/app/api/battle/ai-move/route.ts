import { chooseOpenRouterBattleAiMove, DEFAULT_OPENROUTER_MODEL } from "@/features/battle/ai/openrouter";
import type { BattleAiMoveRequest } from "@/features/battle/ai/publicState";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as BattleAiMoveRequest;

    if (!isBattleAiMoveRequest(body)) {
      return Response.json({ error: "invalid_ai_move_request" }, { status: 400 });
    }

    const move = await chooseOpenRouterBattleAiMove(body, {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
      siteUrl: process.env.OPENROUTER_SITE_URL,
      appTitle: process.env.OPENROUTER_APP_TITLE,
      timeoutMs: parseTimeoutMs(process.env.OPENROUTER_TIMEOUT_MS),
    });

    return Response.json(move, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn("AI move route failed.", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "ai_move_failed" }, { status: 500 });
  }
}

function isBattleAiMoveRequest(value: unknown): value is BattleAiMoveRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as BattleAiMoveRequest;
  return (
    typeof request.round === "number" &&
    (request.first === "player" || request.first === "enemy") &&
    isAiFighter(request.player) &&
    isAiFighter(request.enemy) &&
    (request.visiblePlayerCardId === undefined || typeof request.visiblePlayerCardId === "string")
  );
}

function isAiFighter(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const fighter = value as BattleAiMoveRequest["player"];
  return (
    typeof fighter.id === "string" &&
    typeof fighter.name === "string" &&
    typeof fighter.hp === "number" &&
    typeof fighter.energy === "number" &&
    Array.isArray(fighter.hand) &&
    fighter.hand.length > 0 &&
    Array.isArray(fighter.usedCardIds)
  );
}

function parseTimeoutMs(value?: string) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
