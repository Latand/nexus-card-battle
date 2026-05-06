import { isClanBonusActive } from "../clans";
import type { Bonus, Card, Fighter, ResolvedEffect } from "../types";

export type BonusState = {
  active: boolean;
  bonus: Bonus;
  card: Card;
  copiedFrom?: string;
  blockedBy?: string;
  stopsAbility: boolean;
};

export function bonusHasEffect(bonus: Bonus, key: string) {
  return bonus.effects.some((effect) => effect.key === key);
}

export function getEffectiveBonusStates(player: Fighter, playerCard: Card, enemy: Fighter, enemyCard: Card) {
  let playerBonus = getBonusState(player, playerCard, enemyCard);
  let enemyBonus = getBonusState(enemy, enemyCard, playerCard);

  // Resolve stop-bonus from BOTH sides simultaneously (use post-copy bonuses
  // so chameleon's copied stop-bonus also cancels). Identify by effect key —
  // legacy bonus.id is unstable Cyrillic.
  const playerStopsBonus = playerBonus.active && bonusHasEffect(playerBonus.bonus, "stop-bonus");
  const enemyStopsBonus = enemyBonus.active && bonusHasEffect(enemyBonus.bonus, "stop-bonus");

  if (enemyStopsBonus) playerBonus = blockBonusEffects(playerBonus, enemyCard.name);
  if (playerStopsBonus) enemyBonus = blockBonusEffects(enemyBonus, playerCard.name);

  return { playerBonus, enemyBonus };
}

function blockBonusEffects(state: BonusState, blockedBy: string): BonusState {
  if (!state.active) return state;

  const effects = state.bonus.effects.filter((effect) => effect.unblockable);
  const removedAny = effects.length !== state.bonus.effects.length;

  if (effects.length === 0) {
    return { ...state, active: false, blockedBy: removedAny ? blockedBy : state.blockedBy, stopsAbility: false };
  }

  return {
    ...state,
    bonus: { ...state.bonus, effects },
    blockedBy: removedAny ? blockedBy : state.blockedBy,
    stopsAbility: bonusHasEffect({ ...state.bonus, effects }, "stop-ability"),
  };
}

function getBonusState(fighter: Fighter, card: Card, opponentCard: Card): BonusState {
  const active = isClanBonusActive(fighter, card);
  const copiedBonus = active && bonusHasEffect(card.bonus, "copy-bonus");
  const bonus = copiedBonus ? opponentCard.bonus : card.bonus;

  return {
    active,
    bonus,
    card,
    copiedFrom: copiedBonus ? opponentCard.clan : undefined,
    stopsAbility: active && bonusHasEffect(bonus, "stop-ability"),
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
