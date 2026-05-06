import { cards } from "@/features/battle/model/cards";
import { READABLE_CARD_FRAME_URL } from "@/features/battle/model/cardAssets";
import { clans, type ClanRecord } from "@/features/battle/model/clans";
import type { Bonus, Card, EffectSpec } from "@/features/battle/model/types";

export const GROUP_CARD_RARITY = "Legend" as const;
export const GROUP_CARD_ACCENT = "#f0c431";
const STATIC_CARD_IDS = new Set(cards.map((card) => card.id));
const STATIC_CLAN_NAMES = new Set(Object.keys(clans));
const dynamicCardIds = new Set<string>();
const dynamicClanNames = new Set<string>();

export type GroupIntegrationRecord = {
  chatId: string;
  clan: string;
  boosterId: string;
  displayName: string;
  glyphUrl: string;
  bonus: Bonus;
  cardIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type GroupCardIntegrationRecord = {
  id: string;
  chatId: string;
  creatorTelegramId: string;
  idempotencyKey: string;
  dropWeight: number;
  createdAt: Date;
};

export type GroupCardInput = {
  chatId: string;
  creatorTelegramId: string;
  idempotencyKey: string;
  name: string;
  power: number;
  damage: number;
  ability: {
    id: string;
    name: string;
    description: string;
    effects: EffectSpec[];
  };
  imageUrl: string;
  artUrl: string;
  dropWeight: number;
};

export function groupBoosterId(chatId: string) {
  return `group-${encodeURIComponent(chatId)}`;
}

export function groupCardId(chatId: string, idempotencyKey: string) {
  return `group-${slugPart(chatId)}-${slugPart(idempotencyKey)}`;
}

export function registerGroupRuntime(group: GroupIntegrationRecord) {
  const record: ClanRecord = {
    slug: slugPart(group.chatId),
    name: group.clan,
    sourceUrl: `nexus://integrations/groups/${group.chatId}`,
    logoUrl: group.glyphUrl,
    cardCounts: {
      Common: 0,
      Rare: 0,
      Unique: 0,
      Legend: group.cardIds.length,
    },
    bonus: cloneBonus(group.bonus),
  };

  clans[group.clan] = record;
  if (!STATIC_CLAN_NAMES.has(group.clan)) {
    dynamicClanNames.add(group.clan);
  }
}

export function registerGroupCardRuntime(group: GroupIntegrationRecord, cardInput: GroupCardInput) {
  registerGroupRuntime(group);
  const cardId = groupCardId(cardInput.chatId, cardInput.idempotencyKey);
  const existingIndex = cards.findIndex((card) => card.id === cardId);
  const card = buildGroupCard(group, cardInput);
  if (existingIndex >= 0) {
    cards[existingIndex] = card;
    if (!STATIC_CARD_IDS.has(cardId)) {
      dynamicCardIds.add(cardId);
    }
    return card;
  }

  cards.push(card);
  dynamicCardIds.add(card.id);
  return card;
}

export function hydrateGroupRuntime(groups: readonly GroupIntegrationRecord[], groupCards: readonly GroupCardInput[]) {
  const groupsByChatId = new Map(groups.map((group) => [group.chatId, group] as const));
  for (const group of groups) {
    registerGroupRuntime(group);
  }
  for (const groupCard of groupCards) {
    const group = groupsByChatId.get(groupCard.chatId);
    if (group) {
      registerGroupCardRuntime(group, groupCard);
    }
  }
}

export function resetDynamicIntegrationRuntimeForTests() {
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    if (dynamicCardIds.has(cards[index].id)) {
      cards.splice(index, 1);
    }
  }
  for (const clanName of dynamicClanNames) {
    delete clans[clanName];
  }
  dynamicCardIds.clear();
  dynamicClanNames.clear();
}

export function buildGroupCard(group: GroupIntegrationRecord, input: GroupCardInput): Card {
  const id = groupCardId(input.chatId, input.idempotencyKey);
  return {
    id,
    name: input.name,
    clan: group.clan,
    level: 4,
    power: input.power,
    damage: input.damage,
    ability: {
      ...input.ability,
      effects: input.ability.effects.map((effect) => ({ ...effect })),
    },
    bonus: cloneBonus(group.bonus),
    artUrl: input.artUrl,
    frameUrl: READABLE_CARD_FRAME_URL,
    used: false,
    rarity: GROUP_CARD_RARITY,
    portrait: groupCardPortrait(id),
    accent: GROUP_CARD_ACCENT,
    source: {
      sourceId: stableSourceId(id),
      sourceUrl: `nexus://integrations/group-cards/${id}`,
      sourceArtUrl: input.imageUrl,
      collectible: true,
      abilityText: input.ability.name,
      abilityDescription: input.ability.description,
      bonusText: group.bonus.name,
      bonusDescription: group.bonus.description,
    },
  };
}

function cloneBonus(bonus: Bonus): Bonus {
  return {
    ...bonus,
    effects: bonus.effects.map((effect) => ({ ...effect })),
  };
}

function groupCardPortrait(seed: string) {
  const hue = stableSourceId(seed) % 360;
  return [
    "radial-gradient(circle at 50% 20%, rgba(255,246,210,0.95) 0 8%, transparent 9%)",
    `linear-gradient(145deg, hsl(${hue} 58% 52%), hsl(${(hue + 26) % 360} 46% 32%) 52%, #131319)`,
  ].join(", ");
}

function stableSourceId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function slugPart(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || stableSourceId(value).toString(36);
}
