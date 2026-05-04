import { DAMAGE_BOOST_COST } from "../constants";
import type { Card, Clash, Fighter, FighterStatus, Outcome, ResolvedEffect, Side } from "../types";
import { bonusControlEffects, getEffectiveBonusStates } from "./bonusRules";
import {
  applyNumericEffect,
  createEffectLog,
  getEffectTargetSide,
  isOutcomeConditionMet,
  type QueuedEffect,
} from "./effectRules";
import { spendAndUse } from "./fighters";
import { buildRewards, getMatchResult, otherSide } from "./match";
import { chooseEnemyMove, type EnemyMove } from "./opponentStrategy";
import { isAbilityBlocked, score } from "./scoring";

export function resolveRound(
  player: Fighter,
  enemy: Fighter,
  playerCard: Card,
  playerEnergy: number,
  damageBoost: boolean,
  first: Side,
  round: number,
  enemyMove?: EnemyMove,
): Outcome {
  const enemyChoice = enemyMove ?? chooseEnemyMove(enemy, player, round, {
    knownPlayerMove: { card: playerCard, energy: playerEnergy, damageBoost },
    first,
  });
  const { playerBonus, enemyBonus } = getEffectiveBonusStates(player, playerCard, enemy, enemyChoice.card);
  const playerAbilityBlocked = isAbilityBlocked(
    playerCard,
    enemyBonus.active && enemyBonus.bonus.id === "stop-opponent-ability",
    {
      owner: player,
      opponent: enemy,
      opponentCard: enemyChoice.card,
      opponentEnergyBid: enemyChoice.energy,
    },
  );
  const enemyAbilityBlocked = isAbilityBlocked(
    enemyChoice.card,
    playerBonus.active && playerBonus.bonus.id === "stop-opponent-ability",
    {
      owner: enemy,
      opponent: player,
      opponentCard: playerCard,
      opponentEnergyBid: playerEnergy,
    },
  );
  const playerScore = score(playerCard, playerEnergy, first === "player", {
    owner: player,
    opponent: enemy,
    opponentCard: enemyChoice.card,
    opponentEnergyBid: enemyChoice.energy,
    abilityBlocked: playerAbilityBlocked,
    clanBonus: playerBonus,
  });
  const enemyScore = score(enemyChoice.card, enemyChoice.energy, first === "enemy", {
    owner: enemy,
    opponent: player,
    opponentCard: playerCard,
    opponentEnergyBid: playerEnergy,
    abilityBlocked: enemyAbilityBlocked,
    clanBonus: enemyBonus,
  });
  const effects: ResolvedEffect[] = [
    ...bonusControlEffects(playerBonus, enemyBonus),
    ...(playerAbilityBlocked
      ? [{
          id: "stop-opponent-ability",
          source: enemyChoice.card.name,
          label: "- уміння суперника",
          timing: "control" as const,
          stat: "ability" as const,
          target: "player" as Side,
        }]
      : []),
    ...(enemyAbilityBlocked
      ? [{
          id: "stop-opponent-ability",
          source: playerCard.name,
          label: "- уміння суперника",
          timing: "control" as const,
          stat: "ability" as const,
          target: "enemy" as Side,
        }]
      : []),
    ...playerScore.effects,
    ...enemyScore.effects,
  ];

  let playerAttack = playerScore.attack;
  let enemyAttack = enemyScore.attack;

  enemyAttack = applyQueuedNumberEffects(enemyAttack, playerScore.opponentAttackEffects, "enemy", effects, enemyScore.effectiveEnergy);
  playerAttack = applyQueuedNumberEffects(playerAttack, enemyScore.opponentAttackEffects, "player", effects, playerScore.effectiveEnergy);

  const tie = resolveTie({
    playerAttack,
    enemyAttack,
    playerEnergy,
    enemyEnergy: enemyChoice.energy,
    playerCard,
    enemyCard: enemyChoice.card,
    first,
  });

  const winner = tie.winner;
  const loser = otherSide(winner);
  const winnerScore = winner === "player" ? playerScore : enemyScore;
  const loserScore = winner === "player" ? enemyScore : playerScore;
  let damage = winnerScore.damage;
  const winnerCard = winner === "player" ? playerCard : enemyChoice.card;
  const loserCard = winner === "player" ? enemyChoice.card : playerCard;
  const enemyDamageBoost = Boolean(enemyChoice.damageBoost);
  effects.push(...winnerScore.damageEffects.map((effect) => ({ ...effect, target: loser })));

  if (winner === "player" && damageBoost) {
    damage += 2;
    effects.push({ source: playerCard.name, label: "+2 урону за ривок", value: 2, target: "enemy" });
  }

  if (winner === "enemy" && enemyDamageBoost) {
    damage += 2;
    effects.push({ source: enemyChoice.card.name, label: "+2 урону за ривок", value: 2, target: "player" });
  }

  damage = applyQueuedNumberEffects(damage, loserScore.opponentDamageEffects, winner, effects);
  damage = applyMirrorDamageEffects(damage, winnerScore.damageMirrorEffects, winnerCard, loserCard, loser, effects);

  let nextPlayer = spendAndUse(player, playerCard.id, playerEnergy + (damageBoost ? DAMAGE_BOOST_COST : 0));
  let nextEnemy = spendAndUse(enemy, enemyChoice.card.id, enemyChoice.energy + (enemyDamageBoost ? DAMAGE_BOOST_COST : 0));

  if (winner === "player") {
    nextEnemy = { ...nextEnemy, hp: Math.max(0, nextEnemy.hp - damage) };
  } else {
    nextPlayer = { ...nextPlayer, hp: Math.max(0, nextPlayer.hp - damage) };
  }

  ({ nextPlayer, nextEnemy } = applyAfterDamageEffects(nextPlayer, nextEnemy, winner, winner, winnerScore.afterDamageEffects, effects, damage));
  ({ nextPlayer, nextEnemy } = applyAfterDamageEffects(nextPlayer, nextEnemy, loser, winner, loserScore.afterDamageEffects, effects, damage));
  ({ nextPlayer, nextEnemy } = applyEndOfRoundStatuses(nextPlayer, nextEnemy, effects));

  const clash: Clash = {
    round,
    first,
    playerCard,
    enemyCard: enemyChoice.card,
    playerAttack,
    enemyAttack,
    playerEnergy,
    enemyEnergy: enemyChoice.energy,
    boostedDamage: damageBoost || enemyDamageBoost,
    winner,
    loser,
    damage,
    effects,
    tieBreaker: tie.tieBreaker,
    text: `${winnerCard.name} пробиває ${winner === "player" ? enemy.name : player.name}: завдано ${damage} урону`,
  };

  const matchResult = getMatchResult(nextPlayer, nextEnemy, round);
  const rewards = matchResult ? buildRewards(nextPlayer, matchResult) : undefined;

  return { clash, nextPlayer, nextEnemy, matchResult, rewards };
}

function applyQueuedNumberEffects(
  value: number,
  queuedEffects: QueuedEffect[],
  target: Side,
  effects: ResolvedEffect[],
  targetEnergy?: number,
) {
  return queuedEffects.reduce((currentValue, effect) => {
    const nextValue =
      effect.rule.stat === "power" && targetEnergy !== undefined
        ? applyPowerEffectToAttack(currentValue, targetEnergy, effect.rule)
        : applyNumericEffect(currentValue, effect.rule);

    if (nextValue !== currentValue) {
      effects.push(createEffectLog(effect.rule, effect.source, target, nextValue - currentValue));
    }

    return nextValue;
  }, value);
}

function applyPowerEffectToAttack(attack: number, energy: number, rule: QueuedEffect["rule"]) {
  if (energy <= 0) return attack;

  const currentPower = Math.max(0, Math.round(attack / energy));
  const nextPower = applyNumericEffect(currentPower, rule);
  return nextPower * energy;
}

function applyMirrorDamageEffects(
  damage: number,
  queuedEffects: QueuedEffect[],
  winnerCard: Card,
  loserCard: Card,
  loser: Side,
  effects: ResolvedEffect[],
) {
  return queuedEffects.reduce((currentDamage, effect) => {
    const mirroredDamage = loserCard.damage;

    if (mirroredDamage !== currentDamage) {
      effects.push(createEffectLog(effect.rule, winnerCard.name, loser, mirroredDamage - currentDamage));
    }

    return mirroredDamage;
  }, damage);
}

function applyAfterDamageEffects(
  nextPlayer: Fighter,
  nextEnemy: Fighter,
  ownerSide: Side,
  winner: Side,
  queuedEffects: QueuedEffect[],
  effects: ResolvedEffect[],
  damageDealt: number,
) {
  let player = nextPlayer;
  let enemy = nextEnemy;

  for (const effect of queuedEffects) {
    if (!isOutcomeConditionMet(effect.rule, ownerSide, winner)) continue;

    const target = getEffectTargetSide(ownerSide, effect.rule.target);
    const currentFighter = target === "player" ? player : enemy;
    const nextFighter = applyFighterEffect(currentFighter, effect, damageDealt);

    if (nextFighter !== currentFighter) {
      const value = getFighterEffectDelta(currentFighter, nextFighter, effect.rule.stat);
      effects.push(createEffectLog(effect.rule, effect.source, target, value));

      if (target === "player") player = nextFighter;
      if (target === "enemy") enemy = nextFighter;
    }
  }

  return { nextPlayer: player, nextEnemy: enemy };
}

function applyFighterEffect(fighter: Fighter, effect: QueuedEffect, damageDealt: number) {
  const amount = effect.rule.mode === "per_damage" ? (effect.rule.amount ?? 0) * damageDealt : (effect.rule.amount ?? 0);

  if (effect.rule.stat === "status" && effect.rule.statusKind) {
    return addStatus(fighter, {
      id: buildStatusId(effect.rule.statusKind, effect.rule.min),
      kind: effect.rule.statusKind,
      amount,
      min: effect.rule.min,
      source: effect.source,
      stacks: 1,
    });
  }

  if (effect.rule.stat === "hp") {
    const min = effect.rule.min ?? 0;
    const nextHp = amount < 0 && fighter.hp <= min ? fighter.hp : fighter.hp + amount;
    return { ...fighter, hp: Math.max(min, nextHp) };
  }

  if (effect.rule.stat === "energy") {
    const min = effect.rule.min ?? 0;
    const nextEnergy = amount < 0 && fighter.energy <= min ? fighter.energy : fighter.energy + amount;
    return { ...fighter, energy: Math.max(min, nextEnergy) };
  }

  return fighter;
}

function getFighterEffectDelta(before: Fighter, after: Fighter, stat: QueuedEffect["rule"]["stat"]) {
  if (stat === "hp") return after.hp - before.hp;
  if (stat === "energy") return after.energy - before.energy;
  return undefined;
}

function addStatus(fighter: Fighter, status: FighterStatus): Fighter {
  const existing = fighter.statuses.find((item) => item.id === status.id);

  if (!existing) {
    return { ...fighter, statuses: [...fighter.statuses, status] };
  }

  return {
    ...fighter,
    statuses: fighter.statuses.map((item) =>
      item.id === status.id
        ? {
            ...item,
            amount: item.amount + status.amount,
            source: mergeStatusSources(item.source, status.source),
            stacks: item.stacks + status.stacks,
          }
        : item,
    ),
  };
}

function buildStatusId(kind: FighterStatus["kind"], min?: number) {
  return [kind, min ?? "none"].join(":");
}

function mergeStatusSources(current: string, next: string) {
  const sources = new Set(current.split(", ").filter(Boolean));
  sources.add(next);
  return Array.from(sources).join(", ");
}

function applyEndOfRoundStatuses(nextPlayer: Fighter, nextEnemy: Fighter, effects: ResolvedEffect[]) {
  const playerResult = applyStatusTicks(nextPlayer, "player");
  const enemyResult = applyStatusTicks(nextEnemy, "enemy");

  effects.push(...playerResult.effects, ...enemyResult.effects);

  return {
    nextPlayer: playerResult.fighter,
    nextEnemy: enemyResult.fighter,
  };
}

function applyStatusTicks(fighter: Fighter, side: Side) {
  let nextFighter = fighter;
  const effects: ResolvedEffect[] = [];

  for (const status of fighter.statuses) {
    if (nextFighter.hp <= 0) continue;

    const beforeHp = nextFighter.hp;
    const amount = status.amount;

    if (status.kind === "blessing") {
      nextFighter = { ...nextFighter, hp: nextFighter.hp + amount };
    }

    if (status.kind === "poison") {
      const min = status.min ?? 0;
      if (nextFighter.hp > min) {
        nextFighter = { ...nextFighter, hp: Math.max(min, nextFighter.hp - amount) };
      }
    }

    const delta = nextFighter.hp - beforeHp;
    if (delta !== 0) {
      effects.push({
        id: status.id,
        source: status.source,
        label: getStatusTickLabel(status),
        value: delta,
        amount: status.amount,
        min: status.min,
        timing: "after_damage",
        stat: "hp",
        target: side,
      });
    }
  }

  return { fighter: nextFighter, effects };
}

function getStatusTickLabel(status: FighterStatus) {
  if (status.kind === "poison") return `отрута ${status.amount}${status.min !== undefined ? `, мін. ${status.min}` : ""}`;
  return `благословення +${status.amount}`;
}

function resolveTie({
  playerAttack,
  enemyAttack,
  playerEnergy,
  enemyEnergy,
  playerCard,
  enemyCard,
  first,
}: {
  playerAttack: number;
  enemyAttack: number;
  playerEnergy: number;
  enemyEnergy: number;
  playerCard: Card;
  enemyCard: Card;
  first: Side;
}): { winner: Side; tieBreaker?: Clash["tieBreaker"] } {
  if (playerAttack !== enemyAttack) {
    return { winner: playerAttack > enemyAttack ? "player" : "enemy" };
  }

  if (playerCard.id === "enigma" && enemyCard.id !== "enigma") {
    return { winner: "player", tieBreaker: "enigma" };
  }

  if (enemyCard.id === "enigma" && playerCard.id !== "enigma") {
    return { winner: "enemy", tieBreaker: "enigma" };
  }

  if (playerEnergy !== enemyEnergy) {
    return {
      winner: playerEnergy < enemyEnergy ? "player" : "enemy",
      tieBreaker: "lower_energy",
    };
  }

  return { winner: first, tieBreaker: "initiative" };
}
