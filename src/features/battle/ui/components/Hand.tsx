import { cn } from "@/shared/lib/cn";
import { isClanBonusActive } from "../../model/clans";
import { hasApplicableAbilityEffect } from "../../model/game";
import type { Card, Fighter, Side } from "../../model/types";
import { BattleCard } from "./BattleCard";

export function Hand({
  cards,
  fighter,
  opponent,
  owner,
  active = false,
  selectedId,
  playedCardId,
  winnerCardIds,
  onPick,
  disabled,
}: {
  cards: Card[];
  fighter?: Fighter;
  opponent?: Fighter;
  owner: Side;
  active?: boolean;
  selectedId?: string;
  playedCardId?: string;
  winnerCardIds?: ReadonlySet<string>;
  onPick?: (card: Card) => void;
  disabled?: boolean;
}) {
  const hasPlayedEnemyCard = owner === "enemy" && Boolean(playedCardId);

  return (
    <section
      className={cn(
        "battle-hand",
        owner === "enemy" ? "battle-hand--enemy" : "battle-hand--player",
        "relative z-[6] mx-auto grid grid-cols-4 items-start justify-center gap-2 rounded-md py-2 transition-[box-shadow,filter,transform] duration-500 max-[760px]:gap-1.5",
        owner === "enemy"
          ? "mt-2 w-[min(760px,92vw)] px-3 max-[960px]:w-[min(640px,94vw)] max-[760px]:w-full max-[760px]:px-1"
          : "mt-2 w-[min(790px,94vw)] px-3 max-[960px]:w-[min(700px,96vw)] max-[760px]:w-full max-[760px]:px-1",
        hasPlayedEnemyCard && "pb-8 max-[760px]:pb-6",
        active
          ? owner === "player"
            ? "bg-[#ffd84d]/8 shadow-[0_0_24px_rgba(255,211,62,0.34)]"
            : "bg-[#ff4b42]/8 shadow-[0_0_24px_rgba(255,60,55,0.32)]"
          : "bg-transparent",
      )}
      data-active={active ? "true" : "false"}
      data-owner={owner}
    >
      {cards.map((card) => {
        const isSelected = selectedId === card.id;
        const isPlayed = playedCardId === card.id;
        const isRoundWinner = card.used && Boolean(winnerCardIds?.has(card.id));
        const clanBonusActive = isClanBonusActive({ hand: cards }, card);
        const abilityActive =
          fighter && opponent
            ? hasApplicableAbilityEffect(card, { owner: fighter, opponent })
            : true;
        const state = cn(
          "battle-hand-card",
          "relative z-[1] block border-0 bg-transparent p-0 text-left text-inherit transition-[filter,transform,opacity] duration-500",
          isSelected && owner === "player" && "-translate-y-2 drop-shadow-[0_0_18px_rgba(255,210,58,0.86)]",
          isSelected && owner === "enemy" && "drop-shadow-[0_0_18px_rgba(255,91,84,0.76)]",
          isPlayed && owner === "enemy" && "z-[3] translate-y-6 scale-[1.045] drop-shadow-[0_18px_24px_rgba(255,74,66,0.58)] max-[760px]:translate-y-5",
          card.used && "cursor-not-allowed opacity-35 grayscale",
          !card.used && "cursor-pointer hover:-translate-y-1 hover:drop-shadow-[0_0_12px_rgba(255,220,91,0.5)]",
        );
        const cardFaceClass = "battle-card-face--hand";

        const cardDisabled = Boolean(disabled || card.used);
        const medal = isRoundWinner ? <RoundWinnerMedal /> : null;

        return owner === "player" ? (
          <div
            key={card.id}
            data-testid={`player-card-${card.id}`}
            data-played={isPlayed ? "true" : "false"}
            className={state}
            role="button"
            tabIndex={cardDisabled ? -1 : 0}
            aria-disabled={cardDisabled}
            onClick={() => {
              if (!cardDisabled) onPick?.(card);
            }}
            onKeyDown={(event) => {
              if (cardDisabled || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              onPick?.(card);
            }}
          >
            <BattleCard card={card} clanBonusActive={clanBonusActive} abilityActive={abilityActive} className={cardFaceClass} />
            {medal}
          </div>
        ) : (
          <div
            key={card.id}
            data-testid={`enemy-card-${card.id}`}
            data-played={isPlayed ? "true" : "false"}
            className={state}
          >
            <BattleCard card={card} clanBonusActive={clanBonusActive} abilityActive={abilityActive} className={cardFaceClass} />
            {medal}
          </div>
        );
      })}
    </section>
  );
}

function RoundWinnerMedal() {
  return (
    <span
      className="pointer-events-none absolute right-[-6px] top-[-6px] z-[8] grid aspect-square w-[clamp(20px,3.4vw,32px)] place-items-center rounded-full border-2 border-[#fff1a6] bg-[radial-gradient(circle_at_36%_28%,#fff8bd_0_24%,#ffd64e_25%_58%,#9e6312_59%_100%)] text-[clamp(11px,1.8vw,18px)] font-black leading-none text-[#2a1705] shadow-[0_0_0_2px_rgba(0,0,0,0.72),0_0_14px_rgba(255,216,82,0.7),0_4px_10px_rgba(0,0,0,0.45)] [text-shadow:0_1px_0_rgba(255,255,255,0.55)]"
      aria-label="Карта виграла раунд"
      title="Карта виграла раунд"
    >
      ★
    </span>
  );
}
