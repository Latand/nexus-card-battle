import type { Card } from "./types";

export const cards: Card[] = [
  {
    id: "alpha",
    clan: "Alpha",
    name: "Верита",
    power: 8,
    damage: 5,
    ability: "благо 1",
    bonus: "+2 силы",
    rarity: "Legend",
    portrait:
      "radial-gradient(circle at 48% 20%, #fff6d1 0 9%, transparent 10%), linear-gradient(155deg, #f7d36a, #b44334 45%, #2b1414)",
    accent: "#f3c44f",
  },
  {
    id: "fury",
    clan: "Fury",
    name: "Рэдлайн",
    power: 7,
    damage: 4,
    ability: "+8 атаки",
    bonus: "+8 атаки",
    rarity: "Rare",
    portrait:
      "radial-gradient(circle at 55% 22%, #ffe2cb 0 8%, transparent 9%), linear-gradient(145deg, #ff7d4b, #8f1f2e 52%, #1d0b10)",
    accent: "#f05b3d",
  },
  {
    id: "micron",
    clan: "Micron",
    name: "Байт-Ведьма",
    power: 5,
    damage: 6,
    ability: "гнев: +2 урон",
    bonus: "+2 урона",
    rarity: "Uniq",
    portrait:
      "radial-gradient(circle at 45% 21%, #dffeff 0 8%, transparent 9%), linear-gradient(145deg, #68f0d2, #1b837d 48%, #101c2a)",
    accent: "#41d6c0",
  },
  {
    id: "dahack",
    clan: "Da:Hack",
    name: "Нулл Кид",
    power: 6,
    damage: 7,
    ability: "- способность",
    bonus: "-4 атаки соп.",
    rarity: "Uniq",
    portrait:
      "radial-gradient(circle at 52% 20%, #f1e9ff 0 8%, transparent 9%), linear-gradient(150deg, #a891ff, #4c338f 52%, #130d27)",
    accent: "#9277ff",
  },
  {
    id: "aliens",
    clan: "Aliens",
    name: "Ззард",
    power: 8,
    damage: 6,
    ability: "урон = урону соп.",
    bonus: "- бонус",
    rarity: "Legend",
    portrait:
      "radial-gradient(circle at 48% 21%, #efffc1 0 8%, transparent 9%), linear-gradient(145deg, #b4e34d, #55762b 48%, #172211)",
    accent: "#a7d94a",
  },
  {
    id: "metro",
    clan: "Metropolis",
    name: "Майкрофт",
    power: 7,
    damage: 4,
    ability: "крах: +1 жизнь",
    bonus: "-2 энергии",
    rarity: "Rare",
    portrait:
      "radial-gradient(circle at 50% 20%, #d9faff 0 8%, transparent 9%), linear-gradient(145deg, #4fd9ff, #255c8d 52%, #111927)",
    accent: "#49bfe8",
  },
  {
    id: "enigma",
    clan: "Enigma",
    name: "Аспид",
    power: 5,
    damage: 5,
    ability: "хамелеон",
    bonus: "ничья: шанс выше",
    rarity: "Rare",
    portrait:
      "radial-gradient(circle at 47% 21%, #ffe7f6 0 8%, transparent 9%), linear-gradient(145deg, #ef82b8, #80335e 52%, #23101d)",
    accent: "#df6aa5",
  },
  {
    id: "toyz",
    clan: "Toyz",
    name: "Чин-Чин",
    power: 4,
    damage: 8,
    ability: "крах: +1 эн",
    bonus: "-13 атаки",
    rarity: "Common",
    portrait:
      "radial-gradient(circle at 52% 20%, #fff3bd 0 8%, transparent 9%), linear-gradient(145deg, #ffd45c, #c17d28 52%, #2a180c)",
    accent: "#ffbf3d",
  },
];

export const playerIds = ["alpha", "fury", "micron", "dahack"];
export const enemyIds = ["aliens", "metro", "enigma", "toyz"];
