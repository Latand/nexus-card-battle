"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cards } from "@/features/battle/model/cards";
import { BattleGame } from "@/features/battle/ui/BattleGame";
import { RealtimeBattleGame } from "@/features/battle/ui/RealtimeBattleGame";
import type { TelegramPlayer } from "@/shared/lib/telegram";
import { PLAYER_DECK_SIZE } from "../model/randomDeck";
import { CollectionDeckScreen } from "./collection/CollectionDeckScreen";

const DECK_SESSION_STORAGE_KEY = "nexus:deck-session:v1";
const DECK_CLOUD_STORAGE_KEY = "nexus_deck_v1";
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
      CloudStorage?: {
        getItem: (key: string, callback: (error: string | Error | null, value?: string) => void) => void;
        setItem: (key: string, value: string, callback?: (error: string | Error | null, stored?: boolean) => void) => void;
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
  const deckIdsRef = useRef(deckIds);
  const deckTouchedRef = useRef(false);
  const persistenceReadyRef = useRef(false);

  useEffect(() => {
    deckIdsRef.current = deckIds;
  }, [deckIds]);

  useEffect(() => {
    const telegramPlayerHandle = window.setTimeout(() => setTelegramPlayer(readTelegramPlayer()), 0);

    const cancelPersistenceTask = schedulePersistenceTask(() => {
      void loadSavedDeckIds(collectionIds).then((savedDeckIds) => {
        persistenceReadyRef.current = true;

        if (savedDeckIds && !deckTouchedRef.current) {
          deckIdsRef.current = savedDeckIds;
          setDeckIds(savedDeckIds);
          return;
        }

        void saveDeckIds(deckIdsRef.current);
      });
    });

    return () => {
      window.clearTimeout(telegramPlayerHandle);
      cancelPersistenceTask();
    };
  }, [collectionIds]);

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

  useEffect(() => {
    if (!persistenceReadyRef.current) return;
    return schedulePersistenceTask(() => {
      void saveDeckIds(deckIds);
    });
  }, [deckIds]);

  const handleDeckChange = useCallback(
    (nextDeckIds: string[]) => {
      const sanitizedDeckIds = sanitizeDeckIds(nextDeckIds, collectionIds);

      deckTouchedRef.current = true;
      deckIdsRef.current = sanitizedDeckIds;
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

async function loadSavedDeckIds(collectionIds: string[]) {
  if (typeof window === "undefined") return null;

  const cloudDeckIds = await readCloudDeckIds(collectionIds);
  if (cloudDeckIds) return cloudDeckIds;

  try {
    const raw = window.sessionStorage.getItem(DECK_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isStringArray(parsed)) return null;

    return sanitizeDeckIds(parsed, collectionIds);
  } catch {
    return null;
  }
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

async function saveDeckIds(deckIds: string[]) {
  if (typeof window === "undefined") return;

  await writeCloudDeckIds(deckIds);

  try {
    window.sessionStorage.setItem(DECK_SESSION_STORAGE_KEY, JSON.stringify(deckIds));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
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
    <section className="fixed inset-0 z-[100] grid place-items-center bg-[#05080b] px-5 text-center text-[#f8eed8]">
      <div className="grid max-w-[420px] gap-3">
        <strong className="text-3xl font-black uppercase leading-none text-[#ffe08a] [font-family:Impact,Arial_Narrow,sans-serif]">
          Поверни екран
        </strong>
        <p className="text-sm font-black uppercase tracking-[0.04em] text-[#d9ceb2]">
          Арена відкривається на весь екран і найкраще працює горизонтально.
        </p>
      </div>
    </section>
  );
}

async function readCloudDeckIds(collectionIds: string[]) {
  const cloudStorage = getTelegramWebApp()?.CloudStorage;
  if (!cloudStorage) return null;

  const raw = await new Promise<string | undefined>((resolve) => {
    cloudStorage.getItem(DECK_CLOUD_STORAGE_KEY, (error, value) => {
      resolve(error ? undefined : value);
    });
  });

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isStringArray(parsed)) return null;

    return sanitizeDeckIds(parsed, collectionIds);
  } catch {
    return null;
  }
}

async function writeCloudDeckIds(deckIds: string[]) {
  const cloudStorage = getTelegramWebApp()?.CloudStorage;
  if (!cloudStorage) return;

  await new Promise<void>((resolve) => {
    cloudStorage.setItem(DECK_CLOUD_STORAGE_KEY, JSON.stringify(deckIds), () => resolve());
  });
}

function schedulePersistenceTask(task: () => void) {
  if (typeof window === "undefined") return () => {};

  const handle = window.setTimeout(task, 0);
  return () => window.clearTimeout(handle);
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function unique(values: string[]) {
  return [...new Set(values)];
}
