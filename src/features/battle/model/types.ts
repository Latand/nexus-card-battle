export type Side = "player" | "enemy";

export type Phase =
  | "match_intro"
  | "round_intro"
  | "player_turn"
  | "card_preview"
  | "opponent_turn"
  | "battle_intro"
  | "damage_apply"
  | "round_result"
  | "match_result"
  | "reward_summary";

export type Rarity = "Common" | "Rare" | "Unique" | "Legend";

export type EffectTiming = "control" | "before_attack" | "attack" | "damage" | "after_damage";
export type EffectStat = "ability" | "bonus" | "power" | "attack" | "damage" | "hp" | "energy" | "status";
export type EffectTarget = "self" | "opponent";
export type EffectCondition = "always" | "owner_hp_below_opponent" | "on_win" | "on_loss";
export type EffectOutcomeCondition = "always" | "on_win" | "on_loss";
export type EffectMode =
  | "add"
  | "reduce_with_min"
  | "mirror_opponent_card_damage"
  | "mirror_opponent_card_power"
  | "per_damage"
  | "per_owner_energy"
  | "per_opponent_energy"
  | "per_owner_hp"
  | "per_opponent_hp";
export type StatusKind = "poison" | "blessing";

export type EffectSpec = {
  key: string;
  id?: string;
  label?: string;
  amount?: number;
  min?: number;
  condition?: EffectCondition;
  outcome?: EffectOutcomeCondition;
  mode?: EffectMode;
  target?: EffectTarget;
  statusKind?: StatusKind;
  unblockable?: boolean;
};

export type Ability = {
  id: string;
  name: string;
  description: string;
  effects: EffectSpec[];
};

export type Bonus = {
  id: string;
  name: string;
  description: string;
  effects: EffectSpec[];
};

export type CardSource = {
  sourceId: number;
  sourceUrl: string;
  sourceArtUrl?: string;
  cost?: number;
  collectible: boolean;
  abilityText: string;
  abilityDescription: string;
  bonusText: string;
  bonusDescription: string;
};

export type Card = {
  id: string;
  name: string;
  clan: string;
  level: number;
  power: number;
  damage: number;
  ability: Ability;
  bonus: Bonus;
  artUrl: string;
  frameUrl: string;
  used: boolean;
  rarity: Rarity;
  portrait: string;
  accent: string;
  source: CardSource;
};

export type CardCollection = {
  ownerId: string;
  cardIds: string[];
};

export type Deck = {
  ownerId: string;
  cardIds: string[];
};

export type FighterStatus = {
  id: string;
  kind: StatusKind;
  amount: number;
  min?: number;
  source: string;
  stacks: number;
};

export type Fighter = {
  id: string;
  name: string;
  title: string;
  avatarUrl: string;
  hp: number;
  energy: number;
  statuses: FighterStatus[];
  collection: CardCollection;
  deck: Deck;
  hand: Card[];
  usedCardIds: string[];
};

export type ResolvedEffect = {
  id?: string;
  source: string;
  label: string;
  value?: number;
  amount?: number;
  min?: number;
  timing?: EffectTiming;
  stat?: EffectStat;
  target?: Side;
};

export type ClashResult = {
  playerAttack: number;
  enemyAttack: number;
  winner: Side;
  loser: Side;
  damage: number;
  effects: ResolvedEffect[];
  tieBreaker?: "lower_energy" | "initiative" | "enigma";
};

export type Clash = ClashResult & {
  round: number;
  first: Side;
  playerCard: Card;
  enemyCard: Card;
  playerEnergy: number;
  enemyEnergy: number;
  boostedDamage: boolean;
  text: string;
};

export type RoundState = {
  round: number;
  playerCardId?: string;
  enemyCardId?: string;
  playerEnergyBid: number;
  enemyEnergyBid: number;
  clash?: Clash;
};

export type MatchResult = "player" | "enemy" | "draw";

export type CardReward = {
  cardId: string;
  cardName: string;
  xp: number;
  levelProgress: number;
};

export type RewardSummaryTotals = {
  crystals: number;
  totalXp: number;
  level: number;
};

export type RewardSummary = {
  matchXp: number;
  levelProgress: number;
  cardRewards: CardReward[];
  // Slice 1 progression fields. Populated by the PvE match-finished endpoint
  // and (in slice 2) by the server-authoritative PvP path. Local PvE/PvP
  // games that still call buildRewards default these to zero/false so the
  // overlay can render safely while progression isn't wired through.
  deltaXp: number;
  deltaCrystals: number;
  leveledUp: boolean;
  levelUpBonusCrystals: number;
  newTotals: RewardSummaryTotals;
};

export type GameState = {
  phase: Phase;
  player: Fighter;
  enemy: Fighter;
  round: RoundState;
  first: Side;
  lastClash?: Clash;
  matchResult?: MatchResult;
  rewards?: RewardSummary;
};

export type Outcome = {
  clash: Clash;
  nextPlayer: Fighter;
  nextEnemy: Fighter;
  matchResult?: MatchResult;
  rewards?: RewardSummary;
};
