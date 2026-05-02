"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { cards } from "@/features/battle/model/cards";
import { clanList } from "@/features/battle/model/clans";
import type { Card, Rarity } from "@/features/battle/model/types";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import { cn } from "@/shared/lib/cn";
import { visibleText } from "@/shared/lib/visibleText";
import { PLAYER_DECK_SIZE } from "../../model/randomDeck";

type Props = {
  collectionIds: string[];
  deckIds: string[];
  onDeckChange: (deckIds: string[]) => void;
  onPlay: (deckIds: string[], mode: "ai" | "human") => void;
};

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
  Common: "Звичайна",
  Rare: "Рідкісна",
  Unique: "Унікальна",
  Legend: "Легендарна",
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
  { id: "damage", label: "Шкода" },
  { id: "name", label: "Ім’я" },
];

export function CollectionDeckScreen({ collectionIds, deckIds: savedDeckIds = [], onDeckChange, onPlay }: Props) {
  const collectionSet = useMemo(() => new Set(collectionIds), [collectionIds]);
  const collectionCards = useMemo(() => cards.filter((card) => collectionSet.has(card.id)), [collectionSet]);
  const deckIds = useMemo(
    () => savedDeckIds.filter((cardId) => collectionSet.has(cardId)),
    [collectionSet, savedDeckIds],
  );
  const [selectedId, setSelectedId] = useState(() => deckIds[0] ?? collectionCards[0]?.id);
  const [query, setQuery] = useState("");
  const [activeFaction, setActiveFaction] = useState("all");
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("rarity");

  const deckCards = useMemo(() => deckIds.map((cardId) => cards.find((card) => card.id === cardId)).filter(Boolean) as Card[], [deckIds]);
  const activeSelectedId = selectedId && collectionSet.has(selectedId) ? selectedId : deckIds[0] ?? collectionCards[0]?.id;
  const selectedCard = cards.find((card) => card.id === activeSelectedId) ?? deckCards[0] ?? collectionCards[0];
  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return collectionCards
      .filter((card) => activeFaction === "all" || card.clan === activeFaction)
      .filter((card) => rarity === "all" || card.rarity === rarity)
      .filter((card) => {
        if (!normalizedQuery) return true;
        return [card.name, card.clan, card.ability.name, card.bonus.name].some((value) =>
          visibleText(value).toLowerCase().includes(normalizedQuery),
        );
      })
      .sort((left, right) => sortCards(left, right, sortMode));
  }, [activeFaction, collectionCards, query, rarity, sortMode]);
  const visibleCards = filteredCards.slice(0, GRID_LIMIT);
  const canPlay = deckIds.length >= PLAYER_DECK_SIZE;
  const canRemoveCard = deckIds.length > PLAYER_DECK_SIZE;
  const deckStats = getDeckStats(deckCards);
  const activeLinks = getActiveLinks(deckCards);
  const ownedFactions = useMemo(
    () => clanList.filter((faction) => collectionCards.some((card) => card.clan === faction.name)),
    [collectionCards],
  );

  function addCard(card: Card) {
    setSelectedId(card.id);
    if (deckIds.includes(card.id)) return;
    onDeckChange([...deckIds, card.id]);
  }

  function removeCard(cardId: string) {
    if (!canRemoveCard) return;
    onDeckChange(deckIds.filter((item) => item !== cardId));
  }

  function trimDeckToMinimum() {
    onDeckChange(deckIds.slice(0, PLAYER_DECK_SIZE));
    setSelectedId(deckIds[0] ?? selectedId);
  }

  function autofillDeck() {
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
    <main className="min-h-screen bg-[#07090b] text-[#f9efd8]">
      <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,rgba(11,15,17,0.96),rgba(5,7,10,0.98)),url('/nexus-assets/backgrounds/arena-bar-1024x576.png')] bg-cover bg-center px-4 py-4 max-[760px]:px-2">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(250,199,76,0.06),transparent_24%,transparent_76%,rgba(75,204,220,0.06))]" />

        <section className="relative z-10 mx-auto grid max-w-[1480px] gap-3">
          <header className="grid min-h-[68px] grid-cols-[220px_minmax(240px,1fr)_auto] items-center gap-3 rounded-md border border-[#d3a248]/45 bg-[linear-gradient(180deg,rgba(20,25,28,0.92),rgba(8,10,13,0.96))] px-4 shadow-[0_18px_44px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,235,165,0.12)] max-[980px]:grid-cols-1">
            <div className="grid gap-1">
              <b className="text-[12px] font-black uppercase tracking-[0.18em] text-[#d4b06a]">Бойова картотека</b>
              <h1 className="text-[34px] font-black uppercase leading-none text-[#fff0ad] [text-shadow:0_3px_0_rgba(0,0,0,0.72)]">
                {GAME_TITLE}
              </h1>
            </div>

            <div className="grid grid-cols-[minmax(180px,1fr)_auto_auto] gap-2 max-[760px]:grid-cols-1">
              <label className="grid min-h-[42px] grid-cols-[34px_minmax(0,1fr)] items-center rounded border border-white/10 bg-black/38 px-2">
                <span className="text-center text-lg font-black text-[#65d7e9]">⌕</span>
                <input
                  className="h-full min-w-0 bg-transparent text-sm font-bold text-[#fff7e4] outline-none placeholder:text-[#91866f]"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Пошук за карткою, фракцією або умінням"
                  data-testid="collection-search"
                />
              </label>

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

            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Карток" value={collectionCards.length} />
              <Metric label="Фракцій" value={ownedFactions.length} />
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
          />

          <div className="grid grid-cols-[220px_minmax(0,1fr)_312px] gap-3 max-[1120px]:grid-cols-[190px_minmax(0,1fr)] max-[860px]:grid-cols-1">
            <aside className="grid content-start gap-2 rounded-md border border-white/10 bg-black/42 p-2 shadow-[inset_0_0_32px_rgba(0,0,0,0.34)] max-[1120px]:order-1 max-[860px]:order-3">
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <strong className="text-xs font-black uppercase tracking-[0.14em] text-[#d4b06a]">Фракції</strong>
                <button
                  className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black uppercase text-[#efe3c5] hover:bg-white/10"
                  type="button"
                  onClick={() => setActiveFaction("all")}
                >
                  Усі
                </button>
              </div>

              <button
                className={factionButtonClass(activeFaction === "all")}
                type="button"
                onClick={() => setActiveFaction("all")}
              >
                <span>Уся база</span>
                <b>{collectionCards.length}</b>
              </button>

              <div className="grid max-h-[calc(100vh-220px)] gap-1 overflow-y-auto pr-1 max-[860px]:max-h-[220px]">
                {ownedFactions.map((faction) => {
                  const count = collectionCards.filter((card) => card.clan === faction.name).length;
                  return (
                    <button
                      key={faction.slug}
                      className={factionButtonClass(activeFaction === faction.name)}
                      type="button"
                      onClick={() => setActiveFaction(faction.name)}
                    >
                      <span className="truncate">{visibleText(faction.name)}</span>
                      <b>{count}</b>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="grid min-h-[560px] content-start gap-3 rounded-md border border-[#d3a248]/32 bg-[rgba(6,8,11,0.66)] p-3 shadow-[inset_0_0_70px_rgba(0,0,0,0.28)] max-[1120px]:order-2 max-[860px]:order-1 max-[860px]:col-span-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid gap-1">
                  <strong className="text-xl font-black uppercase leading-none text-[#fff0ad]">Колекція</strong>
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#a99d85]">
                    Показано {visibleCards.length} з {filteredCards.length}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button className={utilityButtonClass()} type="button" onClick={autofillDeck}>
                    Авто
                  </button>
                  <button className={utilityButtonClass()} type="button" onClick={trimDeckToMinimum} disabled={!canRemoveCard}>
                    До мінімуму
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(138px,1fr))] gap-2">
                {visibleCards.map((card) => {
                  const inDeckIndex = deckIds.indexOf(card.id);

                  return (
                    <CollectionCardTile
                      key={card.id}
                      card={card}
                      selected={selectedCard?.id === card.id}
                      inDeckIndex={inDeckIndex}
                      canRemove={canRemoveCard}
                      onSelect={() => setSelectedId(card.id)}
                      onToggle={() => (inDeckIndex >= 0 ? removeCard(card.id) : addCard(card))}
                    />
                  );
                })}
              </div>
            </section>

            <aside className="grid content-start gap-3 self-start max-[1120px]:order-3 max-[1120px]:col-span-2 max-[860px]:order-2 max-[860px]:col-span-1">
              {selectedCard ? <CardDetails card={selectedCard} inDeck={deckIds.includes(selectedCard.id)} canRemove={canRemoveCard} onToggle={() => (deckIds.includes(selectedCard.id) ? removeCard(selectedCard.id) : addCard(selectedCard))} /> : null}
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
  canRemove,
  onSelect,
  onToggle,
}: {
  card: Card;
  selected: boolean;
  inDeckIndex: number;
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
        "group relative grid min-h-[208px] place-items-center rounded-md border bg-black/18 p-2 transition",
        "shadow-[0_12px_26px_rgba(0,0,0,0.34),inset_0_0_0_1px_rgba(255,255,255,0.04)]",
        selected ? "border-[#ffe08a] ring-2 ring-[#ffe08a]/35" : "border-[color-mix(in_srgb,var(--accent),#000_42%)]",
        "hover:-translate-y-0.5 hover:brightness-110",
      )}
      style={style}
      data-testid={`collection-card-${card.id}`}
    >
      <button className="absolute inset-0 z-[1] rounded-md" type="button" onClick={onSelect} aria-label={`Обрати ${visibleText(card.name)}`} />
      <MiniBattleCard card={card} size="collection" />

      {inDeck ? (
        <b className="pointer-events-none absolute right-2 top-2 z-[3] grid aspect-square w-7 place-items-center rounded-full bg-[#ffe08a] text-xs font-black text-[#17100a] shadow-[0_4px_12px_rgba(0,0,0,0.42)]">
          {inDeckIndex + 1}
        </b>
      ) : null}

      <button
        className={cn(
          "absolute inset-0 z-[4] grid place-items-center rounded-md bg-black/54 opacity-0 backdrop-blur-[1px] transition group-hover:opacity-100 focus:opacity-100",
          inDeck && !canRemove ? "cursor-not-allowed" : "cursor-pointer",
        )}
        type="button"
        disabled={inDeck && !canRemove}
        onClick={onToggle}
        aria-label={inDeck ? `Прибрати ${visibleText(card.name)} з колоди` : `Додати ${visibleText(card.name)} до колоди`}
        data-testid={`collection-toggle-${card.id}`}
      >
        <span
          className={cn(
            "grid aspect-square w-14 place-items-center rounded-full border-2 text-4xl font-black leading-none shadow-[0_12px_24px_rgba(0,0,0,0.45)]",
            inDeck && !canRemove
              ? "border-white/20 bg-[#3b3434] text-white/55"
              : inDeck
                ? "border-[#ffb39d] bg-[#df3f36] text-white"
                : "border-[#fff0ad] bg-[#ffe05f] text-[#17100a]",
          )}
        >
          {inDeck ? "−" : "+"}
        </span>
      </button>
    </article>
  );
}

function DeckDock({
  deckCards,
  selectedId,
  deckStats,
  canPlay,
  canRemove,
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
  onPlayAi: () => void;
  onPlayHuman: () => void;
  onSelect: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onAutofill: () => void;
}) {
  return (
    <section className="relative z-20 grid grid-cols-[minmax(0,1fr)_218px] gap-3 rounded-md border border-[#d3a248]/45 bg-[linear-gradient(180deg,rgba(18,22,25,0.95),rgba(7,9,12,0.98))] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,235,165,0.1)] max-[980px]:grid-cols-1">
      <div className="min-w-0">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <strong className="block text-xl font-black uppercase leading-none text-[#fff0ad]">Колода</strong>
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#a99d85]">
              Мінімум {PLAYER_DECK_SIZE}, у колоді {deckCards.length}
            </span>
          </div>
          <button className={utilityButtonClass()} type="button" onClick={onAutofill}>
            Авто
          </button>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-max grid-flow-col auto-cols-[82px] gap-2">
            {deckCards.map((card, index) => (
              <DeckDockSlot
                key={card.id}
                card={card}
                index={index}
                selected={selectedId === card.id}
                onSelect={() => onSelect(card.id)}
                onRemove={() => onRemove(card.id)}
                canRemove={canRemove}
              />
            ))}
            {Array.from({ length: Math.max(0, PLAYER_DECK_SIZE - deckCards.length) }, (_, index) => (
              <button
                key={`empty-${index}`}
                className="grid h-[118px] w-[82px] place-items-center rounded-md border border-dashed border-white/14 bg-white/[0.03] p-2 text-xs font-black uppercase text-[#746b5a] transition hover:border-[#ffe08a]/40 hover:text-[#efe3c5]"
                type="button"
                onClick={onAutofill}
                aria-label="Автозаповнити колоду"
              >
                <span className="grid aspect-square w-9 place-items-center rounded-full border border-white/12 bg-black/30 text-lg">+</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid content-start gap-2 max-[980px]:grid-cols-[160px_minmax(0,1fr)] max-[560px]:grid-cols-1">
        <button
          className={cn(
            "min-h-[44px] rounded-md border-2 px-5 text-sm font-black uppercase transition",
            canPlay
              ? "border-black/60 bg-[linear-gradient(180deg,#fff26d,#e3b51e_54%,#a66d12)] text-[#1a1408] hover:brightness-110"
              : "cursor-not-allowed border-white/10 bg-white/5 text-[#7e7668]",
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
            "min-h-[44px] rounded-md border-2 px-5 text-sm font-black uppercase transition",
            canPlay
              ? "border-[#65d7e9]/60 bg-[linear-gradient(180deg,#68e5f5,#218aa3_56%,#0d4151)] text-[#061116] hover:brightness-110"
              : "cursor-not-allowed border-white/10 bg-white/5 text-[#7e7668]",
          )}
          type="button"
          disabled={!canPlay}
          onClick={onPlayHuman}
          data-testid="play-human-match"
        >
          PvP
        </button>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Сила" value={deckStats.power} />
          <Metric label="Шкода" value={deckStats.damage} />
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
        "group relative grid h-[118px] w-[82px] place-items-center rounded-md border bg-black/18 p-1 transition",
        selected ? "border-[#ffe08a] ring-2 ring-[#ffe08a]/30" : "border-white/10 hover:border-[#ffe08a]/50",
      )}
      data-testid={`deck-card-${card.id}`}
    >
      <button className="absolute inset-0 z-[1] rounded-md" type="button" onClick={onSelect} aria-label={`Обрати ${visibleText(card.name)}`} />
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
        aria-label={`Прибрати ${visibleText(card.name)} з колоди`}
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
        size === "collection" ? "h-[188px] w-[136px]" : size === "dock" ? "h-[102px] w-[74px]" : "h-[160px] w-[116px]",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 w-[216px] origin-top-left",
          size === "collection" ? "scale-[0.63]" : size === "dock" ? "scale-[0.342]" : "scale-[0.535]",
        )}
      >
        <BattleCard card={card} compact />
      </div>
    </div>
  );
}

function CardDetails({
  card,
  inDeck,
  canRemove,
  onToggle,
}: {
  card: Card;
  inDeck: boolean;
  canRemove: boolean;
  onToggle: () => void;
}) {
  const disableRemove = inDeck && !canRemove;

  return (
    <section className="rounded-md border border-white/10 bg-black/46 p-3 shadow-[inset_0_0_42px_rgba(0,0,0,0.32)]">
      <div className="mb-3 grid justify-items-center" data-testid="selected-card-preview">
        <div className="w-[216px] max-w-full">
          <BattleCard card={card} />
        </div>
      </div>

      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block truncate text-2xl font-black uppercase leading-none text-[#fff0ad]">{visibleText(card.name)}</strong>
          <span className="mt-1 block text-xs font-black uppercase tracking-[0.1em] text-[#9ed6e4]">{visibleText(card.clan)} · {rarityLabels[card.rarity]}</span>
        </div>
        <button className={utilityButtonClass()} type="button" onClick={onToggle} disabled={disableRemove}>
          {inDeck ? "Прибрати" : "До колоди"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Сила" value={card.power} />
        <Metric label="Шкода" value={card.damage} />
      </div>

      <dl className="mt-3 grid gap-2">
        <DetailRow label="Уміння" title={card.ability.name} description={card.ability.description} />
        <DetailRow label="Бонус" title={card.bonus.name} description={card.bonus.description} />
      </dl>
    </section>
  );
}

function DeckLinksPanel({ activeLinks }: { activeLinks: { faction: string; bonus: string }[] }) {
  return (
    <section className="rounded-md border border-white/10 bg-black/36 p-3 shadow-[inset_0_0_34px_rgba(0,0,0,0.28)]">
      <strong className="text-xs font-black uppercase tracking-[0.12em] text-[#d4b06a]">Зв’язки</strong>
      <div className="mt-2 grid gap-2">
        {activeLinks.length > 0 ? (
          activeLinks.map((link) => (
            <div key={link.faction} className="rounded border border-[#65d7e9]/20 bg-[#65d7e9]/8 px-2 py-1.5">
              <b className="block truncate text-xs font-black text-[#c7f5ff]">{visibleText(link.faction)}</b>
              <span className="block truncate text-[11px] font-bold text-[#efe3c5]">{visibleText(link.bonus)}</span>
            </div>
          ))
        ) : (
          <span className="rounded border border-white/10 bg-black/22 px-2 py-2 text-xs font-bold text-[#91866f]">
            Додай пари однієї фракції
          </span>
        )}
      </div>
    </section>
  );
}

function DetailRow({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-2">
      <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[#d4b06a]">{label}</dt>
      <dd className="mt-1 text-sm font-black text-[#fff7df]">{visibleText(title)}</dd>
      <dd className="mt-1 line-clamp-3 text-xs font-bold leading-snug text-[#bdb197]">{visibleText(description)}</dd>
    </div>
  );
}

function Segmented({
  value,
  items,
  onChange,
  label,
}: {
  value: string;
  items: { id: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#91866f]">{label}</span>
      <div className="flex min-h-[30px] overflow-hidden rounded border border-white/10 bg-black/35">
        {items.map((item) => (
          <button
            key={item.id}
            className={cn(
              "px-2 text-[11px] font-black uppercase transition",
              value === item.id ? "bg-[#d3a248] text-[#130f09]" : "text-[#e6dcc3] hover:bg-white/8",
            )}
            type="button"
            onClick={() => onChange(item.id)}
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
    <div className="rounded border border-white/10 bg-black/36 px-2 py-2">
      <b className="block text-xl font-black leading-none text-[#ffe08a]">{value}</b>
      <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.1em] text-[#a99d85]">{label}</span>
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

function factionButtonClass(active: boolean) {
  return cn(
    "grid min-h-[36px] grid-cols-[minmax(0,1fr)_42px] items-center gap-2 rounded px-2 text-left text-xs font-black uppercase transition",
    active
      ? "border border-[#ffe08a]/55 bg-[#d3a248] text-[#140f08] shadow-[0_0_18px_rgba(211,162,72,0.24)]"
      : "border border-white/8 bg-white/[0.04] text-[#efe3c5] hover:border-[#65d7e9]/45 hover:bg-[#65d7e9]/8",
  );
}

function utilityButtonClass() {
  return "rounded border border-white/12 bg-white/[0.06] px-3 py-2 text-xs font-black uppercase text-[#efe3c5] transition hover:border-[#ffe08a]/45 hover:bg-[#ffe08a]/12";
}
