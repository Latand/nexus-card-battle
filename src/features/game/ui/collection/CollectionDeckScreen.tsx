"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import { cards } from "@/features/battle/model/cards";
import { clanList } from "@/features/battle/model/clans";
import type { Card, Rarity } from "@/features/battle/model/types";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import { SELL_PRICES_BY_RARITY } from "@/features/economy/sellPricing";
import { getOwnedCount, getSellableCount, type OwnedCardEntry } from "@/features/inventory/inventoryOps";
import { sellPlayerCards } from "@/features/player/profile/client";
import type { PlayerIdentity, PlayerProfile } from "@/features/player/profile/types";
import { cn } from "@/shared/lib/cn";
import { PLAYER_DECK_SIZE } from "../../model/randomDeck";

type Props = {
  collectionIds: string[];
  ownedCards: readonly OwnedCardEntry[];
  deckIds: string[];
  profileStatus: "loading" | "ready" | "unavailable";
  profileIdentityMode?: "telegram" | "guest";
  profileOwnedCardCount: number;
  profileDeckCount: number;
  deckSource: "profile" | "starter-fallback";
  deckSaveStatus: "idle" | "saving" | "saved" | "error";
  deckReadyToPlay: boolean;
  starterFreeBoostersRemaining: number;
  playerIdentity?: PlayerIdentity | null;
  onPlayerUpdated?: (profile: PlayerProfile) => void;
  onDeckChange: (deckIds: string[]) => void;
  onPlay: (deckIds: string[], mode: "ai" | "human") => void;
};

type SellStatus =
  | { kind: "idle" }
  | { kind: "selling" }
  | { kind: "error"; message: string };

type CollectionMode = "owned" | "base";
type RarityFilter = Rarity | "all";
type SortMode = "rarity" | "power" | "damage" | "name";

const GAME_TITLE = "Нексус";
const GRID_LIMIT = 240;
const rarityOrder: Record<Rarity, number> = {
  Legend: 4,
  Unique: 3,
  Rare: 2,
  Common: 1,
};
const rarityLabels: Record<Rarity, string> = {
  Common: "COMMON",
  Rare: "RARE",
  Unique: "UNIQ",
  Legend: "LEGEND",
};
const rarityFilters: { id: RarityFilter; label: string }[] = [
  { id: "all", label: "Усі" },
  { id: "Legend", label: "Легендарні" },
  { id: "Unique", label: "Унікальні" },
  { id: "Rare", label: "Рідкісні" },
  { id: "Common", label: "Звичайні" },
];
const sortModes: { id: SortMode; label: string }[] = [
  { id: "rarity", label: "Рідкість" },
  { id: "power", label: "Сила" },
  { id: "damage", label: "Урон" },
  { id: "name", label: "Ім’я" },
];
const collectionModes: { id: CollectionMode; label: string }[] = [
  { id: "owned", label: "Мої" },
  { id: "base", label: "Уся база" },
];

export function CollectionDeckScreen({
  collectionIds,
  ownedCards,
  deckIds: savedDeckIds = [],
  profileStatus,
  profileIdentityMode,
  profileOwnedCardCount,
  profileDeckCount,
  deckSource,
  deckSaveStatus,
  deckReadyToPlay,
  starterFreeBoostersRemaining,
  playerIdentity,
  onPlayerUpdated,
  onDeckChange,
  onPlay,
}: Props) {
  const ownedSet = useMemo(() => new Set(collectionIds), [collectionIds]);
  const ownedCardCatalog = useMemo(() => cards.filter((card) => ownedSet.has(card.id)), [ownedSet]);
  const [collectionMode, setCollectionMode] = useState<CollectionMode>("owned");
  const browsingCards = collectionMode === "owned" ? ownedCardCatalog : cards;
  const canEditDeck = collectionMode === "owned" && deckSaveStatus !== "saving";
  const deckIds = useMemo(
    () => savedDeckIds.filter((cardId) => ownedSet.has(cardId)),
    [ownedSet, savedDeckIds],
  );
  const [selectedId, setSelectedId] = useState(() => deckIds[0] ?? ownedCardCatalog[0]?.id);
  const [query, setQuery] = useState("");
  const [activeFaction, setActiveFaction] = useState("all");
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("rarity");
  const [visiblePage, setVisiblePage] = useState({ key: "", limit: GRID_LIMIT });
  const [sellStatus, setSellStatus] = useState<SellStatus>({ kind: "idle" });

  const handleSellCard = useCallback(
    async (card: Card, count: number) => {
      if (!playerIdentity || !onPlayerUpdated) return;
      if (count <= 0) return;

      const ownedCount = getOwnedCount(ownedCards, card.id);
      const lastCopy = ownedCount === count;
      const requiresConfirm = card.rarity === "Legend" || lastCopy;
      if (requiresConfirm && typeof window !== "undefined") {
        const message = lastCopy
          ? `Видалити останню копію ${card.name}?`
          : `Продати ${count} × ${card.name}?`;
        if (!window.confirm(message)) return;
      }

      setSellStatus({ kind: "selling" });
      const result = await sellPlayerCards(playerIdentity, card.id, count).catch((error: unknown) => ({
        ok: false as const,
        error: "unknown" as const,
        message: error instanceof Error ? error.message : undefined,
      }));
      if (result.ok) {
        onPlayerUpdated(result.player);
        setSellStatus({ kind: "idle" });
        return;
      }

      setSellStatus({ kind: "error", message: sellErrorMessage(result.error) });
    },
    [onPlayerUpdated, ownedCards, playerIdentity],
  );

  const deckCards = useMemo(() => deckIds.map((cardId) => cards.find((card) => card.id === cardId)).filter(Boolean) as Card[], [deckIds]);
  const browsingCardIds = useMemo(() => new Set(browsingCards.map((card) => card.id)), [browsingCards]);
  const activeSelectedId = selectedId && browsingCardIds.has(selectedId) ? selectedId : deckIds[0] ?? browsingCards[0]?.id;
  const selectedCard = activeSelectedId ? cards.find((card) => card.id === activeSelectedId) : undefined;
  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return browsingCards
      .filter((card) => activeFaction === "all" || card.clan === activeFaction)
      .filter((card) => rarity === "all" || card.rarity === rarity)
      .filter((card) => {
        if (!normalizedQuery) return true;
        return [card.name, card.clan, card.ability.name, card.bonus.name].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );
      })
      .sort((left, right) => sortCards(left, right, sortMode));
  }, [activeFaction, browsingCards, query, rarity, sortMode]);
  const visibleScopeKey = [collectionMode, activeFaction, query, rarity, sortMode].join("\u0000");
  const visibleLimit = visiblePage.key === visibleScopeKey ? visiblePage.limit : GRID_LIMIT;
  const visibleCards = filteredCards.slice(0, visibleLimit);
  const canLoadMoreCards = visibleCards.length < filteredCards.length;
  const canPlay = deckIds.length >= PLAYER_DECK_SIZE && deckReadyToPlay;
  const canRemoveCard = canEditDeck && deckIds.length > PLAYER_DECK_SIZE;
  const deckStats = getDeckStats(deckCards);
  const activeLinks = getActiveLinks(deckCards);
  const browsingFactions = useMemo(
    () => clanList.filter((faction) => browsingCards.some((card) => card.clan === faction.name)),
    [browsingCards],
  );

  function addCard(card: Card) {
    setSelectedId(card.id);
    if (!canEditDeck || !ownedSet.has(card.id)) return;
    if (deckIds.includes(card.id)) return;
    onDeckChange([...deckIds, card.id]);
  }

  function removeCard(cardId: string) {
    if (!canEditDeck) return;
    if (!canRemoveCard) return;
    onDeckChange(deckIds.filter((item) => item !== cardId));
  }

  function trimDeckToMinimum() {
    if (!canEditDeck) return;
    onDeckChange(deckIds.slice(0, PLAYER_DECK_SIZE));
    setSelectedId(deckIds[0] ?? selectedId);
  }

  function autofillDeck() {
    if (!canEditDeck) return;

    const already = new Set(deckIds);
    const next = [...deckIds];

    for (const card of filteredCards) {
      if (next.length >= PLAYER_DECK_SIZE) break;
      if (!already.has(card.id)) {
        next.push(card.id);
        already.add(card.id);
      }
    }

    onDeckChange(next);
    setSelectedId(next[0] ?? selectedId);
  }

  return (
    <main
      className="min-h-screen bg-[#07090b] text-[#f9efd8]"
      data-testid="player-profile-shell"
      data-profile-status={profileStatus}
      data-profile-identity-mode={profileIdentityMode ?? "unknown"}
      data-profile-owned-card-count={profileOwnedCardCount}
      data-profile-deck-count={profileDeckCount}
      data-deck-source={deckSource}
      data-collection-mode={collectionMode}
      data-visible-card-count={visibleCards.length}
      data-filtered-card-count={filteredCards.length}
      data-starter-free-boosters-remaining={starterFreeBoostersRemaining}
    >
      <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,rgba(11,15,17,0.96),rgba(5,7,10,0.98)),url('/nexus-assets/backgrounds/arena-bar-1024x576.png')] bg-cover bg-center px-4 py-4 max-[760px]:px-2">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(250,199,76,0.06),transparent_24%,transparent_76%,rgba(75,204,220,0.06))]" />

        <section className="relative z-10 mx-auto grid max-w-[1480px] gap-3">
          <header className="grid min-h-[68px] grid-cols-[200px_minmax(240px,1fr)_auto] items-center gap-3 rounded-md bg-[linear-gradient(180deg,rgba(20,25,28,0.9),rgba(8,10,13,0.95))] px-4 py-2 shadow-[0_18px_44px_rgba(0,0,0,0.42)] max-[1040px]:grid-cols-[minmax(0,1fr)_auto] max-[760px]:grid-cols-1 max-[760px]:gap-2 max-[760px]:px-3 max-[760px]:py-2">
            <div className="grid gap-0.5">
              <b className="text-[11px] font-black uppercase tracking-[0.18em] text-[#d4b06a] max-[760px]:text-[10px]">Бойова картотека</b>
              <h1 className="text-[30px] font-black uppercase leading-none text-[#fff0ad] [text-shadow:0_3px_0_rgba(0,0,0,0.72)] max-[760px]:text-[24px]">
                {GAME_TITLE}
              </h1>
            </div>

            <div className="grid min-w-0 grid-cols-[auto_minmax(180px,1fr)] gap-2 max-[1040px]:col-span-2 max-[760px]:col-span-1 max-[760px]:grid-cols-[auto_minmax(0,1fr)]">
              <Segmented
                value={collectionMode}
                items={collectionModes}
                onChange={(value) => {
                  setCollectionMode(value as CollectionMode);
                  setActiveFaction("all");
                }}
                label="Режим"
                testIdPrefix="collection-mode"
              />

              <label className="grid min-h-[40px] grid-cols-[30px_minmax(0,1fr)] items-center rounded bg-black/45 px-2 self-end">
                <span className="text-center text-lg font-black text-[#65d7e9]">⌕</span>
                <input
                  className="h-full min-w-0 bg-transparent text-sm font-bold text-[#fff7e4] outline-none placeholder:text-[#91866f]"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Пошук картки чи уміння"
                  data-testid="collection-search"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center max-[1040px]:hidden">
              <Metric label={collectionMode === "owned" ? "Мої" : "База"} value={browsingCards.length} />
              <Metric label="Фракцій" value={browsingFactions.length} />
              <Metric label="У колоді" value={deckIds.length} />
            </div>
          </header>

          <DeckDock
            deckCards={deckCards}
            selectedId={selectedCard?.id}
            deckStats={deckStats}
            canPlay={canPlay}
            canRemove={canRemoveCard}
            onPlayAi={() => onPlay(deckIds, "ai")}
            onPlayHuman={() => onPlay(deckIds, "human")}
            onSelect={setSelectedId}
            onRemove={removeCard}
            onAutofill={autofillDeck}
            canEdit={canEditDeck}
            deckSaveStatus={deckSaveStatus}
          />

          <div className="grid grid-cols-1 gap-3 min-[1121px]:grid-cols-[220px_minmax(0,1fr)_312px]">
            <aside className="order-2 grid content-start gap-2 rounded-md bg-black/30 p-2 min-[1121px]:order-none max-[720px]:bg-transparent max-[720px]:p-0">
              <div className="flex items-center justify-between gap-2 px-2 py-1 max-[720px]:hidden">
                <strong className="text-xs font-black uppercase tracking-[0.14em] text-[#d4b06a]">Фракції</strong>
                <button
                  className="rounded bg-white/5 px-2 py-1 text-[10px] font-black uppercase text-[#efe3c5] hover:bg-white/10"
                  type="button"
                  onClick={() => setActiveFaction("all")}
                >
                  Скинути
                </button>
              </div>

              <div className="max-[720px]:flex max-[720px]:gap-1.5 max-[720px]:overflow-x-auto max-[720px]:rounded-md max-[720px]:bg-black/30 max-[720px]:p-1.5 max-[720px]:[scrollbar-width:none] max-[720px]:[&::-webkit-scrollbar]:hidden">
                <button
                  className={cn(
                    factionButtonClass(activeFaction === "all"),
                    "max-[720px]:min-h-[32px] max-[720px]:shrink-0 max-[720px]:grid-cols-[auto_auto] max-[720px]:px-2.5 max-[720px]:text-[11px]",
                  )}
                  type="button"
                  onClick={() => setActiveFaction("all")}
                >
                  <span>Усі фракції</span>
                  <b>{browsingCards.length}</b>
                </button>

                <div className="grid max-h-[calc(100vh-220px)] gap-1 overflow-y-auto pr-1 max-[720px]:contents">
                  {browsingFactions.map((faction) => {
                    const count = browsingCards.filter((card) => card.clan === faction.name).length;
                    return (
                      <button
                        key={faction.slug}
                        className={cn(
                          factionButtonClass(activeFaction === faction.name),
                          "max-[720px]:min-h-[32px] max-[720px]:shrink-0 max-[720px]:grid-cols-[auto_auto] max-[720px]:px-2.5 max-[720px]:text-[11px]",
                        )}
                        type="button"
                        onClick={() => setActiveFaction(faction.name)}
                      >
                        <span className="truncate">{faction.name}</span>
                        <b>{count}</b>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <section className="order-3 grid min-h-[560px] content-start gap-3 rounded-md bg-[rgba(6,8,11,0.55)] p-3 min-[1121px]:order-none max-[420px]:p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid gap-1">
                  <strong className="text-xl font-black uppercase leading-none text-[#fff0ad]">Колекція</strong>
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#7e7567]">
                    {collectionMode === "owned" ? "Мої карти" : "Уся база"} · {visibleCards.length}/{filteredCards.length}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button className={utilityButtonClass()} type="button" onClick={autofillDeck} disabled={!canEditDeck}>
                    Авто
                  </button>
                  <button className={utilityButtonClass()} type="button" onClick={trimDeckToMinimum} disabled={!canRemoveCard}>
                    До мінімуму
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 max-[420px]:grid-cols-1">
                <Segmented
                  value={rarity}
                  items={rarityFilters}
                  onChange={(value) => setRarity(value as RarityFilter)}
                  label="Рідкість"
                />
                <Segmented
                  value={sortMode}
                  items={sortModes}
                  onChange={(value) => setSortMode(value as SortMode)}
                  label="Сортування"
                />
              </div>

              <div className="collection-grid grid grid-cols-[repeat(auto-fill,minmax(146px,1fr))] gap-2 max-[420px]:grid-cols-3 max-[420px]:gap-1.5 max-[340px]:grid-cols-2">
                {visibleCards.length > 0 ? visibleCards.map((card) => {
                  const inDeckIndex = deckIds.indexOf(card.id);
                  const owned = ownedSet.has(card.id);
                  const ownedCount = getOwnedCount(ownedCards, card.id);

                  return (
                    <CollectionCardTile
                      key={card.id}
                      card={card}
                      selected={selectedCard?.id === card.id}
                      inDeckIndex={inDeckIndex}
                      owned={owned}
                      ownedCount={ownedCount}
                      editable={canEditDeck && owned}
                      canRemove={canRemoveCard}
                      onSelect={() => setSelectedId(card.id)}
                      onToggle={() => (inDeckIndex >= 0 ? removeCard(card.id) : addCard(card))}
                    />
                  );
                }) : (
                  <div className="col-span-full grid min-h-[180px] place-items-center rounded-md bg-black/30 px-4 text-center text-sm font-black uppercase text-[#91866f]" data-testid="collection-empty">
                    Немає карток
                  </div>
                )}
              </div>

              {canLoadMoreCards ? (
                <div className="grid justify-items-center pt-3">
                  <button
                    className="min-h-[42px] rounded-md bg-[linear-gradient(180deg,rgba(255,224,138,0.18),rgba(211,162,72,0.08))] px-5 text-xs font-black uppercase text-[#ffe8a6] transition hover:bg-[#ffe08a]/16"
                    type="button"
                    onClick={() =>
                      setVisiblePage({
                        key: visibleScopeKey,
                        limit: Math.min(visibleLimit + GRID_LIMIT, filteredCards.length),
                      })
                    }
                    data-testid="collection-load-more"
                  >
                    Показати ще · {visibleCards.length}/{filteredCards.length}
                  </button>
                </div>
              ) : null}
            </section>

            <aside className="order-1 grid content-start gap-3 self-start min-[1121px]:order-none">
              {selectedCard ? (
                <CardDetails
                  card={selectedCard}
                  inDeck={deckIds.includes(selectedCard.id)}
                  owned={ownedSet.has(selectedCard.id)}
                  editable={canEditDeck && ownedSet.has(selectedCard.id)}
                  canRemove={canRemoveCard}
                  ownedCount={getOwnedCount(ownedCards, selectedCard.id)}
                  sellableCount={getSellableCount(ownedCards, deckIds, selectedCard.id)}
                  cardInDeck={deckIds.includes(selectedCard.id)}
                  canSell={Boolean(playerIdentity && onPlayerUpdated) && profileStatus === "ready"}
                  sellStatus={sellStatus}
                  onSell={(count) => void handleSellCard(selectedCard, count)}
                  onToggle={() => (deckIds.includes(selectedCard.id) ? removeCard(selectedCard.id) : addCard(selectedCard))}
                />
              ) : null}
              <DeckLinksPanel activeLinks={activeLinks} />
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function CollectionCardTile({
  card,
  selected,
  inDeckIndex,
  owned,
  ownedCount,
  editable,
  canRemove,
  onSelect,
  onToggle,
}: {
  card: Card;
  selected: boolean;
  inDeckIndex: number;
  owned: boolean;
  ownedCount: number;
  editable: boolean;
  canRemove: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const style = {
    "--accent": card.accent,
  } as CSSProperties;
  const inDeck = inDeckIndex >= 0;

  return (
    <article
      className={cn(
        "collection-card-tile group relative grid min-h-[214px] place-items-center rounded-md border border-transparent bg-transparent p-1.5 transition max-[420px]:min-h-[166px] max-[420px]:p-0.5 max-[340px]:min-h-[194px]",
        selected ? "border-[#ffe08a] bg-black/16 ring-2 ring-[#ffe08a]/35" : "hover:border-[color-mix(in_srgb,var(--accent),#000_28%)]",
        "hover:-translate-y-0.5 hover:brightness-110",
      )}
      style={style}
      data-testid={`collection-card-${card.id}`}
    >
      <button className="absolute inset-0 z-[1] rounded-md" type="button" onClick={onSelect} aria-label={`Обрати ${card.name}`} />
      <MiniBattleCard card={card} size="collection" />

      {!owned ? (
        <b
          className="pointer-events-none absolute left-2 top-2 z-[3] rounded bg-black/70 px-2 py-1 text-[10px] font-black uppercase text-[#d7c5a3]"
          data-testid={`collection-locked-${card.id}`}
        >
          Закрито
        </b>
      ) : null}

      {ownedCount > 0 ? (
        <b
          className="pointer-events-none absolute bottom-2 left-2 z-[3] rounded bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#ffe08a]"
          data-testid={`collection-owned-count-${card.id}`}
        >
          Ви маєте: {ownedCount}
        </b>
      ) : null}

      {editable ? (
        <button
          className={cn(
            "absolute right-1 top-1 z-[4] grid aspect-square w-9 place-items-center rounded-full border text-2xl font-black leading-none opacity-0 shadow-[0_8px_18px_rgba(0,0,0,0.48)] transition group-hover:opacity-100 focus:opacity-100 max-[420px]:w-8 max-[420px]:text-xl",
            inDeck && !canRemove ? "cursor-not-allowed" : "cursor-pointer",
            inDeck && !canRemove
              ? "border-white/20 bg-[#3b3434] text-white/55"
              : inDeck
                ? "border-[#ffb39d]/75 bg-[#df3f36] text-white"
                : "border-[#fff0ad] bg-[#ffe05f] text-[#17100a]",
          )}
          type="button"
          disabled={inDeck && !canRemove}
          onClick={onToggle}
          aria-label={inDeck ? `Прибрати ${card.name} з колоди` : `Додати ${card.name} до колоди`}
          data-testid={`collection-toggle-${card.id}`}
        >
          {inDeck ? "−" : "+"}
        </button>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 z-[4] grid place-items-end rounded-md bg-black/0 p-2 opacity-0 transition group-hover:bg-black/38 group-hover:opacity-100"
          data-testid={`collection-readonly-${card.id}`}
        >
          <span className="rounded bg-black/72 px-2 py-1 text-[10px] font-black uppercase text-[#efe3c5]">
            {owned ? "У вас" : "Довідник"}
          </span>
        </div>
      )}
    </article>
  );
}

function DeckDock({
  deckCards,
  selectedId,
  deckStats,
  canPlay,
  canRemove,
  canEdit,
  deckSaveStatus,
  onPlayAi,
  onPlayHuman,
  onSelect,
  onRemove,
  onAutofill,
}: {
  deckCards: Card[];
  selectedId?: string;
  deckStats: ReturnType<typeof getDeckStats>;
  canPlay: boolean;
  canRemove: boolean;
  canEdit: boolean;
  deckSaveStatus: "idle" | "saving" | "saved" | "error";
  onPlayAi: () => void;
  onPlayHuman: () => void;
  onSelect: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onAutofill: () => void;
}) {
  return (
    <section className="relative z-20 grid grid-cols-[minmax(0,1fr)_218px] gap-3 rounded-md bg-[linear-gradient(180deg,rgba(18,22,25,0.92),rgba(7,9,12,0.96))] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.42)] max-[720px]:grid-cols-1 max-[420px]:p-2">
      <div className="min-w-0">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <strong className="block text-xl font-black uppercase leading-none text-[#fff0ad]">Колода</strong>
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#a99d85]">
              Мінімум {PLAYER_DECK_SIZE}, у колоді {deckCards.length}
            </span>
            {deckSaveStatus !== "idle" ? (
              <span
                className={cn(
                  "mt-1 block text-[10px] font-black uppercase tracking-[0.1em]",
                  deckSaveStatus === "error" ? "text-[#ffb39d]" : "text-[#9ed6e4]",
                )}
                data-testid="deck-save-status"
                data-status={deckSaveStatus}
              >
                {deckSaveLabel(deckSaveStatus)}
              </span>
            ) : null}
          </div>
          <button className={utilityButtonClass()} type="button" onClick={onAutofill} disabled={!canEdit}>
            Авто
          </button>
        </div>

        <div className="deck-dock-scroll overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid min-w-max grid-flow-col auto-cols-[82px] gap-2 max-[420px]:auto-cols-[72px] max-[420px]:gap-1.5">
            {deckCards.map((card, index) => (
              <DeckDockSlot
                key={card.id}
                card={card}
                index={index}
                selected={selectedId === card.id}
                onSelect={() => onSelect(card.id)}
                onRemove={() => onRemove(card.id)}
                canRemove={canEdit && canRemove}
              />
            ))}
            {Array.from({ length: Math.max(0, PLAYER_DECK_SIZE - deckCards.length) }, (_, index) => (
              <button
                key={`empty-${index}`}
                className="grid h-[118px] w-[82px] place-items-center rounded-md bg-white/[0.04] p-2 text-xs font-black uppercase text-[#746b5a] transition hover:bg-[#ffe08a]/10 hover:text-[#efe3c5] disabled:cursor-not-allowed disabled:opacity-45 max-[420px]:h-[106px] max-[420px]:w-[72px]"
                type="button"
                onClick={onAutofill}
                disabled={!canEdit}
                aria-label="Автозаповнити колоду"
              >
                <span className="grid aspect-square w-9 place-items-center rounded-full bg-black/40 text-lg">+</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid content-start gap-2 max-[720px]:grid-cols-2">
        <button
          className={cn(
            "min-h-[44px] rounded-md px-5 text-sm font-black uppercase transition",
            canPlay
              ? "bg-[linear-gradient(180deg,#fff26d,#e3b51e_54%,#a66d12)] text-[#1a1408] hover:brightness-110"
              : "cursor-not-allowed bg-white/5 text-[#7e7668]",
          )}
          type="button"
          disabled={!canPlay}
          onClick={onPlayAi}
          data-testid="play-selected-deck"
        >
          Грати
        </button>

        <button
          className={cn(
            "min-h-[44px] rounded-md px-5 text-sm font-black uppercase transition",
            canPlay
              ? "bg-[linear-gradient(180deg,#68e5f5,#218aa3_56%,#0d4151)] text-[#061116] hover:brightness-110"
              : "cursor-not-allowed bg-white/5 text-[#7e7668]",
          )}
          type="button"
          disabled={!canPlay}
          onClick={onPlayHuman}
          data-testid="play-human-match"
        >
          PvP
        </button>

        <div className="grid grid-cols-3 gap-2 max-[720px]:col-span-2">
          <Metric label="Сила" value={deckStats.power} />
          <Metric label="Урон" value={deckStats.damage} />
          <Metric label="Легенд." value={deckStats.legends} />
        </div>
      </div>
    </section>
  );
}

function DeckDockSlot({
  card,
  index,
  selected,
  canRemove,
  onSelect,
  onRemove,
}: {
  card: Card;
  index: number;
  selected: boolean;
  canRemove: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <article
      className={cn(
        "deck-dock-slot group relative grid h-[118px] w-[82px] place-items-center rounded-md p-1 transition max-[420px]:h-[106px] max-[420px]:w-[72px]",
        selected ? "bg-[#ffe08a]/10 ring-2 ring-[#ffe08a]/55" : "bg-black/24 hover:bg-black/35",
      )}
      data-testid={`deck-card-${card.id}`}
    >
      <button className="absolute inset-0 z-[1] rounded-md" type="button" onClick={onSelect} aria-label={`Обрати ${card.name}`} />
      <MiniBattleCard card={card} size="dock" />
      <b className="pointer-events-none absolute left-1.5 top-1.5 z-[3] grid aspect-square w-6 place-items-center rounded-full bg-[#111820] text-xs font-black text-[#ffe08a] shadow-[0_4px_12px_rgba(0,0,0,0.42)]">
        {index + 1}
      </b>
      <button
        className={cn(
          "absolute right-1.5 top-1.5 z-[4] grid aspect-square w-7 place-items-center rounded-full border text-xl font-black leading-none shadow-[0_8px_18px_rgba(0,0,0,0.45)] transition",
          canRemove
            ? "border-[#ffb39d]/65 bg-[#df3f36] text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
            : "cursor-not-allowed border-white/15 bg-[#3b3434] text-white/45 opacity-40",
        )}
        type="button"
        disabled={!canRemove}
        onClick={onRemove}
        data-testid={`deck-remove-${card.id}`}
        aria-label={`Прибрати ${card.name} з колоди`}
      >
        −
      </button>
    </article>
  );
}

function MiniBattleCard({ card, size }: { card: Card; size: "collection" | "deck" | "dock" }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        size === "collection"
          ? "h-[192px] w-[136px] max-[420px]:h-[154px] max-[420px]:w-[108px] max-[340px]:h-[180px] max-[340px]:w-[128px]"
          : size === "dock"
            ? "h-[102px] w-[74px] max-[420px]:h-[90px] max-[420px]:w-[64px]"
            : "h-[160px] w-[116px]",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 w-[216px] origin-top-left",
          size === "collection"
            ? "scale-[0.63] max-[420px]:scale-50 max-[340px]:scale-[0.592]"
            : size === "dock"
              ? "scale-[0.342] max-[420px]:scale-[0.296]"
              : "scale-[0.535]",
        )}
      >
        <BattleCard card={card} compact className="!w-[216px]" />
      </div>
    </div>
  );
}

function CardDetails({
  card,
  inDeck,
  owned,
  editable,
  canRemove,
  ownedCount,
  sellableCount,
  cardInDeck,
  canSell,
  sellStatus,
  onSell,
  onToggle,
}: {
  card: Card;
  inDeck: boolean;
  owned: boolean;
  editable: boolean;
  canRemove: boolean;
  ownedCount: number;
  sellableCount: number;
  cardInDeck: boolean;
  canSell: boolean;
  sellStatus: SellStatus;
  onSell: (count: number) => void;
  onToggle: () => void;
}) {
  const disableRemove = editable && inDeck && !canRemove;
  const inDeckCount = cardInDeck ? 1 : 0;
  const reserveCount = Math.max(0, ownedCount - inDeckCount);
  const sellPrice = SELL_PRICES_BY_RARITY[card.rarity];
  const isSelling = sellStatus.kind === "selling";
  const duplicateSellCount = cardInDeck ? 0 : Math.max(0, ownedCount - 1);

  return (
    <section className="card-details rounded-md bg-black/40 p-3 max-[860px]:grid max-[860px]:grid-cols-[minmax(190px,216px)_minmax(0,1fr)] max-[860px]:gap-3 max-[560px]:grid-cols-[minmax(112px,132px)_minmax(0,1fr)] max-[420px]:p-2">
      <div className="mb-3 grid justify-items-center max-[860px]:mb-0" data-testid="selected-card-preview">
        <div className="selected-card-preview-card w-[216px] max-w-full">
          <BattleCard card={card} />
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <strong className="block truncate text-2xl font-black uppercase leading-none text-[#fff0ad]">{card.name}</strong>
            <span className="mt-1 block text-xs font-black uppercase tracking-[0.1em] text-[#9ed6e4]">{card.clan} · {rarityLabels[card.rarity]}</span>
          </div>
          {editable ? (
            <button className={utilityButtonClass()} type="button" onClick={onToggle} disabled={disableRemove}>
              {inDeck ? "Прибрати" : "До колоди"}
            </button>
          ) : (
            <span
              className="rounded bg-white/[0.08] px-3 py-2 text-xs font-black uppercase text-[#efe3c5]"
              data-testid={`selected-card-readonly-${card.id}`}
            >
              {owned ? "Є у вас" : "Закрито"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric label="Сила" value={card.power} />
          <Metric label="Урон" value={card.damage} />
        </div>

        <dl className="mt-3 grid gap-2">
          <DetailRow label="Уміння" title={card.ability.name} description={card.ability.description} />
          <DetailRow label="Бонус" title={card.bonus.name} description={card.bonus.description} />
        </dl>

        {owned && canSell ? (
          <section
            className="mt-3 grid gap-2 rounded-md border border-white/10 bg-black/35 p-2"
            data-testid="collection-sell-panel"
            data-card-id={card.id}
          >
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-[10px] font-black uppercase tracking-[0.12em] text-[#d4b06a]">Продати</strong>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9ed6e4]">
                {sellPrice} 💎 / шт.
              </span>
            </div>

            {/*
              When the card is in any saved deck the server rejects every sell
              with `card_in_deck` regardless of count, so quoting "запасних"
              would mislead the player about what's actually sellable. Drop the
              spares segment in that branch — the helper text below explains
              why no spares are sellable.
            */}
            <p
              className="text-[11px] font-bold leading-snug text-[#efe3c5]"
              data-testid="collection-sell-summary"
            >
              {cardInDeck
                ? `Ви маєте: ${ownedCount} (${inDeckCount} у колоді)`
                : `Ви маєте: ${ownedCount} (${inDeckCount} у колоді, ${reserveCount} запасних)`}
            </p>

            {cardInDeck ? (
              <p
                className="text-[10px] font-black uppercase tracking-[0.08em] text-[#ffb39d]"
                data-testid="collection-sell-disabled-reason"
              >
                Видали з колоди, щоб продати
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 max-[560px]:grid-cols-1">
              <button
                className={sellButtonClass()}
                type="button"
                disabled={cardInDeck || sellableCount < 1 || isSelling}
                onClick={() => onSell(1)}
                data-testid="collection-sell-1"
              >
                {sellableCount === 1 && !cardInDeck ? "Продати" : "Продати 1"}
              </button>
              <button
                className={sellButtonClass()}
                type="button"
                disabled={duplicateSellCount < 1 || isSelling}
                onClick={() => onSell(duplicateSellCount)}
                data-testid="collection-sell-all"
              >
                Продати всі дублікати
              </button>
            </div>

            {sellStatus.kind === "error" ? (
              <p
                className="text-[10px] font-black uppercase tracking-[0.08em] text-[#ffb39d]"
                data-testid="collection-sell-error"
              >
                {sellStatus.message}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}

function DeckLinksPanel({ activeLinks }: { activeLinks: { faction: string; bonus: string }[] }) {
  return (
    <section className="rounded-md bg-black/30 p-3">
      <strong className="text-xs font-black uppercase tracking-[0.12em] text-[#d4b06a]">Зв’язки</strong>
      <div className="mt-2 grid gap-2">
        {activeLinks.length > 0 ? (
          activeLinks.map((link) => (
            <div key={link.faction} className="rounded bg-[#65d7e9]/10 px-2 py-1.5">
              <b className="block truncate text-xs font-black text-[#c7f5ff]">{link.faction}</b>
              <span className="block truncate text-[11px] font-bold text-[#efe3c5]">{link.bonus}</span>
            </div>
          ))
        ) : (
          <span className="rounded bg-black/30 px-2 py-2 text-xs font-bold text-[#91866f]">
            Додай пари однієї фракції
          </span>
        )}
      </div>
    </section>
  );
}

function DetailRow({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="rounded bg-white/[0.04] p-2">
      <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[#d4b06a]">{label}</dt>
      <dd className="mt-1 text-sm font-black text-[#fff7df]">{title}</dd>
      <dd className="mt-1 line-clamp-3 text-xs font-bold leading-snug text-[#bdb197]">{description}</dd>
    </div>
  );
}

function Segmented({
  value,
  items,
  onChange,
  label,
  testIdPrefix,
}: {
  value: string;
  items: { id: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
  testIdPrefix?: string;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#91866f]">{label}</span>
      <div className="flex min-h-[30px] max-w-full overflow-x-auto overflow-y-hidden rounded bg-black/40 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <button
            key={item.id}
            className={cn(
              "shrink-0 whitespace-nowrap px-2 text-[11px] font-black uppercase transition max-[420px]:px-1.5 max-[420px]:text-[10px]",
              value === item.id ? "bg-[#d3a248] text-[#130f09]" : "text-[#e6dcc3] hover:bg-white/8",
            )}
            type="button"
            onClick={() => onChange(item.id)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${item.id}` : undefined}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-2 py-1">
      <b className="block text-xl font-black leading-none text-[#ffe08a]">{value}</b>
      <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.1em] text-[#7e7567]">{label}</span>
    </div>
  );
}

function sortCards(left: Card, right: Card, sortMode: SortMode) {
  if (sortMode === "power") return right.power - left.power || right.damage - left.damage || left.name.localeCompare(right.name, "ru");
  if (sortMode === "damage") return right.damage - left.damage || right.power - left.power || left.name.localeCompare(right.name, "ru");
  if (sortMode === "name") return left.name.localeCompare(right.name, "ru");
  return rarityOrder[right.rarity] - rarityOrder[left.rarity] || right.power + right.damage - (left.power + left.damage) || left.name.localeCompare(right.name, "ru");
}

function getDeckStats(deckCards: Card[]) {
  if (deckCards.length === 0) return { power: "0.0", damage: "0.0", legends: 0 };
  const power = deckCards.reduce((sum, card) => sum + card.power, 0) / deckCards.length;
  const damage = deckCards.reduce((sum, card) => sum + card.damage, 0) / deckCards.length;
  return {
    power: power.toFixed(1),
    damage: damage.toFixed(1),
    legends: deckCards.filter((card) => card.rarity === "Legend").length,
  };
}

function getActiveLinks(deckCards: Card[]) {
  const byFaction = new Map<string, Card[]>();

  for (const card of deckCards) {
    byFaction.set(card.clan, [...(byFaction.get(card.clan) ?? []), card]);
  }

  return [...byFaction.entries()]
    .filter(([, factionCards]) => factionCards.length >= 2)
    .map(([faction, factionCards]) => ({
      faction,
      bonus: factionCards[0].bonus.name,
    }));
}

function deckSaveLabel(status: "saving" | "saved" | "error") {
  if (status === "saving") return "Збереження";
  if (status === "saved") return "Збережено";
  return "Не збережено";
}

function factionButtonClass(active: boolean) {
  return cn(
    "grid min-h-[36px] grid-cols-[minmax(0,1fr)_42px] items-center gap-2 rounded px-2 text-left text-xs font-black uppercase transition",
    active
      ? "bg-[#d3a248] text-[#140f08] shadow-[0_0_18px_rgba(211,162,72,0.22)]"
      : "bg-white/[0.04] text-[#efe3c5] hover:bg-[#65d7e9]/12",
  );
}

function utilityButtonClass() {
  return "rounded bg-white/[0.06] px-3 py-2 text-xs font-black uppercase text-[#efe3c5] transition hover:bg-[#ffe08a]/14 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white/[0.06]";
}

function sellButtonClass() {
  return "min-h-[36px] rounded-md bg-[linear-gradient(180deg,rgba(255,224,138,0.18),rgba(211,162,72,0.08))] px-3 text-[11px] font-black uppercase text-[#ffe8a6] transition hover:bg-[#ffe08a]/16 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[linear-gradient(180deg,rgba(255,224,138,0.18),rgba(211,162,72,0.08))]";
}

function sellErrorMessage(error: "invalid_card_id" | "invalid_sell_count" | "insufficient_stock" | "card_in_deck" | "unknown") {
  if (error === "card_in_deck") return "Видали з колоди, щоб продати";
  if (error === "insufficient_stock") return "Недостатньо копій для продажу";
  if (error === "invalid_card_id") return "Невідома карта";
  if (error === "invalid_sell_count") return "Невірна кількість";
  return "Не вдалося продати";
}
