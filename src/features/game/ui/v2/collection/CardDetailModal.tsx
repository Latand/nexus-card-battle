"use client";

import { useEffect, useState } from "react";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import { SELL_PRICES_BY_RARITY } from "@/features/economy/sellPricing";
import type { Card } from "@/features/battle/model/types";
import { cn } from "@/shared/lib/cn";
import Modal from "@/shared/ui/v2/Modal";
import { RARITY_LABELS_LOCAL, type SellStatus } from "./types";

export type CardDetailModalProps = {
  open: boolean;
  card: Card | null;
  ownedCount: number;
  cardInDeck: boolean;
  canEditDeck: boolean;
  canSell: boolean;
  sellStatus: SellStatus;
  isMobile: boolean;
  onClose: () => void;
  onToggleDeck: (cardId: string) => void;
  onSell: (cardId: string, count: number) => Promise<void> | void;
};

export function CardDetailModal({
  open,
  card,
  ownedCount,
  cardInDeck,
  canEditDeck,
  canSell,
  sellStatus,
  isMobile,
  onClose,
  onToggleDeck,
  onSell,
}: CardDetailModalProps) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open, card?.id]);

  if (!card) return null;

  const sellPrice = SELL_PRICES_BY_RARITY[card.rarity];
  const sellableCount = cardInDeck ? 0 : Math.max(0, ownedCount - 1);
  const isSelling = sellStatus.kind === "selling";
  const sellLabel = sellableCount === 1 && !cardInDeck ? "Продати" : "Продати 1";
  const canSellSingle = !cardInDeck && ownedCount >= 1 && !isSelling && canSell;
  const showSellSection = canSell;
  const toggleLabel = cardInDeck ? "ПРИБРАТИ З КОЛОДИ" : "В КОЛОДУ";
  const toggleDisabled = !canEditDeck || (!cardInDeck && ownedCount < 1);

  const handleSellClick = async () => {
    if (!canSellSingle) return;
    const count = 1;
    const isLegend = card.rarity === "Legend";
    const isLastCopy = ownedCount === count;
    const needsConfirm = isLegend || isLastCopy;
    if (needsConfirm) {
      const message = isLastCopy
        ? `Видалити останню копію ${card.name}?`
        : `Продати ${count} × ${card.name}?`;
      const confirmed = typeof window !== "undefined" && window.confirm(message);
      if (!confirmed) return;
    }
    await onSell(card.id, count);
  };

  const stats = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]" data-testid="card-details-stats">
      <dt className="text-ink-mute">Сила</dt>
      <dd className="text-ink tabular-nums text-right">{card.power}</dd>
      <dt className="text-ink-mute">Урон</dt>
      <dd className="text-ink tabular-nums text-right">{card.damage}</dd>
      <dt className="text-ink-mute">Здоров&apos;я</dt>
      <dd className="text-ink tabular-nums text-right">{card.power + card.damage}</dd>
    </dl>
  );

  const traits = (
    <div className="flex flex-col gap-3 text-[13px] leading-snug">
      <div>
        <div className="text-ink-mute text-[11px] uppercase tracking-[0.16em]">Уміння</div>
        <div className="text-ink mt-1">{card.ability.name}</div>
        <p className="text-ink-mute mt-1 line-clamp-3">{card.ability.description}</p>
      </div>
      <div>
        <div className="text-ink-mute text-[11px] uppercase tracking-[0.16em]">Бонус клану</div>
        <div className="text-ink mt-1">{card.bonus.name}</div>
        <p className="text-ink-mute mt-1 line-clamp-3">{card.bonus.description}</p>
      </div>
    </div>
  );

  const ownedLine = (
    <p className="text-accent text-[12px] tabular-nums">
      У вас: <span className="text-ink">{ownedCount}</span>
      {cardInDeck && <span className="text-ink-mute"> · у колоді</span>}
    </p>
  );

  const subtitle = (
    <div className="text-ink-mute text-[11px] uppercase tracking-[0.16em]">
      {card.clan} · {RARITY_LABELS_LOCAL[card.rarity]}
    </div>
  );

  const sellError =
    sellStatus.kind === "error" ? (
      <p
        data-testid="card-details-sell-error"
        className="text-danger text-[12px]"
      >
        {sellStatus.message}
      </p>
    ) : null;

  const actions = (
    <div className={cn("flex gap-2", isMobile ? "flex-col" : "flex-row justify-end")}>
      <button
        type="button"
        data-testid="card-details-add-toggle"
        disabled={toggleDisabled}
        onClick={() => onToggleDeck(card.id)}
        className={cn(
          "inline-flex items-center justify-center px-4 h-10 rounded-md text-[12px] font-medium tracking-[0.16em] uppercase border transition-colors",
          toggleDisabled
            ? "bg-accent/30 border-accent-quiet text-[#1a1408]/60 cursor-not-allowed"
            : "bg-accent border-accent text-[#1a1408] hover:brightness-105",
        )}
      >
        {toggleLabel}
      </button>
      {showSellSection && (
        <button
          type="button"
          data-testid="card-details-sell-button"
          disabled={!canSellSingle}
          onClick={handleSellClick}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 px-4 h-10 rounded-md text-[12px] font-medium tracking-[0.16em] uppercase border transition-colors",
            canSellSingle
              ? "border-danger text-danger hover:bg-danger/10"
              : "border-accent-quiet text-ink-mute cursor-not-allowed",
          )}
        >
          {sellLabel} ЗА {sellPrice}
          <span aria-hidden>💎</span>
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Modal open={open} onClose={onClose} size="sheet-mobile" ariaLabel={`Деталі ${card.name}`}>
        <div
          data-testid="card-details-shell"
          data-card-id={card.id}
          className="flex flex-col h-full overflow-hidden"
        >
          <header className="shrink-0 flex items-center justify-between px-4 h-11 border-b border-accent-quiet">
            <h2 className="text-ink text-[15px] truncate">{card.name}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрити"
              className="text-ink-mute hover:text-ink h-8 w-8 inline-flex items-center justify-center"
            >
              ✕
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
            <div className="mx-auto w-[min(260px,68vw)]">
              <BattleCard card={card} />
            </div>
            <div>
              <h3 className="text-ink text-[20px]">{card.name}</h3>
              {subtitle}
            </div>
            {stats}
            <div className="h-px bg-accent-quiet" />
            {traits}
            {ownedLine}
            {sellError}
          </div>
          <footer className="shrink-0 px-4 py-3 border-t border-accent-quiet bg-surface-raised">
            {actions}
          </footer>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" ariaLabel={`Деталі ${card.name}`}>
      <div
        data-testid="card-details-shell"
        data-card-id={card.id}
        className="flex flex-col h-full max-h-[560px] overflow-hidden"
      >
        <header className="shrink-0 flex items-center justify-between px-5 h-11 border-b border-accent-quiet">
          <span className="text-ink-mute text-[11px] uppercase tracking-[0.16em]">Деталі</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="text-ink-mute hover:text-ink h-8 w-8 inline-flex items-center justify-center"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-[300px_1fr] gap-6 items-start">
          <div className="w-full">
            <BattleCard card={card} />
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            <div>
              <h3 className="text-ink text-[24px] leading-tight">{card.name}</h3>
              <div className="mt-1">{subtitle}</div>
            </div>
            {stats}
            <div className="h-px bg-accent-quiet" />
            {traits}
            <div className="mt-auto flex flex-col gap-3">
              {ownedLine}
              {sellError}
              {actions}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default CardDetailModal;
