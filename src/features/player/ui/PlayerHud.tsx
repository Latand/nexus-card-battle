"use client";

import { useState } from "react";
import { useOnlineCount } from "@/features/presence/client";
import { DEFAULT_PLAYER_AVATAR_URL, resolveAvatarUrl, useTelegramAvatar } from "@/features/player/profile/avatar";
import type { PlayerProfile } from "@/features/player/profile/types";
import { cn } from "@/shared/lib/cn";

type Props = {
  profile: PlayerProfile;
  playerName?: string;
  liveAvatarUrl?: string | null;
  canPlay: boolean;
  onPlay: () => void;
};

const NAME_FALLBACK = "Гравець";

export function PlayerHud({ profile, playerName, liveAvatarUrl, canPlay, onPlay }: Props) {
  const liveTelegramPhoto = useTelegramAvatar();
  const liveAvatar = liveAvatarUrl ?? liveTelegramPhoto;
  const avatarUrl = resolveAvatarUrl({ storedAvatarUrl: profile.avatarUrl, liveAvatarUrl: liveAvatar });
  const displayName = (playerName?.trim() || NAME_FALLBACK).slice(0, 32);
  const onlineCount = useOnlineCount();

  return (
    <>
      <SidebarHud
        profile={profile}
        playerName={displayName}
        avatarUrl={avatarUrl}
        canPlay={canPlay}
        onPlay={onPlay}
        onlineCount={onlineCount}
      />
      <MobileHud
        profile={profile}
        playerName={displayName}
        avatarUrl={avatarUrl}
        onlineCount={onlineCount}
      />
    </>
  );
}

function SidebarHud({
  profile,
  playerName,
  avatarUrl,
  canPlay,
  onPlay,
  onlineCount,
}: {
  profile: PlayerProfile;
  playerName: string;
  avatarUrl: string;
  canPlay: boolean;
  onPlay: () => void;
  onlineCount: number | null;
}) {
  return (
    <aside
      className="hidden md:flex md:flex-col md:gap-3 md:sticky md:top-0 md:z-40 md:h-screen md:w-[220px] md:shrink-0 md:border-r md:border-[#d4b06a]/25 md:bg-[linear-gradient(180deg,rgba(20,25,28,0.96),rgba(8,10,13,0.98))] md:px-3 md:py-4 md:shadow-[0_18px_44px_rgba(0,0,0,0.42)]"
      data-testid="player-hud-sidebar"
      data-profile-crystals={profile.crystals}
      data-profile-level={profile.level}
      data-profile-elo={profile.eloRating}
    >
      <div className="grid gap-0.5 text-center">
        <b className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d4b06a]">Бойова картотека</b>
        <strong className="text-2xl font-black uppercase leading-none text-[#fff0ad] [text-shadow:0_3px_0_rgba(0,0,0,0.72)]">
          Нексус
        </strong>
      </div>

      <div className="grid place-items-center gap-2">
        <HudAvatar src={avatarUrl} size={96} testId="player-hud-avatar-sidebar" />
        <strong
          className="block max-w-full truncate text-sm font-black uppercase tracking-[0.04em] text-[#fff7df]"
          data-testid="player-hud-name"
        >
          {playerName}
        </strong>
        <b
          className="rounded bg-[#1a2226] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#9ed6e4]"
          data-testid="player-hud-level"
        >
          Lv {profile.level}
        </b>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <HudStatTile
          icon="💎"
          label="Кристали"
          value={profile.crystals}
          testId="player-hud-crystals"
          tone="crystal"
        />
        <HudStatTile
          icon="🏆"
          label="ELO"
          value={profile.eloRating}
          testId="player-hud-elo"
          tone="elo"
        />
      </div>

      <button
        type="button"
        className={cn(
          "min-h-[44px] rounded-md px-4 text-sm font-black uppercase tracking-[0.08em] transition",
          canPlay
            ? "bg-[linear-gradient(180deg,#fff26d,#e3b51e_54%,#a66d12)] text-[#1a1408] hover:brightness-110"
            : "cursor-not-allowed bg-white/5 text-[#7e7668]",
        )}
        disabled={!canPlay}
        onClick={onPlay}
        data-testid="player-hud-play"
      >
        Грати
      </button>

      <div className="mt-auto" />

      <div
        className={cn(
          "grid min-h-[44px] place-items-center rounded-md border px-2 text-[11px] font-black uppercase tracking-[0.12em]",
          onlineCount === null
            ? "border-dashed border-white/10 bg-black/20 text-[#5d5443]"
            : "border-[#3da06a]/40 bg-[#0d2017] text-[#bff0c4]",
        )}
        data-testid="player-hud-online-slot"
        data-online-count={onlineCount === null ? "" : String(onlineCount)}
      >
        {onlineCount === null ? (
          "Онлайн"
        ) : (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">🟢</span>
            <b className="text-[#dff7d8]" data-testid="player-hud-online-count">
              {onlineCount}
            </b>
            <span className="tracking-[0.14em] text-[#9bd3a4]">онлайн</span>
          </span>
        )}
      </div>
    </aside>
  );
}

function MobileHud({
  profile,
  playerName,
  avatarUrl,
  onlineCount,
}: {
  profile: PlayerProfile;
  playerName: string;
  avatarUrl: string;
  onlineCount: number | null;
}) {
  return (
    <header
      className="md:hidden sticky top-0 z-40 flex items-center gap-2 border-b border-[#d4b06a]/25 bg-[linear-gradient(180deg,rgba(18,22,25,0.94),rgba(8,10,13,0.96))] px-2 py-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.45)]"
      data-testid="player-hud-mobile"
      data-profile-crystals={profile.crystals}
      data-profile-level={profile.level}
      data-profile-elo={profile.eloRating}
    >
      <HudAvatar src={avatarUrl} size={40} testId="player-hud-avatar-mobile" />

      <div className="grid min-w-0 flex-1 gap-0.5">
        <strong
          className="block truncate text-[11px] font-black uppercase tracking-[0.06em] text-[#fff0ad]"
          data-testid="player-hud-name-mobile"
        >
          {playerName}
        </strong>
        <span
          className="block truncate text-[10px] font-black uppercase tracking-[0.08em] text-[#cbbd99]"
          data-testid="player-hud-stats-mobile"
        >
          <b className="text-[#9ed6e4]" data-testid="player-hud-level-mobile">
            Lv {profile.level}
          </b>
          {" · 💎 "}
          <b className="text-[#ffe08a]" data-testid="player-hud-crystals-mobile">
            {profile.crystals}
          </b>
          {" · 🏆 "}
          <b className="text-[#fff7df]" data-testid="player-hud-elo-mobile">
            {profile.eloRating}
          </b>
        </span>
      </div>

      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none tracking-[0.04em]",
          onlineCount === null
            ? "border border-white/15 bg-black/45 text-transparent"
            : "border border-[#3da06a]/40 bg-[#0d2017] text-[#dff7d8]",
        )}
        data-testid="player-hud-online-slot-mobile"
        data-online-count={onlineCount === null ? "" : String(onlineCount)}
        aria-hidden={onlineCount === null ? "true" : undefined}
      >
        {onlineCount === null ? (
          <span className="block h-2 w-2 rounded-full bg-white/15" />
        ) : (
          <>
            <span aria-hidden="true">🟢</span>
            <b data-testid="player-hud-online-count-mobile">{onlineCount}</b>
          </>
        )}
      </span>
    </header>
  );
}

function HudAvatar({ src, size, testId }: { src: string; size: number; testId: string }) {
  // src is part of the key so React re-mounts when the resolved URL changes,
  // which resets the local error-fallback state without an effect.
  return <HudAvatarImage key={src} src={src} size={size} testId={testId} />;
}

function HudAvatarImage({ src, size, testId }: { src: string; size: number; testId: string }) {
  // Telegram-hosted photos can 404 or expire; fall back to the default art
  // locally without dragging the parent into transient CDN failures.
  const [resolvedSrc, setResolvedSrc] = useState(src);

  return (
    <span
      className="grid place-items-center overflow-hidden rounded-full border-2 border-[#ffe08a]/65 bg-black shadow-[0_8px_22px_rgba(0,0,0,0.4)]"
      style={{ width: size, height: size }}
      data-testid={testId}
      data-avatar-src={resolvedSrc}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedSrc}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
        onError={() => {
          if (resolvedSrc !== DEFAULT_PLAYER_AVATAR_URL) setResolvedSrc(DEFAULT_PLAYER_AVATAR_URL);
        }}
      />
    </span>
  );
}

function HudStatTile({
  icon,
  label,
  value,
  testId,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  testId: string;
  tone: "crystal" | "elo";
}) {
  return (
    <div
      className={cn(
        "grid gap-0.5 rounded-md border border-white/10 bg-black/35 px-2 py-1.5 text-center",
        tone === "crystal" ? "shadow-[inset_0_0_0_1px_rgba(255,224,138,0.18)]" : "shadow-[inset_0_0_0_1px_rgba(101,215,233,0.18)]",
      )}
      data-testid={testId}
      data-value={value}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {icon}
      </span>
      <b
        className={cn(
          "block text-base font-black leading-none",
          tone === "crystal" ? "text-[#ffe08a]" : "text-[#9ed6e4]",
        )}
      >
        {value}
      </b>
      <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[#7e7567]">{label}</span>
    </div>
  );
}
