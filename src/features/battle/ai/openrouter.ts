import { isClanBonusActive } from "../model/clans";
import { BASE_ATTACK_ENERGY, DAMAGE_BOOST_COST, MAX_ROUNDS } from "../model/constants";
import { chooseEnemyMove, type EnemyMove } from "../model/game";
import type { Card, EffectSpec, Fighter } from "../model/types";
import { DEFAULT_OPENROUTER_MODEL } from "./modelInfo";
import type { BattleAiFighter, BattleAiMoveRequest, BattleAiMoveResponse } from "./publicState";

export { DEFAULT_OPENROUTER_MODEL } from "./modelInfo";
const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 70_000;
const OPENROUTER_REASONING_TOKENS = 5_000;
const OPENROUTER_MAX_TOKENS = 5_000;
const BATTLE_MOVE_TOOL_NAME = "choose_battle_move";

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
    const move = normalizeModelMove(modelMove, enemy);
    return toResponse(move, "openrouter", model);
  } catch (error) {
    console.warn("OpenRouter AI move failed; using emergency local strategy.", getSafeErrorMessage(error));
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
        tools: [buildBattleMoveTool(request.enemy)],
        tool_choice: {
          type: "function",
          function: { name: BATTLE_MOVE_TOOL_NAME },
        },
        parallel_tool_calls: false,
        reasoning: { max_tokens: OPENROUTER_REASONING_TOKENS },
        temperature: 0.2,
        max_tokens: OPENROUTER_MAX_TOKENS,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter returned HTTP ${response.status}`);
    }

    const body = await response.json();
    return getOpenRouterToolMove(body);
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
    "You are the enemy battle AI for Nexus Card Battle.",
    "Call the choose_battle_move tool exactly once. Do not answer with text.",
    "Game overview: each fighter starts with 12 HP and 12 energy, draws a 4-card battle hand, and the match lasts up to 4 rounds unless someone reaches 0 HP earlier.",
    "Each round both sides privately choose one unused card, an energy bid, and optionally a damage boost. Attack is card.power * (energy + 1). Higher attack wins. The winning card deals its damage; damageBoost spends 3 extra energy for +2 damage.",
    "Tie breakers: higher attack wins first; if attack is equal, Enigma beats non-Enigma; if still tied, lower energy bid wins; if still tied, initiative wins.",
    "Hidden information rule: never assume you can see the opponent energy bid or damage boost. If the player moved first, only their selected card is visible. If the enemy moves first, no player card choice is visible yet.",
    "Energy is scarce across the whole match. There is no full refill between rounds. Avoid all-in before the final round unless it wins the match now, prevents lethal damage, or is clearly the only good line.",
    "Avoid bidding 0 energy unless you are deliberately sacrificing the round, saving energy for later, or the chosen card has a useful zero-energy effect. Normal early and middle rounds should usually spend a moderate share of current energy.",
    "Do not counter a visible player card by exactly one hidden energy. Estimate a reasonable range, preserve future energy, and use the card matchup, damage, active abilities, bonuses, HP, round number, and initiative.",
    "Use damageBoost only when +2 damage matters: lethal, preventing a dangerous extra round, or creating a clear HP swing. Otherwise save the 3 energy.",
  ].join("\n");
}

function buildDecisionContext(request: BattleAiMoveRequest) {
  const visiblePlayerCard = request.visiblePlayerCardId
    ? request.player.hand.find((card) => card.id === request.visiblePlayerCardId)
    : undefined;
  const energyPlan = getEnergyPlan(request.enemy.energy, request.round);

  return {
    task: "Choose the enemy move for the current round using the tool call.",
    battleState: {
      round: request.round,
      roundsLeft: energyPlan.roundsLeft,
      initiative: request.first,
      enemyActsFirst: request.first === "enemy",
      visiblePlayerCardId: request.visiblePlayerCardId ?? null,
      visiblePlayerCard: visiblePlayerCard ? summarizeCard(visiblePlayerCard, request.player) : null,
      hiddenInformation: {
        playerEnergyBid: "hidden and not present in this payload",
        playerDamageBoost: "hidden and not present in this payload",
        enemyEnergyBid: "choose privately with the tool call",
      },
    },
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
    strategyGuide: {
      energyPlan,
      priorities: [
        "win immediately if a legal move deals lethal damage without wasting unnecessary energy",
        "avoid losing to visible lethal damage when the player's card is already visible",
        "prefer card and energy combinations that win or narrowly lose while preserving enough energy for remaining rounds",
        "do not spend all current energy early just because it maximizes attack",
        "do not bid 0 energy unless the move is an intentional sacrifice or the card's effect still creates value",
      ],
    },
    player: summarizeFighter(request.player),
    enemy: summarizeFighter(request.enemy),
    legalEnemyMoves: getLegalMoves(request.enemy, request.round),
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

function getLegalMoves(enemy: BattleAiFighter, round: number) {
  const energyPlan = getEnergyPlan(enemy.energy, round);

  return enemy.hand
    .filter((card) => !card.used && !enemy.usedCardIds.includes(card.id))
    .map((card) => ({
      cardId: card.id,
      minEnergy: 0,
      maxEnergyWithoutBoost: enemy.energy,
      maxEnergyWithDamageBoost: enemy.energy >= DAMAGE_BOOST_COST ? enemy.energy - DAMAGE_BOOST_COST : null,
      canDamageBoost: enemy.energy >= DAMAGE_BOOST_COST,
      recommendedEnergyRange: energyPlan.moderateEnergyRange,
      plannedEnergy: energyPlan.plannedEnergy,
      allInEarlyWarning: energyPlan.allInEarlyWarning,
      attackAtPlannedEnergy: card.power * (energyPlan.plannedEnergy + BASE_ATTACK_ENERGY),
      damageWithoutBoost: card.damage,
      damageWithBoost: card.damage + 2,
    }));
}

function getEnergyPlan(energy: number, round: number) {
  const normalizedEnergy = Math.max(0, Math.floor(energy));
  const roundsLeft = Math.max(1, MAX_ROUNDS - round + 1);
  const plannedEnergy = Math.max(0, Math.min(normalizedEnergy, Math.ceil(normalizedEnergy / roundsLeft)));
  const lower = normalizedEnergy === 0 ? 0 : Math.max(1, plannedEnergy - 1);
  const upper = Math.max(lower, Math.min(normalizedEnergy, plannedEnergy + 1));

  return {
    roundsLeft,
    plannedEnergy,
    moderateEnergyRange: [lower, upper] as [number, number],
    allInEarlyWarning: round < MAX_ROUNDS && normalizedEnergy >= 6
      ? "Do not spend all current energy before the final round unless it is lethal, prevents lethal, or is clearly necessary."
      : null,
  };
}

function buildBattleMoveTool(enemy: BattleAiFighter) {
  const legalCardIds = enemy.hand
    .filter((card) => !card.used && !enemy.usedCardIds.includes(card.id))
    .map((card) => card.id);

  return {
    type: "function",
    function: {
      name: BATTLE_MOVE_TOOL_NAME,
      description: "Choose the enemy card, private energy bid, and whether to spend 3 extra energy for +2 damage this round.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          cardId: {
            type: "string",
            enum: legalCardIds,
            description: "The unused enemy card to play. Must be selected even when only one legal card remains.",
          },
          energy: {
            type: "integer",
            minimum: 0,
            maximum: Math.max(0, Math.floor(enemy.energy)),
            description: "Private energy bid for this card. This does not include the 3 energy damageBoost cost.",
          },
          damageBoost: {
            type: "boolean",
            description: "True spends 3 extra energy for +2 damage. Only choose true when energy + 3 <= current enemy energy and the extra damage materially matters.",
          },
        },
        required: ["cardId", "energy", "damageBoost"],
      },
    },
  };
}

function getOpenRouterAssistantMessage(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const first = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  return message;
}

function getOpenRouterToolMove(body: unknown): ModelMove {
  const message = getOpenRouterAssistantMessage(body);
  if (!message) throw new Error("OpenRouter response did not include an assistant message.");
  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(toolCalls)) throw new Error(`OpenRouter response did not include a ${BATTLE_MOVE_TOOL_NAME} tool call.`);

  const toolCall = toolCalls.find((item) => {
    if (!item || typeof item !== "object") return false;
    const fn = (item as { function?: unknown }).function;
    if (!fn || typeof fn !== "object") return false;
    return (fn as { name?: unknown }).name === BATTLE_MOVE_TOOL_NAME;
  });

  if (!toolCall || typeof toolCall !== "object") {
    throw new Error(`OpenRouter response did not include a ${BATTLE_MOVE_TOOL_NAME} tool call.`);
  }

  const fn = (toolCall as { function?: unknown }).function;
  if (!fn || typeof fn !== "object") throw new Error("OpenRouter tool call was malformed.");
  return parseToolArguments((fn as { arguments?: unknown }).arguments);
}

function parseToolArguments(args: unknown): ModelMove {
  if (typeof args === "string") return parseModelMove(args);
  if (args && typeof args === "object") return args as ModelMove;
  throw new Error("OpenRouter tool call did not include JSON arguments.");
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

function normalizeModelMove(rawMove: ModelMove, enemy: Fighter): EnemyMove {
  const nestedMove = rawMove.move && typeof rawMove.move === "object" ? rawMove.move as ModelMove : rawMove;
  const cardId = typeof nestedMove.cardId === "string" ? nestedMove.cardId.trim() : "";
  const card = enemy.hand.find((item) => item.id === cardId && !item.used && !enemy.usedCardIds.includes(item.id));
  if (!card) throw new Error("OpenRouter tool selected an unavailable card.");

  if (typeof nestedMove.energy !== "number" || !Number.isFinite(nestedMove.energy)) {
    throw new Error("OpenRouter tool did not select a numeric energy bid.");
  }

  const rawEnergy = Math.floor(nestedMove.energy);
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
