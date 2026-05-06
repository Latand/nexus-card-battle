import { describe, expect, test } from "bun:test";
import { chooseOpenRouterBattleAiMove, DEFAULT_OPENROUTER_MODEL } from "../src/features/battle/ai/openrouter";
import { createBattleAiMoveRequest } from "../src/features/battle/ai/publicState";
import { createInitialGame } from "../src/features/battle/model/game";

describe("OpenRouter battle AI", () => {
  test("public AI payload omits hidden round bids while exposing the visible first card", () => {
    const game = createInitialGame();
    const selected = game.player.hand[0];
    const request = createBattleAiMoveRequest(
      {
        ...game,
        round: {
          ...game.round,
          playerCardId: selected.id,
          playerEnergyBid: 9,
          enemyEnergyBid: 8,
        },
      },
      { visiblePlayerCard: selected },
    );

    expect(request.visiblePlayerCardId).toBe(selected.id);
    expect(Object.keys(request)).not.toContain("playerEnergyBid");
    expect(Object.keys(request)).not.toContain("enemyEnergyBid");
    expect(request.round).toBe(game.round.round);
    expect(request.player.energy).toBe(game.player.energy);
    expect(request.enemy.energy).toBe(game.enemy.energy);
  });

  test("falls back to the local strategy when no OpenRouter key is configured", async () => {
    const game = createInitialGame();
    const request = createBattleAiMoveRequest(game, { visiblePlayerCard: game.player.hand[0] });
    const response = await chooseOpenRouterBattleAiMove(request, { apiKey: "" });
    const availableEnemyCardIds = new Set(game.enemy.hand.map((card) => card.id));

    expect(response.source).toBe("fallback");
    expect(response.model).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(availableEnemyCardIds.has(response.cardId)).toBe(true);
    expect(response.energy).toBeGreaterThanOrEqual(0);
    expect(response.energy).toBeLessThanOrEqual(game.enemy.energy);
  });

  test("sends hidden-info rules and a forced move tool to OpenRouter", async () => {
    const game = createInitialGame();
    const enemyCard = game.enemy.hand[0];
    const request = createBattleAiMoveRequest(game, { visiblePlayerCard: game.player.hand[0] });
    let capturedBody: unknown;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_battle_move",
                    type: "function",
                    function: {
                      name: "choose_battle_move",
                      arguments: JSON.stringify({ cardId: enemyCard.id, energy: 2, damageBoost: false }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const response = await chooseOpenRouterBattleAiMove(request, {
      apiKey: "test-openrouter-key",
      fetchImpl,
      model: "test/model",
    });

    expect(response).toEqual({
      cardId: enemyCard.id,
      energy: 2,
      damageBoost: false,
      source: "openrouter",
      model: "test/model",
    });

    const body = capturedBody as {
      messages: Array<{ role: string; content: string }>;
      tools: Array<{
        type: string;
        function: {
          name: string;
          parameters: {
            properties: {
              cardId: { enum: string[] };
              energy: { minimum: number; maximum: number };
              damageBoost: { type: string };
            };
            required: string[];
          };
        };
      }>;
      tool_choice: { type: string; function: { name: string } };
      parallel_tool_calls: boolean;
      response_format?: unknown;
      reasoning?: { max_tokens: number };
      max_tokens?: number;
    };
    const context = JSON.parse(body.messages[1].content) as {
      battleState: { visiblePlayerCardId: string };
      rules: { hiddenInformation: { playerEnergyBid: string; enemyEnergyBid: string } };
      strategyGuide: { energyPlan: { plannedEnergy: number; moderateEnergyRange: [number, number] }; priorities: string[] };
    };

    expect(body.response_format).toBeUndefined();
    expect(body.tools[0].type).toBe("function");
    expect(body.tools[0].function.name).toBe("choose_battle_move");
    expect(body.tools[0].function.parameters.properties.cardId.enum).toContain(enemyCard.id);
    expect(body.tools[0].function.parameters.properties.energy).toMatchObject({ minimum: 0, maximum: game.enemy.energy });
    expect(body.tools[0].function.parameters.properties.damageBoost.type).toBe("boolean");
    expect(body.tools[0].function.parameters.required).toEqual(["cardId", "energy", "damageBoost"]);
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "choose_battle_move" } });
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.reasoning).toEqual({ max_tokens: 5000 });
    expect(body.max_tokens).toBe(5000);
    expect(context.battleState.visiblePlayerCardId).toBe(game.player.hand[0].id);
    expect(context.rules.hiddenInformation.playerEnergyBid).toBe("never provided");
    expect(context.rules.hiddenInformation.enemyEnergyBid).toContain("choose it privately");
    expect(context.strategyGuide.energyPlan.moderateEnergyRange[1]).toBeLessThan(game.enemy.energy);
    expect(context.strategyGuide.priorities.join(" ")).toContain("do not spend all current energy early");
  });

  const openRouterIntegrationTest = process.env.RUN_OPENROUTER_INTEGRATION === "1" ? test : test.skip;

  openRouterIntegrationTest(
    "calls the configured OpenRouter model and returns a legal move",
    async () => {
      const game = createInitialGame();
      const request = createBattleAiMoveRequest(game, { visiblePlayerCard: game.player.hand[0] });
      const response = await chooseOpenRouterBattleAiMove(request, {
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL,
      });
      const availableEnemyCardIds = new Set(game.enemy.hand.map((card) => card.id));

      expect(response.source).toBe("openrouter");
      expect(availableEnemyCardIds.has(response.cardId)).toBe(true);
      expect(response.energy).toBeGreaterThan(0);
      expect(response.energy).toBeLessThan(game.enemy.energy);
    },
    75_000,
  );
});
