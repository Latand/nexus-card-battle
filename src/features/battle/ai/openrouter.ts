import { isClanBonusActive } from "../model/clans";
import { BASE_ATTACK_ENERGY, DAMAGE_BOOST_COST, MAX_ROUNDS } from "../model/constants";
import { chooseEnemyMove, type EnemyMove } from "../model/game";
import type { Card, EffectSpec, Fighter } from "../model/types";
import type { BattleAiFighter, BattleAiMoveRequest, BattleAiMoveResponse } from "./publicState";

export const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 8_000;

export type BattleAiMoveOptions = {
  apiKey?: string;
  model?: string;
  siteUrl?: string;
  appTitle?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type ModelMove = {
  cardId?: unknown;
  energy?: unknown;
  damageBoost?: unknown;
  move?: unknown;
};

export async function chooseOpenRouterBattleAiMove(
  request: BattleAiMoveRequest,
  options: BattleAiMoveOptions = {},
): Promise<BattleAiMoveResponse> {
  const enemy = toRuntimeFighter(request.enemy);
  const player = toRuntimeFighter(request.player);
  const visiblePlayerCard = request.visiblePlayerCardId
    ? player.hand.find((card) => card.id === request.visiblePlayerCardId)
    : undefined;
  const fallback = chooseFallbackMove(enemy, player, request.round, request.first, visiblePlayerCard);
  const model = options.model?.trim() || DEFAULT_OPENROUTER_MODEL;
  const apiKey = options.apiKey?.trim();

  if (!apiKey) return toResponse(fallback, "fallback", model);

  try {
    const modelMove = await requestOpenRouterMove(request, { ...options, apiKey, model });
    const move = normalizeModelMove(modelMove, enemy, fallback);
    return toResponse(move, "openrouter", model);
  } catch (error) {
    console.warn("OpenRouter AI move failed; falling back to local strategy.", getSafeErrorMessage(error));
    return toResponse(fallback, "fallback", model);
  }
}

function chooseFallbackMove(enemy: Fighter, player: Fighter, round: number, first: BattleAiMoveRequest["first"], visiblePlayerCard?: Card) {
  return chooseEnemyMove(enemy, player, round, { visiblePlayerCard, first });
}

async function requestOpenRouterMove(
  request: BattleAiMoveRequest,
  options: Required<Pick<BattleAiMoveOptions, "apiKey" | "model">> & BattleAiMoveOptions,
): Promise<ModelMove> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      signal: controller.signal,
      headers: buildOpenRouterHeaders(options),
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: JSON.stringify(buildDecisionContext(request)) },
        ],
        response_format: { type: "json_object" },
        reasoning: { max_tokens: 64 },
        temperature: 0.35,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter returned HTTP ${response.status}`);
    }

    const body = await response.json();
    const content = getOpenRouterMessageContent(body);
    if (!content) throw new Error("OpenRouter response did not include message content.");
    return parseModelMove(content);
  } finally {
    clearTimeout(timeout);
  }
}

function buildOpenRouterHeaders(options: Required<Pick<BattleAiMoveOptions, "apiKey" | "model">> & BattleAiMoveOptions) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
    "X-OpenRouter-Title": options.appTitle?.trim() || "Nexus Card Battle",
  };

  if (options.siteUrl?.trim()) {
    headers["HTTP-Referer"] = options.siteUrl.trim();
  }

  return headers;
}

function buildSystemPrompt() {
  return [
    "You choose one legal move for the enemy in a hidden-bid card battle.",
    "Never assume or request hidden opponent energy bids. If the player moved first, only the player's selected card is visible, not their energy or damage boost.",
    "Return JSON only: {\"cardId\":\"card-id\",\"energy\":0,\"damageBoost\":false}. No markdown, no explanation.",
    "Pick cardId from legalEnemyMoves. Energy must be an integer within that move's limit.",
  ].join(" ");
}

function buildDecisionContext(request: BattleAiMoveRequest) {
  return {
    rules: {
      maxRounds: MAX_ROUNDS,
      baseAttackEnergy: BASE_ATTACK_ENERGY,
      attackFormula: "attack = card.power * (energyBid + baseAttackEnergy), then active effects apply",
      damage: "the winning card deals its damage; damageBoost adds +2 damage and costs extra energy",
      damageBoostCost: DAMAGE_BOOST_COST,
      tieBreakers: ["higher attack wins", "Enigma card wins equal attack against non-Enigma", "lower energy bid wins remaining ties", "initiative wins final ties"],
      hiddenInformation: {
        playerEnergyBid: "never provided",
        playerDamageBoost: "never provided",
        enemyEnergyBid: "choose it privately; it will not be revealed before clash",
      },
    },
    round: request.round,
    initiative: request.first,
    visiblePlayerCardId: request.visiblePlayerCardId ?? null,
    player: summarizeFighter(request.player),
    enemy: summarizeFighter(request.enemy),
    legalEnemyMoves: getLegalMoves(request.enemy),
  };
}

function summarizeFighter(fighter: BattleAiFighter) {
  return {
    id: fighter.id,
    name: fighter.name,
    title: fighter.title,
    hp: fighter.hp,
    energy: fighter.energy,
    statuses: fighter.statuses,
    aiProfile: fighter.aiProfile ?? null,
    usedCardIds: fighter.usedCardIds,
    hand: fighter.hand.map((card) => summarizeCard(card, fighter)),
  };
}

function summarizeCard(card: Card, fighter: BattleAiFighter) {
  const playable = !card.used && !fighter.usedCardIds.includes(card.id);

  return {
    id: card.id,
    name: card.name,
    clan: card.clan,
    rarity: card.rarity,
    level: card.level,
    power: card.power,
    damage: card.damage,
    playable,
    bonusActiveFromCurrentHand: isClanBonusActive(fighter, card),
    ability: {
      name: card.ability.name,
      description: card.ability.description,
      effects: card.ability.effects.map(summarizeEffect),
    },
    bonus: {
      name: card.bonus.name,
      description: card.bonus.description,
      effects: card.bonus.effects.map(summarizeEffect),
    },
  };
}

function summarizeEffect(effect: EffectSpec) {
  return {
    key: effect.key,
    ...(effect.amount !== undefined ? { amount: effect.amount } : {}),
    ...(effect.min !== undefined ? { min: effect.min } : {}),
    ...(effect.target ? { target: effect.target } : {}),
    ...(effect.condition ? { condition: effect.condition } : {}),
    ...(effect.outcome ? { outcome: effect.outcome } : {}),
    ...(effect.mode ? { mode: effect.mode } : {}),
    ...(effect.statusKind ? { statusKind: effect.statusKind } : {}),
  };
}

function getLegalMoves(enemy: BattleAiFighter) {
  return enemy.hand
    .filter((card) => !card.used && !enemy.usedCardIds.includes(card.id))
    .map((card) => ({
      cardId: card.id,
      minEnergy: 0,
      maxEnergyWithoutBoost: enemy.energy,
      maxEnergyWithDamageBoost: Math.max(-1, enemy.energy - DAMAGE_BOOST_COST),
      canDamageBoost: enemy.energy >= DAMAGE_BOOST_COST,
    }));
}

function getOpenRouterMessageContent(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

function parseModelMove(content: string): ModelMove {
  try {
    return JSON.parse(content) as ModelMove;
  } catch {
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (!objectMatch) throw new Error("OpenRouter response was not valid JSON.");
    return JSON.parse(objectMatch[0]) as ModelMove;
  }
}

function normalizeModelMove(rawMove: ModelMove, enemy: Fighter, fallback: EnemyMove): EnemyMove {
  const nestedMove = rawMove.move && typeof rawMove.move === "object" ? rawMove.move as ModelMove : rawMove;
  const cardId = typeof nestedMove.cardId === "string" ? nestedMove.cardId.trim() : "";
  const card = enemy.hand.find((item) => item.id === cardId && !item.used && !enemy.usedCardIds.includes(item.id));
  if (!card) return fallback;

  const rawEnergy = typeof nestedMove.energy === "number" && Number.isFinite(nestedMove.energy)
    ? Math.floor(nestedMove.energy)
    : fallback.energy;
  const energy = Math.max(0, Math.min(enemy.energy, rawEnergy));
  const damageBoost = nestedMove.damageBoost === true && energy + DAMAGE_BOOST_COST <= enemy.energy;

  return { card, energy, damageBoost };
}

function toResponse(move: EnemyMove, source: BattleAiMoveResponse["source"], model: string): BattleAiMoveResponse {
  return {
    cardId: move.card.id,
    energy: move.energy,
    damageBoost: Boolean(move.damageBoost),
    source,
    model,
  };
}

function toRuntimeFighter(fighter: BattleAiFighter): Fighter {
  const cardIds = fighter.hand.map((card) => card.id);

  return {
    ...fighter,
    avatarUrl: "",
    collection: { ownerId: fighter.id, cardIds },
    deck: { ownerId: fighter.id, cardIds },
  };
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown OpenRouter error";
}
