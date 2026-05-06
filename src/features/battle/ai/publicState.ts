import type { Card, Fighter, FighterAiProfile, FighterStatus, GameState, Side } from "../model/types";

export type BattleAiCard = Card;

export type BattleAiFighter = {
  id: string;
  name: string;
  title: string;
  aiProfile?: FighterAiProfile;
  hp: number;
  energy: number;
  statuses: FighterStatus[];
  hand: BattleAiCard[];
  usedCardIds: string[];
};

export type BattleAiMoveRequest = {
  round: number;
  first: Side;
  player: BattleAiFighter;
  enemy: BattleAiFighter;
  visiblePlayerCardId?: string;
};

export type BattleAiMoveResponse = {
  cardId: string;
  energy: number;
  damageBoost: boolean;
  source: "openrouter" | "fallback";
  model?: string;
};

export function createBattleAiMoveRequest(game: GameState, options: { visiblePlayerCard?: Card } = {}): BattleAiMoveRequest {
  return {
    round: game.round.round,
    first: game.first,
    player: toBattleAiFighter(game.player),
    enemy: toBattleAiFighter(game.enemy),
    ...(options.visiblePlayerCard ? { visiblePlayerCardId: options.visiblePlayerCard.id } : {}),
  };
}

export function toBattleAiFighter(fighter: Fighter): BattleAiFighter {
  return {
    id: fighter.id,
    name: fighter.name,
    title: fighter.title,
    ...(fighter.aiProfile ? { aiProfile: fighter.aiProfile } : {}),
    hp: fighter.hp,
    energy: fighter.energy,
    statuses: fighter.statuses.map((status) => ({ ...status })),
    hand: fighter.hand.map(toBattleAiCard),
    usedCardIds: [...fighter.usedCardIds],
  };
}

function toBattleAiCard(card: Card): BattleAiCard {
  return {
    ...card,
    ability: { ...card.ability, effects: card.ability.effects.map((effect) => ({ ...effect })) },
    bonus: { ...card.bonus, effects: card.bonus.effects.map((effect) => ({ ...effect })) },
    source: { ...card.source },
  };
}
