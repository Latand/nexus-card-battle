"use client";

import { useEffect, useState } from "react";
import type { Card, Rarity } from "@/features/battle/model/types";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import type { BoosterResponse } from "@/features/boosters/types";
import { cn } from "@/shared/lib/cn";

const revealRarityPriority: Record<Rarity, number> = {
  Legend: 0,
  Unique: 1,
  Rare: 2,
  Common: 3,
};

function pickDefaultRevealIndex(cards: Card[]): number {
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (!card) continue;
    const score = revealRarityPriority[card.rarity];
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

type BoosterRevealProps = {
  booster: BoosterResponse;
  cards: Card[];
  revealedCount: number;
  continueLabel: string;
  onContinue: () => void;
};

export function BoosterReveal({
  booster,
  cards,
  revealedCount,
  continueLabel,
  onContinue,
}: BoosterRevealProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(() => pickDefaultRevealIndex(cards));
  const totalSlots = cards.length;
  const complete = revealedCount >= totalSlots;
  const activeCard = cards[selectedIndex] ?? cards[0];

  // Re-anchor selection when the card set changes (e.g. opening a new booster
  // returns from reveal → catalog → reveal again).
  useEffect(() => {
    setSelectedIndex(pickDefaultRevealIndex(cards));
  }, [cards]);

  return (
    <section
      data-testid="starter-reveal-shell"
      data-revealed-count={revealedCount}
      className="flex flex-col items-center gap-6 sm:gap-8"
    >
      <ChapterHeading title={booster.name} revealed={revealedCount} total={totalSlots} />

      {activeCard && (
        <div
          data-testid="starter-reveal-active-card"
          data-card-id={activeCard.id}
          className="w-[min(220px,52vw)] sm:w-[min(260px,28vw)]"
        >
          <BattleCard card={activeCard} />
        </div>
      )}

      <div data-testid="starter-reveal-list" className="grid w-full max-w-[720px] grid-cols-5 gap-2 sm:gap-3">
        {cards.map((card, index) => {
          const revealed = index < revealedCount;
          const active = index === selectedIndex;
          return (
            <RevealSlot
              key={`${card.id}-${index}`}
              index={index}
              card={card}
              revealed={revealed}
              active={active}
              onSelect={() => setSelectedIndex(index)}
            />
          );
        })}
      </div>

      {complete && (
        <button
          type="button"
          data-testid="starter-reveal-continue"
          onClick={onContinue}
          className="text-sm uppercase tracking-[0.16em] text-accent hover:brightness-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          {continueLabel}
        </button>
      )}
    </section>
  );
}

function ChapterHeading({
  title,
  revealed,
  total,
}: {
  title: string;
  revealed: number;
  total: number;
}) {
  return (
    <div className="flex w-full max-w-[680px] items-center gap-3 sm:gap-4">
      <span aria-hidden className="h-px flex-1 bg-accent-quiet" />
      <span className="text-xs sm:text-sm uppercase tracking-[0.18em] text-ink-mute whitespace-nowrap">
        {title} · <span className="tabular-nums text-ink">{revealed}/{total}</span>
      </span>
      <span aria-hidden className="h-px flex-1 bg-accent-quiet" />
    </div>
  );
}

type RevealSlotProps = {
  index: number;
  card: Card;
  revealed: boolean;
  active: boolean;
  onSelect: () => void;
};

function RevealSlot({ index, card, revealed, active, onSelect }: RevealSlotProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        data-testid={`starter-reveal-card-${index + 1}`}
        data-card-id={card.id}
        data-active={active}
        aria-pressed={active}
        onClick={onSelect}
        disabled={!revealed}
        className={cn(
          "group relative w-full overflow-hidden rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-accent",
          "aspect-[2/3]",
          active && "ring-1 ring-accent",
        )}
      >
        {revealed ? (
          <BattleCard card={card} className="h-full w-full" />
        ) : (
          <span className="grid h-full w-full place-items-center rounded-md border border-accent-quiet bg-surface text-ink-mute">
            <span className="text-2xl">?</span>
          </span>
        )}
      </button>
      <span
        aria-hidden
        className={cn(
          "text-[11px] leading-none",
          revealed ? "text-ink-mute" : "text-ink-mute/60",
        )}
      >
        {revealed ? "✓" : "?"}
      </span>
    </div>
  );
}

export default BoosterReveal;
