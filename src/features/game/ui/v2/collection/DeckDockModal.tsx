"use client";

import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import { PLAYER_DECK_SIZE } from "@/features/game/model/randomDeck";
import type { Card } from "@/features/battle/model/types";
import { cn } from "@/shared/lib/cn";
import Modal from "@/shared/ui/v2/Modal";
import { getActiveLinks, getDeckStats } from "./utils";

export type DeckDockModalProps = {
  open: boolean;
  deckCards: Card[];
  deckIds: string[];
  canEditDeck: boolean;
  canPlay: boolean;
  deckSaveStatus: "idle" | "saving" | "saved" | "error";
  onClose: () => void;
  onRemove: (cardId: string) => void;
  onAutofill: () => void;
  onTrim: () => void;
  onPlay: (mode: "ai" | "human") => void;
};

export function DeckDockModal({
  open,
  deckCards,
  deckIds,
  canEditDeck,
  canPlay,
  deckSaveStatus,
  onClose,
  onRemove,
  onAutofill,
  onTrim,
  onPlay,
}: DeckDockModalProps) {
  const stats = getDeckStats(deckCards);
  const activeLinks = getActiveLinks(deckCards);
  const canRemove = canEditDeck && deckIds.length > PLAYER_DECK_SIZE;
  const canTrim = canEditDeck && deckIds.length > PLAYER_DECK_SIZE;

  return (
    <Modal open={open} onClose={onClose} size="wide" ariaLabel="Колода">
      <div data-testid="deck-dock" className="flex flex-col h-full max-h-[620px] overflow-hidden">
        <header className="shrink-0 flex items-start justify-between px-6 pt-5 pb-3 gap-4">
          <div className="min-w-0">
            <h2 className="text-ink text-[22px] leading-tight">
              Колода · {deckIds.length}/{PLAYER_DECK_SIZE} {deckIds.length >= PLAYER_DECK_SIZE ? "готова" : ""}
            </h2>
            <p className="text-ink-mute text-[12px] mt-1">
              Сила <span className="tabular-nums text-ink">{stats.power}</span>
              {" · "}Урон <span className="tabular-nums text-ink">{stats.damage}</span>
              {" · "}<span className="tabular-nums text-ink">{stats.factions}</span> фракції
              {deckSaveStatus !== "idle" && (
                <>
                  {" · "}
                  <span data-component="deck-dock-save-status" data-status={deckSaveStatus} className="text-ink-mute">
                    {deckSaveStatus === "saving" && "збереження…"}
                    {deckSaveStatus === "saved" && "збережено"}
                    {deckSaveStatus === "error" && "помилка"}
                  </span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="shrink-0 text-ink-mute hover:text-ink h-8 w-8 inline-flex items-center justify-center"
          >
            ✕
          </button>
        </header>
        <div className="px-6">
          <div className="h-px bg-accent-quiet" />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {deckCards.map((card, index) => (
              <DeckSlot
                key={card.id}
                card={card}
                index={index + 1}
                onRemove={canRemove ? () => onRemove(card.id) : undefined}
              />
            ))}
            {Array.from({ length: Math.max(0, PLAYER_DECK_SIZE - deckCards.length) }).map((_, i) => (
              <EmptySlot key={`empty-${i}`} index={deckCards.length + i + 1} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-mute text-[11px] uppercase tracking-[0.16em]">Зв&apos;язки:</span>
            {activeLinks.length === 0 ? (
              <span className="text-ink-mute text-[12px]">Поки що немає (потрібно ≥2 карти однієї фракції)</span>
            ) : (
              activeLinks.map((link) => (
                <span
                  key={link.faction}
                  className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full border border-accent-quiet text-ink-mute text-[11px]"
                >
                  <span className="text-ink">{link.faction}</span>
                  <span className="opacity-60">·</span>
                  <span>{link.bonus}</span>
                </span>
              ))
            )}
          </div>
        </div>
        <footer className="shrink-0 px-6 py-4 border-t border-accent-quiet flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="deck-dock-autofill"
              disabled={!canEditDeck}
              onClick={onAutofill}
              className={cn(
                "inline-flex items-center justify-center px-3 h-9 rounded-md text-[12px] tracking-[0.06em] border transition-colors",
                canEditDeck
                  ? "border-accent-quiet text-ink hover:border-accent"
                  : "border-accent-quiet text-ink-mute cursor-not-allowed",
              )}
            >
              Авто-добір
            </button>
            <button
              type="button"
              data-testid="deck-dock-trim"
              disabled={!canTrim}
              onClick={onTrim}
              className={cn(
                "inline-flex items-center justify-center px-3 h-9 rounded-md text-[12px] tracking-[0.06em] border transition-colors",
                canTrim
                  ? "border-accent-quiet text-ink hover:border-accent"
                  : "border-accent-quiet text-ink-mute cursor-not-allowed",
              )}
            >
              Очистити
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="deck-dock-play-ai"
              disabled={!canPlay}
              onClick={() => onPlay("human")}
              className={cn(
                "inline-flex items-center justify-center px-5 h-9 rounded-md text-[12px] font-medium tracking-[0.16em] uppercase border transition-colors",
                canPlay
                  ? "bg-accent border-accent text-[#1a1408] hover:brightness-105"
                  : "bg-accent/30 border-accent-quiet text-[#1a1408]/60 cursor-not-allowed",
              )}
            >
              НА АРЕНУ
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function DeckSlot({
  card,
  index,
  onRemove,
}: {
  card: Card;
  index: number;
  onRemove?: () => void;
}) {
  return (
    <article
      data-testid={`deck-dock-card-${index}`}
      data-card-id={card.id}
      className="relative shrink-0 w-[110px]"
    >
      <BattleCard card={card} />
      <span
        className="absolute top-1 left-1 z-10 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded bg-bg/85 border border-accent text-accent text-[11px] tabular-nums"
        aria-label={`Слот ${index}`}
      >
        {index}
      </span>
      <button
        type="button"
        data-testid={`deck-dock-remove-${card.id}`}
        onClick={onRemove}
        disabled={!onRemove}
        aria-label={`Прибрати ${card.name}`}
        className={cn(
          "absolute top-1 right-1 z-10 h-6 w-6 rounded-full border text-[12px] inline-flex items-center justify-center transition-colors",
          onRemove
            ? "bg-bg/85 border-accent-quiet text-ink-mute hover:border-danger hover:text-danger"
            : "bg-bg/40 border-accent-quiet/40 text-ink-mute/40 cursor-not-allowed",
        )}
      >
        ⊖
      </button>
    </article>
  );
}

function EmptySlot({ index }: { index: number }) {
  return (
    <div
      aria-hidden
      className="relative shrink-0 w-[110px] aspect-[2/3] rounded-[10px] border border-dashed border-accent-quiet/60 grid place-items-center text-ink-mute text-[11px] tabular-nums"
    >
      {index}
    </div>
  );
}

export default DeckDockModal;
