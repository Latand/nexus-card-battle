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
  onPick?: (card: Card) => void;
  disabled?: boolean;
}) {
  const hasPlayedEnemyCard = owner === "enemy" && Boolean(playedCardId);

  return (
    <section
      className={cn(
        "battle-hand",
        owner === "enemy" ? "battle-hand--enemy" : "battle-hand--player",
        "relative z-10 mx-auto grid grid-cols-4 items-start justify-center gap-2 rounded-md border-2 py-2 transition-[border-color,background-color,box-shadow,filter,transform] duration-500 max-[760px]:gap-1.5",
        "before:pointer-events-none before:absolute before:inset-1 before:rounded before:border before:border-white/5 before:content-['']",
        owner === "enemy"
          ? "mt-1 w-[min(760px,92vw)] px-3 [article]:min-h-[132px] max-[960px]:w-[min(640px,94vw)] max-[760px]:w-full max-[760px]:px-1 max-[760px]:[article]:min-h-[110px]"
          : "mt-2 w-[min(790px,94vw)] px-3 [article]:min-h-[152px] max-[960px]:w-[min(700px,96vw)] max-[760px]:w-full max-[760px]:px-1 max-[760px]:[article]:min-h-[118px]",
        hasPlayedEnemyCard && "pb-8 max-[760px]:pb-6",
        active
          ? owner === "player"
            ? "border-[#ffd84d]/90 bg-[linear-gradient(180deg,rgba(255,217,69,0.16),rgba(0,0,0,0.18))] shadow-[0_0_24px_rgba(255,211,62,0.48),inset_0_0_24px_rgba(255,211,62,0.12)]"
            : "border-[#ff4b42]/85 bg-[linear-gradient(180deg,rgba(255,63,63,0.15),rgba(0,0,0,0.18))] shadow-[0_0_24px_rgba(255,60,55,0.42),inset_0_0_24px_rgba(255,60,55,0.12)]"
          : "border-[#d6a03b]/24 bg-black/8 shadow-[inset_0_0_18px_rgba(0,0,0,0.28)]",
      )}
      data-active={active ? "true" : "false"}
      data-owner={owner}
    >
      {cards.map((card) => {
        const isSelected = selectedId === card.id;
        const isPlayed = playedCardId === card.id;
        const bonusVisible = isCopyClanBonusResolved(card, cards);
        const clanBonusActive = isClanBonusActive({ hand: cards }, card) && bonusVisible;
        const abilityActive =
          fighter && opponent
            ? hasApplicableAbilityEffect(card, { owner: fighter, opponent })
            : isCopyClanAbilityResolved(card, cards);
        const state = cn(
          "battle-hand-card",
          "relative z-[1] block border-0 bg-transparent p-0 text-left text-inherit transition-[filter,transform,opacity] duration-500",
          isSelected && owner === "player" && "-translate-y-2 drop-shadow-[0_0_18px_rgba(255,210,58,0.86)]",
          isSelected && owner === "enemy" && "drop-shadow-[0_0_18px_rgba(255,91,84,0.76)]",
          isPlayed && owner === "enemy" && "z-[3] translate-y-6 scale-[1.045] drop-shadow-[0_18px_24px_rgba(255,74,66,0.58)] max-[760px]:translate-y-5",
          card.used && "cursor-not-allowed opacity-35 grayscale",
          !card.used && "cursor-pointer hover:-translate-y-1 hover:drop-shadow-[0_0_12px_rgba(255,220,91,0.5)]",
        );

        const cardDisabled = Boolean(disabled || card.used);

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
            <BattleCard card={card} clanBonusActive={clanBonusActive} abilityActive={abilityActive} bonusVisible={bonusVisible} />
          </div>
        ) : (
          <div
            key={card.id}
            data-testid={`enemy-card-${card.id}`}
            data-played={isPlayed ? "true" : "false"}
            className={state}
          >
            <BattleCard card={card} clanBonusActive={clanBonusActive} abilityActive={abilityActive} bonusVisible={bonusVisible} />
          </div>
        );
      })}
    </section>
  );
}

function isCopyClanAbilityResolved(card: Card, hand: Card[]) {
  const copyEffects = card.ability.effects.filter((effect) => effect.key === "copy-clan-bonus");
  if (copyEffects.length === 0) return true;

  return copyEffects.some((effect) => effect.copyClan && hand.some((handCard) => handCard.clan === effect.copyClan));
}

function isCopyClanBonusResolved(card: Card, hand: Card[]) {
  const copyEffects = card.bonus.effects.filter((effect) => effect.key === "copy-clan-bonus");
  if (copyEffects.length === 0) return true;

  return copyEffects.some((effect) => effect.copyClan && hand.some((handCard) => handCard.clan === effect.copyClan));
}
