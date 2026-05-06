import { describe, expect, test } from "bun:test";
import { BASE_ATTACK_ENERGY, DAMAGE_BOOST_COST, MAX_ENERGY, MAX_HEALTH } from "../src/features/battle/model/constants";
import { resolveRound } from "../src/features/battle/model/domain/roundResolver";
import type { Bonus, Card, EffectSpec, Fighter, Rarity, Side } from "../src/features/battle/model/types";

const EMPTY_BONUS: Bonus = { id: "none", name: "No bonus", description: "", effects: [] };

describe("battle effect rules", () => {
  test("energy gained per damage uses the final damage after the +2 damage boost", () => {
    const playerCard = makeCard({
      id: "player-drain",
      power: 10,
      damage: 3,
      abilityEffects: [{ key: "add-energy", amount: 1, mode: "per_damage", outcome: "on_win" }],
    });
    const enemyCard = makeCard({ id: "enemy-low", power: 1, damage: 1 });
    const player = makeFighter("player", [playerCard]);
    const enemy = makeFighter("enemy", [enemyCard]);

    const outcome = resolveRound(player, enemy, playerCard, 0, true, "player", 1, {
      card: enemyCard,
      energy: 0,
      damageBoost: false,
    });

    expect(outcome.clash.winner).toBe("player");
    expect(outcome.clash.damage).toBe(5);
    expect(outcome.nextEnemy.hp).toBe(MAX_HEALTH - 5);
    expect(outcome.nextPlayer.energy).toBe(MAX_ENERGY - DAMAGE_BOOST_COST + 5);
    expect(effectValue(outcome.clash.effects, "add-energy")).toBe(5);
  });

  test("+damage ability and manual +2 damage boost stack before damage is applied", () => {
    const playerCard = makeCard({
      id: "player-plus-damage",
      power: 10,
      damage: 3,
      abilityEffects: [{ key: "add-damage", amount: 2 }],
    });
    const enemyCard = makeCard({ id: "enemy-low", power: 1, damage: 1 });
    const player = makeFighter("player", [playerCard]);
    const enemy = makeFighter("enemy", [enemyCard]);

    const outcome = resolveRound(player, enemy, playerCard, 0, true, "player", 1, {
      card: enemyCard,
      energy: 0,
      damageBoost: false,
    });

    expect(outcome.clash.winner).toBe("player");
    expect(outcome.clash.damage).toBe(7);
    expect(outcome.nextEnemy.hp).toBe(MAX_HEALTH - 7);
  });

  test("unblockable ability effects survive both -ability bonus and -ability ability", () => {
    const playerCard = makeCard({
      id: "player-unblockable-energy",
      power: 10,
      damage: 2,
      abilityEffects: [
        { key: "add-damage", amount: 2 },
        { key: "add-energy", amount: 1, mode: "per_damage", outcome: "on_win", unblockable: true },
      ],
    });
    const enemyCard = makeCard({
      id: "enemy-double-stop",
      clan: "StopAbilityClan",
      power: 1,
      damage: 1,
      abilityEffects: [{ key: "stop-ability", target: "opponent" }],
      bonus: makeBonus("stop-ability-bonus", [{ key: "stop-ability", target: "opponent" }]),
    });
    const player = makeFighter("player", [playerCard]);
    const enemy = makeFighter("enemy", [enemyCard, makeCard({ id: "enemy-stop-support", clan: "StopAbilityClan" })]);

    const outcome = resolveRound(player, enemy, playerCard, 0, false, "player", 1, {
      card: enemyCard,
      energy: 0,
      damageBoost: false,
    });

    expect(outcome.clash.winner).toBe("player");
    expect(outcome.clash.damage).toBe(2);
    expect(outcome.nextEnemy.hp).toBe(MAX_HEALTH - 2);
    expect(outcome.nextPlayer.energy).toBe(MAX_ENERGY + 2);
    expect(effectValue(outcome.clash.effects, "add-energy")).toBe(2);
  });

  test("unblockable bonus effects survive an opponent -bonus", () => {
    const playerCard = makeCard({
      id: "player-unblockable-bonus",
      clan: "UnblockableBonusClan",
      power: 1,
      damage: 1,
      bonus: makeBonus("unblockable-energy-bonus", [
        { key: "add-energy", amount: 2, outcome: "always", unblockable: true },
      ]),
    });
    const enemyCard = makeCard({
      id: "enemy-stop-bonus",
      clan: "StopBonusClan",
      power: 10,
      damage: 1,
      bonus: makeBonus("stop-bonus", [{ key: "stop-bonus", target: "opponent" }]),
    });
    const player = makeFighter("player", [playerCard, makeCard({ id: "player-bonus-support", clan: "UnblockableBonusClan" })]);
    const enemy = makeFighter("enemy", [enemyCard, makeCard({ id: "enemy-stop-bonus-support", clan: "StopBonusClan" })]);

    const outcome = resolveRound(player, enemy, playerCard, 0, false, "enemy", 1, {
      card: enemyCard,
      energy: 0,
      damageBoost: false,
    });

    expect(outcome.clash.winner).toBe("enemy");
    expect(outcome.nextPlayer.energy).toBe(MAX_ENERGY + 2);
    expect(effectValue(outcome.clash.effects, "add-energy")).toBe(2);
  });

  test("blockable bonus effects are removed by an opponent -bonus", () => {
    const playerCard = makeCard({
      id: "player-blockable-bonus",
      clan: "BlockableBonusClan",
      power: 1,
      damage: 1,
      bonus: makeBonus("blockable-energy-bonus", [
        { key: "add-energy", amount: 2, outcome: "always" },
      ]),
    });
    const enemyCard = makeCard({
      id: "enemy-stop-bonus-blockable",
      clan: "StopBonusClan",
      power: 10,
      damage: 1,
      bonus: makeBonus("stop-bonus", [{ key: "stop-bonus", target: "opponent" }]),
    });
    const player = makeFighter("player", [playerCard, makeCard({ id: "player-blockable-support", clan: "BlockableBonusClan" })]);
    const enemy = makeFighter("enemy", [enemyCard, makeCard({ id: "enemy-stop-bonus-blockable-support", clan: "StopBonusClan" })]);

    const outcome = resolveRound(player, enemy, playerCard, 0, false, "enemy", 1, {
      card: enemyCard,
      energy: 0,
      damageBoost: false,
    });

    expect(outcome.clash.winner).toBe("enemy");
    expect(outcome.nextPlayer.energy).toBe(MAX_ENERGY);
    expect(effectValue(outcome.clash.effects, "add-energy")).toBeUndefined();
  });

  test("power reduction changes the power component before flat attack bonuses are added", () => {
    const playerEnergy = 2;
    const effectiveEnergy = playerEnergy + BASE_ATTACK_ENERGY;
    const playerCard = makeCard({
      id: "player-power-plus-attack",
      power: 5,
      damage: 1,
      abilityEffects: [{ key: "add-attack", amount: 4 }],
    });
    const enemyCard = makeCard({
      id: "enemy-reduce-power",
      power: 1,
      damage: 1,
      abilityEffects: [{ key: "reduce-power", amount: -2, min: 1, target: "opponent" }],
    });
    const player = makeFighter("player", [playerCard]);
    const enemy = makeFighter("enemy", [enemyCard]);

    const outcome = resolveRound(player, enemy, playerCard, playerEnergy, false, "player", 1, {
      card: enemyCard,
      energy: 0,
      damageBoost: false,
    });

    expect(outcome.clash.playerAttack).toBe((5 - 2) * effectiveEnergy + 4);
  });

  test("extra HP loss after damage is not reduced by -damage effects", () => {
    const playerCard = makeCard({
      id: "player-extra-loss",
      power: 10,
      damage: 3,
      abilityEffects: [{ key: "add-hp", amount: -2, outcome: "on_win", target: "opponent" }],
    });
    const enemyCard = makeCard({
      id: "enemy-reduce-damage",
      power: 1,
      damage: 1,
      abilityEffects: [{ key: "reduce-damage", amount: -2, min: 1, target: "opponent" }],
    });
    const player = makeFighter("player", [playerCard]);
    const enemy = makeFighter("enemy", [enemyCard]);

    const outcome = resolveRound(player, enemy, playerCard, 0, false, "player", 1, {
      card: enemyCard,
      energy: 0,
      damageBoost: false,
    });

    expect(outcome.clash.damage).toBe(1);
    expect(outcome.nextEnemy.hp).toBe(MAX_HEALTH - 1 - 2);
  });
});

function makeCard({
  id,
  clan = "TestClan",
  power = 1,
  damage = 1,
  abilityEffects = [],
  bonus = EMPTY_BONUS,
}: {
  id: string;
  clan?: string;
  power?: number;
  damage?: number;
  abilityEffects?: EffectSpec[];
  bonus?: Bonus;
}): Card {
  return {
    id,
    name: id,
    clan,
    rarity: "Common" as Rarity,
    level: 1,
    power,
    damage,
    ability: { id: `${id}-ability`, name: `${id} ability`, description: "", effects: abilityEffects },
    bonus,
    artUrl: "",
    frameUrl: "",
    used: false,
    portrait: "",
    accent: "",
    source: {
      sourceId: 0,
      sourceUrl: "",
      collectible: true,
      abilityText: "",
      abilityDescription: "",
      bonusText: "",
      bonusDescription: "",
    },
  };
}

function makeBonus(id: string, effects: EffectSpec[]): Bonus {
  return { id, name: id, description: "", effects };
}

function makeFighter(id: Side, hand: Card[]): Fighter {
  const cardIds = hand.map((card) => card.id);

  return {
    id,
    name: id,
    title: "Tester",
    avatarUrl: "",
    hp: MAX_HEALTH,
    energy: MAX_ENERGY,
    statuses: [],
    collection: { ownerId: id, cardIds },
    deck: { ownerId: id, cardIds },
    hand: hand.map((card) => ({ ...card, used: false })),
    usedCardIds: [],
  };
}

function effectValue(effects: Array<{ id?: string; value?: number }>, idIncludes: string) {
  return effects.find((effect) => effect.id?.includes(idIncludes))?.value;
}
