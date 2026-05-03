"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { cards as cardCatalog } from "@/features/battle/model/cards";
import { clans } from "@/features/battle/model/clans";
import { fetchStarterBoosterCatalog, openStarterBooster } from "@/features/boosters/client";
import { STARTER_BOOSTER_CARD_COUNT, type BoosterCatalogItem, type BoosterResponse } from "@/features/boosters/types";
import type { Card, Rarity } from "@/features/battle/model/types";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import { STARTER_FREE_BOOSTERS, type PlayerIdentity, type PlayerProfile } from "@/features/player/profile/types";
import { cn } from "@/shared/lib/cn";

type ProfileStatus = "loading" | "ready" | "unavailable";
type Phase = "catalog" | "opening" | "reveal" | "deck-ready";
type CatalogStatus = "loading" | "ready" | "error";

type Props = {
  identity: PlayerIdentity;
  profile: PlayerProfile;
  profileStatus: ProfileStatus;
  profileIdentityMode?: "telegram" | "guest";
  deckSource: "profile" | "starter-fallback";
  onProfileChange: (profile: PlayerProfile) => void;
  onPlayDeck: (deckIds: string[], mode: "ai" | "human") => void;
  onEditDeck: (deckIds: string[]) => void;
};

type RevealState = {
  booster: BoosterResponse;
  cards: Card[];
  player: PlayerProfile;
};

const STARTER_KIT_CARD_COUNT = STARTER_FREE_BOOSTERS * STARTER_BOOSTER_CARD_COUNT;
const boosterAccents = [
  ["#ffe08a", "#65d7e9"],
  ["#ef735a", "#a8df5a"],
  ["#f0b14a", "#d26a8a"],
  ["#79d3a6", "#efcf6f"],
  ["#c6b4ff", "#f48c58"],
  ["#9bd1ff", "#d7e35e"],
] as const;
const rarityLabels: Record<Rarity, string> = {
  Common: "Звичайна",
  Rare: "Рідкісна",
  Unique: "Унікальна",
  Legend: "Легендарна",
};
const boosterStories: Record<string, string> = {
  "neon-breach": "Зламники проти прибульців: вимикай уміння, ламай бонуси і забирай темп ще до першого удару.",
  "factory-shift": "Цехова зміна для силового старту: Workers добивають уроном, Micron піднімає чистий damage.",
  "street-kings": "Вулиця грає на виснаження, Kingpin повертає енергію навіть після невдалого раунду.",
  "carnival-vice": "Нервовий контроль атаки: Circus ріже натиск, Gamblers підкручують ризик у свою користь.",
  "faith-and-fury": "Святі тримаються довше, Fury розганяє атаку і закриває раунди силою.",
  biohazard: "Мутанти і симбіоти тиснуть силу суперника, поки Deviants роблять кожну відповідь слабшою.",
  underworld: "Кримінальний пакет з отрутою і прокляттями: грає повільно, але боляче.",
  "mind-games": "Психологічний бустер: PSI лікується, Enigma краде чужі правила бою.",
  "toy-factory": "Іграшковий цех контролює атаку, Alpha просто додає сили там, де треба продавити.",
  "metro-chase": "Погоня за ресурсами: Metropolis краде енергію, Chasers карають навіть програні раунди.",
  "desert-signal": "Пустельний сигнал про ресурс і живучість: Халифат дає енергію, Nemos тримає здоров'я.",
  "street-plague": "Вулична чума змішує мінус урону з прокляттям, щоб суперник танув по раундах.",
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
}: Props) {
  const [optimisticProfile, setOptimisticProfile] = useState<PlayerProfile | null>(null);
  const [phase, setPhase] = useState<Phase>("catalog");
  const [openingBoosterId, setOpeningBoosterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogProfile, setCatalogProfile] = useState<PlayerProfile | null>(null);
  const [boosters, setBoosters] = useState<BoosterCatalogItem[]>([]);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const profileForDisplay = optimisticProfile ?? catalogProfile ?? profile;
  const openedCount = profileForDisplay.openedBoosterIds.length;
  const progressCount = Math.max(0, STARTER_FREE_BOOSTERS - profileForDisplay.starterFreeBoostersRemaining);
  const canChoose = phase === "catalog" && catalogStatus === "ready";

  useEffect(() => {
    let disposed = false;

    void fetchStarterBoosterCatalog(identity)
      .then((response) => {
        if (disposed) return;
        setBoosters(response.boosters);
        setCatalogProfile(response.player);
        setOptimisticProfile(response.player);
        setCatalogError(null);
        setCatalogStatus("ready");
        onProfileChange(response.player);
      })
      .catch((caughtError) => {
        if (disposed) return;
        setCatalogError(caughtError instanceof Error ? caughtError.message : "Каталог бустерів зараз недоступний.");
        setCatalogStatus("error");
      });

    return () => {
      disposed = true;
    };
  }, [catalogRefreshKey, identity, onProfileChange]);

  async function handleOpenBooster(booster: BoosterCatalogItem) {
    if (!canChoose || !booster.starter.canOpen) return;

    setError(null);
    setOpeningBoosterId(booster.id);
    setPhase("opening");

    try {
      const response = await openStarterBooster(identity, booster.id);
      if (response.cards.length === 0) {
        throw new Error("Starter booster did not return cards.");
      }

      setOptimisticProfile(response.player);
      onProfileChange(response.player);
      setReveal({
        booster: response.booster,
        cards: response.cards,
        player: response.player,
      });
      setRevealedCount(response.cards.length);
      setPhase("reveal");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Бустер зараз недоступний.");
      setOpeningBoosterId(null);
      setPhase("catalog");
    }
  }

  function finishReveal() {
    if (!reveal) return;

    setOptimisticProfile(reveal.player);
    onProfileChange(reveal.player);

    if (isStarterKitReady(reveal.player)) {
      setOpeningBoosterId(null);
      setReveal(null);
      setRevealedCount(0);
      setPhase("deck-ready");
      return;
    }

    setOpeningBoosterId(null);
    setReveal(null);
    setRevealedCount(0);
    setCatalogStatus("loading");
    setCatalogError(null);
    setBoosters([]);
    setPhase("catalog");
    setCatalogRefreshKey((current) => current + 1);
  }

  return (
    <main
      className="min-h-screen bg-[#080907] text-[#f7efd7]"
      data-testid="player-profile-shell"
      data-profile-status={profileStatus}
      data-profile-identity-mode={profileIdentityMode ?? "unknown"}
      data-profile-owned-card-count={profileForDisplay.ownedCardIds.length}
      data-profile-deck-count={profileForDisplay.deckIds.length}
      data-deck-source={deckSource}
      data-starter-free-boosters-remaining={profileForDisplay.starterFreeBoostersRemaining}
    >
      <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,rgba(16,17,12,0.95),rgba(5,8,9,0.98)),url('/nexus-assets/backgrounds/arena-bar-1024x576.png')] bg-cover bg-center px-4 py-4 max-[620px]:px-2">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,224,138,0.1),transparent_18%,transparent_78%,rgba(101,215,233,0.1))]" />

        <section
          className="relative z-10 mx-auto grid min-h-[calc(100dvh-32px)] max-w-[1280px] grid-rows-[auto_minmax(0,1fr)] gap-3"
          data-testid="starter-onboarding-shell"
          data-phase={phase}
          data-catalog-status={catalogStatus}
          data-opened-booster-count={openedCount}
          data-progress-count={progressCount}
        >
          <header className="grid grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.1fr)_auto] items-stretch gap-3 rounded-md border border-[#d4aa4d]/45 bg-[linear-gradient(180deg,rgba(28,27,19,0.94),rgba(9,11,11,0.97))] p-3 shadow-[0_18px_42px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,242,181,0.12)] max-[980px]:grid-cols-1 max-[620px]:p-2">
            <div className="grid content-center gap-1">
              <b className="text-[11px] font-black uppercase tracking-[0.16em] text-[#d6b66d]">Стартова роздача</b>
              <h1 className="text-[clamp(28px,6vw,54px)] font-black uppercase leading-none text-[#fff0ad] [text-shadow:0_3px_0_rgba(0,0,0,0.72)]">
                Нексус
              </h1>
            </div>

            <StarterProgress profile={profileForDisplay} />

            <div className="grid min-w-[240px] grid-cols-3 gap-2 max-[980px]:min-w-0">
              <Metric label="Бустерів" value={`${progressCount}/${STARTER_FREE_BOOSTERS}`} />
              <Metric label="Карт" value={profileForDisplay.ownedCardIds.length} testId="starter-owned-count" />
              <Metric label="Ще" value={profileForDisplay.starterFreeBoostersRemaining} />
            </div>
          </header>

          {phase === "deck-ready" ? (
            <StarterDeckReady profile={profileForDisplay} onPlayDeck={onPlayDeck} onEditDeck={onEditDeck} />
          ) : phase === "reveal" && reveal ? (
            <StarterReveal reveal={reveal} revealedCount={revealedCount} onDone={finishReveal} />
          ) : (
            <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 max-[760px]:grid-cols-1">
                <div className="min-w-0">
                  <strong className="block text-[clamp(24px,4vw,38px)] font-black uppercase leading-none text-[#fff4c4]">
                    {openedCount === 0 ? "Обери перший бустер" : "Другий бустер чекає"}
                  </strong>
                  <p className="mt-2 max-w-[760px] text-sm font-bold leading-snug text-[#cbbd99] max-[520px]:text-xs">
                    Обери два різні бустери. У кожному 5 нових карт з двох кланів: гарантовано одна легендарна,
                    одна унікальна і ще три карти без повторів з твоєї колекції.
                  </p>
                </div>

                <div className="grid min-w-[210px] gap-1 rounded-md border border-white/10 bg-black/34 px-3 py-2 text-right max-[760px]:min-w-0 max-[760px]:text-left">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8ed8e6]">Стан</span>
                  <b className="text-sm font-black uppercase text-[#fff0ad]" data-testid="starter-state-label">
                    {openedCount === 0 ? "Перший вибір" : "Другий вибір"}
                  </b>
                </div>
              </div>

              {phase === "opening" ? (
                <div
                  className="rounded-md border border-[#65d7e9]/35 bg-[#0d2d32]/70 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#c7f8ff]"
                  data-testid="starter-opening-pending"
                >
                  Записуємо бустер у профіль...
                </div>
              ) : null}

              {catalogStatus === "loading" ? (
                <div
                  className="rounded-md border border-[#d4aa4d]/35 bg-black/34 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#ffe08a]"
                  data-testid="starter-catalog-loading"
                >
                  Завантажуємо каталог бустерів...
                </div>
              ) : null}

              {catalogStatus === "error" ? (
                <div
                  className="rounded-md border border-[#ef735a]/45 bg-[#3a1512]/80 px-4 py-3 text-sm font-bold text-[#ffd5ca]"
                  data-testid="starter-catalog-error"
                >
                  {catalogError}
                </div>
              ) : null}

              {error ? (
                <div
                  className="rounded-md border border-[#ef735a]/45 bg-[#3a1512]/80 px-4 py-3 text-sm font-bold text-[#ffd5ca]"
                  data-testid="starter-booster-error"
                >
                  {error}
                </div>
              ) : null}

              {catalogStatus === "ready" ? (
                <div
                  className="booster-catalog-grid grid min-h-0 grid-cols-[repeat(auto-fit,minmax(178px,1fr))] gap-2.5 overflow-y-auto pr-1 max-[430px]:grid-cols-2 max-[430px]:gap-2"
                  data-testid="starter-booster-catalog"
                >
                  {boosters.map((booster, index) => (
                    <BoosterTile
                      key={booster.id}
                      booster={booster}
                      index={index}
                      busy={phase === "opening"}
                      opening={openingBoosterId === booster.id}
                      onOpen={() => handleOpenBooster(booster)}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function StarterDeckReady({
  profile,
  onPlayDeck,
  onEditDeck,
}: {
  profile: PlayerProfile;
  onPlayDeck: (deckIds: string[], mode: "ai" | "human") => void;
  onEditDeck: (deckIds: string[]) => void;
}) {
  const savedOwnedDeckIds = getSavedOwnedDeckIds(profile);
  const deckCards = savedOwnedDeckIds
    .map((cardId) => cardCatalog.find((card) => card.id === cardId))
    .filter(Boolean) as Card[];
  const clans = new Set(deckCards.map((card) => card.clan));
  const totalPower = deckCards.reduce((sum, card) => sum + card.power, 0);
  const totalDamage = deckCards.reduce((sum, card) => sum + card.damage, 0);
  const deckReady = savedOwnedDeckIds.length >= STARTER_KIT_CARD_COUNT;

  return (
    <section
      className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3"
      data-testid="starter-deck-ready-shell"
      data-card-count={deckCards.length}
      data-profile-deck-count={profile.deckIds.length}
      data-opened-booster-count={profile.openedBoosterIds.length}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-3 rounded-md border border-[#d4aa4d]/45 bg-[linear-gradient(180deg,rgba(29,29,20,0.94),rgba(8,10,10,0.98))] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,242,181,0.12)] max-[860px]:grid-cols-1 max-[520px]:p-3">
        <div className="min-w-0">
          <b className="text-[11px] font-black uppercase tracking-[0.16em] text-[#65d7e9]">Стартовий комплект закрито</b>
          <h2 className="mt-1 text-[clamp(28px,5vw,50px)] font-black uppercase leading-none text-[#fff0ad] [text-shadow:0_3px_0_rgba(0,0,0,0.72)]">
            Колода готова
          </h2>
          <p className="mt-2 max-w-[760px] text-sm font-bold leading-snug text-[#cbbd99] max-[520px]:text-xs">
            Два різні бустери вже записали карти в профіль. Можна одразу зіграти бій з AI, PvP або підкрутити склад.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric label="Карт" value={`${deckCards.length}/${STARTER_KIT_CARD_COUNT}`} />
          <Metric label="Бустерів" value={`${profile.openedBoosterIds.length}/${STARTER_FREE_BOOSTERS}`} />
          <Metric label="Фракцій" value={clans.size} />
          <Metric label="Сила" value={totalPower} />
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_260px] gap-3 max-[960px]:grid-cols-1">
        <section className="grid min-h-0 content-start gap-2 overflow-y-auto rounded-md border border-[#d4aa4d]/32 bg-[rgba(5,8,10,0.74)] p-3 shadow-[inset_0_0_68px_rgba(0,0,0,0.3)] max-[520px]:p-2">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(116px,1fr))] gap-3 max-[430px]:grid-cols-2 max-[430px]:gap-1.5">
            {deckCards.map((card, index) => (
              <StarterDeckReadyCard key={`${card.id}-${index}`} card={card} index={index} />
            ))}
          </div>
        </section>

        <aside className="grid content-start gap-3 rounded-md border border-white/10 bg-black/42 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Урон" value={totalDamage} />
            <Metric label="Легенд." value={deckCards.filter((card) => card.rarity === "Legend").length} />
          </div>

          <button
            className={cn(
              "min-h-[48px] rounded-md border-2 px-5 text-sm font-black uppercase transition",
              deckReady
                ? "border-black/60 bg-[linear-gradient(180deg,#fff26d,#e3b51e_54%,#a66d12)] text-[#1a1408] hover:brightness-110"
                : "cursor-not-allowed border-white/10 bg-white/5 text-[#7e7668]",
            )}
            type="button"
            disabled={!deckReady}
            onClick={() => onPlayDeck(savedOwnedDeckIds, "ai")}
            data-testid="starter-deck-ready-play"
          >
            Грати
          </button>

          <button
            className={cn(
              "min-h-[48px] rounded-md border-2 px-5 text-sm font-black uppercase transition",
              deckReady
                ? "border-[#65d7e9]/60 bg-[linear-gradient(180deg,#68e5f5,#218aa3_56%,#0d4151)] text-[#061116] hover:brightness-110"
                : "cursor-not-allowed border-white/10 bg-white/5 text-[#7e7668]",
            )}
            type="button"
            disabled={!deckReady}
            onClick={() => onPlayDeck(savedOwnedDeckIds, "human")}
            data-testid="starter-deck-ready-play-human"
          >
            PvP
          </button>

          <button
            className="min-h-[48px] rounded-md border-2 border-[#65d7e9]/60 bg-[linear-gradient(180deg,#68e5f5,#218aa3_56%,#0d4151)] px-5 text-sm font-black uppercase text-[#061116] transition hover:brightness-110"
            type="button"
            onClick={() => onEditDeck(savedOwnedDeckIds)}
            data-testid="starter-deck-ready-edit"
          >
            Редагувати колоду
          </button>
        </aside>
      </div>
    </section>
  );
}

function StarterDeckReadyCard({ card, index }: { card: Card; index: number }) {
  const style = {
    "--card-accent": card.accent,
  } as CSSProperties;

  return (
    <article
      className="relative grid min-h-[190px] place-items-center overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--card-accent),#000_38%)] bg-black/22 p-2 shadow-[0_12px_26px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] max-[430px]:min-h-[168px] max-[430px]:p-1"
      style={style}
      data-testid={`starter-deck-ready-card-${index + 1}`}
      data-card-id={card.id}
    >
      <MiniRevealBattleCard card={card} />
      <b className="pointer-events-none absolute left-2 top-2 z-[3] grid aspect-square w-7 place-items-center rounded-full bg-[#fff0ad] text-xs font-black text-[#17100a] shadow-[0_4px_12px_rgba(0,0,0,0.42)]">
        {index + 1}
      </b>
      <span className="pointer-events-none absolute right-2 top-2 z-[3] max-w-[70%] truncate rounded border border-white/12 bg-black/70 px-2 py-1 text-[9px] font-black uppercase text-[#9ed6e4]">
        {rarityLabels[card.rarity]}
      </span>
    </article>
  );
}

function StarterProgress({ profile }: { profile: PlayerProfile }) {
  const openedCount = profile.openedBoosterIds.length;

  return (
    <section
      className="grid content-center gap-2 rounded border border-white/10 bg-black/30 px-3 py-2"
      data-testid="starter-progress"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a99d85]">Прогрес старту</span>
        <b className="text-sm font-black uppercase text-[#ffe08a]">{profile.starterFreeBoostersRemaining} лишилось</b>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: STARTER_FREE_BOOSTERS }, (_, index) => {
          const filled = index < openedCount;
          return (
            <span
              key={index}
              className={cn(
                "h-3 rounded-sm border transition",
                filled
                  ? "border-[#ffe08a]/70 bg-[linear-gradient(90deg,#ffe08a,#65d7e9)]"
                  : "border-white/12 bg-white/[0.05]",
              )}
              data-testid={`starter-progress-slot-${index + 1}`}
              data-filled={filled}
            />
          );
        })}
      </div>
    </section>
  );
}

function BoosterTile({
  booster,
  index,
  busy,
  opening,
  onOpen,
}: {
  booster: BoosterCatalogItem;
  index: number;
  busy: boolean;
  opening: boolean;
  onOpen: () => void;
}) {
  const [toneA, toneB] = boosterAccents[index % boosterAccents.length];
  const opened = booster.starter.opened;
  const disabled = busy || !booster.starter.canOpen;
  const clanDetails = booster.clans.map((clanName) => clans[clanName]).filter(Boolean);
  const style = {
    "--booster-a": toneA,
    "--booster-b": toneB,
  } as CSSProperties;

  return (
    <article
      className={cn(
        "group relative min-h-[282px] overflow-hidden rounded-md border bg-[linear-gradient(145deg,color-mix(in_srgb,var(--booster-a),#111_24%),rgba(8,10,10,0.96)_42%,color-mix(in_srgb,var(--booster-b),#050809_32%))] p-3 shadow-[0_14px_30px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.12)] transition max-[430px]:min-h-[248px] max-[430px]:p-2",
        opened
          ? "border-[#ffe08a]/65 brightness-75"
          : booster.starter.canOpen
            ? "border-white/14 hover:-translate-y-0.5 hover:border-[#fff0ad]/70 hover:brightness-110"
            : "border-white/10 opacity-70",
      )}
      style={style}
      data-testid={`starter-booster-card-${booster.id}`}
      data-opened={opened}
      data-can-open={booster.starter.canOpen}
    >
      <div className="pointer-events-none absolute inset-2 rounded border border-white/12" />
      <div className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rotate-12 border-[14px] border-[color-mix(in_srgb,var(--booster-a),transparent_38%)]" />
      <div className="relative z-[1] grid h-full min-h-[256px] grid-rows-[auto_1fr_auto] gap-3 max-[430px]:min-h-[226px]">
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-sm border border-black/35 bg-[#fff0ad] px-1.5 py-1 text-[10px] font-black uppercase leading-none text-[#17100a]">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "rounded-sm border px-1.5 py-1 text-[10px] font-black uppercase leading-none",
              opened
                ? "border-[#ffe08a]/60 bg-[#ffe08a] text-[#17100a]"
                : "border-white/15 bg-black/34 text-[#f6ebd1]",
            )}
          >
            {opened ? "Відкрито" : "Новий"}
          </span>
        </div>

        <div className="grid content-end gap-2">
          <strong className="text-[clamp(18px,3vw,25px)] font-black uppercase leading-[0.95] text-[#fff4c4] [text-shadow:0_2px_0_rgba(0,0,0,0.72)]">
            {booster.name}
          </strong>
          <p className="line-clamp-3 text-[11px] font-bold leading-snug text-[#e8d9b6] max-[430px]:line-clamp-2 max-[430px]:text-[10px]">
            {boosterStories[booster.id] ?? "Два клана, пять новых карт и стартовая связка для первой колоды."}
          </p>
          <div className="grid grid-cols-3 gap-1 text-center">
            <BoosterPromise value="5" label="карт" />
            <BoosterPromise value="1" label="легенда" />
            <BoosterPromise value="1" label="унікальна" />
          </div>
          <div className="grid gap-1">
            {clanDetails.map((clan) => (
              <div
                key={clan.name}
                className="min-w-0 rounded-sm border border-white/12 bg-black/32 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <b className="truncate text-[11px] font-black uppercase tracking-[0.04em] text-[#fff0ad]">{clan.name}</b>
                  <span className="shrink-0 text-[9px] font-black uppercase text-[#8ed8e6]">{clan.bonus.name}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] font-bold leading-snug text-[#cbbd99]">{clan.bonus.description}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          className={cn(
            "min-h-[38px] rounded border-2 px-3 text-xs font-black uppercase transition",
            disabled
              ? "cursor-not-allowed border-white/10 bg-black/28 text-[#7c735f]"
              : "border-black/55 bg-[linear-gradient(180deg,#fff26d,#e2b72e_56%,#966414)] text-[#17100a] hover:brightness-110",
          )}
          type="button"
          disabled={disabled}
          onClick={onOpen}
          data-testid={`starter-booster-open-${booster.id}`}
        >
          {opening ? "Запис..." : opened ? "Недоступно" : "Відкрити"}
        </button>
      </div>
    </article>
  );
}

function BoosterPromise({ value, label }: { value: string; label: string }) {
  return (
    <span className="rounded-sm border border-[#ffe08a]/24 bg-[#ffe08a]/10 px-1.5 py-1">
      <b className="block text-sm font-black leading-none text-[#ffe08a]">{value}</b>
      <em className="mt-0.5 block truncate text-[8px] font-black uppercase not-italic text-[#e8d9b6]">{label}</em>
    </span>
  );
}

function StarterReveal({
  reveal,
  revealedCount,
  onDone,
}: {
  reveal: RevealState;
  revealedCount: number;
  onDone: () => void;
}) {
  const visibleCards = reveal.cards.slice(0, revealedCount);
  const defaultIndex = pickDefaultRevealIndex(visibleCards);
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);

  useEffect(() => {
    setSelectedIndex(pickDefaultRevealIndex(reveal.cards.slice(0, revealedCount)));
  }, [reveal.booster.id, revealedCount, reveal.cards]);

  const maxIndex = Math.max(visibleCards.length - 1, 0);
  const safeIndex = Math.min(Math.max(selectedIndex, 0), maxIndex);
  const activeCard = visibleCards[safeIndex] ?? reveal.cards[0];
  const complete = revealedCount >= reveal.cards.length;
  const deckReadyAfterReveal = isStarterKitReady(reveal.player);

  return (
    <section
      className="starter-reveal-stage grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 rounded-md border border-[#d4aa4d]/42 bg-[linear-gradient(180deg,rgba(24,22,15,0.92),rgba(5,7,8,0.96))] p-4 shadow-[inset_0_0_70px_rgba(0,0,0,0.28)] max-[620px]:p-2"
      data-testid="starter-reveal-shell"
      data-revealed-count={revealedCount}
    >
      <div className="flex items-end justify-between gap-3 max-[620px]:grid">
        <div>
          <b className="text-[11px] font-black uppercase tracking-[0.16em] text-[#65d7e9]">{reveal.booster.name}</b>
          <h2 className="mt-1 text-[clamp(24px,5vw,42px)] font-black uppercase leading-none text-[#fff0ad]">
            П&apos;ять карт у профілі
          </h2>
        </div>
        <span className="rounded border border-white/10 bg-black/34 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#cbbd99]">
          1 легендарна · 1 унікальна · без повторів
        </span>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(230px,330px)_minmax(0,1fr)] items-center gap-4 max-[760px]:grid-cols-1 max-[760px]:items-start">
        <div
          className="starter-reveal-card justify-self-center"
          data-testid="starter-reveal-active-card"
          data-card-id={activeCard.id}
        >
          <BattleCard card={activeCard} className="w-[min(260px,66vw)] !min-h-[352px] max-[430px]:w-[min(218px,70vw)] max-[430px]:!min-h-[302px]" />
        </div>

        <aside className="grid min-w-0 gap-3">
          <div className="min-w-0">
            <strong className="block truncate text-[clamp(26px,5vw,46px)] font-black uppercase leading-none text-[#fff6d0]">
              {activeCard.name}
            </strong>
            <span className="mt-1 block text-xs font-black uppercase tracking-[0.12em] text-[#9ed6e4]">
              {activeCard.clan} · {rarityLabels[activeCard.rarity]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Сила" value={activeCard.power} />
            <Metric label="Урон" value={activeCard.damage} />
          </div>

          <dl className="grid gap-2">
            <RevealDetail label="Уміння" title={activeCard.ability.name} description={activeCard.ability.description} />
            <RevealDetail label="Бонус" title={activeCard.bonus.name} description={activeCard.bonus.description} />
          </dl>
        </aside>
      </div>

      <div className="grid gap-3">
        <div className="grid grid-cols-5 gap-2 max-[760px]:grid-cols-[repeat(5,minmax(112px,1fr))] max-[760px]:overflow-x-auto max-[620px]:gap-1.5" data-testid="starter-reveal-list">
          {visibleCards.map((card, index) => {
            const isActive = index === safeIndex;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={cn(
                  "starter-reveal-chip min-w-0 rounded border bg-black/34 p-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe08a]/70",
                  isActive
                    ? "border-[#ffe08a]/80 bg-[#ffe08a]/[0.08] shadow-[0_0_0_1px_rgba(255,224,138,0.45),0_8px_22px_rgba(0,0,0,0.42)]"
                    : "border-white/10 hover:border-[#fff0ad]/55 hover:bg-black/45",
                )}
                style={{ "--reveal-index": index } as CSSProperties}
                data-testid={`starter-reveal-card-${index + 1}`}
                data-card-id={card.id}
                data-active={isActive}
                aria-pressed={isActive}
              >
                <MiniRevealBattleCard card={card} />
                <b className="mt-1 block truncate text-[11px] font-black uppercase text-[#fff0ad] max-[430px]:text-[10px]">{card.name}</b>
                <span className="block truncate text-[9px] font-black uppercase text-[#9ed6e4]">{rarityLabels[card.rarity]}</span>
              </button>
            );
          })}
        </div>

        {complete ? (
          <button
            className="justify-self-end rounded-md border-2 border-black/55 bg-[linear-gradient(180deg,#fff26d,#e2b72e_56%,#966414)] px-5 py-3 text-sm font-black uppercase text-[#17100a] transition hover:brightness-110 max-[620px]:w-full"
            type="button"
            onClick={onDone}
            data-testid="starter-reveal-continue"
          >
            {deckReadyAfterReveal ? "До колоди" : "До каталогу"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function MiniRevealBattleCard({ card }: { card: Card }) {
  return (
    <div className="relative mx-auto h-[132px] w-[96px] overflow-hidden max-[430px]:h-[116px] max-[430px]:w-[84px]">
      <div className="pointer-events-none absolute left-0 top-0 w-[216px] origin-top-left scale-[0.444] max-[430px]:scale-[0.389]">
        <BattleCard card={card} compact className="!w-[216px]" />
      </div>
    </div>
  );
}

function RevealDetail({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-2">
      <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-[#d4b06a]">{label}</dt>
      <dd className="mt-1 text-sm font-black text-[#fff7df]">{title}</dd>
      <dd className="mt-1 line-clamp-3 text-xs font-bold leading-snug text-[#bdb197]">{description}</dd>
    </div>
  );
}

function Metric({ label, value, testId }: { label: string; value: number | string; testId?: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/36 px-2 py-2" data-testid={testId}>
      <b className="block text-xl font-black leading-none text-[#ffe08a]">{value}</b>
      <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.1em] text-[#a99d85]">{label}</span>
    </div>
  );
}

const revealRarityPriority: Record<Rarity, number> = {
  Legend: 0,
  Unique: 1,
  Rare: 2,
  Common: 3,
};

function pickDefaultRevealIndex(cards: Card[]) {
  if (cards.length === 0) return 0;
  let bestIndex = 0;
  let bestRank = revealRarityPriority[cards[0].rarity];
  for (let index = 1; index < cards.length; index += 1) {
    const rank = revealRarityPriority[cards[index].rarity];
    if (rank < bestRank) {
      bestRank = rank;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function isStarterKitReady(profile: PlayerProfile) {
  return (
    profile.starterFreeBoostersRemaining === 0 &&
    profile.openedBoosterIds.length >= STARTER_FREE_BOOSTERS &&
    getSavedOwnedDeckIds(profile).length >= STARTER_KIT_CARD_COUNT
  );
}

function getSavedOwnedDeckIds(profile: PlayerProfile) {
  const knownCardIds = new Set(cardCatalog.map((card) => card.id));
  const ownedCardIds = new Set(profile.ownedCardIds);

  return unique(profile.deckIds).filter((cardId) => knownCardIds.has(cardId) && ownedCardIds.has(cardId));
}

function unique(values: string[]) {
  return [...new Set(values)];
}
