"use client";

import { Modal } from "@/shared/ui/v2/Modal";
import { cn } from "@/shared/lib/cn";
import {
  DEFAULT_PLAYER_AVATAR_URL,
  resolveAvatarUrl,
  useTelegramAvatar,
} from "@/features/player/profile/avatar";
import { computeLevelFromXp, type PlayerProfile } from "@/features/player/profile/types";
import { useOnlineCount } from "@/features/presence/client";

export type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
  profile: PlayerProfile;
  playerName?: string;
  liveAvatarUrl?: string | null;
  onOpenGuide?: () => void;
  onOpenSettings?: () => void;
};

const NAME_FALLBACK = "Гравець";

export function ProfileModal({
  open,
  onClose,
  profile,
  playerName,
  liveAvatarUrl,
  onOpenGuide,
  onOpenSettings,
}: ProfileModalProps) {
  const telegramAvatar = useTelegramAvatar();
  const onlineCount = useOnlineCount();
  const avatarUrl = resolveAvatarUrl({
    storedAvatarUrl: profile.avatarUrl,
    liveAvatarUrl: liveAvatarUrl ?? telegramAvatar,
  });
  const displayName = (playerName?.trim() || NAME_FALLBACK).slice(0, 32);
  const { xpIntoLevel, xpForNextLevel } = computeLevelFromXp(profile.totalXp);
  const xpPercent = xpForNextLevel > 0 ? Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100))) : 0;
  const wins = profile.wins ?? 0;
  const opened = profile.openedBoosterIds.length;

  return (
    <Modal open={open} onClose={onClose} size="drawer-right" ariaLabel="Профіль гравця">
      <div className="flex flex-col h-full bg-surface-raised text-ink p-6 gap-5 overflow-y-auto">
        <div className="flex items-start justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="text-ink-mute hover:text-ink text-lg leading-none w-8 h-8 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div
            data-component="player-profile-avatar"
            data-avatar-src={avatarUrl}
            className="w-24 h-24 rounded-full overflow-hidden border border-accent-quiet ring-1 ring-accent-quiet/40"
          >
            <AvatarImg src={avatarUrl} alt={displayName} />
          </div>
          <strong
            data-component="player-profile-name"
            className="text-[22px] font-normal text-ink leading-tight"
          >
            {displayName}
          </strong>
          <div className="text-ink-mute text-sm tabular-nums">
            <span data-component="player-profile-level">Lv {profile.level}</span>
            <span aria-hidden="true"> · </span>
            <span>XP {xpIntoLevel}/{xpForNextLevel}</span>
          </div>
          <div
            className="w-full max-w-[280px] h-1 bg-surface overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={xpPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-accent-quiet" style={{ width: `${xpPercent}%` }} />
          </div>
        </div>

        <div className="border-t border-accent-quiet/40" />

        <ul className="flex flex-col gap-3 text-[15px]">
          <StatRow icon="◆" label="Кристали" value={profile.crystals} testId="player-profile-crystals" />
          <StatRow icon="♛" label="ELO" value={profile.eloRating} testId="player-profile-elo" />
          <StatRow icon="⚔" label="Перемог" value={wins} testId="player-profile-wins" />
          <StatRow icon="⚐" label="Бустерів відкрито" value={opened} testId="player-profile-opened-boosters" />
        </ul>

        <div className="border-t border-accent-quiet/40" />

        <div className="text-accent-quiet text-sm">
          Онлайн зараз:{" "}
          <span
            data-component="player-profile-online-count"
            className="tabular-nums text-accent"
          >
            {onlineCount ?? "…"}
          </span>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
          <GhostButton onClick={onOpenGuide} disabled={!onOpenGuide} label="Інструкція" />
          <GhostButton onClick={onOpenSettings} disabled={!onOpenSettings} label="Налаштування" />
        </div>
      </div>
    </Modal>
  );
}

function StatRow({ icon, label, value, testId, component }: { icon: string; label: string; value: number; testId: string; component?: string }) {
  return (
    <li
      data-testid={testId}
      data-component={component}
      data-value={value}
      className="flex items-center gap-3"
    >
      <span aria-hidden="true" className="text-ink-mute w-5 text-center">{icon}</span>
      <span className="text-ink-mute flex-1">{label}</span>
      <span className="text-ink tabular-nums text-right">{value}</span>
    </li>
  );
}

function GhostButton({ onClick, disabled, label }: { onClick?: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-10 border border-accent-quiet text-ink-mute text-sm tracking-wide rounded-md transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:border-accent hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function AvatarImg({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      onError={(event) => {
        const img = event.currentTarget;
        if (img.src !== DEFAULT_PLAYER_AVATAR_URL && !img.src.endsWith(DEFAULT_PLAYER_AVATAR_URL)) {
          img.src = DEFAULT_PLAYER_AVATAR_URL;
        }
      }}
    />
  );
}

export default ProfileModal;
