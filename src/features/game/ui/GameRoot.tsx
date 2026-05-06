"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cards } from "@/features/battle/model/cards";
import { BattleGame } from "@/features/battle/ui/BattleGame";
import { STARTER_BOOSTER_CARD_COUNT } from "@/features/boosters/types";
import { getOwnedCardIds } from "@/features/inventory/inventoryOps";
import { DEFAULT_PLAYER_AVATAR_URL, readTelegramPhotoUrl, resolveAvatarUrl, useTelegramAvatar } from "@/features/player/profile/avatar";
import { fetchPlayerProfile, resolveClientPlayerIdentity, savePlayerAvatar, savePlayerDeck } from "@/features/player/profile/client";
import { STARTER_FREE_BOOSTERS, type PlayerIdentity, type PlayerProfile } from "@/features/player/profile/types";
import { useOnlineCount } from "@/features/presence/client";
import { ProfileModal } from "@/features/player/ui/v2/ProfileModal";
import { AtmosphericBackground } from "@/shared/ui/v2/AtmosphericBackground";
import { LobbyBubble } from "@/shared/ui/v2/LobbyBubble";
import { LobbyChatDrawer } from "@/shared/ui/v2/LobbyChatDrawer";
import { TopBar } from "@/shared/ui/v2/TopBar";
import type { TelegramPlayer } from "@/shared/lib/telegram";
import { PLAYER_DECK_SIZE } from "../model/randomDeck";
import { clearBattleSession, hasBattleSession } from "@/features/battle/persistence";
import { useUrlEnum } from "./useUrlState";
import { BoosterShopModal } from "./v2/collection/BoosterShopModal";
import { CollectionDeckScreen } from "./v2/collection/CollectionDeckScreen";
import { StarterBoosterOnboarding } from "./v2/onboarding/StarterBoosterOnboarding";

type BattleMode = "ai" | "human";
type ProfileStatus = "loading" | "ready" | "unavailable";
type DeckSource = "profile" | "starter-fallback";
type DeckSaveStatus = "idle" | "saving" | "saved" | "error";
const STARTER_KIT_CARD_COUNT = STARTER_FREE_BOOSTERS * STARTER_BOOSTER_CARD_COUNT;
type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      ready?: () => void;
      expand?: () => void;
      platform?: string;
      unlockOrientation?: () => void;
      disableVerticalSwipes?: () => void;
      setHeaderColor?: (color: string) => void;
      setBackgroundColor?: (color: string) => void;
      setBottomBarColor?: (color: string) => void;
      viewportHeight?: number;
      viewportStableHeight?: number;
      onEvent?: (eventType: string, eventHandler: () => void) => void;
      offEvent?: (eventType: string, eventHandler: () => void) => void;
      initDataUnsafe?: {
        user?: {
          id?: number;
          username?: string;
          first_name?: string;
          last_name?: string;
          photo_url?: string;
        };
      };
    };
  };
};
type TelegramWebApp = NonNullable<NonNullable<TelegramWindow["Telegram"]>["WebApp"]>;

export function GameRoot() {
  const allCardIds = useMemo(() => cards.map((card) => card.id), []);
  const [screen, setScreen] = useUrlEnum<"collection" | "battle">("screen", ["collection", "battle"], "collection", "push");
  const [battleMode, setBattleMode] = useState<BattleMode>("human");
  const [deckIds, setDeckIds] = useState<string[]>([]);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [playerIdentity, setPlayerIdentity] = useState<PlayerIdentity | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("loading");
  const [deckSaveStatus, setDeckSaveStatus] = useState<DeckSaveStatus>("idle");
  const [profileRetryKey, setProfileRetryKey] = useState(0);
  const [starterDeckReadyVisible, setStarterDeckReadyVisible] = useState(false);
  const [telegramPlayer, setTelegramPlayer] = useState<TelegramPlayer>(() => readTelegramPlayer());
  const deckTouchedRef = useRef(false);
  const deckSaveRequestRef = useRef(0);
  const lastConfirmedDeckIdsRef = useRef<string[]>([]);
  const ownedCardIds = useMemo(() => getOwnedCardIdsForProfile(playerProfile, allCardIds), [allCardIds, playerProfile]);
  const profileDeckIds = useMemo(() => getDeckIdsForProfile(playerProfile, ownedCardIds), [ownedCardIds, playerProfile]);
  const deckSource: DeckSource = profileDeckIds.length > 0 ? "profile" : "starter-fallback";
  const deckReadyToPlay = isSavedOwnedDeckReady(profileDeckIds, deckIds, deckSaveStatus);
  const starterFreeBoostersRemaining = playerProfile?.starterFreeBoostersRemaining ?? 0;
  const playerName = telegramPlayer.name;
  const showStarterOnboarding =
    profileStatus === "ready" &&
    Boolean(playerIdentity) &&
    Boolean(playerProfile) &&
    (starterDeckReadyVisible ||
      ((playerProfile?.starterFreeBoostersRemaining ?? 0) > 0 && !playerProfile?.onboarding.completed));

  useEffect(() => {
    const telegramPlayerHandle = window.setTimeout(() => setTelegramPlayer(readTelegramPlayer()), 0);

    return () => {
      window.clearTimeout(telegramPlayerHandle);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const identity = resolveClientPlayerIdentity();

    void fetchPlayerProfile(identity)
      .then((profile) => {
        if (disposed) return;
        lastConfirmedDeckIdsRef.current = getConfirmedDeckIds(profile, allCardIds);
        setPlayerIdentity(identity);
        setPlayerProfile(profile);
        setProfileStatus("ready");
        setDeckSaveStatus("idle");
      })
      .catch(() => {
        if (disposed) return;
        setPlayerIdentity(identity);
        setPlayerProfile(null);
        setProfileStatus("unavailable");
        lastConfirmedDeckIdsRef.current = [];
        setDeckSaveStatus("idle");
      });

    return () => {
      disposed = true;
    };
  }, [allCardIds, profileRetryKey]);

  useEffect(() => {
    if (deckTouchedRef.current) return;

    const nextDeckIds = profileDeckIds.length > 0 ? profileDeckIds : createStarterDeckIds(ownedCardIds);
    setDeckIds(nextDeckIds);
  }, [ownedCardIds, profileDeckIds]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    const syncViewportHeight = () => syncAppViewportHeight(webApp);

    syncViewportHeight();

    if (webApp) {
      document.documentElement.dataset.telegramWebapp = "true";
      webApp.ready?.();
      webApp.expand?.();
      webApp.disableVerticalSwipes?.();
      applyTelegramChromeColors(webApp);
      releaseTelegramOrientationLock(webApp);
      webApp.onEvent?.("viewportChanged", syncViewportHeight);
    }

    const syncHandle = window.setTimeout(syncViewportHeight, 0);
    window.addEventListener("resize", syncViewportHeight);
    window.visualViewport?.addEventListener?.("resize", syncViewportHeight);

    return () => {
      window.clearTimeout(syncHandle);
      window.removeEventListener("resize", syncViewportHeight);
      window.visualViewport?.removeEventListener?.("resize", syncViewportHeight);
      webApp?.offEvent?.("viewportChanged", syncViewportHeight);
      if (webApp) {
        document.documentElement.removeAttribute("data-telegram-webapp");
      }
    };
  }, []);

  const handleDeckChange = useCallback(
    (nextDeckIds: string[]) => {
      const sanitizedDeckIds = sanitizeDeckIds(nextDeckIds, ownedCardIds);
      const changed = !sameStringArray(deckIds, sanitizedDeckIds);

      deckTouchedRef.current = true;
      setDeckIds(sanitizedDeckIds);

      if (!changed || !playerIdentity || !playerProfile || profileStatus !== "ready" || sanitizedDeckIds.length < PLAYER_DECK_SIZE) {
        return;
      }

      const requestId = deckSaveRequestRef.current + 1;
      deckSaveRequestRef.current = requestId;
      setDeckSaveStatus("saving");

      void savePlayerDeck(playerIdentity, sanitizedDeckIds)
        .then((nextProfile) => {
          if (deckSaveRequestRef.current !== requestId) return;
          const confirmedDeckIds = getConfirmedDeckIds(nextProfile, allCardIds);
          lastConfirmedDeckIdsRef.current = confirmedDeckIds;
          setPlayerProfile(nextProfile);
          setDeckIds(confirmedDeckIds);
          setDeckSaveStatus("saved");
        })
        .catch(() => {
          if (deckSaveRequestRef.current !== requestId) return;
          setDeckIds(lastConfirmedDeckIdsRef.current);
          setDeckSaveStatus("error");
        });
    },
    [allCardIds, deckIds, ownedCardIds, playerIdentity, playerProfile, profileStatus],
  );
  const handleStarterProfileChange = useCallback((nextProfile: PlayerProfile) => {
    deckTouchedRef.current = false;
    lastConfirmedDeckIdsRef.current = getConfirmedDeckIds(nextProfile, allCardIds);
    setPlayerProfile(nextProfile);
    setDeckSaveStatus("idle");
    setStarterDeckReadyVisible(isStarterKitReady(nextProfile, allCardIds));
  }, [allCardIds]);
  const handleStarterDeckPlay = useCallback((starterDeckIds: string[], mode: BattleMode = "human") => {
    const sanitizedDeckIds = sanitizeDeckIds(starterDeckIds, ownedCardIds);
    if (sanitizedDeckIds.length < PLAYER_DECK_SIZE) return;

    deckTouchedRef.current = true;
    setDeckIds(sanitizedDeckIds);
    setStarterDeckReadyVisible(false);
    setBattleMode(mode);
    clearBattleSession();
    setScreen("battle");
  }, [ownedCardIds, setScreen]);
  const handleStarterDeckEdit = useCallback(
    (starterDeckIds: string[]) => {
      deckTouchedRef.current = true;
      setDeckIds(sanitizeDeckIds(starterDeckIds, ownedCardIds));
      setStarterDeckReadyVisible(false);
      setScreen("collection");
    },
    [ownedCardIds, setScreen],
  );
  const handleSavedDeckPlay = useCallback(
    (nextDeckIds: string[], mode: BattleMode) => {
      const sanitizedDeckIds = sanitizeDeckIds(nextDeckIds, ownedCardIds);
      if (!deckReadyToPlay || !sameStringArray(sanitizedDeckIds, profileDeckIds)) return;

      deckTouchedRef.current = true;
      setDeckIds(profileDeckIds);
      setBattleMode(mode);
      clearBattleSession();
      setScreen("battle");
    },
    [deckReadyToPlay, ownedCardIds, profileDeckIds, setScreen],
  );
  const handleBattlePlayerUpdated = useCallback((nextProfile: PlayerProfile) => {
    const nextOwnedCardIds = getOwnedCardIdsForProfile(nextProfile, allCardIds);
    if (!deckIds.every((cardId) => nextOwnedCardIds.includes(cardId))) return;

    lastConfirmedDeckIdsRef.current = getConfirmedDeckIds(nextProfile, allCardIds);
    setPlayerProfile(nextProfile);
  }, [allCardIds, deckIds]);
  const retryProfileLoad = useCallback(() => {
    deckTouchedRef.current = false;
    setStarterDeckReadyVisible(false);
    setPlayerProfile(null);
    setProfileStatus("loading");
    lastConfirmedDeckIdsRef.current = [];
    setDeckSaveStatus("idle");
    setProfileRetryKey((current) => current + 1);
  }, []);

  const liveTelegramAvatarUrl = useTelegramAvatar();
  const handlePlayFromHud = useCallback(() => {
    if (!deckReadyToPlay || profileDeckIds.length < PLAYER_DECK_SIZE) return;
    handleSavedDeckPlay(profileDeckIds, "human");
  }, [deckReadyToPlay, handleSavedDeckPlay, profileDeckIds]);
  const hudCanPlay =
    profileStatus === "ready" && deckReadyToPlay && profileDeckIds.length >= PLAYER_DECK_SIZE;

  // Persist Telegram photo_url onto the profile when it differs from what we
  // already stored. We do this once per (identity, photoUrl) tuple so a slow
  // network or transient 4xx does not retry-storm.
  useEffect(() => {
    if (!playerIdentity || !playerProfile || profileStatus !== "ready") return;
    const livePhoto = liveTelegramAvatarUrl ?? readTelegramPhotoUrl();
    if (!livePhoto) return;
    if (playerProfile.avatarUrl === livePhoto) return;

    let cancelled = false;
    void savePlayerAvatar(playerIdentity, livePhoto)
      .then((nextProfile) => {
        if (cancelled) return;
        setPlayerProfile((current) => (current ? { ...current, avatarUrl: nextProfile.avatarUrl } : current));
      })
      .catch((error) => {
        // Persistence failure is non-fatal: the live Telegram photo continues
        // to render via useTelegramAvatar() for this session.
        if (cancelled) return;
        console.warn("Failed to persist Telegram avatar URL.", error);
      });

    return () => {
      cancelled = true;
    };
  }, [liveTelegramAvatarUrl, playerIdentity, playerProfile, profileStatus]);

  // Refresh on `?screen=battle` arrives before the profile/deck have hydrated;
  // bounce back to the collection unless we have a persisted session that
  // BattleGame can resume from. Without this guard, BattleGame's createInitialGame
  // throws on the empty placeholder deck.
  const hasPersistedBattleSession = screen === "battle" && hasBattleSession();
  const battleResumable = screen === "battle" && (deckIds.length >= PLAYER_DECK_SIZE || hasPersistedBattleSession);
  useEffect(() => {
    if (screen !== "battle") return;
    if (profileStatus !== "ready") return;
    if (battleResumable) return;
    setScreen("collection");
  }, [battleResumable, profileStatus, screen, setScreen]);

  if (screen === "battle" && battleResumable) {
    const persistedAvatarUrl = playerProfile?.avatarUrl;
    const resolvedBattleMode = battleMode === "ai" || hasPersistedBattleSession ? "ai" : "human";
    return (
      <>
        <BattleGame
          playerCollectionIds={ownedCardIds}
          playerDeckIds={deckIds}
          playerIdentity={playerIdentity ?? undefined}
          playerName={playerName}
          playerEloRating={playerProfile?.eloRating}
          telegramPlayer={telegramPlayer}
          mode={resolvedBattleMode}
          avatarUrl={persistedAvatarUrl}
          onOpenCollection={() => setScreen("collection")}
          onSwitchMode={(nextMode) => setBattleMode(nextMode)}
          onPlayerUpdated={handleBattlePlayerUpdated}
        />
      </>
    );
  }

  if (profileStatus === "loading") {
    return (
      <>
        <ProfileLoadingScreen />
      </>
    );
  }

  if (profileStatus === "unavailable") {
    return (
      <>
        <ProfileUnavailableScreen profileIdentityMode={playerIdentity?.mode} onRetry={retryProfileLoad} />
      </>
    );
  }

  if (showStarterOnboarding && playerIdentity && playerProfile) {
    return (
      <HudShell
        profile={playerProfile}
        playerName={playerName}
        playerIdentity={playerIdentity}
        liveTelegramAvatarUrl={liveTelegramAvatarUrl}
        canPlay={hudCanPlay}
        onPlay={handlePlayFromHud}
        onPlayerUpdated={handleStarterProfileChange}
      >
        <StarterBoosterOnboarding
          identity={playerIdentity}
          profile={playerProfile}
          profileStatus={profileStatus}
          profileIdentityMode={playerIdentity.mode}
          deckSource={deckSource}
          onProfileChange={handleStarterProfileChange}
          onPlayDeck={handleStarterDeckPlay}
          onEditDeck={handleStarterDeckEdit}
        />
      </HudShell>
    );
  }

  return (
    <HudShell
      profile={playerProfile}
      playerName={playerName}
      playerIdentity={playerIdentity}
      liveTelegramAvatarUrl={liveTelegramAvatarUrl}
      canPlay={hudCanPlay}
      onPlay={handlePlayFromHud}
      onPlayerUpdated={setPlayerProfile}
    >
      <CollectionDeckScreen
        collectionIds={ownedCardIds}
        ownedCards={playerProfile?.ownedCards ?? []}
        deckIds={deckIds}
        profileStatus={profileStatus}
        profileIdentityMode={playerIdentity?.mode}
        profileOwnedCardCount={ownedCardIds.length}
        profileDeckCount={playerProfile?.deckIds.length ?? 0}
        deckSource={deckSource}
        deckSaveStatus={deckSaveStatus}
        deckReadyToPlay={deckReadyToPlay}
        starterFreeBoostersRemaining={starterFreeBoostersRemaining}
        playerIdentity={playerIdentity}
        onPlayerUpdated={setPlayerProfile}
        onDeckChange={handleDeckChange}
        onPlay={handleSavedDeckPlay}
      />
    </HudShell>
  );
}

function HudShell({
  profile,
  playerName,
  playerIdentity,
  liveTelegramAvatarUrl,
  canPlay,
  onPlay,
  onPlayerUpdated,
  children,
}: {
  profile: PlayerProfile | null;
  playerName?: string;
  playerIdentity: PlayerIdentity | null;
  liveTelegramAvatarUrl: string | null;
  canPlay: boolean;
  onPlay: () => void;
  onPlayerUpdated?: (profile: PlayerProfile) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const onlineCount = useOnlineCount();
  const [profileOpen, setProfileOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [boosterShopOpen, setBoosterShopOpen] = useState(false);

  if (!profile) {
    return <AtmosphericBackground>{children}</AtmosphericBackground>;
  }

  const avatarUrl = resolveAvatarUrl({
    storedAvatarUrl: profile.avatarUrl,
    liveAvatarUrl: liveTelegramAvatarUrl,
  });
  const displayName = (playerName?.trim() || "Гравець").slice(0, 32);

  return (
    <AtmosphericBackground>
      <div className="flex min-h-screen flex-col">
        <TopBar
          avatarUrl={avatarUrl || DEFAULT_PLAYER_AVATAR_URL}
          name={displayName}
          level={profile.level}
          crystals={profile.crystals}
          trophies={profile.eloRating}
          canPlay={canPlay}
          onPlay={onPlay}
          onAvatarClick={() => setProfileOpen(true)}
          onOpenBoosters={playerIdentity ? () => setBoosterShopOpen(true) : undefined}
          onlineCount={onlineCount}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <LobbyBubble count={onlineCount ?? 0} onClick={() => setLobbyOpen(true)} />
      <BoosterShopModal
        open={boosterShopOpen}
        onClose={() => setBoosterShopOpen(false)}
        playerIdentity={playerIdentity}
        profileCrystals={profile.crystals}
        onProfileChange={onPlayerUpdated}
        onCrystalsUpdated={(next) => onPlayerUpdated?.({ ...profile, crystals: next })}
      />
      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        profile={profile}
        playerName={playerName}
        liveAvatarUrl={liveTelegramAvatarUrl}
        onOpenGuide={() => {
          setProfileOpen(false);
          router.push("/guide");
        }}
      />
      <LobbyChatDrawer
        open={lobbyOpen}
        onClose={() => setLobbyOpen(false)}
        userName={playerName?.trim()}
      />
    </AtmosphericBackground>
  );
}

function ProfileUnavailableScreen({
  profileIdentityMode,
  onRetry,
}: {
  profileIdentityMode?: "telegram" | "guest";
  onRetry: () => void;
}) {
  return (
    <main
      className="grid min-h-screen place-items-center bg-[#080907] px-4 text-[#f7efd7]"
      data-testid="player-profile-shell"
      data-profile-status="unavailable"
      data-profile-identity-mode={profileIdentityMode ?? "unknown"}
      data-profile-owned-card-count="0"
      data-profile-deck-count="0"
      data-deck-source="starter-fallback"
      data-starter-free-boosters-remaining="0"
    >
      <section
        className="grid w-full max-w-[460px] gap-3 rounded-md border border-[#ef735a]/45 bg-[linear-gradient(180deg,rgba(36,20,16,0.94),rgba(9,11,11,0.97))] p-4 text-left shadow-[0_18px_42px_rgba(0,0,0,0.42)]"
        data-testid="profile-unavailable"
      >
        <b className="text-[11px] font-black uppercase tracking-[0.16em] text-[#efcf6f]">Профіль недоступний</b>
        <strong className="text-[clamp(24px,6vw,34px)] font-black uppercase leading-none text-[#fff0ad]">
          Не вдалося завантажити гравця
        </strong>
        <p className="text-sm font-bold leading-snug text-[#d6c5a0]">
          Стартові бустери та колода відкриваються тільки після збереженого профілю.
        </p>
        <button
          className="min-h-[42px] justify-self-start rounded-md border-2 border-black/55 bg-[linear-gradient(180deg,#fff26d,#e2b72e_56%,#966414)] px-5 text-sm font-black uppercase text-[#17100a] transition hover:brightness-110"
          type="button"
          onClick={onRetry}
          data-testid="profile-retry"
        >
          Спробувати ще раз
        </button>
      </section>
    </main>
  );
}

function ProfileLoadingScreen() {
  return (
    <main
      className="grid min-h-screen place-items-center bg-[#080907] px-4 text-[#f7efd7]"
      data-testid="player-profile-shell"
      data-profile-status="loading"
      data-profile-identity-mode="unknown"
      data-profile-owned-card-count="0"
      data-profile-deck-count="0"
      data-deck-source="starter-fallback"
      data-starter-free-boosters-remaining="0"
    >
      <section className="grid w-full max-w-[420px] gap-3 rounded-md border border-[#d4aa4d]/45 bg-[linear-gradient(180deg,rgba(28,27,19,0.94),rgba(9,11,11,0.97))] p-4 text-center shadow-[0_18px_42px_rgba(0,0,0,0.42)]">
        <b className="text-[11px] font-black uppercase tracking-[0.16em] text-[#d6b66d]">Нексус</b>
        <span className="text-lg font-black uppercase text-[#fff0ad]">Завантаження профілю</span>
      </section>
    </main>
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

function releaseTelegramOrientationLock(webApp: TelegramWebApp) {
  for (const unlock of [
    () => webApp.unlockOrientation?.(),
    () => (window.screen.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined)?.unlock?.(),
  ]) {
    try {
      unlock();
    } catch {
      // Some clients only allow unlock from a prior explicit lock or not at all.
    }
  }
}

function applyTelegramChromeColors(webApp: TelegramWebApp) {
  for (const apply of [
    () => webApp.setHeaderColor?.("#0d0e10"),
    () => webApp.setBackgroundColor?.("#0d0e10"),
    () => webApp.setBottomBarColor?.("#0d0e10"),
  ]) {
    try {
      apply();
    } catch {
      // Some Telegram clients expose only a subset of the chrome color API.
    }
  }
}

function syncAppViewportHeight(webApp?: TelegramWebApp) {
  if (typeof window === "undefined") return;

  const height =
    normalizeViewportHeight(webApp?.viewportStableHeight) ??
    normalizeViewportHeight(webApp?.viewportHeight) ??
    normalizeViewportHeight(window.visualViewport?.height) ??
    normalizeViewportHeight(window.innerHeight);

  if (!height) return;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

function normalizeViewportHeight(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return undefined;
  return Math.max(320, Math.round(value));
}

function getOwnedCardIdsForProfile(profile: PlayerProfile | null, allCardIds: string[]) {
  if (!profile) return [];
  const profileOwnedCardIds = getOwnedCardIds(profile.ownedCards);
  if (profileOwnedCardIds.length === 0) return [];

  const knownCards = new Set(allCardIds);
  return unique(profileOwnedCardIds).filter((cardId) => knownCards.has(cardId));
}

function getDeckIdsForProfile(profile: PlayerProfile | null, collectionIds: string[]) {
  if (!profile || profile.deckIds.length === 0) return [];
  return unique(profile.deckIds).filter((cardId) => collectionIds.includes(cardId));
}

function getConfirmedDeckIds(profile: PlayerProfile, allCardIds: string[]) {
  return getDeckIdsForProfile(profile, getOwnedCardIdsForProfile(profile, allCardIds));
}

function isSavedOwnedDeckReady(
  savedOwnedDeckIds: string[],
  currentDeckIds: string[],
  deckSaveStatus: DeckSaveStatus,
) {
  return (
    savedOwnedDeckIds.length >= PLAYER_DECK_SIZE &&
    sameStringArray(currentDeckIds, savedOwnedDeckIds) &&
    deckSaveStatus !== "saving"
  );
}

function isStarterKitReady(profile: PlayerProfile, allCardIds: string[]) {
  return (
    profile.starterFreeBoostersRemaining === 0 &&
    profile.openedBoosterIds.length >= STARTER_FREE_BOOSTERS &&
    getConfirmedDeckIds(profile, allCardIds).length >= STARTER_KIT_CARD_COUNT
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

function sameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}
