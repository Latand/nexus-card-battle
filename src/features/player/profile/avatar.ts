import { useEffect, useState } from "react";

export const DEFAULT_PLAYER_AVATAR_URL = "/nexus-assets/characters/cyber-brawler-thumb.png";

type TelegramAvatarWindow = Window & {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: {
        user?: {
          photo_url?: string;
        };
      };
    };
  };
};

export function readTelegramPhotoUrl(): string | null {
  if (typeof window === "undefined") return null;
  const photoUrl = (window as TelegramAvatarWindow).Telegram?.WebApp?.initDataUnsafe?.user?.photo_url;
  if (typeof photoUrl !== "string") return null;
  const trimmed = photoUrl.trim();
  return trimmed && /^https:\/\//i.test(trimmed) ? trimmed : null;
}

// Reads the live Telegram-provided photo on mount. Telegram's WebApp script
// is loaded with beforeInteractive, but a defensive deferred read covers the
// case where initData is populated late on slow clients.
export function useTelegramAvatar(): string | null {
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => readTelegramPhotoUrl());

  useEffect(() => {
    if (photoUrl) return;
    const handle = window.setTimeout(() => {
      const next = readTelegramPhotoUrl();
      if (next) setPhotoUrl(next);
    }, 0);

    return () => window.clearTimeout(handle);
  }, [photoUrl]);

  return photoUrl;
}

export function resolveAvatarUrl({
  storedAvatarUrl,
  liveAvatarUrl,
}: {
  storedAvatarUrl?: string | null;
  liveAvatarUrl?: string | null;
}): string {
  if (typeof storedAvatarUrl === "string" && storedAvatarUrl.trim()) return storedAvatarUrl.trim();
  if (typeof liveAvatarUrl === "string" && liveAvatarUrl.trim()) return liveAvatarUrl.trim();
  return DEFAULT_PLAYER_AVATAR_URL;
}
