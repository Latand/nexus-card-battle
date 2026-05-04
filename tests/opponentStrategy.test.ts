import { describe, expect, test } from "bun:test";
import { aiOpponents } from "../src/features/battle/model/loadouts";
import { createInitialGame } from "../src/features/battle/model/game";
import { makeFighter } from "../src/features/battle/model/domain/fighters";
import { findCard } from "../src/features/battle/model/domain/decks";
import { chooseEnemyMove } from "../src/features/battle/model/domain/opponentStrategy";
import type { Card, Fighter } from "../src/features/battle/model/types";

describe("AI opponents", () => {
  test("AI mode exposes ten named opponents with distinct valid decks", () => {
    expect(aiOpponents).toHaveLength(10);
    expect(new Set(aiOpponents.map((opponent) => opponent.id)).size).toBe(10);
    expect(new Set(aiOpponents.map((opponent) => opponent.name)).size).toBe(10);
    expect(new Set(aiOpponents.map((opponent) => opponent.deckIds.join("|"))).size).toBe(10);

    for (const opponent of aiOpponents) {
      expect(opponent.name.trim()).not.toBe("");
      expect(opponent.level).toBeGreaterThanOrEqual(1);
      expect(opponent.deckIds.length).toBeGreaterThanOrEqual(9);
      expect(new Set(opponent.deckIds).size).toBe(opponent.deckIds.length);
      expect(opponent.deckIds.every((cardId) => opponent.collectionIds.includes(cardId))).toBe(true);
      expect(() => createInitialGame({ enemyOpponentId: opponent.id })).not.toThrow();
    }
  });

  test("selected AI opponent is visible in the initial battle state", () => {
    const opponent = aiOpponents[4];
    const game = createInitialGame({ enemyOpponentId: opponent.id });

    expect(game.enemy.name).toBe(opponent.name);
    expect(game.enemy.title).toBe(opponent.title);
    expect(game.enemy.aiProfile?.opponentId).toBe(opponent.id);
    expect(game.enemy.deck.cardIds).toEqual(opponent.deckIds);
  });
});

describe("chooseEnemyMove", () => {
  test("spends beyond the old four-energy cap when analysis says it must beat a known attack", () => {
    const enemy = fighterWithHand("enemy", ["aliens-392", "aliens-88", "aliens-828", "aliens-86"], {
      difficulty: "champion",
      aggression: 0.78,
      riskTolerance: 0.7,
    });
    const player = fighterWithHand("player", ["alpha-630", "alpha-1163", "alpha-473", "alpha-1678"]);
    const playerCard = player.hand[0];

    const move = chooseEnemyMove(enemy, player, 1, {
      knownPlayerMove: { card: playerCard, energy: 5, damageBoost: false },
      first: "player",
    });

    expect(move.energy).toBeGreaterThan(4);
  });

  test("keeps energy low when a cheap response already wins the known clash", () => {
    const enemy = fighterWithHand("enemy", ["alpha-630", "alpha-1163", "alpha-473", "alpha-1678"], {
      difficulty: "elite",
      aggression: 0.5,
      riskTolerance: 0.35,
    });
    const player = fighterWithHand("player", ["metropolis-396", "metropolis-301", "metropolis-1186", "metropolis-497"]);
    const playerCard = player.hand[0];

    const move = chooseEnemyMove(enemy, player, 1, {
      knownPlayerMove: { card: playerCard, energy: 1, damageBoost: false },
      first: "player",
    });

    expect(move.energy).toBeLessThanOrEqual(1);
  });

  test("uses damage boost when it converts a won clash into lethal damage", () => {
    const enemy = fighterWithHand("enemy", ["aliens-392", "aliens-88", "aliens-828", "aliens-86"], {
      difficulty: "champion",
      aggression: 0.85,
      riskTolerance: 0.85,
    });
    const player = {
      ...fighterWithHand("player", ["metropolis-396", "metropolis-301", "metropolis-1186", "metropolis-497"]),
      hp: 9,
    };
    const playerCard = player.hand[0];

    const move = chooseEnemyMove(enemy, player, 1, {
      knownPlayerMove: { card: playerCard, energy: 0, damageBoost: false },
      first: "player",
    });

    expect(move.damageBoost).toBe(true);
  });
});

function fighterWithHand(
  id: "player" | "enemy",
  handIds: string[],
  aiProfile?: Partial<NonNullable<Fighter["aiProfile"]>>,
): Fighter {
  const deckIds = [
    ...handIds,
    ...aiOpponents[0].deckIds.filter((cardId) => !handIds.includes(cardId)),
  ].slice(0, 9);
  const fighter = makeFighter(id, id, "Test", deckIds, deckIds);
  return {
    ...fighter,
    aiProfile: aiProfile
      ? {
          opponentId: "test-ai",
          level: 10,
          difficulty: "veteran",
          style: "balanced",
          aggression: 0.55,
          riskTolerance: 0.45,
          ...aiProfile,
        }
      : undefined,
    hand: handIds.slice(0, 4).map((cardId) => ({ ...findCard(cardId), used: false }) satisfies Card),
  };
}
