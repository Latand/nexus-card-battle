import { describe, expect, test } from "bun:test";
import { cards } from "../src/features/battle/model/cards";
import { DAMAGE_BOOST_COST, MAX_HEALTH } from "../src/features/battle/model/constants";
import { makeFighter } from "../src/features/battle/model/domain/fighters";
import { resolveRound } from "../src/features/battle/model/domain/roundResolver";
import type { Fighter } from "../src/features/battle/model/types";

const DECK_CARDS = cards.slice(0, 9);
const DECK_CARD_IDS = DECK_CARDS.map((card) => card.id);
const HAND_CARDS = DECK_CARDS.slice(0, 4);

function buildPvpFighter(id: "player" | "enemy", energyOverride?: number): Fighter {
  const fighter = makeFighter(id, id, "PvP", DECK_CARD_IDS, DECK_CARD_IDS);
  return {
    ...fighter,
    energy: energyOverride ?? fighter.energy,
    hand: HAND_CARDS.map((card) => ({ ...card, used: false })),
  };
}

describe("resolveRound (per-side damage boost)", () => {
  test("enemy-side boost debits enemy energy by energy + DAMAGE_BOOST_COST", () => {
    const player = buildPvpFighter("player");
    const enemy = buildPvpFighter("enemy");
    const playerEnergyBefore = player.energy;
    const enemyEnergyBefore = enemy.energy;
    const playerCard = player.hand[0];
    const enemyCard = enemy.hand[1];

    const outcome = resolveRound(
      player,
      enemy,
      playerCard,
      0,
      false,
      "player",
      1,
      { card: enemyCard, energy: 4, damageBoost: true },
    );

    expect(outcome.nextEnemy.energy).toBe(enemyEnergyBefore - 4 - DAMAGE_BOOST_COST);
    expect(outcome.nextPlayer.energy).toBe(playerEnergyBefore);
  });

  test("enemy-side boost adds +2 damage when enemy wins the clash", () => {
    const player = buildPvpFighter("player");
    const enemy = buildPvpFighter("enemy");
    const playerCard = player.hand[0];
    const enemyCard = enemy.hand[1];

    const baseline = resolveRound(
      player,
      enemy,
      playerCard,
      0,
      false,
      "enemy",
      1,
      { card: enemyCard, energy: 6, damageBoost: false },
    );
    const boosted = resolveRound(
      player,
      enemy,
      playerCard,
      0,
      false,
      "enemy",
      1,
      { card: enemyCard, energy: 6, damageBoost: true },
    );

    if (baseline.clash.winner !== "enemy" || boosted.clash.winner !== "enemy") {
      throw new Error("Test setup expected the enemy to win; pick different cards if cards.ts changed.");
    }

    expect(boosted.clash.damage).toBe(baseline.clash.damage + 2);
    expect(MAX_HEALTH - boosted.nextPlayer.hp).toBe(boosted.clash.damage);
  });

  test("absent enemy damageBoost flag preserves the existing AI-side semantics", () => {
    const player = buildPvpFighter("player");
    const enemy = buildPvpFighter("enemy");
    const enemyEnergyBefore = enemy.energy;
    const playerCard = player.hand[0];
    const enemyCard = enemy.hand[1];

    const outcome = resolveRound(
      player,
      enemy,
      playerCard,
      0,
      false,
      "player",
      1,
      { card: enemyCard, energy: 3 },
    );

    expect(outcome.nextEnemy.energy).toBe(enemyEnergyBefore - 3);
  });

  test("both sides boosting debits both fighters' energy independently", () => {
    const player = buildPvpFighter("player");
    const enemy = buildPvpFighter("enemy");
    const playerEnergyBefore = player.energy;
    const enemyEnergyBefore = enemy.energy;
    const playerCard = player.hand[0];
    const enemyCard = enemy.hand[1];

    const outcome = resolveRound(
      player,
      enemy,
      playerCard,
      2,
      true,
      "player",
      1,
      { card: enemyCard, energy: 5, damageBoost: true },
    );

    expect(outcome.nextPlayer.energy).toBe(playerEnergyBefore - 2 - DAMAGE_BOOST_COST);
    expect(outcome.nextEnemy.energy).toBe(enemyEnergyBefore - 5 - DAMAGE_BOOST_COST);
  });
});
