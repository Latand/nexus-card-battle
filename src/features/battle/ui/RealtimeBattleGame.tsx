"use client";

import { BattleGame } from "./BattleGame";

type RealtimeBattleGameProps = {
  playerCollectionIds: string[];
  playerDeckIds: string[];
  onOpenCollection: () => void;
};

export function RealtimeBattleGame({
  playerCollectionIds,
  playerDeckIds,
  onOpenCollection,
}: RealtimeBattleGameProps) {
  return (
    <BattleGame
      playerCollectionIds={playerCollectionIds}
      playerDeckIds={playerDeckIds}
      onOpenCollection={onOpenCollection}
    />
  );
}
