import type { BonusState } from "./bonusRules";
import { BASE_ATTACK_ENERGY } from "../constants";
import {
  applyNumericEffect,
  createEffectLog,
  instantiateEffectRules,
  type EffectContext,
  isEffectConditionMet,
  type EffectRule,
  type QueuedEffect,
} from "./effectRules";
import type { Card, EffectSpec, Fighter, ResolvedEffect } from "../types";

export type ScoreOptions = {
  owner?: Fighter;
  opponent?: Fighter;
  opponentCard?: Card;
  opponentEnergyBid?: number;
  abilityBlocked?: boolean;
  clanBonus?: BonusState;
};

export type ScoreResult = {
  baseAttack: number;
  attack: number;
  damage: number;
  effectiveEnergy: number;
  effects: ResolvedEffect[];
  damageEffects: ResolvedEffect[];
  opponentAttackEffects: QueuedEffect[];
  opponentDamageEffects: QueuedEffect[];
  afterDamageEffects: QueuedEffect[];
  damageMirrorEffects: QueuedEffect[];
  abilityActive: boolean;
};

export function score(card: Card, energy: number, _first: boolean, options: ScoreOptions = {}): ScoreResult {
  const effects: ResolvedEffect[] = [];
  const damageEffects: ResolvedEffect[] = [];
  const opponentAttackEffects: QueuedEffect[] = [];
  const opponentDamageEffects: QueuedEffect[] = [];
  const afterDamageEffects: QueuedEffect[] = [];
  const damageMirrorEffects: QueuedEffect[] = [];
  const spentEnergy = Math.max(0, energy);
  const effectiveEnergy = spentEnergy + BASE_ATTACK_ENERGY;
  const ownerRemainingEnergy = Math.max(0, (options.owner?.energy ?? 0) - spentEnergy);
  const opponentRemainingEnergy = Math.max(0, (options.opponent?.energy ?? 0) - (options.opponentEnergyBid ?? 0));
  const ownerHp = Math.max(0, options.owner?.hp ?? 0);
  const opponentHp = Math.max(0, options.opponent?.hp ?? 0);
  let power = card.power;
  let damage = card.damage;
  const abilityEffects = getAllowedAbilityEffects(card, options.abilityBlocked);
  const activeRules = getActiveRuleGroups(card, options, abilityEffects);
  const abilityActive = activeRules.abilityRules.length > 0;
  const rules = activeRules.rules;

  for (const effect of rules) {
    const rule = effect.rule;

    if (rule.timing === "before_attack" && rule.target === "self") {
      if (rule.mode === "mirror_opponent_card_power") {
        const nextPower = options.opponentCard?.power ?? power;
        if (nextPower !== power) {
          effects.push(createEffectLog(rule, effect.source, undefined, nextPower - power));
        }
        power = nextPower;
        continue;
      }

      const nextPower = applyNumericEffect(power, rule);
      if (nextPower !== power) {
        effects.push(createEffectLog(rule, effect.source, undefined, nextPower - power));
      }
      power = nextPower;
    }

    if (rule.timing === "before_attack" && rule.target === "opponent" && rule.stat === "power") {
      opponentAttackEffects.push(effect);
    }
  }

  const baseAttack = power * effectiveEnergy;
  let attack = baseAttack;

  for (const effect of rules) {
    const rule = effect.rule;

    if (rule.timing === "attack" && rule.target === "self") {
      const nextAttack = applyScoreEffect(attack, rule, { ownerRemainingEnergy, opponentRemainingEnergy, ownerHp, opponentHp });
      if (nextAttack !== attack) {
        effects.push(createEffectLog(rule, effect.source, undefined, nextAttack - attack));
      }
      attack = nextAttack;
    }

    if (rule.timing === "attack" && rule.target === "opponent") {
      opponentAttackEffects.push(effect);
    }

    if (rule.timing === "damage" && rule.target === "self") {
      if (rule.mode === "mirror_opponent_card_damage") {
        damageMirrorEffects.push(effect);
        continue;
      }

      const nextDamage = applyNumericEffect(damage, rule);
      if (nextDamage !== damage) {
        damageEffects.push(createEffectLog(rule, effect.source, undefined, nextDamage - damage));
      }
      damage = nextDamage;
    }

    if (rule.timing === "damage" && rule.target === "opponent") {
      opponentDamageEffects.push(effect);
    }

    if (rule.timing === "after_damage") {
      afterDamageEffects.push(effect);
    }
  }

  return {
    baseAttack,
    attack,
    damage,
    effectiveEnergy,
    effects,
    damageEffects,
    opponentAttackEffects,
    opponentDamageEffects,
    afterDamageEffects,
    damageMirrorEffects,
    abilityActive,
  };
}

export function hasApplicableAbilityEffect(card: Card, options: ScoreOptions = {}) {
  return getActiveAbilityRules(card, options, card.ability.effects).length > 0;
}

export function isAbilityBlocked(card: Card, blocked?: boolean, options: ScoreOptions = {}) {
  return Boolean(blocked && getActiveAbilityRules(card, options, card.ability.effects).some((rule) => !rule.unblockable));
}

function getAllowedAbilityEffects(card: Card, abilityBlocked?: boolean) {
  return card.ability.effects.filter((effect) => !abilityBlocked || effect.unblockable);
}

function getActiveRuleGroups(card: Card, options: ScoreOptions, abilityEffects: EffectSpec[]) {
  const context = getEffectContext(card, options);
  const bonusEffects = options.clanBonus?.active ? options.clanBonus.bonus.effects : [];
  const bonusRules = instantiateEffectRules(bonusEffects);
  const abilityRules = getActiveAbilityRules(card, options, abilityEffects);
  const handSupportEffects = getActiveHandSupportEffects(card, options);
  const activeBonusRules = bonusRules.filter((rule) => !context || isEffectConditionMet(rule, context));

  return {
    abilityRules,
    rules: [
      ...activeBonusRules.map((rule) => ({ rule, source: getRuleSource(rule, card, activeBonusRules) })),
      ...handSupportEffects,
      ...abilityRules.map((rule) => ({ rule, source: card.name })),
    ] satisfies QueuedEffect[],
  };
}

function getRuleSource(rule: EffectRule, card: Card, bonusRules: EffectRule[]) {
  return bonusRules.includes(rule) ? `${card.name} (${card.clan})` : card.name;
}

function getOpponentCardFallback(opponent: Fighter) {
  return opponent.hand.find((card) => !card.used && !opponent.usedCardIds.includes(card.id)) ?? opponent.hand[0];
}

function getActiveAbilityRules(card: Card, options: ScoreOptions, abilityEffects: EffectSpec[]) {
  const context = getEffectContext(card, options);
  const abilityRules = instantiateEffectRules(abilityEffects);

  return abilityRules.filter((rule) => !context || isEffectConditionMet(rule, context));
}

function getActiveHandSupportEffects(card: Card, options: ScoreOptions): QueuedEffect[] {
  if (!options.owner) return [];

  const context = getEffectContext(card, options);

  return options.owner.hand.flatMap((sourceCard) => {
    if (sourceCard.id === card.id) return [];
    if (sourceCard.clan !== card.clan) return [];
    if (sourceCard.used || options.owner?.usedCardIds.includes(sourceCard.id)) return [];

    const supportEffects = sourceCard.ability.effects.filter(isHandSupportEffect);
    const supportRules = instantiateEffectRules(supportEffects);

    return supportRules
      .filter((rule) => !context || isEffectConditionMet(rule, { ...context, ownerCard: sourceCard }))
      .map((rule) => ({ rule, source: sourceCard.name }));
  });
}

function isHandSupportEffect(effect: EffectSpec) {
  return effect.key === "add-attack-to-clan-hand" || effect.key === "add-power-to-clan-hand";
}

function getEffectContext(card: Card, options: ScoreOptions): EffectContext | undefined {
  if (!options.owner || !options.opponent) return undefined;

  return {
    owner: options.owner,
    opponent: options.opponent,
    ownerCard: card,
    opponentCard: options.opponentCard ?? getOpponentCardFallback(options.opponent),
  };
}

function applyScoreEffect(
  value: number,
  rule: EffectRule,
  scoreContext: {
    ownerRemainingEnergy: number;
    opponentRemainingEnergy: number;
    ownerHp: number;
    opponentHp: number;
  },
) {
  if (rule.mode === "per_owner_energy") return value + (rule.amount ?? 0) * scoreContext.ownerRemainingEnergy;
  if (rule.mode === "per_opponent_energy") return value + (rule.amount ?? 0) * scoreContext.opponentRemainingEnergy;
  if (rule.mode === "per_owner_hp") return value + (rule.amount ?? 0) * scoreContext.ownerHp;
  if (rule.mode === "per_opponent_hp") return value + (rule.amount ?? 0) * scoreContext.opponentHp;
  return applyNumericEffect(value, rule);
}
