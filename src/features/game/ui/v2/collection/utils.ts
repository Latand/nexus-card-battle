import type { Card } from "@/features/battle/model/types";
import { RARITY_ORDER, type SortMode } from "./types";

export function filterCards(
  pool: Card[],
  query: string,
  faction: string,
  rarity: string,
): Card[] {
  const q = query.trim().toLowerCase();
  return pool.filter((card) => {
    if (faction !== "all" && card.clan !== faction) return false;
    if (rarity !== "all" && card.rarity !== rarity) return false;
    if (!q) return true;
    return (
      card.name.toLowerCase().includes(q) ||
      card.clan.toLowerCase().includes(q) ||
      card.ability.name.toLowerCase().includes(q) ||
      card.bonus.name.toLowerCase().includes(q)
    );
  });
}

export function sortCards(pool: Card[], mode: SortMode): Card[] {
  const next = [...pool];
  switch (mode) {
    case "power":
      next.sort(
        (a, b) =>
          b.power - a.power || b.damage - a.damage || a.name.localeCompare(b.name, "ru"),
      );
      break;
    case "damage":
      next.sort(
        (a, b) =>
          b.damage - a.damage || b.power - a.power || a.name.localeCompare(b.name, "ru"),
      );
      break;
    case "name":
      next.sort((a, b) => a.name.localeCompare(b.name, "ru"));
      break;
    case "rarity":
    default:
      next.sort(
        (a, b) =>
          RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] ||
          b.power + b.damage - (a.power + a.damage) ||
          a.name.localeCompare(b.name, "ru"),
      );
      break;
  }
  return next;
}

export function getDeckStats(deckCards: Card[]): {
  power: string;
  damage: string;
  legends: number;
  factions: number;
} {
  if (deckCards.length === 0) {
    return { power: "0.0", damage: "0.0", legends: 0, factions: 0 };
  }
  const totalPower = deckCards.reduce((sum, c) => sum + c.power, 0);
  const totalDamage = deckCards.reduce((sum, c) => sum + c.damage, 0);
  const factions = new Set(deckCards.map((c) => c.clan)).size;
  const legends = deckCards.filter((c) => c.rarity === "Legend").length;
  return {
    power: (totalPower / deckCards.length).toFixed(1),
    damage: (totalDamage / deckCards.length).toFixed(1),
    legends,
    factions,
  };
}

export function getActiveLinks(deckCards: Card[]): { faction: string; bonus: string }[] {
  const grouped = new Map<string, Card[]>();
  for (const card of deckCards) {
    const list = grouped.get(card.clan) ?? [];
    list.push(card);
    grouped.set(card.clan, list);
  }
  const out: { faction: string; bonus: string }[] = [];
  for (const [faction, list] of grouped) {
    if (list.length >= 2) {
      out.push({ faction, bonus: list[0].bonus.name });
    }
  }
  return out;
}
