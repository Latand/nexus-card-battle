import { BASE_ATTACK_ENERGY, MAX_ROUNDS } from "../constants";
import type { Card, Fighter } from "../types";
import { getAvailableCards } from "./fighters";

export type EnemyMove = {
  card: Card;
  energy: number;
};

export function getEnemyPreview(enemy: Fighter, playerHp: number) {
  const available = getAvailableCards(enemy);
  const lethal = available.find((item) => item.damage >= playerHp);

  return (
    lethal ??
    [...available].sort((a, b) => b.power * 2 + b.damage - (a.power * 2 + a.damage))[0]
  );
}

export function chooseEnemyMove(enemy: Fighter, player: Fighter, round: number): EnemyMove {
  const available = getAvailableCards(enemy);
  const roundsLeft = Math.max(1, MAX_ROUNDS - round + 1);
  const plannedEnergy = Math.max(1, Math.ceil(enemy.energy / roundsLeft));
  const energy = Math.min(enemy.energy, Math.min(4, plannedEnergy));

  const card =
    available.find((item) => item.damage >= player.hp) ??
    [...available].sort((a, b) => {
      const effectiveEnergy = energy + BASE_ATTACK_ENERGY;
      return b.power * effectiveEnergy + b.damage * 2 - (a.power * effectiveEnergy + a.damage * 2);
    })[0];

  return { card, energy };
}
