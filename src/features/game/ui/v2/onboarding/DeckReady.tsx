"use client";

import type { Card } from "@/features/battle/model/types";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import type { PlayerProfile } from "@/features/player/profile/types";

type DeckReadyProps = {
  profile: PlayerProfile;
  deckIds: string[];
  cards: Card[];
  openedBoosterCount: number;
  canPlay: boolean;
  onPlayAi: () => void;
  onPlayHuman: () => void;
  onEdit: () => void;
};

export function DeckReady({
  profile,
  deckIds,
  cards,
  openedBoosterCount,
  canPlay,
  onPlayAi,
  onPlayHuman,
  onEdit,
}: DeckReadyProps) {
  const factionCount = new Set(cards.map((card) => card.clan)).size;

  return (
    <section
      data-testid="starter-deck-ready-shell"
      data-card-count={cards.length}
      data-profile-deck-count={profile.deckIds.length}
      data-opened-booster-count={openedBoosterCount}
      className="flex flex-col items-center gap-8 sm:gap-10"
    >
      <h2 className="text-center text-lg sm:text-[22px] font-medium text-ink">
        Колода готова · <span className="tabular-nums">{cards.length}</span> карт ·{" "}
        <span className="tabular-nums">{factionCount}</span> фракції
      </h2>

      <div className="flex w-full flex-wrap items-start justify-center gap-2 sm:gap-3">
        {cards.map((card, index) => (
          <div
            key={`${card.id}-${index}`}
            data-testid={`starter-deck-ready-card-${index + 1}`}
            data-card-id={card.id}
            className="w-[min(96px,22vw)] shrink-0 sm:w-[120px]"
          >
            <BattleCard card={card} />
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          data-testid="starter-deck-ready-play"
          onClick={onPlayAi}
          disabled={!canPlay || deckIds.length === 0}
          className="inline-flex h-14 w-[min(360px,calc(100vw-32px))] items-center justify-center rounded-md border border-accent bg-accent text-sm font-medium uppercase tracking-[0.18em] text-[#1a1408] disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-105 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          ГРАТИ З ШІ
        </button>

        <div className="flex items-center gap-3 text-sm text-ink-mute">
          <button
            type="button"
            data-testid="starter-deck-ready-play-human"
            onClick={onPlayHuman}
            disabled={!canPlay || deckIds.length === 0}
            className="underline-offset-4 hover:text-cool hover:underline disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:underline"
          >
            PvP бій
          </button>
          <span aria-hidden className="text-ink-mute">·</span>
          <button
            type="button"
            data-testid="starter-deck-ready-edit"
            onClick={onEdit}
            disabled={deckIds.length === 0}
            className="underline-offset-4 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:underline"
          >
            Редагувати колоду
          </button>
        </div>
      </div>
    </section>
  );
}

export default DeckReady;
