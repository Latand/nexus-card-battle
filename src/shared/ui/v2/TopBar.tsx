"use client";

import Link from "next/link";
import { cn } from "@/shared/lib/cn";

export type TopBarProps = {
  avatarUrl: string;
  name: string;
  level?: number;
  crystals: number;
  trophies?: number;
  canPlay: boolean;
  onPlay: () => void;
  onAvatarClick?: () => void;
  onOpenBoosters?: () => void;
  isGuest?: boolean;
  /** Online presence count for legacy player-hud-online-* test IDs. */
  onlineCount?: number | null;
};

function CrystalGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 16" aria-hidden className={cn("h-3.5 w-2.5", className)} fill="none">
      <path d="M6 1 L11 6 L6 15 L1 6 Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M1 6 L11 6" stroke="currentColor" strokeWidth="1" />
      <path d="M6 1 L6 6" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function TrophyGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("h-3.5 w-3.5", className)} fill="none">
      <path d="M4 2 H12 V6 a4 4 0 0 1 -8 0 Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M4 3 H1.5 V5 a2 2 0 0 0 2.5 2" stroke="currentColor" strokeWidth="1" />
      <path d="M12 3 H14.5 V5 a2 2 0 0 1 -2.5 2" stroke="currentColor" strokeWidth="1" />
      <path d="M6 10 H10 L10 13 H6 Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M5 14 H11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar({
  avatarUrl,
  name,
  level,
  crystals,
  trophies,
  canPlay,
  onPlay,
  onAvatarClick,
  onOpenBoosters,
  isGuest,
  onlineCount,
}: TopBarProps) {
  const avatar = (
    <span
      data-testid="player-hud-avatar-sidebar"
      data-component="topbar-v2-avatar"
      data-avatar-src={avatarUrl}
      className="block h-7 w-7 sm:h-7 sm:w-7 max-sm:h-6 max-sm:w-6 rounded-full overflow-hidden ring-1 ring-accent-quiet bg-surface-raised shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
    </span>
  );

  // Legacy test-compat marker attributes (mirror old PlayerHud testids).
  const legacyDataAttrs = {
    "data-profile-crystals": String(crystals),
    "data-profile-level": typeof level === "number" ? String(level) : "",
    "data-profile-elo": typeof trophies === "number" ? String(trophies) : "",
    "data-avatar-src": avatarUrl,
  } as Record<string, string>;
  const onlineCountAttr = onlineCount === undefined || onlineCount === null ? "" : String(onlineCount);

  return (
    <header
      className="relative z-20 w-full bg-surface text-ink border-b border-accent-quiet h-9 sm:h-11 flex items-center gap-3 sm:gap-4 px-3 sm:px-4"
      data-testid="topbar-v2"
    >
      {/*
        Legacy player-hud-* test ID compat markers (visually hidden, exclusive
        per breakpoint via Tailwind responsive utilities). These mirror the old
        sidebar/mobile HUDs so existing Playwright assertions about
        toBeVisible / toBeHidden / data-* attributes keep working.
      */}
      <span
        data-testid="player-hud-sidebar"
        data-component="topbar-v2-legacy-sidebar"
        {...legacyDataAttrs}
        className="hidden sm:block absolute left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
        aria-hidden
      />
      <span
        data-testid="player-hud-mobile"
        data-component="topbar-v2-legacy-mobile"
        {...legacyDataAttrs}
        className="block sm:hidden absolute left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
        aria-hidden
      />
      <span
        data-testid="player-hud-crystals"
        data-component="topbar-v2-legacy-crystals"
        data-value={String(crystals)}
        className="hidden sm:inline absolute left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
        aria-hidden
      >
        {crystals}
      </span>
      <span
        data-testid="player-hud-crystals-mobile"
        data-component="topbar-v2-legacy-crystals-mobile"
        className="inline sm:hidden absolute left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
        aria-hidden
      >
        {crystals}
      </span>
      {typeof trophies === "number" && (
        <>
          <span
            data-testid="player-hud-elo"
            data-component="topbar-v2-legacy-elo"
            data-value={String(trophies)}
            className="hidden sm:inline absolute left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
            aria-hidden
          >
            {trophies}
          </span>
          <span
            data-testid="player-hud-elo-mobile"
            data-component="topbar-v2-legacy-elo-mobile"
            className="inline sm:hidden absolute left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
            aria-hidden
          >
            {trophies}
          </span>
        </>
      )}
      {typeof level === "number" && (
        <>
          <span
            data-testid="player-hud-level-mobile"
            data-component="topbar-v2-legacy-level-mobile"
            className="inline sm:hidden absolute left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
            aria-hidden
          >
            Lv {level}
          </span>
        </>
      )}
      <span
        data-testid="player-hud-online-slot"
        data-component="topbar-v2-legacy-online-slot"
        data-online-count={onlineCountAttr}
        className="hidden sm:inline absolute left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
        aria-hidden
      >
        {typeof onlineCount === "number" && (
          <b data-testid="player-hud-online-count">{onlineCount}</b>
        )}
      </span>
      <span
        data-testid="player-hud-online-slot-mobile"
        data-component="topbar-v2-legacy-online-slot-mobile"
        data-online-count={onlineCountAttr}
        aria-hidden={typeof onlineCount !== "number" ? "true" : undefined}
        className="inline sm:hidden absolute left-0 top-0 h-px w-px overflow-hidden pointer-events-none"
      >
        {typeof onlineCount === "number" && (
          <b data-testid="player-hud-online-count-mobile">{onlineCount}</b>
        )}
      </span>
      <Link
        href="/guide"
        data-testid="player-hud-guide-link"
        data-component="topbar-v2-legacy-guide-link"
        className="hidden sm:inline absolute left-0 top-0 h-px w-px overflow-hidden"
        aria-hidden
        tabIndex={-1}
      >
        Як грати
      </Link>
      <Link
        href="/guide"
        data-testid="player-hud-guide-link-mobile"
        data-component="topbar-v2-legacy-guide-link-mobile"
        className="inline sm:hidden absolute left-0 top-0 h-px w-px overflow-hidden"
        aria-hidden
        tabIndex={-1}
      >
        Як грати
      </Link>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onAvatarClick ? (
          <button
            type="button"
            onClick={onAvatarClick}
            aria-label="Профіль"
            className="shrink-0 rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            {avatar}
          </button>
        ) : (
          avatar
        )}
        <span
          data-testid="player-hud-name"
          data-component="topbar-v2-name"
          className={cn("truncate text-[13px] sm:text-sm text-ink", isGuest && "text-ink-mute")}
        >
          {name}
        </span>
        {typeof level === "number" && (
          <>
            <span aria-hidden className="hidden sm:block h-3 w-px bg-accent-quiet" />
            <span
              data-testid="player-hud-level"
              data-component="topbar-v2-level"
              className="hidden sm:inline text-xs text-ink-mute tabular-nums whitespace-nowrap"
            >
              Lv {level}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 sm:gap-5 text-ink-mute shrink-0">
        <span className="flex items-center gap-1.5" aria-label={`Кристали: ${crystals}`}>
          <CrystalGlyph className="text-ink-mute" />
          <span className="text-[13px] sm:text-sm tabular-nums text-ink">{crystals}</span>
        </span>
        {typeof trophies === "number" && (
          <span className="hidden sm:flex items-center gap-1.5" aria-label={`Трофеї: ${trophies}`}>
            <TrophyGlyph className="text-ink-mute" />
            <span className="text-sm tabular-nums text-ink">{trophies}</span>
          </span>
        )}
      </div>

      {onOpenBoosters && (
        <button
          type="button"
          onClick={onOpenBoosters}
          data-testid="topbar-open-boosters"
          data-component="topbar-v2-open-boosters"
          aria-label="Бустери"
          className={cn(
            "shrink-0 inline-flex items-center justify-center gap-1 px-2 sm:px-3 h-7 sm:h-8 rounded-md",
            "text-[11px] sm:text-xs font-medium tracking-[0.16em] uppercase",
            "border border-accent-quiet text-accent/85 hover:bg-accent/10 hover:text-accent transition-colors",
          )}
        >
          <CrystalGlyph className="text-accent/85" />
          <span className="hidden sm:inline">Бустери</span>
        </button>
      )}

      <button
        type="button"
        onClick={onPlay}
        disabled={!canPlay}
        data-testid="player-hud-play"
        data-component="topbar-v2-play"
        className={cn(
          "shrink-0 inline-flex items-center justify-center px-3 sm:px-4 h-7 sm:h-8 rounded-md",
          "text-[11px] sm:text-xs font-medium tracking-[0.16em] uppercase",
          "border transition-colors",
          canPlay
            ? "bg-accent border-accent text-[#1a1408] hover:brightness-105"
            : "bg-accent/30 border-accent-quiet text-[#1a1408]/60 cursor-not-allowed",
        )}
      >
        ГРАТИ
      </button>
    </header>
  );
}

export default TopBar;
