"use client";

import type { TelegramPlayer } from "@/shared/lib/telegram";
import type { PlayerIdentity } from "@/features/player/profile/types";
import { BattleGame } from "./BattleGame";

type RealtimeBattleGameProps = {
  playerCollectionIds: string[];
  playerDeckIds: string[];
  playerIdentity?: PlayerIdentity;
  playerName?: string;
  telegramPlayer?: TelegramPlayer;
  onOpenCollection: () => void;
  onSwitchMode?: (mode: "ai" | "human") => void;
};

export function RealtimeBattleGame({
  playerCollectionIds,
  playerDeckIds,
  playerIdentity,
  playerName,
  telegramPlayer,
  onOpenCollection,
  onSwitchMode,
}: RealtimeBattleGameProps) {
  return (
    <BattleGame
      playerCollectionIds={playerCollectionIds}
      playerDeckIds={playerDeckIds}
      playerIdentity={playerIdentity}
      playerName={playerName}
      telegramPlayer={telegramPlayer}
      mode="human"
      onOpenCollection={onOpenCollection}
      onSwitchMode={onSwitchMode}
    />
  );
}
