import { isClanBonusActive } from "../clans";
import type { Bonus, Card, Fighter, ResolvedEffect } from "../types";

export type BonusState = {
  active: boolean;
  bonus: Bonus;
  card: Card;
  copiedFrom?: string;
  blockedBy?: string;
};

export function getEffectiveBonusStates(player: Fighter, playerCard: Card, enemy: Fighter, enemyCard: Card) {
  let playerBonus = getBonusState(player, playerCard, enemyCard);
  let enemyBonus = getBonusState(enemy, enemyCard, playerCard);

  const playerStopsBonus = playerBonus.active && playerBonus.bonus.id === "stop-opponent-bonus";
  const enemyStopsBonus = enemyBonus.active && enemyBonus.bonus.id === "stop-opponent-bonus";

  if (enemyStopsBonus) playerBonus = { ...playerBonus, active: false, blockedBy: enemyCard.name };
  if (playerStopsBonus) enemyBonus = { ...enemyBonus, active: false, blockedBy: playerCard.name };

  return { playerBonus, enemyBonus };
}

function getBonusState(fighter: Fighter, card: Card, opponentCard: Card): BonusState {
  const active = isClanBonusActive(fighter, card);
  const copiedBonus = active && card.bonus.id === "copy-opponent-bonus";

  return {
    active,
    bonus: copiedBonus ? opponentCard.bonus : card.bonus,
    card,
    copiedFrom: copiedBonus ? opponentCard.clan : undefined,
  };
}

export function bonusControlEffects(playerBonus: BonusState, enemyBonus: BonusState): ResolvedEffect[] {
  const effects: ResolvedEffect[] = [];

  if (playerBonus.blockedBy) {
    effects.push({
      id: "stop-opponent-bonus",
      source: playerBonus.blockedBy,
      label: "- бонус суперника",
      timing: "control",
      stat: "bonus",
      target: "player",
    });
  }

  if (enemyBonus.blockedBy) {
    effects.push({
      id: "stop-opponent-bonus",
      source: enemyBonus.blockedBy,
      label: "- бонус суперника",
      timing: "control",
      stat: "bonus",
      target: "enemy",
    });
  }

  if (playerBonus.active && playerBonus.copiedFrom) {
    effects.push({
      id: "copy-opponent-bonus",
      source: playerBonus.card.name,
      label: `хамелеон: ${playerBonus.copiedFrom}`,
      timing: "control",
      stat: "bonus",
      target: "player",
    });
  }

  if (enemyBonus.active && enemyBonus.copiedFrom) {
    effects.push({
      id: "copy-opponent-bonus",
      source: enemyBonus.card.name,
      label: `хамелеон: ${enemyBonus.copiedFrom}`,
      timing: "control",
      stat: "bonus",
      target: "enemy",
    });
  }

  return effects;
}
