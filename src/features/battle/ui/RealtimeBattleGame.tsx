"use client";

import type { TelegramPlayer } from "@/shared/lib/telegram";
import { BattleGame } from "./BattleGame";

type RealtimeBattleGameProps = {
  playerCollectionIds: string[];
  playerDeckIds: string[];
  playerName?: string;
  telegramPlayer?: TelegramPlayer;
  onOpenCollection: () => void;
};

export function RealtimeBattleGame({
  playerCollectionIds,
  playerDeckIds,
  playerName,
  telegramPlayer,
  onOpenCollection,
}: RealtimeBattleGameProps) {
  return (
    <BattleGame
      playerCollectionIds={playerCollectionIds}
      playerDeckIds={playerDeckIds}
      playerName={playerName}
      telegramPlayer={telegramPlayer}
      mode="human"
      onOpenCollection={onOpenCollection}
    />
  );
}
