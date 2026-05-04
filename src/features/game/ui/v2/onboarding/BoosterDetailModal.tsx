"use client";

import { clans } from "@/features/battle/model/clans";
import { ClanGlyph } from "@/features/battle/ui/components/ClanGlyph";
import type { BoosterCatalogItem } from "@/features/boosters/types";
import { Modal } from "@/shared/ui/v2/Modal";

type BoosterDetailModalProps = {
  booster: BoosterCatalogItem | null;
  story?: string;
  busy: boolean;
  onClose: () => void;
  onOpen: (booster: BoosterCatalogItem) => void;
};

export function BoosterDetailModal({
  booster,
  story,
  busy,
  onClose,
  onOpen,
}: BoosterDetailModalProps) {
  const open = booster !== null;
  const ctaLabel = busy
    ? "Запис..."
    : booster && booster.starter.opened
      ? "Недоступно"
      : "ВІДКРИТИ";
  const ctaDisabled = !booster || busy || !booster.starter.canOpen;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      ariaLabel={booster ? `${booster.name} — деталі бустера` : undefined}
    >
      {booster && (
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[22px] sm:text-2xl font-medium uppercase tracking-[0.06em] text-ink">
                {booster.name}
              </h2>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-mute">
                Стартовий бустер
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрити"
              className="shrink-0 grid h-7 w-7 place-items-center rounded text-ink-mute hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden fill="none">
                <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <hr className="border-t border-accent-quiet" />

          {story && (
            <p className="text-sm leading-relaxed text-ink/90">{story}</p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {booster.clans.map((clan) => (
              <ClanPanel key={clan} clan={clan} />
            ))}
          </div>

          <footer className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-mute text-center sm:text-left">
              5 карт · 1 легендарна · 1 унікальна
            </p>
            <button
              type="button"
              data-testid={`starter-booster-open-${booster.id}`}
              onClick={() => {
                if (ctaDisabled) return;
                onOpen(booster);
              }}
              disabled={ctaDisabled}
              className="inline-flex h-10 items-center justify-center rounded-md border border-accent bg-accent px-6 text-xs font-medium uppercase tracking-[0.16em] text-[#1a1408] disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-105 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              {ctaLabel}
            </button>
          </footer>
        </div>
      )}
    </Modal>
  );
}

function ClanPanel({ clan }: { clan: string }) {
  const record = clans[clan];
  const bonusName = record?.bonus.name ?? "—";
  const bonusDescription = record?.bonus.description ?? "";

  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-accent-quiet bg-surface px-4 py-4 text-center">
      <span className="grid h-12 w-12 place-items-center text-ink-mute">
        <ClanGlyph clan={clan} className="h-10 w-10" />
      </span>
      <span className="text-[11px] uppercase tracking-[0.16em] text-ink">{clan}</span>
      <span className="text-xs text-ink">{bonusName}</span>
      {bonusDescription && (
        <span className="text-[11px] leading-snug text-ink-mute line-clamp-2">
          {bonusDescription}
        </span>
      )}
    </div>
  );
}

export default BoosterDetailModal;
