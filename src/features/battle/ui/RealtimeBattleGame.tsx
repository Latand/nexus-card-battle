"use client";

import { BattleGame } from "./BattleGame";

type RealtimeBattleGameProps = {
  playerCollectionIds: string[];
  playerDeckIds: string[];
  playerName?: string;
  onOpenCollection: () => void;
};

export function RealtimeBattleGame({
  playerCollectionIds,
  playerDeckIds,
  playerName,
  onOpenCollection,
}: RealtimeBattleGameProps) {
  return (
    <BattleGame
      playerCollectionIds={playerCollectionIds}
      playerDeckIds={playerDeckIds}
      playerName={playerName}
      mode="human"
      onOpenCollection={onOpenCollection}
    />
  );
}
