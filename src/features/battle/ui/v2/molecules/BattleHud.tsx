import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import type { FighterStatus } from "@/features/battle/model/types";
import { EnergyBar } from "../atoms/EnergyBar";
import { HpBar } from "../atoms/HpBar";

export type BattleHudProps = {
  side: "opponent" | "player";
  mode: "ai" | "pvp";
  timer?: { secondsLeft: number; totalSeconds: number };
  /** When true, the timer pill is rendered with danger styling (≤10s left). */
  timerWarning?: boolean;
  energy: { value: number; max: number };
  hp: { value: number; max: number };
  identity: {
    name: string;
    level?: number;
    avatarUrl?: string;
    elo?: number;
    modelLabel?: string;
    online?: "online" | "reconnecting" | "disconnected";
  };
  roundNumber?: number;
  onOpenDecks?: () => void;
  onSurrender?: () => void;
  canSurrender?: boolean;
  /** When true, briefly pulses warm-red on the identity area (incoming damage). */
  damageFlash?: boolean;
  /** Active status effects on this side's fighter (poison, blessing, …). */
  statuses?: FighterStatus[];
  className?: string;
};

const MAX_VISIBLE_STATUS_BADGES = 4;

function statusTooltip(status: FighterStatus): string {
  if (status.kind === "poison") {
    const min = status.min !== undefined ? `, мін. ${status.min}` : "";
    return `Отрута ${status.amount}${min}${status.stacks > 1 ? ` ×${status.stacks}` : ""}`;
  }
  return `Благословіння +${status.amount}${status.stacks > 1 ? ` ×${status.stacks}` : ""}`;
}

function StatusBadge({ status }: { status: FighterStatus }) {
  const isPoison = status.kind === "poison";
  const glyph = isPoison ? "⚗" : "✦";
  const showCount = status.stacks > 1 || status.amount > 1;
  const countLabel = status.stacks > 1 ? `×${status.stacks}` : `${status.amount}`;
  return (
    <span
      data-status-kind={status.kind}
      data-status-amount={status.amount}
      data-status-stacks={status.stacks}
      title={statusTooltip(status)}
      aria-label={statusTooltip(status)}
      className={cn(
        "relative inline-flex items-center justify-center w-[22px] h-[22px] sm:w-6 sm:h-6 rounded-md border text-[12px] sm:text-[13px] leading-none font-semibold shrink-0",
        isPoison
          ? "bg-emerald-900/40 border-emerald-500/60 text-[#6ba35f]"
          : "bg-accent/15 border-accent/60 text-[#f0c668]",
      )}
    >
      <span aria-hidden>{glyph}</span>
      {showCount ? (
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 px-[2px] min-w-[10px] h-[10px] inline-flex items-center justify-center rounded-[3px] bg-bg/90 text-ink/95 font-mono tabular-nums",
            "text-[8px] leading-none",
          )}
        >
          {countLabel}
        </span>
      ) : null}
    </span>
  );
}

const ONLINE_LABEL: Record<NonNullable<BattleHudProps["identity"]["online"]>, string> = {
  online: "Online",
  reconnecting: "Reconnecting…",
  disconnected: "Offline",
};

const ONLINE_DOT: Record<NonNullable<BattleHudProps["identity"]["online"]>, string> = {
  online: "bg-[#6ba35f] animate-pulse",
  reconnecting: "bg-accent animate-pulse",
  disconnected: "bg-danger",
};

export function BattleHud({
  side,
  mode,
  timer,
  timerWarning,
  energy,
  hp,
  identity,
  roundNumber,
  onOpenDecks,
  onSurrender,
  canSurrender,
  damageFlash,
  statuses,
  className,
}: BattleHudProps) {
  const isOpponent = side === "opponent";
  const isPvpOpponent = isOpponent && mode === "pvp";
  const showRating = identity.elo !== undefined;
  const energyTestId = isOpponent ? "battle-hud-opponent-energy" : "battle-hud-player-energy";
  const hpTestId = isOpponent ? "battle-hud-opponent-hp" : "battle-hud-player-hp";
  const hudTestId = isOpponent ? "battle-hud-opponent" : "battle-hud-player";
  const statusList = statuses ?? [];
  const visibleStatuses = statusList.slice(0, MAX_VISIBLE_STATUS_BADGES);
  const overflowStatusCount = Math.max(0, statusList.length - visibleStatuses.length);
  const statusSideKey = isOpponent ? "opponent" : "player";
  const timerDanger = Boolean(timer && (timerWarning || timer.secondsLeft <= 10));

  return (
    <div
      className={cn(
        "relative w-full bg-surface",
        isOpponent ? "border-b border-accent-quiet/60" : "border-t border-accent-quiet/60",
        className,
      )}
    >
      <div
        data-testid={hudTestId}
        data-side={side}
        data-mode={mode}
        className={cn(
          "mx-auto flex items-center gap-1.5 sm:gap-4 px-2 sm:px-5 min-w-0",
          "h-[40px] sm:h-[52px] max-w-[1440px]",
        )}
      >
        {/* LEFT cluster */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 min-w-0">
          {isOpponent && timer ? (
            <span
              data-testid="turn-timer"
              data-warning={timerDanger ? "true" : "false"}
              className={cn(
                "inline-flex items-center gap-0.5 sm:gap-1 font-mono tabular-nums text-[10px] sm:text-[13px] leading-none text-ink/80 rounded px-1 py-0.5",
                timerDanger && "text-danger animate-[turn-timer-blink_1s_steps(2,end)_infinite]",
              )}
              aria-label="Турн таймер"
            >
              <span aria-hidden>⌛</span>
              <span>{timer.secondsLeft}<span className="hidden sm:inline"> сек</span></span>
            </span>
          ) : null}
          {!isOpponent && roundNumber !== undefined ? (
            <span
              data-testid="round-marker"
              className="text-[10px] sm:text-[12px] uppercase tracking-[0.1em] sm:tracking-[0.14em] text-accent/80 font-semibold whitespace-nowrap"
            >
              <span className="hidden sm:inline">Раунд </span>
              <span className="sm:hidden">Р</span>
              {roundNumber}
            </span>
          ) : null}
        </div>

        {/* CENTER cluster — bars sit on a single baseline; allowed to shrink on mobile */}
        <div className="flex-1 flex items-center gap-1.5 sm:gap-4 min-w-0">
          <EnergyBar
            value={energy.value}
            max={energy.max}
            label="Енергія"
            data-testid={energyTestId}
            className="flex-1 min-w-[40px] sm:min-w-[60px]"
          />
          <HpBar
            value={hp.value}
            max={hp.max}
            label="Здоров'я"
            data-testid={hpTestId}
            className="flex-1 min-w-[40px] sm:min-w-[60px]"
          />
        </div>

        {/* IDENTITY cluster */}
        <div
          data-testid={isOpponent ? "battle-hud-opponent-identity" : "battle-hud-player-identity"}
          data-damage-flash={damageFlash ? "true" : "false"}
          className={cn(
            "flex items-center gap-1.5 sm:gap-3 shrink min-w-0 max-w-[44%] sm:max-w-[40%] rounded-md px-1 py-0.5 transition-all",
            damageFlash && "ring-2 ring-danger/80 bg-danger/15 animate-[hud-damage-shake_360ms_ease-in-out]",
          )}
        >
          {isPvpOpponent && identity.avatarUrl ? (
            <span className="relative hidden sm:inline-block w-8 h-8 rounded-full overflow-hidden border border-accent-quiet shrink-0">
              <Image
                src={identity.avatarUrl}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
              />
            </span>
          ) : null}
          <div className="flex flex-col min-w-0">
            <span
              data-testid={isOpponent ? "battle-hud-opponent-name" : "battle-hud-player-name"}
              className="text-[10px] sm:text-[13px] leading-none uppercase tracking-[0.04em] sm:tracking-[0.08em] text-ink/90 truncate max-w-[64px] sm:max-w-none"
            >
              {identity.name}
            </span>
            {isOpponent && identity.modelLabel ? (
              <span className="hidden sm:inline text-[10px] leading-none text-cool mt-1 truncate">
                {identity.modelLabel}
              </span>
            ) : isPvpOpponent && identity.level !== undefined ? (
              <span className="hidden sm:inline text-[10px] leading-none text-ink-mute mt-1">
                Lv {identity.level}
              </span>
            ) : null}
          </div>
          {visibleStatuses.length > 0 ? (
            <div
              data-testid={`battle-hud-status-${statusSideKey}`}
              data-count={statusList.length}
              className="flex items-center gap-1 shrink-0"
            >
              {visibleStatuses.map((status) => (
                <StatusBadge key={status.id} status={status} />
              ))}
              {overflowStatusCount > 0 ? (
                <span
                  aria-label={`Ще ${overflowStatusCount} ефект(и)`}
                  title={`Ще ${overflowStatusCount}`}
                  className="inline-flex items-center justify-center h-[22px] sm:h-6 px-1 rounded-md border border-ink-mute/40 bg-bg/60 text-[9px] sm:text-[10px] font-mono tabular-nums text-ink/80 shrink-0"
                >
                  +{overflowStatusCount}
                </span>
              ) : null}
            </div>
          ) : null}
          {showRating ? (
            <span
              data-testid={isOpponent ? "battle-hud-opponent-elo" : "battle-hud-player-elo"}
              className="hidden sm:inline-flex items-center px-1 h-5 text-[10px] font-mono tabular-nums uppercase tracking-wider text-cool"
            >
              ELO {identity.elo}
            </span>
          ) : null}
          {!isOpponent ? (
            <span
              data-testid="battle-hud-mode"
              data-mode={mode}
              className={cn(
                "inline-flex items-center px-1.5 sm:px-2 h-5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded border shrink-0",
                mode === "pvp"
                  ? "text-cool border-cool/60"
                  : "text-accent border-accent-quiet",
              )}
            >
              АРЕНА
            </span>
          ) : null}
          {!isOpponent && onSurrender ? (
            <button
              type="button"
              onClick={onSurrender}
              disabled={!canSurrender}
              data-testid="battle-hud-surrender"
              aria-label="Здатись"
              className={cn(
                "inline-flex items-center justify-center h-5 px-1.5 sm:px-2 rounded border text-[9px] sm:text-[10px] uppercase tracking-wider transition-colors shrink-0",
                "text-danger/90 border-danger/60 hover:bg-danger/10",
                !canSurrender && "opacity-45 cursor-not-allowed hover:bg-transparent",
              )}
            >
              <span className="hidden sm:inline">ЗДАТИСЬ</span>
              <span className="sm:hidden" aria-hidden>×</span>
            </button>
          ) : null}
          {isOpponent && onOpenDecks ? (
            <button
              type="button"
              onClick={onOpenDecks}
              data-testid="battle-hud-open-decks"
              aria-label="Колоди"
              className="inline-flex items-center justify-center px-1.5 sm:px-2 h-6 min-w-6 text-[9px] sm:text-[10px] uppercase tracking-wider text-accent/80 border border-accent-quiet rounded hover:bg-accent/10 transition-colors shrink-0"
            >
              <span className="hidden sm:inline">КОЛОДИ</span>
              <span className="sm:hidden" aria-hidden>▦</span>
            </button>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes hud-damage-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
        @keyframes turn-timer-blink {
          0%, 100% {
            background: rgba(217, 112, 86, 0.06);
            box-shadow: 0 0 0 0 rgba(217, 112, 86, 0);
          }
          50% {
            background: rgba(217, 112, 86, 0.22);
            box-shadow: 0 0 0 2px rgba(217, 112, 86, 0.26);
          }
        }
      `}</style>

      {/* Live-opponent presence hugs the right edge just below the strip */}
      {isPvpOpponent && identity.online ? (
        <div
          data-testid="battle-hud-opponent-presence"
          data-state={identity.online}
          className="absolute right-3 sm:right-5 top-full mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-mute pointer-events-none"
        >
          <span
            className={cn("inline-block w-1.5 h-1.5 rounded-full", ONLINE_DOT[identity.online])}
            aria-hidden
          />
          <span>{ONLINE_LABEL[identity.online]}</span>
        </div>
      ) : null}
    </div>
  );
}

export default BattleHud;
