import { MAX_ROUNDS } from "../constants";
import { enemyCollectionIds, enemyDeckIds, playerCollectionIds, playerDeckIds } from "../loadouts";
import type { Fighter, GameState, MatchResult, Outcome, RewardSummary, Side } from "../types";
import { findCard } from "./decks";
import { getUsedIds, makeFighter } from "./fighters";

export type CreateInitialGameOptions = {
  playerCollectionIds?: string[];
  playerDeckIds?: string[];
  enemyCollectionIds?: string[];
  enemyDeckIds?: string[];
  playerName?: string;
};

export function createInitialGame(options: CreateInitialGameOptions = {}): GameState {
  const nextPlayerCollectionIds = options.playerCollectionIds ?? playerCollectionIds;
  const nextPlayerDeckIds = options.playerDeckIds ?? playerDeckIds;
  const nextEnemyCollectionIds = options.enemyCollectionIds ?? enemyCollectionIds;
  const nextEnemyDeckIds = options.enemyDeckIds ?? enemyDeckIds;
  const playerName = options.playerName?.trim() || "Гравець";

  return {
    phase: "match_intro",
    player: makeFighter("player", playerName, "Лідер вулиці", nextPlayerCollectionIds, nextPlayerDeckIds),
    enemy: makeFighter("enemy", "Суперник", "Гість арени", nextEnemyCollectionIds, nextEnemyDeckIds),
    round: createRound(1),
    first: "player",
  };
}

export function createRound(round: number) {
  return {
    round,
    playerEnergyBid: 0,
    enemyEnergyBid: 0,
  };
}

export function applyOutcome(state: GameState, outcome: Outcome): GameState {
  const nextRoundNumber = Math.min(MAX_ROUNDS, getUsedIds(outcome.nextPlayer).length + 1);

  return {
    ...state,
    phase: outcome.matchResult ? "match_result" : "round_result",
    player: outcome.nextPlayer,
    enemy: outcome.nextEnemy,
    first: otherSide(state.first),
    lastClash: outcome.clash,
    matchResult: outcome.matchResult,
    rewards: outcome.rewards,
    round: {
      round: nextRoundNumber,
      playerCardId: outcome.clash.playerCard.id,
      enemyCardId: outcome.clash.enemyCard.id,
      playerEnergyBid: outcome.clash.playerEnergy,
      enemyEnergyBid: outcome.clash.enemyEnergy,
      clash: outcome.clash,
    },
  };
}

export function startNextRound(state: GameState): GameState {
  const nextRound = Math.min(MAX_ROUNDS, getUsedIds(state.player).length + 1);

  return {
    ...state,
    phase: "round_intro",
    round: createRound(nextRound),
  };
}

export function getMatchResult(player: Fighter, enemy: Fighter, round: number): MatchResult | undefined {
  if (player.hp <= 0 && enemy.hp <= 0) return "draw";
  if (enemy.hp <= 0) return "player";
  if (player.hp <= 0) return "enemy";
  if (round < MAX_ROUNDS) return undefined;
  if (player.hp === enemy.hp) return "draw";
  return player.hp > enemy.hp ? "player" : "enemy";
}

export function buildRewards(player: Fighter, result: MatchResult): RewardSummary {
  const usedCards = getUsedIds(player).map((cardId) => findCard(cardId));
  const resultXp = result === "player" ? 48 : result === "draw" ? 32 : 22;
  const survivalXp = player.hp * 2;
  const matchXp = resultXp + survivalXp;

  return {
    matchXp,
    levelProgress: Math.min(100, 38 + matchXp),
    cardRewards: usedCards.map((card, index) => ({
      cardId: card.id,
      cardName: card.name,
      xp: 8 + card.level * 2 + index,
      levelProgress: Math.min(100, 24 + card.level * 13 + index * 9),
    })),
  };
}

export function otherSide(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}
