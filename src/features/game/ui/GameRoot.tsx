"use client";

import { useCallback, useEffect, useState } from "react";
import { cards } from "@/features/battle/model/cards";
import { BattleGame } from "@/features/battle/ui/BattleGame";
import { RealtimeBattleGame } from "@/features/battle/ui/RealtimeBattleGame";
import type { TelegramPlayer } from "@/shared/lib/telegram";
import { PLAYER_DECK_SIZE } from "../model/randomDeck";
import { CollectionDeckScreen } from "./collection/CollectionDeckScreen";

type BattleMode = "ai" | "human";
type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      ready?: () => void;
      expand?: () => void;
      isFullscreen?: boolean;
      isOrientationLocked?: boolean;
      platform?: string;
      isVersionAtLeast?: (version: string) => boolean;
      requestFullscreen?: () => void;
      lockOrientation?: () => void;
      disableVerticalSwipes?: () => void;
      initDataUnsafe?: {
        user?: {
          id?: number;
          username?: string;
          first_name?: string;
          last_name?: string;
        };
      };
    };
  };
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait" | "any" | "natural") => Promise<void>;
};

export function GameRoot() {
  const [collectionIds] = useState(() => cards.map((card) => card.id));
  const [screen, setScreen] = useState<"collection" | "battle">("collection");
  const [battleMode, setBattleMode] = useState<BattleMode>("ai");
  const [deckIds, setDeckIds] = useState(() => createStarterDeckIds(collectionIds));
  const [telegramPlayer, setTelegramPlayer] = useState<TelegramPlayer>(() => readTelegramPlayer());
  const [telegramLandscapePromptActive, setTelegramLandscapePromptActive] = useState(false);
  const playerName = telegramPlayer.name;

  useEffect(() => {
    const telegramPlayerHandle = window.setTimeout(() => setTelegramPlayer(readTelegramPlayer()), 0);

    return () => {
      window.clearTimeout(telegramPlayerHandle);
    };
  }, []);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;

    let disposed = false;
    const syncLandscape = () => {
      const landscape = isLandscapeViewport();
      setTelegramLandscapePromptActive(isMobileTelegramClient(webApp) && !landscape);

      if (landscape && canUseTelegramVersion(webApp, "8.0") && !webApp.isOrientationLocked) {
        try {
          webApp.lockOrientation?.();
        } catch {
          // Telegram clients may expose the method while rejecting the current platform.
        }
      }
    };

    webApp.ready?.();
    webApp.expand?.();
    webApp.disableVerticalSwipes?.();
    requestTelegramFullscreen(webApp);
    void requestLandscapeOrientation(webApp).finally(() => {
      if (!disposed) syncLandscape();
    });

    const syncHandle = window.setTimeout(syncLandscape, 0);
    window.addEventListener("resize", syncLandscape);
    window.screen.orientation?.addEventListener?.("change", syncLandscape);

    return () => {
      disposed = true;
      window.clearTimeout(syncHandle);
      window.removeEventListener("resize", syncLandscape);
      window.screen.orientation?.removeEventListener?.("change", syncLandscape);
    };
  }, []);

  const handleDeckChange = useCallback(
    (nextDeckIds: string[]) => {
      const sanitizedDeckIds = sanitizeDeckIds(nextDeckIds, collectionIds);

      setDeckIds(sanitizedDeckIds);
    },
    [collectionIds],
  );

  if (screen === "battle") {
    return (
      <>
        {battleMode === "human" ? (
          <RealtimeBattleGame
            playerCollectionIds={collectionIds}
            playerDeckIds={deckIds}
            playerName={playerName}
            telegramPlayer={telegramPlayer}
            onOpenCollection={() => setScreen("collection")}
          />
        ) : (
          <BattleGame
            playerCollectionIds={collectionIds}
            playerDeckIds={deckIds}
            playerName={playerName}
            onOpenCollection={() => setScreen("collection")}
          />
        )}
        <TelegramLandscapeOverlay active={telegramLandscapePromptActive} />
      </>
    );
  }

  return (
    <>
      <CollectionDeckScreen
        collectionIds={collectionIds}
        deckIds={deckIds}
        onDeckChange={handleDeckChange}
        onPlay={(nextDeckIds, mode) => {
          handleDeckChange(nextDeckIds);
          setBattleMode(mode);
          setScreen("battle");
        }}
      />
      <TelegramLandscapeOverlay active={telegramLandscapePromptActive} />
    </>
  );
}

function readTelegramPlayer(): TelegramPlayer {
  if (typeof window === "undefined") return {};

  const telegramUser = getTelegramWebApp()?.initDataUnsafe?.user;
  const telegramName = [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(" ").trim();
  const telegramUsername = telegramUser?.username ? `@${telegramUser.username}` : telegramName;
  if (telegramUser || telegramUsername) {
    return {
      telegramId: telegramUser?.id ? String(telegramUser.id) : undefined,
      name: telegramUsername || undefined,
      username: telegramUser?.username ? `@${telegramUser.username}` : undefined,
    };
  }

  const storageKeys = ["nexus:username", "username", "userName", "playerName"];
  for (const key of storageKeys) {
    const value = readStorageString(key);
    if (value) return { name: value };
  }

  return {};
}

function readStorageString(key: string) {
  try {
    return window.localStorage.getItem(key)?.trim() || window.sessionStorage.getItem(key)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getTelegramWebApp() {
  if (typeof window === "undefined") return undefined;
  const webApp = (window as TelegramWindow).Telegram?.WebApp;
  return webApp?.initData ? webApp : undefined;
}

function requestTelegramFullscreen(webApp: NonNullable<TelegramWindow["Telegram"]>["WebApp"]) {
  if (!webApp || webApp.isFullscreen || !canUseTelegramVersion(webApp, "8.0")) return;

  try {
    webApp.requestFullscreen?.();
  } catch {
    // Fullscreen can be unsupported on a Telegram client even when the JS bridge exists.
  }
}

async function requestLandscapeOrientation(webApp: NonNullable<TelegramWindow["Telegram"]>["WebApp"]) {
  if (typeof window === "undefined") return;
  if (!isMobileTelegramClient(webApp)) return;

  try {
    await (window.screen.orientation as LockableScreenOrientation | undefined)?.lock?.("landscape");
  } catch {
    // Browsers commonly require fullscreen/user activation before allowing orientation lock.
  }
}

function canUseTelegramVersion(webApp: NonNullable<TelegramWindow["Telegram"]>["WebApp"], version: string) {
  if (!webApp?.isVersionAtLeast) return false;

  try {
    return webApp.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

function isLandscapeViewport() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(orientation: landscape)").matches || window.innerWidth >= window.innerHeight;
}

function isMobileTelegramClient(webApp: NonNullable<TelegramWindow["Telegram"]>["WebApp"]) {
  const platform = webApp?.platform?.toLowerCase();
  if (platform === "android" || platform === "ios") return true;
  if (platform === "tdesktop" || platform === "macos" || platform === "weba" || platform === "webk") return false;

  return window.matchMedia("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) < 820;
}

function TelegramLandscapeOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <section className="pointer-events-none fixed inset-x-2 top-2 z-[100] flex justify-center text-center text-[#f8eed8]">
      <div className="max-w-[340px] rounded border border-[#ffe08a]/40 bg-[#05080b]/82 px-3 py-2 text-[10px] font-black uppercase tracking-[0.05em] text-[#ffe08a] shadow-[0_10px_28px_rgba(0,0,0,0.48)]">
        Горизонтально зручніше, але портретний режим теж працює.
      </div>
    </section>
  );
}

function sanitizeDeckIds(deckIds: string[], collectionIds: string[]) {
  const collection = new Set(collectionIds);
  const normalized = unique(deckIds).filter((cardId) => collection.has(cardId));

  if (normalized.length >= PLAYER_DECK_SIZE) return normalized;

  const normalizedSet = new Set(normalized);
  for (const cardId of collectionIds) {
    if (!normalizedSet.has(cardId)) {
      normalized.push(cardId);
      normalizedSet.add(cardId);
    }

    if (normalized.length >= PLAYER_DECK_SIZE) break;
  }

  return normalized;
}

function createStarterDeckIds(collectionIds: string[]) {
  return collectionIds.slice(0, PLAYER_DECK_SIZE);
}

function unique(values: string[]) {
  return [...new Set(values)];
}
