export const MAX_HEALTH = 12;
export const MAX_ENERGY = 12;
export const BASE_ATTACK_ENERGY = 1;
export const MAX_ROUNDS = 4;
export const MIN_DECK_SIZE = 8;
export const BATTLE_HAND_SIZE = 4;
export const EXCHANGE_THROWS_MAX = 4;
export const EXCHANGE_THROWS_MIN = 2;
export const DAMAGE_THROWS_CAP = 12;
export const DAMAGE_BOOST_COST = 3;
export const TURN_SECONDS = 75;

export const PHASE_TIMING_MS = {
  match_intro: 1500,
  round_intro: 1600,
  opponent_turn: 1500,
  battle_intro: 2600,
  round_result: 2300,
  match_result: 2400,
} as const;
