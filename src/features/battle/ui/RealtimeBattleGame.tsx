"use client";

import type { TelegramPlayer } from "@/shared/lib/telegram";
import type { PlayerIdentity, PlayerProfile } from "@/features/player/profile/types";
import { BattleGame } from "./BattleGame";

type RealtimeBattleGameProps = {
  playerCollectionIds: string[];
  playerDeckIds: string[];
  playerIdentity?: PlayerIdentity;
  playerName?: string;
  telegramPlayer?: TelegramPlayer;
  avatarUrl?: string;
  onOpenCollection: () => void;
  onSwitchMode?: (mode: "ai" | "human") => void;
  onPlayerUpdated?: (profile: PlayerProfile) => void;
};

export function RealtimeBattleGame({
  playerCollectionIds,
  playerDeckIds,
  playerIdentity,
  playerName,
  telegramPlayer,
  avatarUrl,
  onOpenCollection,
  onSwitchMode,
  onPlayerUpdated,
}: RealtimeBattleGameProps) {
  return (
    <BattleGame
      playerCollectionIds={playerCollectionIds}
      playerDeckIds={playerDeckIds}
      playerIdentity={playerIdentity}
      playerName={playerName}
      telegramPlayer={telegramPlayer}
      avatarUrl={avatarUrl}
      mode="human"
      onOpenCollection={onOpenCollection}
      onSwitchMode={onSwitchMode}
      onPlayerUpdated={onPlayerUpdated}
    />
  );
}
