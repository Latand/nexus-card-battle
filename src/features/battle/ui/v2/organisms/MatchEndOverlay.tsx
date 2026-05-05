"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";
import type { Card } from "@/features/battle/model/types";
import { Modal } from "@/shared/ui/v2/Modal";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";

export type MatchEndRewards = {
  xp: { delta: number; current: number; max: number; levelUp?: boolean; newLevel?: number };
  elo: { delta: number; current: number };
  crystals: number;
  newCard?: Card;
  milestone?: { id: string; label: string };
};

export type MatchEndOverlayProps = {
  open: boolean;
  variant: "victory" | "defeat";
  mode: "ai" | "pvp";
  playerName: string;
  opponentName: string;
  rewards: MatchEndRewards;
  avatarUrl?: string;
  onPlayAgain: () => void;
  onGoToCollection: () => void;
  onClose?: () => void;
  /** Optional inline error from reward persistence. */
  errorText?: string;
};

export function MatchEndOverlay({
  open,
  variant,
  mode,
  playerName,
  opponentName,
  rewards,
  avatarUrl,
  onPlayAgain,
  onGoToCollection,
  onClose,
  errorText,
}: MatchEndOverlayProps) {
  const isVictory = variant === "victory";
  const title = isVictory ? "ПЕРЕМОГА" : "ПОРАЗКА";
  const replayLabel = mode === "pvp" ? "РЕВАНШ" : "ГРАТИ ЩЕ";
  const eloLabel =
    rewards.elo.delta === 0
      ? "0"
      : `${rewards.elo.delta > 0 ? "+" : "−"}${Math.abs(rewards.elo.delta)}`;
  const ringColor = isVictory
    ? "border-accent shadow-[0_0_28px_rgba(240,198,104,0.45)]"
    : "border-danger/60";
  const titleColor = isVictory ? "text-accent" : "text-ink/70";
  const eloColor = rewards.elo.delta < 0 ? "text-danger" : "text-accent";
  const xpPct = rewards.xp.max > 0 ? Math.min(100, (rewards.xp.current / rewards.xp.max) * 100) : 0;
  const xpStartPct = rewards.xp.max > 0
    ? Math.max(0, Math.min(100, ((rewards.xp.current - rewards.xp.delta) / rewards.xp.max) * 100))
    : 0;
  // Animate from xpStartPct -> xpPct when the modal opens. Level-up case is
  // simplified to a single delta animation plus a gold glow on the level-up
  // tile (kept via existing animate-pulse class) — owner can wire a two-stage
  // wrap-around later if desired.
  const [xpFillPct, setXpFillPct] = useState(xpStartPct);
  const [xpAnimating, setXpAnimating] = useState(false);
  useEffect(() => {
    if (!open) {
      setXpFillPct(xpStartPct);
      setXpAnimating(false);
      return;
    }
    setXpFillPct(xpStartPct);
    setXpAnimating(true);
    const raf = requestAnimationFrame(() => {
      setXpFillPct(xpPct);
    });
    const done = window.setTimeout(() => setXpAnimating(false), 950);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [open, xpStartPct, xpPct]);

  return (
    <Modal open={open} onClose={onClose ?? onPlayAgain} size="md" ariaLabel={title}>
      <section
        data-testid="match-end-overlay"
        data-variant={variant}
        data-mode={mode}
        className={cn(
          "relative flex flex-col items-center text-center px-6 sm:px-10 py-8 sm:py-10 gap-5 w-full",
          isVictory
            ? "bg-[radial-gradient(ellipse_at_top,rgba(240,198,104,0.18),transparent_60%)]"
            : "bg-[radial-gradient(ellipse_at_top,rgba(217,112,86,0.10),transparent_55%)]",
        )}
      >
        {onClose ? (
          <button
            type="button"
            data-testid="match-end-close"
            onClick={onClose}
            aria-label="Закрити"
            className="absolute right-3 top-3 inline-grid place-items-center w-8 h-8 rounded-full text-ink-mute hover:text-ink hover:bg-accent/10 transition-colors"
          >
            <span aria-hidden className="text-lg leading-none">×</span>
          </button>
        ) : null}

        {/* Title */}
        <h1
          data-testid="match-end-title"
          data-tone={isVictory ? "victory" : "defeat"}
          className={cn(
            "uppercase tracking-[0.18em] font-bold leading-none text-[40px] sm:text-[48px]",
            titleColor,
          )}
        >
          {title}
        </h1>
        <p
          data-testid="match-end-matchup"
          className="text-[12px] uppercase tracking-[0.18em] text-ink-mute -mt-2"
        >
          {playerName} <span className="text-ink/40 mx-2">vs</span> {opponentName}
        </p>

        {/* Avatar with ring */}
        <div className={cn("relative w-[96px] h-[96px] rounded-full overflow-hidden border-2", ringColor)}>
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              fill
              sizes="96px"
              className={cn("object-cover", !isVictory && "saturate-50")}
            />
          ) : (
            <span className="grid place-items-center w-full h-full text-accent/40 text-[40px]">⚔︎</span>
          )}
        </div>

        {/* Reward list */}
        <ul
          data-testid="match-end-rewards"
          className="w-full max-w-[420px] flex flex-col gap-2 text-left"
        >
          <RewardRow
            testId="match-end-reward-xp"
            label="Досвід"
            value={`+${rewards.xp.delta} XP`}
            tone="accent"
            footer={
              <div className="grid gap-1">
                <div
                  className={cn(
                    "relative h-2 overflow-hidden rounded-full bg-bg/60 border border-accent-quiet/40",
                    rewards.xp.levelUp && "shadow-[0_0_12px_rgba(240,198,104,0.55)]",
                  )}
                  role="progressbar"
                  aria-valuenow={Math.round(xpPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  data-testid="match-end-reward-xp-bar"
                  data-animating={xpAnimating ? "true" : "false"}
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0",
                      rewards.xp.levelUp
                        ? "bg-[linear-gradient(90deg,#f0c668,#fff3b8,#f0c668)]"
                        : "bg-accent",
                    )}
                    style={{
                      width: `${xpFillPct}%`,
                      transition: "width 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-ink-mute">
                  {rewards.xp.current} / {rewards.xp.max} XP
                </span>
              </div>
            }
          />
          {rewards.xp.levelUp ? (
            <li
              data-testid="match-end-reward-level-up"
              data-new-level={rewards.xp.newLevel ?? ""}
              className="flex items-center justify-between gap-3 px-3 py-2 border border-accent rounded-md bg-accent/10 animate-pulse"
            >
              <span className="text-[12px] uppercase tracking-[0.16em] text-accent">
                Новий рівень
              </span>
              <span className="font-mono tabular-nums text-[16px] text-accent">
                Lv {rewards.xp.newLevel ?? "?"}
              </span>
            </li>
          ) : null}
          <RewardRow
            testId="match-end-reward-elo"
            label="ELO"
            value={eloLabel}
            tone={rewards.elo.delta < 0 ? "danger" : "accent"}
            extraClass={eloColor}
          />
          <RewardRow
            testId="match-end-reward-crystals"
            label="Кристали"
            value={`+${rewards.crystals}`}
            tone="cool"
          />
          {rewards.milestone ? (
            <li
              data-testid="match-end-reward-milestone"
              data-milestone-id={rewards.milestone.id}
              className="flex items-center justify-between gap-3 px-3 py-2 border border-accent-quiet/60 rounded-md bg-bg/40"
            >
              <span className="text-[12px] uppercase tracking-[0.16em] text-ink-mute">
                Етап
              </span>
              <span className="font-mono tabular-nums text-[14px] text-accent">
                {rewards.milestone.label}
              </span>
            </li>
          ) : null}
        </ul>

        {/* New card preview — victory only */}
        {isVictory && rewards.newCard ? (
          <div
            data-testid="match-end-reward-new-card"
            data-card-id={rewards.newCard.id}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-accent/85">Нова карта</span>
            <div className="w-[140px]">
              <BattleCard card={rewards.newCard} compact />
            </div>
          </div>
        ) : null}

        {errorText ? (
          <p
            data-testid="match-end-error"
            className="text-[11px] uppercase tracking-[0.16em] text-danger border border-danger/60 rounded-md px-3 py-2 bg-bg/40"
          >
            {errorText}
          </p>
        ) : null}

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2 w-full">
          <button
            type="button"
            data-testid="match-end-replay"
            data-mode={mode}
            onClick={onPlayAgain}
            className="inline-flex items-center justify-center min-w-[150px] h-11 px-6 rounded-md bg-accent text-bg font-bold text-[14px] uppercase tracking-[0.18em] hover:brightness-110 transition-all"
          >
            {replayLabel}
          </button>
          <button
            type="button"
            data-testid="match-end-collection"
            onClick={onGoToCollection}
            className="inline-flex items-center justify-center min-w-[150px] h-11 px-6 rounded-md border border-accent-quiet text-accent text-[13px] uppercase tracking-[0.18em] hover:bg-accent/10 transition-colors"
          >
            ДО КОЛЕКЦІЇ
          </button>
        </div>
      </section>
    </Modal>
  );
}

function RewardRow({
  label,
  value,
  tone,
  testId,
  extraClass,
  footer,
}: {
  label: string;
  value: string;
  tone: "accent" | "danger" | "cool";
  testId: string;
  extraClass?: string;
  footer?: React.ReactNode;
}) {
  const toneClass =
    tone === "danger" ? "text-danger" : tone === "cool" ? "text-cool" : "text-accent";
  return (
    <li
      data-testid={testId}
      className="flex flex-col gap-2 px-3 py-2 border border-accent-quiet/60 rounded-md bg-bg/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] uppercase tracking-[0.16em] text-ink-mute">{label}</span>
        <span className={cn("font-mono tabular-nums text-[16px]", extraClass ?? toneClass)}>
          {value}
        </span>
      </div>
      {footer}
    </li>
  );
}

export default MatchEndOverlay;
