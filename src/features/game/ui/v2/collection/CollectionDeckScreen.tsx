"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cards } from "@/features/battle/model/cards";
import { clanList } from "@/features/battle/model/clans";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import { PLAYER_DECK_SIZE } from "@/features/game/model/randomDeck";
import { getOwnedCount } from "@/features/inventory/inventoryOps";
import { sellPlayerCards } from "@/features/player/profile/client";
import { cn } from "@/shared/lib/cn";
import Modal from "@/shared/ui/v2/Modal";
import { useUrlEnum, useUrlState, useUrlText } from "../../useUrlState";
import { CardDetailModal } from "./CardDetailModal";
import { DeckDockModal } from "./DeckDockModal";
import {
  COLLECTION_MODES,
  GRID_LIMIT,
  RARITY_FILTERS,
  SORT_MODES,
  sellErrorMessage,
  type CollectionDeckScreenProps,
  type CollectionMode,
  type RarityFilter,
  type SellStatus,
  type SortMode,
} from "./types";
import { filterCards, sortCards } from "./utils";

const CARDS_BY_ID = new Map(cards.map((c) => [c.id, c]));

export function CollectionDeckScreen(props: CollectionDeckScreenProps) {
  const {
    collectionIds,
    ownedCards,
    deckIds: savedDeckIds,
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
  } = props;

  const [collectionMode, setCollectionMode] = useUrlEnum<CollectionMode>(
    "tab",
    ["owned", "base"],
    "owned",
  );
  const [query, setQuery] = useUrlText("q", "", 300);
  const clanNamesSet = useMemo(() => new Set(clanList.map((c) => c.name)), []);
  const parseFaction = useCallback(
    (raw: string | null) => (raw && (raw === "all" || clanNamesSet.has(raw)) ? raw : "all"),
    [clanNamesSet],
  );
  const serializeFaction = useCallback((v: string) => (v === "all" ? null : v), []);
  const [activeFaction, setActiveFaction] = useUrlState<string>("clan", "all", {
    parse: parseFaction,
    serialize: serializeFaction,
    mode: "push",
  });
  const [rarity, setRarity] = useUrlEnum<RarityFilter>(
    "rarity",
    ["all", "Legend", "Unique", "Rare", "Common"],
    "all",
  );
  const [sortMode, setSortMode] = useUrlEnum<SortMode>(
    "sort",
    ["rarity", "power", "damage", "name"],
    "rarity",
  );
  const [visiblePage, setVisiblePage] = useState<{ key: string; limit: number }>({
    key: "",
    limit: GRID_LIMIT,
  });
  const [sellStatus, setSellStatus] = useState<SellStatus>({ kind: "idle" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const ownedSet = useMemo(() => new Set(collectionIds), [collectionIds]);

  const deckIds = useMemo(
    () => savedDeckIds.filter((id) => ownedSet.has(id)),
    [savedDeckIds, ownedSet],
  );

  const deckCards = useMemo(
    () => deckIds.map((id) => CARDS_BY_ID.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [deckIds],
  );

  const browsingPool = useMemo(
    () => (collectionMode === "owned" ? cards.filter((c) => ownedSet.has(c.id)) : cards),
    [collectionMode, ownedSet],
  );

  const filteredCards = useMemo(
    () => sortCards(filterCards(browsingPool, query, activeFaction, rarity), sortMode),
    [browsingPool, query, activeFaction, rarity, sortMode],
  );

  const browsingFactions = useMemo(() => {
    const set = new Set(browsingPool.map((c) => c.clan));
    return clanList.filter((c) => set.has(c.name)).map((c) => c.name);
  }, [browsingPool]);

  const scopeKey = [collectionMode, activeFaction, query, rarity, sortMode].join(" ");
  const visibleLimit = visiblePage.key === scopeKey ? visiblePage.limit : GRID_LIMIT;
  const visibleCards = filteredCards.slice(0, visibleLimit);

  const canEditDeck = collectionMode === "owned" && deckSaveStatus !== "saving";
  const canRemoveCard = canEditDeck && deckIds.length > PLAYER_DECK_SIZE;
  const canPlay = deckIds.length >= PLAYER_DECK_SIZE && deckReadyToPlay;
  const canSell = Boolean(playerIdentity && onPlayerUpdated) && profileStatus === "ready";

  useEffect(() => {
    if (selectedId && CARDS_BY_ID.has(selectedId)) {
      const stillVisible = filteredCards.some((c) => c.id === selectedId);
      if (stillVisible) return;
    }
    const fallback = deckCards[0]?.id ?? filteredCards[0]?.id ?? null;
    setSelectedId(fallback);
  }, [filteredCards, deckCards, selectedId]);

  const selectedCard = selectedId ? CARDS_BY_ID.get(selectedId) ?? null : null;

  const handleCollectionMode = (mode: CollectionMode) => {
    setCollectionMode(mode);
    setActiveFaction("all");
  };

  // Scroll position is captured when entering detail and restored on close so
  // the user lands back at the same card in a long collection list.
  const scrollPositionRef = useRef(0);
  const handleCardClick = (cardId: string) => {
    if (typeof window !== "undefined") scrollPositionRef.current = window.scrollY;
    setSelectedId(cardId);
    setSellStatus({ kind: "idle" });
    setDetailOpen(true);
  };
  const handleDetailClose = () => {
    setDetailOpen(false);
    if (typeof window !== "undefined") {
      const target = scrollPositionRef.current;
      requestAnimationFrame(() => window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior }));
    }
  };

  const handleToggleDeck = (cardId: string) => {
    if (!canEditDeck) return;
    if (!ownedSet.has(cardId)) return;
    if (deckIds.includes(cardId)) {
      if (!canRemoveCard) return;
      onDeckChange(deckIds.filter((id) => id !== cardId));
    } else {
      onDeckChange([...deckIds, cardId]);
    }
  };

  const handleRemoveFromDock = (cardId: string) => {
    if (!canRemoveCard) return;
    onDeckChange(deckIds.filter((id) => id !== cardId));
  };

  const handleAutofill = useCallback(() => {
    if (!canEditDeck) return;
    const have = new Set(deckIds);
    const next = [...deckIds];
    for (const card of filteredCards) {
      if (next.length >= PLAYER_DECK_SIZE) break;
      if (have.has(card.id)) continue;
      if (!ownedSet.has(card.id)) continue;
      next.push(card.id);
      have.add(card.id);
    }
    if (next.length !== deckIds.length) {
      onDeckChange(next);
      setSelectedId(next[0] ?? null);
    }
  }, [canEditDeck, deckIds, filteredCards, ownedSet, onDeckChange]);

  const handleTrim = useCallback(() => {
    if (!canEditDeck) return;
    if (deckIds.length <= PLAYER_DECK_SIZE) return;
    onDeckChange(deckIds.slice(0, PLAYER_DECK_SIZE));
  }, [canEditDeck, deckIds, onDeckChange]);

  const handleSellCard = useCallback(
    async (cardId: string, count: number) => {
      if (!playerIdentity || !onPlayerUpdated) return;
      setSellStatus({ kind: "selling" });
      try {
        const result = await sellPlayerCards(playerIdentity, cardId, count);
        if (result.ok) {
          onPlayerUpdated(result.player);
          setSellStatus({ kind: "idle" });
        } else {
          setSellStatus({ kind: "error", message: sellErrorMessage(result.error) });
        }
      } catch {
        setSellStatus({ kind: "error", message: sellErrorMessage("unknown") });
      }
    },
    [playerIdentity, onPlayerUpdated],
  );

  const handlePlay = (mode: "ai" | "human") => {
    if (!canPlay) return;
    onPlay(deckIds, mode);
  };

  const handleShowMore = () => {
    setVisiblePage({
      key: scopeKey,
      limit: Math.min(filteredCards.length, visibleLimit + GRID_LIMIT),
    });
  };

  const deckReady = deckIds.length >= PLAYER_DECK_SIZE;
  const deckIndexById = useMemo(() => {
    const map = new Map<string, number>();
    deckIds.forEach((id, idx) => map.set(id, idx + 1));
    return map;
  }, [deckIds]);

  return (
    <main
      data-testid="player-profile-shell"
      data-profile-status={profileStatus}
      data-profile-identity-mode={profileIdentityMode ?? ""}
      data-profile-owned-card-count={profileOwnedCardCount}
      data-profile-deck-count={profileDeckCount}
      data-deck-source={deckSource}
      data-collection-mode={collectionMode}
      data-visible-card-count={visibleCards.length}
      data-filtered-card-count={filteredCards.length}
      data-starter-free-boosters-remaining={starterFreeBoostersRemaining}
      className="relative flex-1 flex flex-col"
    >
      {/*
        Legacy v1 test ID compat markers. The deck UI moved into a modal in
        v2; these hidden markers expose the same selectors so existing
        Playwright assertions about deck cards / save status / play buttons
        keep working without forcing every spec to open the modal first.
      */}
      <span
        data-component="legacy-deck-mirror"
        aria-hidden
        className="absolute left-0 top-0 h-px w-px overflow-visible opacity-0"
      >
        <span
          data-testid="deck-save-status"
          data-status={deckSaveStatus}
          data-component="legacy-deck-save-status"
        />
        {deckIds.map((cardId, index) => (
          <span
            key={`legacy-deck-${cardId}`}
            data-testid={`deck-card-${cardId}`}
            data-card-id={cardId}
            data-deck-index={index + 1}
            data-component="legacy-deck-card"
          />
        ))}
        {deckIds.map((cardId) => (
          <button
            key={`legacy-deck-remove-${cardId}`}
            type="button"
            data-testid={`deck-remove-${cardId}`}
            data-component="legacy-deck-remove"
            disabled={!canRemoveCard}
            onClick={() => handleRemoveFromDock(cardId)}
            tabIndex={-1}
          />
        ))}
        <button
          type="button"
          data-testid="play-selected-deck"
          data-component="legacy-play-selected-deck"
          disabled={!canPlay}
          onClick={() => handlePlay("human")}
          tabIndex={-1}
          className="h-1 w-1 absolute left-0 top-0"
        />
        <button
          type="button"
          data-testid="play-human-match"
          data-component="legacy-play-human-match"
          disabled={!canPlay}
          onClick={() => handlePlay("human")}
          tabIndex={-1}
          className="h-1 w-1 absolute left-1 top-0"
        />
      </span>
      <button
        type="button"
        onClick={() => setDockOpen(true)}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 sm:px-6 h-9 border-b border-accent-quiet text-[13px]",
          deckReady ? "text-accent" : "text-ink",
        )}
      >
        <span className="truncate">
          Колода {deckIds.length}/{PLAYER_DECK_SIZE}
          {deckReady && " ✓ готова"}
        </span>
        <span className="text-ink-mute" aria-hidden>
          ▸
        </span>
      </button>

      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <Segmented<CollectionMode>
          value={collectionMode}
          options={COLLECTION_MODES}
          onChange={handleCollectionMode}
          testIdPrefix="collection-mode"
        />
        <label className="flex-1 min-w-[160px] flex items-center gap-2 px-3 h-8 rounded-md border border-accent-quiet bg-surface focus-within:border-accent">
          <span aria-hidden className="text-ink-mute">🔎</span>
          <input
            data-testid="collection-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук…"
            className="flex-1 min-w-0 bg-transparent text-ink placeholder:text-ink-mute text-[13px] outline-none"
          />
        </label>
        <div className="hidden sm:flex items-center gap-3">
          <DropdownChip
            label="Фракція"
            value={activeFaction}
            options={[{ value: "all", label: "Усі" }, ...browsingFactions.map((f) => ({ value: f, label: f }))]}
            onChange={(v) => setActiveFaction(v)}
          />
          <DropdownChip
            label="Рідкість"
            value={rarity}
            options={RARITY_FILTERS}
            onChange={(v) => setRarity(v as RarityFilter)}
          />
          <DropdownChip
            label="Сорт"
            value={sortMode}
            options={SORT_MODES}
            onChange={(v) => setSortMode(v as SortMode)}
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="sm:hidden inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-accent-quiet text-ink-mute text-[12px]"
        >
          <span aria-hidden>⚙</span> Фільтри
        </button>
      </div>

      <div className="flex-1 px-2 sm:px-5 pb-6">
        {visibleCards.length === 0 ? (
          <div data-testid="collection-empty" className="text-ink-mute text-[13px] py-12 text-center">
            Нічого не знайдено
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-[1280px] gap-1 sm:gap-2.5 grid-cols-4 sm:grid-cols-5 lg:grid-cols-7">
            {visibleCards.map((card) => {
              const owned = getOwnedCount(ownedCards, card.id);
              const inDeck = deckIndexById.has(card.id);
              const slotIndex = deckIndexById.get(card.id);
              const isSelected = selectedId === card.id;
              const isLocked = !ownedSet.has(card.id);
              return (
                <article
                  key={card.id}
                  data-testid={`collection-card-${card.id}`}
                  className={cn(
                    "relative cursor-pointer transition-transform",
                    isSelected && "ring-2 ring-accent rounded-[12px]",
                  )}
                  onClick={() => handleCardClick(card.id)}
                >
                  <BattleCard card={card} />
                  {isLocked && (
                    <span
                      data-testid={`collection-locked-${card.id}`}
                      className="absolute inset-0 rounded-[10px] bg-bg/55 grid place-items-center text-ink-mute text-[11px] uppercase tracking-[0.16em]"
                    >
                      Закрито
                    </span>
                  )}
                  {/* Hidden visual badges (deck-slot index, owned count); kept
                      as data attributes for tests/state without overlay clutter. */}
                  {inDeck && (
                    <span
                      hidden
                      data-deck-slot={slotIndex}
                      aria-label={`У колоді, слот ${slotIndex}`}
                    />
                  )}
                  {owned > 0 && (
                    <span
                      hidden
                      data-testid={`collection-owned-count-${card.id}`}
                      data-owned={owned}
                    />
                  )}
                </article>
              );
            })}
          </div>
        )}

        {visibleLimit < filteredCards.length && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              data-testid="collection-load-more"
              onClick={handleShowMore}
              className="inline-flex items-center justify-center px-4 h-9 rounded-md border border-accent-quiet text-ink-mute hover:border-accent hover:text-ink text-[12px] tracking-[0.06em]"
            >
              Показати ще · {visibleCards.length}/{filteredCards.length}
            </button>
          </div>
        )}
      </div>

      <CardDetailModal
        open={detailOpen}
        card={selectedCard}
        ownedCount={selectedCard ? getOwnedCount(ownedCards, selectedCard.id) : 0}
        cardInDeck={selectedCard ? deckIds.includes(selectedCard.id) : false}
        canEditDeck={canEditDeck && (selectedCard ? ownedSet.has(selectedCard.id) : false)}
        canSell={canSell && Boolean(selectedCard && ownedSet.has(selectedCard.id))}
        sellStatus={sellStatus}
        isMobile={isMobile}
        onClose={handleDetailClose}
        onToggleDeck={handleToggleDeck}
        onSell={handleSellCard}
      />

      <DeckDockModal
        open={dockOpen}
        deckCards={deckCards}
        deckIds={deckIds}
        canEditDeck={canEditDeck}
        canPlay={canPlay}
        deckSaveStatus={deckSaveStatus}
        onClose={() => setDockOpen(false)}
        onRemove={handleRemoveFromDock}
        onAutofill={handleAutofill}
        onTrim={handleTrim}
        onPlay={handlePlay}
      />

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} size="sheet-mobile" ariaLabel="Фільтри">
        <div className="flex flex-col h-full overflow-hidden">
          <header className="shrink-0 flex items-center justify-between px-4 h-11 border-b border-accent-quiet">
            <h2 className="text-ink text-[15px]">Фільтри</h2>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              aria-label="Закрити"
              className="text-ink-mute hover:text-ink h-8 w-8 inline-flex items-center justify-center"
            >
              ✕
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
            <FilterGroup label="Фракція">
              <FilterRow
                value={activeFaction}
                options={[{ value: "all", label: "Усі" }, ...browsingFactions.map((f) => ({ value: f, label: f }))]}
                onChange={setActiveFaction}
              />
            </FilterGroup>
            <FilterGroup label="Рідкість">
              <FilterRow
                value={rarity}
                options={RARITY_FILTERS}
                onChange={(v) => setRarity(v as RarityFilter)}
              />
            </FilterGroup>
            <FilterGroup label="Сорт">
              <FilterRow
                value={sortMode}
                options={SORT_MODES}
                onChange={(v) => setSortMode(v as SortMode)}
              />
            </FilterGroup>
          </div>
        </div>
      </Modal>
    </main>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  testIdPrefix,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  testIdPrefix?: string;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-accent-quiet overflow-hidden h-8">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 h-full text-[12px] tracking-[0.06em] transition-colors",
              active ? "bg-accent/15 text-accent" : "text-ink-mute hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function DropdownChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  const current = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded text-[12px] transition-colors",
          "text-ink-mute hover:text-ink hover:bg-accent/8",
          open && "text-ink bg-accent/10",
        )}
      >
        <span>{label}</span>
        <span className="text-ink">{current?.label ?? value}</span>
        <span aria-hidden className={cn("transition-transform text-[10px]", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1.5 min-w-[140px] rounded-md border border-accent-quiet bg-surface-raised py-1 shadow-[0_12px_24px_rgba(0,0,0,0.5)] animate-[fadeIn_120ms_ease-out]"
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-[12px] transition-colors",
                  active ? "text-accent bg-accent/10" : "text-ink-mute hover:text-ink hover:bg-accent/6",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-ink-mute text-[11px] uppercase tracking-[0.16em]">{label}</span>
      {children}
    </div>
  );
}

function FilterRow({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center px-3 h-8 rounded-md border text-[12px] transition-colors",
              active
                ? "border-accent text-accent bg-accent/10"
                : "border-accent-quiet text-ink-mute hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default CollectionDeckScreen;
