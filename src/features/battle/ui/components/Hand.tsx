import { cn } from "@/shared/lib/cn";
import type { Card, Side } from "../../model/types";
import { BattleCard } from "./BattleCard";

export function Hand({
  cards,
  used,
  owner,
  selectedId,
  onPick,
  disabled,
}: {
  cards: Card[];
  used: string[];
  owner: Side;
  selectedId?: string;
  onPick?: (card: Card) => void;
  disabled?: boolean;
}) {
  return (
    <section
      className={cn(
        "mx-auto grid w-[min(1240px,100%)] grid-cols-4 items-start gap-3 max-[760px]:grid-cols-2 max-[620px]:grid-cols-1",
        owner === "enemy"
          ? "mt-2 scale-[0.82] origin-top max-[760px]:scale-100"
          : "mt-[-20px] scale-[0.86] origin-top max-[760px]:mt-2 max-[760px]:scale-100",
      )}
    >
      {cards.map((card) => {
        const state = cn(
          "block border-0 bg-transparent p-0 text-left text-inherit transition-[filter,transform] duration-150",
          selectedId === card.id && "-translate-y-2 drop-shadow-[0_0_14px_rgba(255,210,102,0.55)]",
          used.includes(card.id) && "cursor-not-allowed opacity-40 grayscale",
          !used.includes(card.id) && "cursor-pointer hover:-translate-y-1",
        );

        return owner === "player" ? (
          <button
            key={card.id}
            data-testid={`player-card-${card.id}`}
            className={state}
            onClick={() => onPick?.(card)}
            disabled={disabled || used.includes(card.id)}
          >
            <BattleCard card={card} />
          </button>
        ) : (
          <div
            key={card.id}
            data-testid={`enemy-card-${card.id}`}
            className={state}
          >
            <BattleCard card={card} />
          </div>
        );
      })}
    </section>
  );
}
