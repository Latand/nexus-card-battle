export type Side = "player" | "enemy";
export type Phase = "ready" | "exchange" | "damage" | "summary";

export type Card = {
  id: string;
  clan: string;
  name: string;
  power: number;
  damage: number;
  ability: string;
  bonus: string;
  rarity: "Common" | "Rare" | "Uniq" | "Legend";
  portrait: string;
  accent: string;
};

export type Fighter = {
  name: string;
  title: string;
  health: number;
  energy: number;
  hand: Card[];
  used: string[];
};

export type Clash = {
  round: number;
  first: Side;
  playerCard: Card;
  enemyCard: Card;
  playerAttack: number;
  enemyAttack: number;
  playerEnergy: number;
  enemyEnergy: number;
  boostedDamage: boolean;
  winner: Side;
  damage: number;
  text: string;
};

export type Outcome = {
  clash: Clash;
  nextPlayer: Fighter;
  nextEnemy: Fighter;
};
