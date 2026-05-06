"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@/shared/lib/cn";
import type { Card } from "@/features/battle/model/types";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";

// Cards whose ability or bonus directly boosts damage get a warm-red tint
// so the player can spot heavy-hitters at a glance.
function hasDamageBoost(card: Card): boolean {
  const sources = [...(card.ability?.effects ?? []), ...(card.bonus?.effects ?? [])];
  return sources.some((e) => e.key === "add-damage" && (e.amount ?? 0) > 0);
}

export type BattleHandCard = {
  card: Card;
  used?: boolean;
  roundResult?: "won" | "lost";
  medal?: boolean;
  selectable?: boolean;
  selected?: boolean;
  played?: boolean;
};

export type BattleHandProps = {
  side: "opponent" | "player";
  cards: BattleHandCard[];
  /** Highlight the row (e.g. when it's this side's turn). */
  active?: boolean;
  onSelect?: (cardId: string) => void;
  className?: string;
};

export function BattleHand({ side, cards, active, onSelect, className }: BattleHandProps) {
  const isPlayer = side === "player";
  const handTestId = isPlayer ? "battle-hand-player" : "battle-hand-opponent";

  return (
    <div
      data-testid={handTestId}
      data-side={side}
      data-active={active ? "true" : "false"}
      className={cn(
        "battle-hand",
        isPlayer ? "battle-hand--player" : "battle-hand--enemy",
        "flex w-full items-stretch justify-center gap-1 sm:gap-3 px-1 sm:px-3",
        className,
      )}
    >
      {cards.map(({ card, used, roundResult, medal, selectable, selected, played }) => {
        const interactive = isPlayer && Boolean(onSelect) && Boolean(selectable) && !used;
        const cardDisabled = isPlayer && (used || !selectable);
        const damageBoost = hasDamageBoost(card);
        const handleClick = () => {
          if (interactive) onSelect!(card.id);
        };
        const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
          if (!interactive) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect!(card.id);
          }
        };
        const stateValue = used
          ? roundResult === "won"
            ? "won"
            : roundResult === "lost"
              ? "lost"
              : "used"
          : selected
            ? "selected"
            : played
              ? "played"
              : "idle";

        return (
          <div
            key={card.id}
            data-testid={`${isPlayer ? "player-card" : "enemy-card"}-${card.id}`}
            data-card-id={card.id}
            data-side={side}
            data-state={stateValue}
            role={isPlayer ? "button" : undefined}
            tabIndex={isPlayer ? (cardDisabled ? -1 : 0) : -1}
            aria-pressed={isPlayer ? Boolean(selected) : undefined}
            aria-disabled={isPlayer && cardDisabled ? true : undefined}
            onClick={interactive ? handleClick : undefined}
            onKeyDown={interactive ? handleKey : undefined}
            className={cn(
              "battle-hand-card",
              "relative flex-none w-[min(204px,calc((100vw-20px)/4))] min-w-0 transition-all duration-200 ease-out",
              "outline-none",
              interactive && "cursor-pointer hover:-translate-y-0.5",
              !interactive && isPlayer && "cursor-not-allowed",
              selected && "-translate-y-1",
              played && !isPlayer && "translate-y-2 scale-[1.04] drop-shadow-[0_18px_24px_rgba(255,74,66,0.45)]",
              used && "opacity-35 saturate-50 grayscale pointer-events-none",
            )}
          >
            <div
              data-damage-boost={damageBoost ? "true" : undefined}
              className={cn(
                "rounded-[12px] transition-shadow duration-200",
                selected && "ring-2 ring-accent ring-offset-0",
                damageBoost &&
                  "bg-danger/15 ring-1 ring-danger/40 shadow-[0_0_18px_rgba(217,112,86,0.18)]",
              )}
            >
              <BattleCard card={card} />
            </div>

            {used && roundResult ? (
              <span
                data-testid="battle-card-result"
                data-result={roundResult}
                className={cn(
                  "absolute top-1 right-1 inline-grid place-items-center w-5 h-5 rounded-full text-[10px] font-bold border",
                  roundResult === "won"
                    ? "text-accent border-accent bg-bg/80"
                    : "text-danger border-danger bg-bg/80",
                )}
                aria-label={roundResult === "won" ? "Раунд виграно" : "Раунд програно"}
              >
                {roundResult === "won" ? "✓" : "✕"}
              </span>
            ) : null}

            {medal ? (
              <span
                data-testid="battle-card-medal"
                className="absolute -top-2 -left-2 inline-grid place-items-center w-7 h-7 rounded-full text-2xl leading-none text-[#f0c668] bg-bg/85 border border-[#f0c668] drop-shadow-[0_0_8px_rgba(240,198,104,0.6)]"
                aria-label="Виграш раунду"
              >
                ★
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default BattleHand;
