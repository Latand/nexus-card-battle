import { cards as cardCatalog } from "@/features/battle/model/cards";
import type { Card } from "@/features/battle/model/types";
import {
  STARTER_BOOSTER_CARD_COUNT,
} from "@/features/boosters/types";
import { getOwnedCardIds } from "@/features/inventory/inventoryOps";
import { STARTER_FREE_BOOSTERS, type PlayerProfile } from "@/features/player/profile/types";

export const STARTER_KIT_CARD_COUNT = STARTER_FREE_BOOSTERS * STARTER_BOOSTER_CARD_COUNT;

export const boosterStories: Record<string, string> = {
  "neon-breach":
    "Зламники проти прибульців: вимикай уміння, ламай бонуси і забирай темп ще до першого удару.",
  "factory-shift":
    "Промислові важковаговики проти точних мікрочіпів — груба сила та холодна точність на одному столі.",
  "street-kings":
    "Графіті, гангстери і королі району ділять територію — швидкі удари й тиха диктатура.",
  "carnival-vice":
    "Цирк божевілля та азартний ризик: гостра видовищність, де ставка вирішує бій.",
  "faith-and-fury":
    "Святі проти полум'я гніву — благословіння і палаюча розплата на одному ринзі.",
  biohazard:
    "Симбіоти та девіанти: тіло як зброя, мутація як стратегія, отрута як подих.",
  underworld:
    "Мафія та проклятi мерці тримають районі в страху — корупція й голос з потойбіччя.",
  "mind-games":
    "Псіоніки і загадки: контроль розуму, фінти та шари обману, де ходи — це думки.",
  "toy-factory":
    "Іграшковий жах і альфа-хижаки — від милих ляльок до польових командирів.",
  "metro-chase":
    "Тіні мегаполіса та переслідувачі: швидкий рух у тісному бетоні, постріл у темряві.",
  "desert-signal":
    "Халіфат і Nemos шукають сигнал у пустелі: віра, технологія та довгі шляхи.",
  "street-plague":
    "Вулична небезпека стрічається з епідемією — бруд, хвороба і кулак, що не соромиться.",
};

export function isStarterKitReady(profile: PlayerProfile): boolean {
  return (
    profile.starterFreeBoostersRemaining === 0 &&
    profile.openedBoosterIds.length >= STARTER_FREE_BOOSTERS &&
    getSavedOwnedDeckIds(profile).length >= STARTER_KIT_CARD_COUNT
  );
}

export function getSavedOwnedDeckIds(profile: PlayerProfile): string[] {
  const owned = new Set(getOwnedCardIds(profile.ownedCards));
  const knownIds = new Set(cardCatalog.map((card) => card.id));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of profile.deckIds) {
    if (seen.has(id)) continue;
    if (!knownIds.has(id)) continue;
    if (!owned.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function resolveCards(ids: readonly string[]): Card[] {
  const map = new Map(cardCatalog.map((card) => [card.id, card] as const));
  const out: Card[] = [];
  for (const id of ids) {
    const card = map.get(id);
    if (card) out.push(card);
  }
  return out;
}
