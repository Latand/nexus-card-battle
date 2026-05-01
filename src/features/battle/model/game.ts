import { DAMAGE_BOOST_COST, MAX_HEALTH } from "./constants";
import { cards } from "./cards";
import type { Card, Fighter, Outcome, Side } from "./types";

export function makeFighter(name: string, title: string, ids: string[]): Fighter {
  return {
    name,
    title,
    health: MAX_HEALTH,
    energy: 12,
    hand: ids.map((id) => cards.find((card) => card.id === id)!),
    used: [],
  };
}

export function score(card: Card, energy: number, first: boolean) {
  let power = card.power;
  let attack = power * (energy + 1);

  if (card.id === "alpha" && energy >= 2) {
    power += 2;
    attack = power * (energy + 1);
  }

  if (card.id === "fury" && first) attack += 8;

  return { attack, damage: card.damage };
}

export function getEnemyPreview(enemy: Fighter, playerHealth: number) {
  const available = enemy.hand.filter((card) => !enemy.used.includes(card.id));
  return (
    available.find((item) => item.damage >= playerHealth) ??
    [...available].sort((a, b) => b.power + b.damage - (a.power + a.damage))[0]
  );
}

function enemyMove(enemy: Fighter, playerHealth: number) {
  const card = getEnemyPreview(enemy, playerHealth);
  const energy = Math.min(enemy.energy, Math.max(0, 2 + Math.floor(Math.random() * 3)));

  return { card, energy };
}

export function resolveRound(
  player: Fighter,
  enemy: Fighter,
  playerCard: Card,
  playerEnergy: number,
  damageBoost: boolean,
  first: Side,
): Outcome {
  const enemyChoice = enemyMove(enemy, player.health);
  const playerScore = score(playerCard, playerEnergy, first === "player");
  const enemyScore = score(enemyChoice.card, enemyChoice.energy, first === "enemy");

  let playerAttack = playerScore.attack;
  let enemyAttack = enemyScore.attack;
  if (playerCard.id === "dahack") enemyAttack = Math.max(0, enemyAttack - 4);
  if (enemyChoice.card.id === "dahack") playerAttack = Math.max(0, playerAttack - 4);

  let winner: Side;
  if (playerAttack === enemyAttack) {
    const bias = playerCard.id === "enigma" ? 0.65 : enemyChoice.card.id === "enigma" ? 0.35 : 0.5;
    winner = Math.random() < bias ? "player" : "enemy";
  } else {
    winner = playerAttack > enemyAttack ? "player" : "enemy";
  }

  let playerDamage = playerScore.damage + (damageBoost ? 2 : 0);
  let enemyDamage = enemyScore.damage;
  if (playerCard.id === "micron" && playerAttack - enemyAttack >= 10) playerDamage += 2;
  if (enemyChoice.card.id === "micron" && enemyAttack - playerAttack >= 10) enemyDamage += 2;

  const nextPlayer: Fighter = {
    ...player,
    energy: Math.max(0, player.energy - playerEnergy - (damageBoost ? DAMAGE_BOOST_COST : 0)),
    used: [...player.used, playerCard.id],
  };
  const nextEnemy: Fighter = {
    ...enemy,
    energy: Math.max(0, enemy.energy - enemyChoice.energy),
    used: [...enemy.used, enemyChoice.card.id],
  };

  const damage = winner === "player" ? playerDamage : enemyDamage;
  if (winner === "player") nextEnemy.health = Math.max(0, nextEnemy.health - damage);
  if (winner === "enemy") nextPlayer.health = Math.max(0, nextPlayer.health - damage);

  if (winner === "enemy" && playerCard.id === "toyz") nextPlayer.energy += 1;
  if (winner === "player" && enemyChoice.card.id === "toyz") nextEnemy.energy += 1;
  if (winner === "enemy" && playerCard.id === "metro") {
    nextPlayer.health = Math.min(MAX_HEALTH, nextPlayer.health + 1);
  }
  if (winner === "player" && enemyChoice.card.id === "metro") {
    nextEnemy.health = Math.min(MAX_HEALTH, nextEnemy.health + 1);
  }

  const winnerCard = winner === "player" ? playerCard : enemyChoice.card;
  const loserName = winner === "player" ? enemy.name : player.name;
  const clash = {
    round: nextPlayer.used.length,
    first,
    playerCard,
    enemyCard: enemyChoice.card,
    playerAttack,
    enemyAttack,
    playerEnergy,
    enemyEnergy: enemyChoice.energy,
    boostedDamage: damageBoost,
    winner,
    damage,
    text: `${winnerCard.name} пробивает ${loserName}: ${damage} урона нанесено`,
  };

  return { clash, nextPlayer, nextEnemy };
}

export function otherSide(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}
