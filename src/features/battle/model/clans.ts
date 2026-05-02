// Static Нексус clan database used by the battle prototype.
// Clan records are checked in intentionally; no runtime parser is needed.
import type { Bonus, Card, Rarity } from "./types";

export const rarityAccents: Record<Rarity, string> = {
  Common: "#8f949c",
  Rare: "#c86f2f",
  Unique: "#3278f6",
  Legend: "#f0c431",
};

export type ClanRecord = {
  slug: string;
  name: string;
  sourceUrl: string;
  logoUrl?: string;
  cardCounts: Record<Rarity, number>;
  bonus: Bonus;
};

export const clanList = [
  {
    "slug": "dahack",
    "name": "[Da:Hack]",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/dahack",
    "logoUrl": "http://nexus.ru/images/clans/6/logo.png",
    "cardCounts": {
      "Common": 22,
      "Rare": 16,
      "Unique": 7,
      "Legend": 3
    },
    "bonus": {
      "id": "minus-способность",
      "name": "- способность",
      "description": "Отменяет способность противника.",
      "effects": [
        {
          "key": "stop-ability",
          "target": "opponent"
        }
      ]
    }
  },
  {
    "slug": "aliens",
    "name": "Aliens",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/aliens",
    "logoUrl": "http://nexus.ru/images/clans/2/logo.png",
    "cardCounts": {
      "Common": 27,
      "Rare": 19,
      "Unique": 8,
      "Legend": 3
    },
    "bonus": {
      "id": "minus-бонус",
      "name": "- бонус",
      "description": "Отменяет бонус противника.",
      "effects": [
        {
          "key": "stop-bonus",
          "target": "opponent"
        }
      ]
    }
  },
  {
    "slug": "alpha",
    "name": "Alpha",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/alpha",
    "logoUrl": "http://nexus.ru/images/clans/7/logo.png",
    "cardCounts": {
      "Common": 27,
      "Rare": 18,
      "Unique": 7,
      "Legend": 2
    },
    "bonus": {
      "id": "plus2-силы",
      "name": "+2 силы",
      "description": "Сила увеличивается на 2.",
      "effects": [
        {
          "key": "add-power",
          "amount": 2
        }
      ]
    }
  },
  {
    "slug": "corr",
    "name": "C.O.R.R.",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/corr",
    "logoUrl": "http://nexus.ru/images/clans/20/logo.png",
    "cardCounts": {
      "Common": 48,
      "Rare": 39,
      "Unique": 23,
      "Legend": 6
    },
    "bonus": {
      "id": "бонус-toyz",
      "name": "Бонус Toyz",
      "description": "Копирует бонус клана Toyz, если у владельца карты в руке есть карты Toyz: атака соперника уменьшается на 13, но не ниже 17.",
      "effects": [
        {
          "key": "copy-clan-bonus",
          "copyClan": "Toyz"
        }
      ]
    }
  },
  {
    "slug": "chasers",
    "name": "Chasers",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/chasers",
    "logoUrl": "http://nexus.ru/images/clans/18/logo.png",
    "cardCounts": {
      "Common": 25,
      "Rare": 17,
      "Unique": 7,
      "Legend": 3
    },
    "bonus": {
      "id": "крах-minus2-жизни-мин-2",
      "name": "крах: -2 жизни, мин. 2",
      "description": "Если карта с этой способностью проигрывает раунд, противник теряет 2 ед. жизни. (но не ниже чем 2)",
      "effects": [
        {
          "key": "add-hp",
          "amount": -2,
          "outcome": "on_loss",
          "min": 2,
          "target": "opponent"
        }
      ]
    }
  },
  {
    "slug": "circus",
    "name": "Circus",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/circus",
    "logoUrl": "http://nexus.ru/images/clans/5/logo.png",
    "cardCounts": {
      "Common": 23,
      "Rare": 14,
      "Unique": 8,
      "Legend": 3
    },
    "bonus": {
      "id": "minus8-атаки-мин-3",
      "name": "-8 атаки, мин. 3",
      "description": "Общее количество атаки соперника уменьшается на 8, но не может быть меньше 3. Если соперник имеет 3 или менее атаки, способность не имеет эффекта.",
      "effects": [
        {
          "key": "reduce-attack",
          "amount": -8,
          "min": 3,
          "target": "opponent"
        }
      ]
    }
  },
  {
    "slug": "damned",
    "name": "Damned",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/damned",
    "logoUrl": "http://nexus.ru/images/clans/10/logo.png",
    "cardCounts": {
      "Common": 27,
      "Rare": 20,
      "Unique": 8,
      "Legend": 3
    },
    "bonus": {
      "id": "порча-1",
      "name": "порча 1",
      "description": "Если карта с этой способностью выигрывает раунд, у соперника дополнительно отнимается 1 ед. жизни, а игроку добавляется 1 ед. энергии.",
      "effects": [
        {
          "key": "add-hp",
          "amount": -1,
          "target": "opponent",
          "outcome": "on_win"
        },
        {
          "key": "add-energy",
          "amount": 1,
          "outcome": "on_win"
        }
      ]
    }
  },
  {
    "slug": "deviants",
    "name": "Deviants",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/deviants",
    "logoUrl": "http://nexus.ru/images/clans/9/logo.png",
    "cardCounts": {
      "Common": 27,
      "Rare": 20,
      "Unique": 8,
      "Legend": 3
    },
    "bonus": {
      "id": "minus2-силы-мин-1",
      "name": "-2 силы, мин. 1",
      "description": "Общее количество силы соперника уменьшается на 2, но не может быть меньше 1. Если соперник имеет 1 или менее силы, способность не имеет эффекта.",
      "effects": [
        {
          "key": "reduce-power",
          "amount": -2,
          "min": 1,
          "target": "opponent"
        }
      ]
    }
  },
  {
    "slug": "enigma",
    "name": "Enigma",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/enigma",
    "logoUrl": "http://nexus.ru/images/clans/12/logo.png",
    "cardCounts": {
      "Common": 28,
      "Rare": 17,
      "Unique": 7,
      "Legend": 3
    },
    "bonus": {
      "id": "хамелеон",
      "name": "хамелеон",
      "description": "Бонус карты становится таким же, как и у карты соперника, не зависимо от того, активирован ли бонус вражеской карты.",
      "effects": [
        {
          "key": "copy-bonus"
        }
      ]
    }
  },
  {
    "slug": "fury",
    "name": "Fury",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/fury",
    "logoUrl": "http://nexus.ru/images/clans/8/logo.png",
    "cardCounts": {
      "Common": 27,
      "Rare": 17,
      "Unique": 8,
      "Legend": 3
    },
    "bonus": {
      "id": "plus8-атаки",
      "name": "+8 атаки",
      "description": "Атака увеличивается на 8.",
      "effects": [
        {
          "key": "add-attack",
          "amount": 8
        }
      ]
    }
  },
  {
    "slug": "gamblers",
    "name": "Gamblers",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/gamblers",
    "logoUrl": "http://nexus.ru/images/clans/14/logo.png",
    "cardCounts": {
      "Common": 28,
      "Rare": 18,
      "Unique": 8,
      "Legend": 3
    },
    "bonus": {
      "id": "plus2-энергии-нб",
      "name": "+2 энергии нб",
      "description": "Игрок получает 2 энергии и в случае победы, и в случае поражения. Нельзя заблокировать -бонусом или -способностью.",
      "effects": [
        {
          "key": "add-energy",
          "amount": 2,
          "outcome": "always",
          "unblockable": true
        }
      ]
    }
  },
  {
    "slug": "kingpin",
    "name": "Kingpin",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/kingpin",
    "logoUrl": "http://nexus.ru/images/clans/17/logo.png",
    "cardCounts": {
      "Common": 24,
      "Rare": 19,
      "Unique": 7,
      "Legend": 3
    },
    "bonus": {
      "id": "эхо-plus1-энергии",
      "name": "эхо: +1 энергии",
      "description": "Игрок получает 1 ед. энергии и в случае победы, и в случае поражения.",
      "effects": [
        {
          "key": "add-energy",
          "amount": 1,
          "outcome": "always"
        }
      ]
    }
  },
  {
    "slug": "mafia",
    "name": "Mafia",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/mafia",
    "logoUrl": "http://nexus.ru/images/clans/4/logo.png",
    "cardCounts": {
      "Common": 27,
      "Rare": 19,
      "Unique": 7,
      "Legend": 3
    },
    "bonus": {
      "id": "plus2-яда-мин-2",
      "name": "+2 яда, мин. 2",
      "description": "Если карта с этой способностью выигрывает раунд, на соперника накладывается яд и в конце каждого раунда у соперника отнимается по 2 жизни. Если соперник имеет 1 или менее жизней, яд не действует.",
      "effects": [
        {
          "key": "apply-poison",
          "amount": 2,
          "min": 2,
          "outcome": "on_win"
        }
      ]
    }
  },
  {
    "slug": "metropolis",
    "name": "Metropolis",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/metropolis",
    "logoUrl": "http://nexus.ru/images/clans/13/logo.png",
    "cardCounts": {
      "Common": 28,
      "Rare": 21,
      "Unique": 7,
      "Legend": 3
    },
    "bonus": {
      "id": "minus2-энергии",
      "name": "-2 энергии",
      "description": "Если карта с этой способностью выигрывает раунд, соперник теряет 2 энергии.",
      "effects": [
        {
          "key": "add-energy",
          "amount": -2,
          "outcome": "on_win",
          "target": "opponent"
        }
      ]
    }
  },
  {
    "slug": "micron",
    "name": "Micron",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/micron",
    "logoUrl": "http://nexus.ru/images/clans/1/logo.png",
    "cardCounts": {
      "Common": 27,
      "Rare": 18,
      "Unique": 8,
      "Legend": 2
    },
    "bonus": {
      "id": "plus2-урона",
      "name": "+2 урона",
      "description": "Урон увеличивается на 2.",
      "effects": [
        {
          "key": "add-damage",
          "amount": 2
        }
      ]
    }
  },
  {
    "slug": "nemos",
    "name": "Nemos",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/nemos",
    "logoUrl": "http://nexus.ru/images/clans/26/logo.png",
    "cardCounts": {
      "Common": 15,
      "Rare": 14,
      "Unique": 7,
      "Legend": 2
    },
    "bonus": {
      "id": "plus1-жизнь-нб",
      "name": "+1 жизнь нб",
      "description": "Игрок получает 1 ед. жизни и в случае победы, и в случае поражения. Нельзя заблокировать -бонусом или -способностью.",
      "effects": [
        {
          "key": "add-hp",
          "amount": 1,
          "outcome": "always",
          "unblockable": true
        }
      ]
    }
  },
  {
    "slug": "psi",
    "name": "PSI",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/psi",
    "logoUrl": "http://nexus.ru/images/clans/16/logo.png",
    "cardCounts": {
      "Common": 24,
      "Rare": 18,
      "Unique": 8,
      "Legend": 2
    },
    "bonus": {
      "id": "plus2-жизни-нб",
      "name": "+2 жизни нб",
      "description": "Если карта с этой способностью выигрывает раунд, игрок получает 2 жизни. Нельзя заблокировать -бонусом или -способностью.",
      "effects": [
        {
          "key": "add-hp",
          "amount": 2,
          "outcome": "on_win",
          "unblockable": true
        }
      ]
    }
  },
  {
    "slug": "saints",
    "name": "Saints",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/saints",
    "logoUrl": "http://nexus.ru/images/clans/11/logo.png",
    "cardCounts": {
      "Common": 24,
      "Rare": 19,
      "Unique": 8,
      "Legend": 2
    },
    "bonus": {
      "id": "благословение",
      "name": "благословение",
      "description": "Если карта с этой способностью выигрывает раунд, на владельца карты накладывается благословление и в конце каждого раунда у владельца карты прибавляется по 2 жизни.",
      "effects": [
        {
          "key": "apply-blessing",
          "amount": 2,
          "outcome": "on_win"
        }
      ]
    }
  },
  {
    "slug": "street",
    "name": "Street",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/street",
    "logoUrl": "http://nexus.ru/images/clans/3/logo.png",
    "cardCounts": {
      "Common": 25,
      "Rare": 20,
      "Unique": 7,
      "Legend": 2
    },
    "bonus": {
      "id": "minus2-урона-мин-2",
      "name": "-2 урона, мин. 2",
      "description": "Общее количество урона соперника уменьшается на 2, но не может быть меньше 2. Если соперник имеет 2 или менее урона, способность не имеет эффекта.",
      "effects": [
        {
          "key": "reduce-damage",
          "amount": -2,
          "min": 2,
          "target": "opponent"
        }
      ]
    }
  },
  {
    "slug": "symbio",
    "name": "SymBio",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/symbio",
    "logoUrl": "http://nexus.ru/images/clans/27/logo.png",
    "cardCounts": {
      "Common": 14,
      "Rare": 10,
      "Unique": 6,
      "Legend": 1
    },
    "bonus": {
      "id": "minus3-силы-мин-6",
      "name": "-3 силы, мин. 6",
      "description": "Общее количество силы соперника уменьшается на 3, но не может быть меньше 6. Если соперник имеет 6 или менее силы, способность не имеет эффекта.",
      "effects": [
        {
          "key": "reduce-power",
          "amount": -3,
          "min": 6,
          "target": "opponent"
        }
      ]
    }
  },
  {
    "slug": "toyz",
    "name": "Toyz",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/toyz",
    "logoUrl": "http://nexus.ru/images/clans/21/logo.png",
    "cardCounts": {
      "Common": 21,
      "Rare": 13,
      "Unique": 6,
      "Legend": 1
    },
    "bonus": {
      "id": "minus13-атаки-мин-13",
      "name": "-13 атаки, мин. 13",
      "description": "Общее количество атаки соперника уменьшается на 13, но не может быть меньше 17. Если соперник имеет 17 или менее атаки, способность не имеет эффекта.",
      "effects": [
        {
          "key": "reduce-attack",
          "amount": -13,
          "min": 13,
          "target": "opponent"
        }
      ]
    }
  },
  {
    "slug": "workers",
    "name": "Workers",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/workers",
    "logoUrl": "http://nexus.ru/images/clans/15/logo.png",
    "cardCounts": {
      "Common": 24,
      "Rare": 24,
      "Unique": 7,
      "Legend": 3
    },
    "bonus": {
      "id": "гнев-plus3-урона",
      "name": "гнев: +3 урона",
      "description": "Если жизнь игрока меньше жизни соперника: Урон увеличивается на 3.",
      "effects": [
        {
          "key": "add-damage",
          "amount": 3,
          "condition": "owner_hp_below_opponent"
        }
      ]
    }
  },
  {
    "slug": "caliphate",
    "name": "Халифат",
    "sourceUrl": "https://www.citadel-liga.info/nexus/lib2/caliphate",
    "logoUrl": "http://nexus.ru/images/clans/19/logo.png",
    "cardCounts": {
      "Common": 25,
      "Rare": 20,
      "Unique": 5,
      "Legend": 3
    },
    "bonus": {
      "id": "plus2-энергии",
      "name": "+2 энергии",
      "description": "Если карта с этой способностью выигрывает раунд, игрок получает 2 энергии.",
      "effects": [
        {
          "key": "add-energy",
          "amount": 2,
          "outcome": "on_win"
        }
      ]
    }
  }
] satisfies ClanRecord[];

export const clans = Object.fromEntries(clanList.map((clan) => [clan.name, clan])) as Record<string, ClanRecord>;

export function getClanBonus(clan: string) {
  const clanData = clans[clan];
  if (!clanData) throw new Error(`Unknown clan: ${clan}`);
  return clanData.bonus;
}

export function isClanBonusActive(fighter: { hand: Card[] }, card: Card) {
  return fighter.hand.filter((item) => item.clan === card.clan).length >= 2;
}
