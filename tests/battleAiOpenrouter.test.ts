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

  test("sends hidden-info rules to OpenRouter and normalizes a legal JSON move", async () => {
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
                content: JSON.stringify({ cardId: enemyCard.id, energy: 2, damageBoost: false }),
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

    const body = capturedBody as { messages: Array<{ content: string }>; response_format: { type: string }; reasoning?: { max_tokens: number } };
    const context = JSON.parse(body.messages[1].content) as {
      visiblePlayerCardId: string;
      rules: { hiddenInformation: { playerEnergyBid: string; enemyEnergyBid: string } };
    };

    expect(body.response_format.type).toBe("json_object");
    expect(body.reasoning).toEqual({ max_tokens: 64 });
    expect(context.visiblePlayerCardId).toBe(game.player.hand[0].id);
    expect(context.rules.hiddenInformation.playerEnergyBid).toBe("never provided");
    expect(context.rules.hiddenInformation.enemyEnergyBid).toContain("choose it privately");
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
        timeoutMs: 20_000,
      });
      const availableEnemyCardIds = new Set(game.enemy.hand.map((card) => card.id));

      expect(response.source).toBe("openrouter");
      expect(availableEnemyCardIds.has(response.cardId)).toBe(true);
      expect(response.energy).toBeGreaterThanOrEqual(0);
      expect(response.energy).toBeLessThanOrEqual(game.enemy.energy);
    },
    30_000,
  );
});
