import type {
  Card,
  EffectMode,
  EffectOutcomeCondition,
  EffectSpec,
  EffectStat,
  EffectTarget,
  EffectTiming,
  Fighter,
  ResolvedEffect,
  Side,
  StatusKind,
} from "../types";

export type EffectRule = {
  id: string;
  key: string;
  label: string;
  timing: EffectTiming;
  stat: EffectStat;
  target: EffectTarget;
  amount?: number;
  min?: number;
  condition?: EffectSpec["condition"];
  outcome?: EffectOutcomeCondition;
  mode?: EffectMode;
  statusKind?: StatusKind;
  unblockable?: boolean;
};

export type EffectContext = {
  owner: Fighter;
  opponent: Fighter;
  ownerCard: Card;
  opponentCard: Card;
};

export type QueuedEffect = {
  rule: EffectRule;
  source: string;
};

type EffectTemplate = {
  label: string;
  timing: EffectTiming;
  stat: EffectStat;
  target: EffectTarget;
  mode?: EffectMode;
  condition?: EffectSpec["condition"];
  outcome?: EffectOutcomeCondition;
  statusKind?: StatusKind;
};

const effectTemplates: Record<string, EffectTemplate> = {
  "add-attack": {
    label: "{amount:+} атаки",
    timing: "attack",
    stat: "attack",
    target: "self",
  },
  "add-damage": {
    label: "{amount:+} урону",
    timing: "damage",
    stat: "damage",
    target: "self",
  },
  "add-energy": {
    label: "{amount:+} енергії",
    timing: "after_damage",
    stat: "energy",
    target: "self",
  },
  "add-hp": {
    label: "{amount:+} здоров'я",
    timing: "after_damage",
    stat: "hp",
    target: "self",
  },
  "add-power": {
    label: "{amount:+} сили",
    timing: "before_attack",
    stat: "power",
    target: "self",
  },
  "add-attack-per-owner-energy": {
    label: "{amount:+} атаки за енергію",
    timing: "attack",
    stat: "attack",
    target: "self",
    mode: "per_owner_energy",
  },
  "add-attack-per-opponent-energy": {
    label: "{amount:+} атаки за енергію суперника",
    timing: "attack",
    stat: "attack",
    target: "self",
    mode: "per_opponent_energy",
  },
  "add-attack-per-owner-hp": {
    label: "{amount:+} атаки за здоров'я",
    timing: "attack",
    stat: "attack",
    target: "self",
    mode: "per_owner_hp",
  },
  "add-attack-per-opponent-hp": {
    label: "{amount:+} атаки за здоров'я суперника",
    timing: "attack",
    stat: "attack",
    target: "self",
    mode: "per_opponent_hp",
  },
  "add-attack-to-clan-hand": {
    label: "{amount:+} атаки фракції",
    timing: "attack",
    stat: "attack",
    target: "self",
  },
  "add-power-to-clan-hand": {
    label: "{amount:+} сили фракції",
    timing: "before_attack",
    stat: "power",
    target: "self",
  },
  "apply-blessing": {
    label: "благословення {amount:+}",
    timing: "after_damage",
    stat: "status",
    target: "self",
    outcome: "on_win",
    statusKind: "blessing",
  },
  "apply-poison": {
    label: "отрута {amount}, мін. {min}",
    timing: "after_damage",
    stat: "status",
    target: "opponent",
    outcome: "on_win",
    statusKind: "poison",
  },
  "copy-bonus": {
    label: "хамелеон",
    timing: "control",
    stat: "bonus",
    target: "self",
  },
  "rage-attack": {
    label: "{amount:+} атаки за лють",
    timing: "attack",
    stat: "attack",
    target: "self",
    condition: "owner_hp_below_opponent",
  },
  "rage-mirror-damage": {
    label: "урон скопійовано",
    timing: "damage",
    stat: "damage",
    target: "self",
    condition: "owner_hp_below_opponent",
    mode: "mirror_opponent_card_damage",
  },
  "reduce-attack": {
    label: "{amount} атаки суперника",
    timing: "attack",
    stat: "attack",
    target: "opponent",
    mode: "reduce_with_min",
  },
  "reduce-damage": {
    label: "{amount} урону суперника",
    timing: "damage",
    stat: "damage",
    target: "opponent",
    mode: "reduce_with_min",
  },
  "reduce-power": {
    label: "{amount} сили суперника",
    timing: "attack",
    stat: "power",
    target: "opponent",
    mode: "reduce_with_min",
  },
  "stop-ability": {
    label: "- уміння суперника",
    timing: "control",
    stat: "ability",
    target: "opponent",
  },
  "stop-bonus": {
    label: "- бонус суперника",
    timing: "control",
    stat: "bonus",
    target: "opponent",
  },
};

export function instantiateEffectRules(effectSpecs: EffectSpec[]) {
  return effectSpecs.map((spec) => {
    const template = effectTemplates[spec.key];
    if (!template) throw new Error(`Unknown effect template: ${spec.key}`);

    return {
      id: spec.id ?? buildEffectId(spec),
      key: spec.key,
      label: formatEffectLabel(spec.label ?? template.label, spec),
      timing: template.timing,
      stat: template.stat,
      target: spec.target ?? template.target,
      amount: spec.amount,
      min: spec.min,
      condition: normalizeEffectCondition(spec.condition) ?? template.condition,
      outcome: spec.outcome ?? normalizeOutcomeCondition(spec.condition) ?? template.outcome,
      mode: spec.mode ?? template.mode,
      statusKind: spec.statusKind ?? template.statusKind,
      unblockable: spec.unblockable,
    } satisfies EffectRule;
  });
}

export function isEffectConditionMet(rule: EffectRule, context: EffectContext) {
  if (!rule.condition || rule.condition === "always") return true;
  if (rule.condition === "owner_hp_below_opponent") return context.owner.hp < context.opponent.hp;
  return true;
}

export function isOutcomeConditionMet(rule: EffectRule, ownerSide: Side, winner: Side) {
  if (!rule.outcome || rule.outcome === "always") return true;
  if (rule.outcome === "on_win") return ownerSide === winner;
  if (rule.outcome === "on_loss") return ownerSide !== winner;
  return true;
}

export function applyNumericEffect(value: number, rule: EffectRule) {
  if (rule.mode === "reduce_with_min") {
    const min = rule.min ?? 0;
    if (value <= min) return value;
    return Math.max(min, value + (rule.amount ?? 0));
  }

  return value + (rule.amount ?? 0);
}

export function createEffectLog(rule: EffectRule, source: string, target?: Side, value?: number): ResolvedEffect {
  return {
    id: rule.id,
    source,
    label: rule.label,
    value,
    amount: rule.amount,
    min: rule.min,
    timing: rule.timing,
    stat: rule.stat,
    target,
  };
}

export function getEffectTargetSide(ownerSide: Side, target: EffectTarget) {
  if (target === "self") return ownerSide;
  return ownerSide === "player" ? "enemy" : "player";
}

function buildEffectId(spec: EffectSpec) {
  return [
    spec.key,
    spec.amount ?? null,
    spec.min !== undefined ? `min-${spec.min}` : null,
    spec.condition ?? null,
    spec.outcome ?? null,
    spec.statusKind ?? null,
    spec.copyClan ?? null,
    spec.unblockable ? "unblockable" : null,
  ]
    .filter(Boolean)
    .join("-");
}

function formatEffectLabel(template: string, spec: EffectSpec) {
  const amount = spec.amount ?? 0;

  return template
    .replaceAll("{amount:+}", formatSigned(amount))
    .replaceAll("{amount}", String(amount))
    .replaceAll("{min}", String(spec.min ?? 0))
    .replaceAll("{absAmount}", String(Math.abs(amount)));
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function normalizeEffectCondition(condition?: EffectSpec["condition"]) {
  if (condition === "on_win" || condition === "on_loss") return undefined;
  return condition;
}

function normalizeOutcomeCondition(condition?: EffectSpec["condition"]) {
  if (condition === "on_win" || condition === "on_loss") return condition;
  return undefined;
}
