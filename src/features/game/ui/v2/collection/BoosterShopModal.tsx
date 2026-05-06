"use client";

import { useCallback, useEffect, useState } from "react";
import type { Card } from "@/features/battle/model/types";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import { fetchBoosterCatalog, openPaidBooster } from "@/features/boosters/client";
import {
  PAID_BOOSTER_CRYSTAL_COST,
  type BoosterCatalogItem,
  type BoosterResponse,
} from "@/features/boosters/types";
import type { PlayerIdentity, PlayerProfile } from "@/features/player/profile/types";
import { cn } from "@/shared/lib/cn";
import Modal from "@/shared/ui/v2/Modal";

export type BoosterShopModalProps = {
  open: boolean;
  onClose: () => void;
  playerIdentity: PlayerIdentity | null;
  profileCrystals: number;
  onCrystalsUpdated?: (next: number) => void;
  onCardsObtained?: (cards: Card[]) => void;
  /**
   * Optional. When provided, the modal forwards the entire updated player
   * snapshot from the booster API response. Preferred over the per-field
   * callbacks because it carries fresh ownedCards / openedBoosterIds too.
   */
  onProfileChange?: (profile: PlayerProfile) => void;
  groupContext?: string | null;
};

type ShopStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "opening"; boosterId: string };

type RevealState = {
  booster: BoosterResponse;
  cards: Card[];
};
type PaidDisabledReason = NonNullable<BoosterCatalogItem["paid"]["disabledReason"]>;

export function BoosterShopModal({
  open,
  onClose,
  playerIdentity,
  profileCrystals,
  onCrystalsUpdated,
  onCardsObtained,
  onProfileChange,
  groupContext,
}: BoosterShopModalProps) {
  const isMobile = useIsMobile();
  const [boosters, setBoosters] = useState<BoosterCatalogItem[] | null>(null);
  const [status, setStatus] = useState<ShopStatus>({ kind: "idle" });
  const [reveal, setReveal] = useState<RevealState | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBoosters(playerIdentity ? null : []);
      setReveal(null);
      setStatus(playerIdentity ? { kind: "loading" } : { kind: "idle" });
    });
    if (!playerIdentity) {
      return () => {
        cancelled = true;
      };
    }

    void fetchBoosterCatalog(playerIdentity, groupContext)
      .then((response) => {
        if (cancelled) return;
        setBoosters(response.boosters);
        setStatus({ kind: "idle" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Не вдалося завантажити бустери";
        setBoosters(null);
        setReveal(null);
        setStatus({ kind: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [groupContext, open, playerIdentity]);

  const handleOpenBooster = useCallback(
    (boosterId: string) => {
      if (!playerIdentity) return;
      if (status.kind === "opening") return;
      if (profileCrystals < PAID_BOOSTER_CRYSTAL_COST) return;
      const booster = boosters?.find((item) => item.id === boosterId);
      if (booster?.paid.canOpen === false) return;

      setStatus({ kind: "opening", boosterId });
      void openPaidBooster(playerIdentity, boosterId, groupContext)
        .then((response) => {
          setReveal({ booster: response.booster, cards: response.cards });
          setStatus({ kind: "idle" });
          if (onProfileChange) {
            onProfileChange(response.player);
          } else {
            const nextCrystals =
              typeof response.player.crystals === "number"
                ? response.player.crystals
                : Math.max(0, profileCrystals - (response.crystalCost ?? PAID_BOOSTER_CRYSTAL_COST));
            onCrystalsUpdated?.(nextCrystals);
            onCardsObtained?.(response.cards);
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Не вдалося відкрити бустер";
          setStatus({ kind: "error", message });
        });
    },
    [
      onCardsObtained,
      onCrystalsUpdated,
      onProfileChange,
      groupContext,
      boosters,
      playerIdentity,
      profileCrystals,
      status.kind,
    ],
  );

  const loading = status.kind === "loading" || (open && boosters === null && status.kind !== "error");

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={isMobile ? "sheet-mobile" : "lg"}
      ariaLabel="Бустери"
    >
      <div
        data-testid="booster-shop-modal"
        className="flex flex-col h-full max-h-[640px] overflow-hidden"
      >
        <header className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-6 pt-4 sm:pt-5 pb-3">
          <div className="min-w-0 flex items-baseline gap-3">
            <h2 className="text-ink text-[13px] sm:text-sm font-medium uppercase tracking-[0.18em]">
              Бустери
            </h2>
            <span
              data-testid="booster-shop-crystals"
              className="inline-flex items-center gap-1.5 text-ink-mute text-[12px]"
              aria-label={`Кристали: ${profileCrystals}`}
            >
              <CrystalGlyph className="text-accent" />
              <span className="tabular-nums text-ink">{profileCrystals}</span>
            </span>
          </div>
          <button
            type="button"
            data-testid="booster-shop-close"
            onClick={onClose}
            aria-label="Закрити"
            className="shrink-0 grid h-8 w-8 place-items-center text-ink-mute hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            ✕
          </button>
        </header>

        <div className="px-5 sm:px-6">
          <div className="h-px bg-accent-quiet" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 flex flex-col gap-4">
          {status.kind !== "error" && reveal && (
            <RevealPanel reveal={reveal} onDismiss={() => setReveal(null)} />
          )}

          {status.kind === "error" && (
            <p
              data-testid="booster-shop-error"
              className="text-[12px] text-danger"
            >
              {status.message}
            </p>
          )}

          {loading && !reveal && (
            <div data-testid="booster-shop-skeleton" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[88px] rounded-md border border-accent-quiet/40 bg-surface animate-pulse"
                />
              ))}
            </div>
          )}

          {status.kind !== "error" && !loading && boosters && boosters.length === 0 && (
            <p className="text-[12px] text-ink-mute uppercase tracking-[0.16em]">
              Бустери недоступні
            </p>
          )}

          {status.kind !== "error" && !loading && boosters && boosters.length > 0 && (
            <ul
              data-testid="booster-shop-list"
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {boosters.map((booster) => {
                const opening =
                  status.kind === "opening" && status.boosterId === booster.id;
                const paidDisabled = booster.paid.canOpen === false;
                const paidDisabledReason = paidDisabled ? booster.paid.disabledReason : undefined;
                const insufficient =
                  paidDisabledReason === "insufficient_crystals" ||
                  profileCrystals < booster.paid.crystalCost;
                const disabled =
                  !playerIdentity ||
                  paidDisabled ||
                  insufficient ||
                  opening ||
                  status.kind === "opening";
                return (
                  <li key={booster.id}>
                    <BoosterRow
                      booster={booster}
                      opening={opening}
                      disabled={disabled}
                      insufficient={insufficient}
                      disabledReason={paidDisabledReason}
                      onOpen={() => handleOpenBooster(booster.id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function BoosterRow({
  booster,
  opening,
  disabled,
  insufficient,
  disabledReason,
  onOpen,
}: {
  booster: BoosterCatalogItem;
  opening: boolean;
  disabled: boolean;
  insufficient: boolean;
  disabledReason?: PaidDisabledReason;
  onOpen: () => void;
}) {
  const special = booster.presentation === "special" || booster.presentation === "group";
  const disabledCopy = getPaidBoosterDisabledCopy(disabledReason);
  return (
    <article
      data-testid={`booster-shop-item-${booster.id}`}
      data-presentation={booster.presentation}
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-3",
        special
          ? "border-accent/80 bg-[linear-gradient(135deg,rgba(240,196,49,0.18),rgba(70,210,255,0.12)),var(--color-surface)] shadow-[0_0_24px_rgba(240,196,49,0.16)]"
          : "border-accent-quiet bg-surface",
      )}
    >
      <div className="min-w-0 flex-1">
        <strong className={cn("block truncate text-[14px] uppercase tracking-[0.06em]", special ? "text-accent" : "text-ink")}>
          {booster.name}
        </strong>
        <span className={cn("mt-0.5 block truncate text-[11px] uppercase tracking-[0.16em]", special ? "text-cool" : "text-cool")}>
          {booster.clans.join(" · ")}
        </span>
        {disabledCopy && (
          <span
            data-testid={`booster-shop-disabled-reason-${booster.id}`}
            className="mt-1 block truncate text-[11px] uppercase tracking-[0.12em] text-ink-mute"
          >
            {disabledCopy}
          </span>
        )}
      </div>
      <button
        type="button"
        data-testid={`booster-shop-open-${booster.id}`}
        onClick={onOpen}
        disabled={disabled}
        title={getPaidBoosterDisabledTitle(disabledReason, insufficient)}
        className={cn(
          "shrink-0 inline-flex items-center justify-center gap-1 px-3 h-9 rounded-md",
          "text-[12px] font-medium uppercase tracking-[0.12em] border transition-colors",
          disabled
            ? "bg-accent/30 border-accent-quiet text-[#1a1408]/60 cursor-not-allowed"
            : "bg-accent border-accent text-[#1a1408] hover:brightness-105",
        )}
      >
        {opening ? (
          "Відкриття…"
        ) : disabledReason === "group_booster_empty" ? (
          "Немає карт"
        ) : (
          <>
            <span className="tabular-nums">{booster.paid.crystalCost}</span>
            <CrystalGlyph className="text-[#1a1408]" />
          </>
        )}
      </button>
    </article>
  );
}

function getPaidBoosterDisabledCopy(reason?: PaidDisabledReason) {
  if (reason === "group_booster_empty") return "Пул ще порожній";
  return undefined;
}

function getPaidBoosterDisabledTitle(reason: PaidDisabledReason | undefined, insufficient: boolean) {
  if (reason === "group_booster_empty") return "У груповому бустері ще немає карт";
  if (insufficient) return "Недостатньо кристалів";
  return undefined;
}

function RevealPanel({
  reveal,
  onDismiss,
}: {
  reveal: RevealState;
  onDismiss: () => void;
}) {
  return (
    <section
      data-testid="booster-shop-reveal"
      className="rounded-md border border-cool/30 bg-cool/5 p-3 flex flex-col gap-3"
    >
      <header className="flex items-center justify-between gap-3">
        <strong className="min-w-0 truncate text-[12px] uppercase tracking-[0.16em] text-ink">
          {reveal.booster.name}
        </strong>
        <button
          type="button"
          data-testid="booster-shop-reveal-close"
          onClick={onDismiss}
          className="shrink-0 inline-flex items-center justify-center px-3 h-8 rounded-md border border-accent-quiet text-[11px] uppercase tracking-[0.12em] text-ink-mute hover:text-ink hover:border-accent transition-colors"
        >
          Закрити
        </button>
      </header>
      <div className="grid grid-cols-5 gap-2">
        {reveal.cards.map((card, index) => (
          <div
            key={`${card.id}-${index}`}
            data-testid={`booster-shop-reveal-card-${index + 1}`}
            data-card-id={card.id}
            className="w-full"
          >
            <BattleCard card={card} compact />
          </div>
        ))}
      </div>
    </section>
  );
}

function CrystalGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 16" aria-hidden className={cn("h-3.5 w-2.5", className)} fill="none">
      <path d="M6 1 L11 6 L6 15 L1 6 Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M1 6 L11 6" stroke="currentColor" strokeWidth="1" />
      <path d="M6 1 L6 6" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function useIsMobile() {
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

export default BoosterShopModal;
