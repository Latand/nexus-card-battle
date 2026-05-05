"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { Modal } from "@/shared/ui/v2/Modal";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import { MAX_ENERGY } from "@/features/battle/model/constants";
import type { Card, Fighter } from "@/features/battle/model/types";

export type CardPickModalProps = {
  open: boolean;
  selected: Card;
  enemy: Fighter;
  player: Fighter;
  knownEnemyCard?: Card;
  knownEnemyEnergy?: number;
  energy: number;
  maxEnergy: number;
  damageBoost: boolean;
  boostCost: number;
  previewAttack: number;
  previewDamage: number;
  canBoost: boolean;
  onClose: () => void;
  onMinus: () => void;
  onPlus: () => void;
  /** Optional: jump energy bid directly to a value (used by dot picker). */
  onEnergyChange?: (next: number) => void;
  onToggleBoost: () => void;
  onConfirm: () => void;
};

export function CardPickModal({
  open,
  selected,
  enemy,
  player: _player,
  knownEnemyCard,
  knownEnemyEnergy,
  energy,
  maxEnergy,
  damageBoost,
  boostCost,
  previewAttack,
  previewDamage,
  canBoost,
  onClose,
  onMinus,
  onPlus,
  onEnergyChange,
  onToggleBoost,
  onConfirm,
}: CardPickModalProps) {
  const isMobile = useIsMobile();

  // Skip rendering children entirely when closed so testids inside don't
  // pollute global selectors.
  if (!open) return null;

  // `maxEnergy` is the absolute cap for the bid (player.energy − boostCost).
  // Slots beyond it are disabled (greyed out, not clickable).
  const available = Math.min(MAX_ENERGY, maxEnergy);
  const baseAttack = selected.power;

  const setEnergyTo = (n: number) => {
    if (onEnergyChange) {
      onEnergyChange(Math.max(0, Math.min(maxEnergy, n)));
      return;
    }
    // Fallback: walk via +/- to reach n.
    if (n > energy) {
      for (let i = energy; i < n; i += 1) onPlus();
    } else if (n < energy) {
      for (let i = energy; i > n; i -= 1) onMinus();
    }
  };

  const handleDotClick = (slotIndex: number) => {
    // slotIndex is 0-based. If the user taps the currently-last filled dot,
    // clear back to one less (toggle off). Otherwise set to slotIndex + 1.
    const target = energy === slotIndex + 1 ? slotIndex : slotIndex + 1;
    setEnergyTo(target);
  };

  const boostToggleDisabled = !damageBoost && !canBoost;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={isMobile ? "sheet-mobile" : "md"}
      panelClassName={isMobile ? undefined : "!max-w-[600px]"}
      ariaLabel="Вибір картки"
    >
      <section
        data-testid="card-pick-modal"
        className="flex flex-col w-full max-sm:max-h-[calc(100dvh-32px)]"
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 sm:px-7 pt-3 sm:pt-4 pb-1.5 sm:pb-2 shrink-0">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-mute">
            Підготовка ходу
          </h2>
          <button
            type="button"
            data-testid="card-pick-cancel"
            onClick={onClose}
            aria-label="Закрити"
            className="inline-grid place-items-center w-8 h-8 rounded-full text-ink-mute hover:text-ink hover:bg-accent/10 transition-colors"
          >
            <span aria-hidden className="text-lg leading-none">×</span>
          </button>
        </header>

        {/* Body (scrolls only on mobile sheet; sizes to content on desktop) */}
        <div className="px-4 sm:px-7 pb-3 max-sm:flex-1 max-sm:min-h-0 max-sm:overflow-y-auto">
          {/* Two-card duel preview (compact) */}
          <div className="flex items-stretch justify-center gap-6">
            <CompactCardSlot label="Твій боєць">
              <BattleCard card={selected} compact className="!w-[120px] sm:!w-[180px]" />
            </CompactCardSlot>

            <div className="flex items-center justify-center">
              <span
                aria-hidden
                className="inline-grid place-items-center w-[28px] h-[20px] sm:w-[40px] sm:h-[28px] rounded-md border border-accent-quiet bg-surface-raised text-accent text-[10px] sm:text-[12px] uppercase tracking-[0.18em] font-semibold"
              >
                VS
              </span>
            </div>

            <CompactCardSlot label="Проти">
              {knownEnemyCard ? (
                <div data-testid="card-pick-known-enemy" data-card-id={knownEnemyCard.id}>
                  <BattleCard
                    card={knownEnemyCard}
                    compact
                    className="!w-[120px] sm:!w-[180px]"
                  />
                  {knownEnemyEnergy !== undefined ? (
                    <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-ink-mute">
                      Енергія: <span className="text-accent">{knownEnemyEnergy}</span>
                    </p>
                  ) : null}
                </div>
              ) : (
                <HiddenEnemyCard enemyName={enemy.name} />
              )}
            </CompactCardSlot>
          </div>

          {/* Hairline divider */}
          <hr className="my-3 sm:my-4 border-0 border-t border-accent-quiet/40" />

          {/* Inline outcome line — compact, no surrounding box */}
          <div className="flex flex-col items-center justify-center gap-0.5">
            <div className="flex items-center gap-3 sm:gap-4 leading-none">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-accent">
                  Атака
                </span>
                <span
                  data-testid="card-pick-summary-attack"
                  className="font-mono tabular-nums text-[18px] sm:text-[22px] text-ink"
                >
                  {previewAttack}
                </span>
              </span>
              <span aria-hidden className="text-accent-quiet text-[10px]">•</span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-accent">
                  Урон
                </span>
                <span
                  data-testid="card-pick-summary-damage"
                  className="font-mono tabular-nums text-[18px] sm:text-[22px] text-danger"
                >
                  {previewDamage}
                </span>
              </span>
            </div>
            <p className="italic text-[10px] text-ink-mute">
              база {baseAttack} + {energy} енергії
              {damageBoost ? " · +2 буст" : ""}
            </p>
          </div>

          {/* Energy dot-picker */}
          <div className="mt-3 sm:mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] uppercase tracking-[0.14em] text-accent/80">
                Енергія
              </span>
              <span className="font-mono tabular-nums text-[11px] text-ink-mute">
                {energy} / {MAX_ENERGY}
              </span>
            </div>
            <div
              data-testid="card-pick-energy-stepper"
              className="flex items-center justify-center gap-[4px] flex-wrap"
            >
              {Array.from({ length: MAX_ENERGY }).map((_, i) => {
                const filled = i < energy;
                const slotAvailable = i < available;
                return (
                  <button
                    key={i}
                    type="button"
                    data-testid={`card-pick-energy-dot-${i + 1}`}
                    aria-label={`Енергія ${i + 1}`}
                    aria-pressed={filled}
                    disabled={!slotAvailable}
                    onClick={() => handleDotClick(i)}
                    className={cn(
                      "inline-grid place-items-center w-7 h-7 rounded-full transition-colors select-none",
                      filled
                        ? "bg-accent text-[#1a1408] shadow-[0_0_8px_rgba(240,198,104,0.45)]"
                        : "bg-surface-raised border-[1.5px] border-accent-quiet text-accent-quiet",
                      !slotAvailable && "opacity-30 cursor-not-allowed",
                      slotAvailable && !filled && "hover:bg-accent/10",
                    )}
                  >
                    <BoltGlyph />
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 italic text-[9px] text-ink-mute text-center">
              Тапни щоб обрати
            </p>
          </div>

          {/* Boost toggle (optional) */}
          {(canBoost || damageBoost) ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                data-testid="card-pick-boost-toggle"
                data-active={damageBoost ? "true" : "false"}
                onClick={onToggleBoost}
                disabled={boostToggleDisabled}
                aria-pressed={damageBoost}
                className={cn(
                  "inline-flex items-center gap-2 w-[240px] justify-center px-3 h-9 rounded-md border text-[12px] uppercase tracking-[0.12em] transition-colors",
                  damageBoost
                    ? "border-accent text-accent bg-accent/10"
                    : "border-accent-quiet text-accent/80 hover:bg-accent/5",
                  boostToggleDisabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-grid place-items-center w-4 h-4 rounded-sm border",
                    damageBoost ? "border-accent bg-accent text-[#1a1408]" : "border-accent-quiet",
                  )}
                >
                  {damageBoost ? "✓" : ""}
                </span>
                +2 урону за {boostCost} ⚡
              </button>
            </div>
          ) : null}
        </div>

        {/* STICKY ACTION FOOTER */}
        <div className="shrink-0 border-t border-accent-quiet/40 bg-surface-raised">
          <div className="px-4 py-3">
            <button
              type="button"
              data-testid="card-pick-confirm"
              onClick={onConfirm}
              className="inline-flex items-center justify-center w-full h-14 rounded-md bg-accent text-bg font-bold text-[15px] uppercase tracking-[0.18em] hover:brightness-110 transition-all"
            >
              ОК
            </button>
          </div>
        </div>
      </section>
    </Modal>
  );
}

function CompactCardSlot({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.16em] text-ink-mute">
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}

function HiddenEnemyCard({ enemyName }: { enemyName: string }) {
  return (
    <div
      data-testid="card-pick-hidden-enemy"
      className="relative w-[120px] sm:w-[180px] aspect-[2/3] rounded-[10px] border border-accent-quiet bg-surface-raised grid place-items-center overflow-hidden"
      aria-label={`Невідома карта суперника ${enemyName}`}
    >
      <span className="text-[64px] leading-none text-accent/50 font-bold">?</span>
      <span className="absolute bottom-2 inset-x-0 text-center text-[10px] uppercase tracking-[0.16em] text-ink-mute truncate px-2">
        {enemyName}
      </span>
    </div>
  );
}

function BoltGlyph() {
  // Tiny lightning glyph. Uses currentColor so it inherits dot foreground.
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 14"
      className="w-2.5 h-3.5"
      fill="currentColor"
    >
      <path d="M6 0 L0 8 L4 8 L3 14 L10 5 L6 5 Z" />
    </svg>
  );
}

function useIsMobile() {
  // Lazy initial state matches viewport synchronously on first client render,
  // avoiding the desktop→mobile flicker when the modal opens on a phone.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export default CardPickModal;
