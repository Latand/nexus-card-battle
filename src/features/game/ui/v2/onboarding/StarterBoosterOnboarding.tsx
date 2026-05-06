"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Card } from "@/features/battle/model/types";
import {
  fetchStarterBoosterCatalog,
  openStarterBooster,
} from "@/features/boosters/client";
import type { BoosterCatalogItem, BoosterResponse } from "@/features/boosters/types";
import { getOwnedCardIds } from "@/features/inventory/inventoryOps";
import {
  STARTER_FREE_BOOSTERS,
  type PlayerIdentity,
  type PlayerProfile,
} from "@/features/player/profile/types";
import { BoosterCatalog } from "./BoosterCatalog";
import { BoosterDetailModal } from "./BoosterDetailModal";
import { BoosterReveal } from "./BoosterReveal";
import { DeckReady } from "./DeckReady";
import {
  STARTER_KIT_CARD_COUNT,
  boosterStories,
  getSavedOwnedDeckIds,
  isStarterKitReady,
  resolveCards,
} from "./onboardingLogic";

type ProfileStatus = "loading" | "ready" | "unavailable";
type Phase = "catalog" | "opening" | "reveal" | "deck-ready";
type CatalogStatus = "loading" | "ready" | "error";
type RevealState = {
  booster: BoosterResponse;
  cards: Card[];
  player: PlayerProfile;
};

type StarterBoosterOnboardingProps = {
  identity: PlayerIdentity;
  profile: PlayerProfile;
  profileStatus: ProfileStatus;
  profileIdentityMode?: "telegram" | "guest";
  deckSource: "profile" | "starter-fallback";
  onProfileChange: (profile: PlayerProfile) => void;
  onPlayDeck: (deckIds: string[], mode: "ai" | "human") => void;
  onEditDeck: (deckIds: string[]) => void;
};

export function StarterBoosterOnboarding({
  identity,
  profile,
  profileStatus,
  profileIdentityMode,
  deckSource,
  onProfileChange,
  onPlayDeck,
  onEditDeck,
}: StarterBoosterOnboardingProps) {
  const [optimisticProfile, setOptimisticProfile] = useState<PlayerProfile | null>(null);
  const [phase, setPhase] = useState<Phase>("catalog");
  const [openingBoosterId, setOpeningBoosterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [revealedCount, setRevealedCount] = useState<number>(0);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogProfile, setCatalogProfile] = useState<PlayerProfile | null>(null);
  const [boosters, setBoosters] = useState<BoosterCatalogItem[]>([]);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState<number>(0);
  const [detailBoosterId, setDetailBoosterId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCatalogStatus("loading");
    setCatalogError(null);
    fetchStarterBoosterCatalog(identity)
      .then((response) => {
        if (cancelled) return;
        setBoosters(response.boosters);
        setCatalogProfile(response.player);
        setOptimisticProfile(response.player);
        setCatalogStatus("ready");
        onProfileChange(response.player);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Каталог недоступний.";
        setCatalogError(message);
        setCatalogStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [catalogRefreshKey, identity, onProfileChange]);

  const profileForDisplay = optimisticProfile ?? catalogProfile ?? profile;
  const openedCount = profileForDisplay.openedBoosterIds.length;
  const canChoose = phase === "catalog" && catalogStatus === "ready";
  const stateLabel = openedCount === 0 ? "Перший вибір" : "Другий вибір";
  const headerTitle = openedCount === 0 ? "Обери перший бустер" : "Другий бустер чекає";
  const detailBooster = useMemo(
    () => (detailBoosterId ? boosters.find((b) => b.id === detailBoosterId) ?? null : null),
    [detailBoosterId, boosters],
  );
  const detailStory = detailBooster ? boosterStories[detailBooster.id] : undefined;

  const handleOpenBooster = useCallback(
    async (booster: BoosterCatalogItem) => {
      if (!canChoose || !booster.starter.canOpen) return;
      setPhase("opening");
      setOpeningBoosterId(booster.id);
      setError(null);
      setDetailBoosterId(null);
      try {
        const response = await openStarterBooster(identity, booster.id);
        if (response.cards.length === 0) {
          throw new Error("Starter booster did not return cards.");
        }
        setOptimisticProfile(response.player);
        onProfileChange(response.player);
        setReveal({ booster: response.booster, cards: response.cards, player: response.player });
        setRevealedCount(response.cards.length);
        setPhase("reveal");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Не вдалося відкрити бустер.";
        setError(message);
        setPhase("catalog");
      } finally {
        setOpeningBoosterId(null);
      }
    },
    [canChoose, identity, onProfileChange],
  );

  const handleSelectFromCatalog = useCallback(
    (booster: BoosterCatalogItem) => {
      if (!canChoose) return;
      setDetailBoosterId(booster.id);
    },
    [canChoose],
  );

  const finishReveal = useCallback(() => {
    if (!reveal) return;
    setOptimisticProfile(reveal.player);
    onProfileChange(reveal.player);
    if (isStarterKitReady(reveal.player)) {
      setPhase("deck-ready");
    } else {
      setReveal(null);
      setRevealedCount(0);
      setBoosters([]);
      setCatalogStatus("loading");
      setCatalogRefreshKey((value) => value + 1);
      setPhase("catalog");
    }
  }, [reveal, onProfileChange]);

  const deckReadyAfterReveal = reveal ? isStarterKitReady(reveal.player) : false;
  const continueLabel = deckReadyAfterReveal ? "До колоди" : "До каталогу";

  const deckIds = useMemo(() => getSavedOwnedDeckIds(profileForDisplay), [profileForDisplay]);
  const deckCards = useMemo(() => {
    const ids = deckIds.length > 0 ? deckIds : getOwnedCardIds(profileForDisplay.ownedCards);
    return resolveCards(ids).slice(0, STARTER_KIT_CARD_COUNT);
  }, [deckIds, profileForDisplay]);

  const ownedCardCount = getOwnedCardIds(profileForDisplay.ownedCards).length;
  const profileDeckCount = profileForDisplay.deckIds.length;
  const starterFreeRemaining = profileForDisplay.starterFreeBoostersRemaining;

  return (
    <>
      <main
        data-testid="player-profile-shell"
        data-profile-status={profileStatus}
        data-profile-identity-mode={profileIdentityMode ?? ""}
        data-profile-owned-card-count={ownedCardCount}
        data-profile-deck-count={profileDeckCount}
        data-deck-source={deckSource}
        data-starter-free-boosters-remaining={starterFreeRemaining}
        className="contents"
      >
      <section
        data-testid="starter-onboarding-shell"
        data-phase={phase}
        data-catalog-status={catalogStatus}
        data-opened-booster-count={openedCount}
        data-progress-count={Math.min(openedCount, STARTER_FREE_BOOSTERS)}
        // 44px desktop / 36px mobile chrome lives in GameRoot above this section.
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-6 sm:gap-8 sm:px-6 sm:pt-10"
      >
        {phase !== "reveal" && phase !== "deck-ready" && (
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-medium text-ink">Стартовий комплект</h1>
              <p className="mt-1 text-sm text-ink-mute">
                Обери два бустери. У кожному 5 карт.
              </p>
              <p className="mt-1 text-xs text-ink-mute sm:hidden">{headerTitle}</p>
            </div>
            <div data-testid="starter-state-wrap" className="flex items-center gap-3">
              <StarterProgress openedCount={openedCount} />
              <span
                data-testid="starter-state-label"
                className="text-xs uppercase tracking-[0.16em] text-accent whitespace-nowrap"
              >
                {stateLabel}
              </span>
            </div>
          </header>
        )}

        {phase === "catalog" && (
          <>
            {catalogStatus === "loading" && (
              <p data-testid="starter-catalog-loading" className="text-sm text-ink-mute">
                Завантажуємо бустери…
              </p>
            )}
            {catalogStatus === "error" && (
              <p
                data-testid="starter-catalog-error"
                className="rounded-md border border-danger/40 bg-surface px-4 py-3 text-sm text-danger"
              >
                {catalogError ?? "Не вдалося отримати каталог."}
              </p>
            )}
            {error && (
              <p
                data-testid="starter-booster-error"
                className="rounded-md border border-danger/40 bg-surface px-4 py-3 text-sm text-danger"
              >
                {error}
              </p>
            )}
            {catalogStatus === "ready" && (
              <BoosterCatalog
                boosters={boosters}
                selectedId={detailBoosterId}
                busy={false}
                onSelect={handleSelectFromCatalog}
              />
            )}
          </>
        )}

        {phase === "opening" && (
          <>
            <p
              data-testid="starter-opening-pending"
              className="rounded-md border border-accent-quiet bg-surface px-4 py-3 text-sm text-ink-mute"
            >
              Відкриваємо бустер…
            </p>
            {boosters.length > 0 && (
              <BoosterCatalog
                boosters={boosters}
                selectedId={openingBoosterId}
                busy
                onSelect={() => {}}
              />
            )}
          </>
        )}

        {phase === "reveal" && reveal && (
          <BoosterReveal
            booster={reveal.booster}
            cards={reveal.cards}
            revealedCount={revealedCount}
            continueLabel={continueLabel}
            onContinue={finishReveal}
          />
        )}

        {phase === "deck-ready" && (
          <DeckReady
            profile={profileForDisplay}
            deckIds={deckIds}
            cards={deckCards}
            openedBoosterCount={openedCount}
            canPlay={isStarterKitReady(profileForDisplay)}
            onPlayArena={() => onPlayDeck(deckIds, "human")}
            onEdit={() => onEditDeck(deckIds)}
          />
        )}
      </section>
      </main>

      <BoosterDetailModal
        booster={detailBooster}
        story={detailStory}
        busy={phase === "opening"}
        onClose={() => setDetailBoosterId(null)}
        onOpen={handleOpenBooster}
      />
    </>
  );
}

function StarterProgress({ openedCount }: { openedCount: number }) {
  return (
    <section
      data-testid="starter-progress"
      className="flex items-center gap-1.5"
      aria-label={`Відкрито ${Math.min(openedCount, STARTER_FREE_BOOSTERS)} з ${STARTER_FREE_BOOSTERS} бустерів`}
    >
      {Array.from({ length: STARTER_FREE_BOOSTERS }).map((_, index) => {
        const filled = index < openedCount;
        return (
          <span
            key={index}
            data-testid={`starter-progress-slot-${index + 1}`}
            data-filled={filled}
            className={
              filled ? "h-1 w-8 rounded-full bg-accent" : "h-1 w-8 rounded-full bg-accent-quiet/50"
            }
          />
        );
      })}
    </section>
  );
}

export default StarterBoosterOnboarding;
