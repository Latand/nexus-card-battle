"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { isClanBonusActive } from "../model/clans";
import { DAMAGE_BOOST_COST, PHASE_TIMING_MS, TURN_SECONDS } from "../model/constants";
import {
  applyOutcome,
  chooseEnemyMove,
  createInitialGame,
  getAvailableCards,
  getSelectedCard,
  resolveRound,
  score,
  startNextRound,
} from "../model/game";
import type { EnemyMove } from "../model/game";
import type { Clash, GameState, MatchResult, Outcome, Phase, RewardSummary, Side } from "../model/types";
import { AttackAnimation } from "./components/AttackAnimation";
import { BattleOverlay } from "./components/BattleOverlay";
import { Hand } from "./components/Hand";
import { NamePlate } from "./components/ResourceCounter";
import { SceneBackground } from "./components/SceneBackground";
import { SelectionOverlay } from "./components/SelectionOverlay";

type BattleGameProps = {
  playerCollectionIds?: string[];
  playerDeckIds?: string[];
  onOpenCollection?: () => void;
};

export function BattleGame({ playerCollectionIds, playerDeckIds, onOpenCollection }: BattleGameProps = {}) {
  const initialGame = useMemo(
    () => createInitialGame({ playerCollectionIds, playerDeckIds }),
    [playerCollectionIds, playerDeckIds],
  );
  const [game, setGame] = useState(() => initialGame);
  const [selectedId, setSelectedId] = useState(() => getAvailableCards(initialGame.player)[0]?.id);
  const [energy, setEnergy] = useState(0);
  const [damageBoost, setDamageBoost] = useState(false);
  const [pending, setPending] = useState<Outcome | null>(null);
  const [enemyLockedMove, setEnemyLockedMove] = useState<EnemyMove | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState(TURN_SECONDS);
  const autoSubmitRef = useRef(() => {});

  const selected = getSelectedCard(game.player, selectedId) ?? game.player.hand[0];
  const boostCost = damageBoost ? DAMAGE_BOOST_COST : 0;
  const maxEnergyForCard = Math.max(0, game.player.energy - boostCost);
  const selectedEnergy = Math.min(energy, maxEnergyForCard);
  const canBoost = !damageBoost ? game.player.energy >= selectedEnergy + DAMAGE_BOOST_COST : true;
  const locked = pending !== null || !["player_turn", "card_preview"].includes(game.phase);
  const activeClash = pending?.clash ?? (showsResolvedClash(game.phase) ? game.lastClash ?? null : null);
  const preview = selected
    ? score(selected, selectedEnergy, game.first === "player", {
        owner: game.player,
        opponent: game.enemy,
        clanBonus: {
          active: isClanBonusActive(game.player, selected),
          bonus: selected.bonus,
          card: selected,
        },
      })
    : { attack: 0, damage: 0 };
  const previewDamage = preview.damage + (damageBoost ? 2 : 0);
  const verdict = useMemo(() => getVerdict(game.matchResult), [game.matchResult]);
  const showBattle = pending !== null && ["battle_intro", "damage_apply"].includes(game.phase);
  const arenaText = getArenaText(game, activeClash, verdict);
  const boardHidden = !["player_turn", "card_preview", "opponent_turn"].includes(game.phase);
  const activeHand = getActiveHand(game.phase);
  const enemyPlayedCardId = enemyLockedMove?.card.id ?? pending?.clash.enemyCard.id ?? game.round.enemyCardId;
  const playerDecisionActive = pending === null && ["player_turn", "card_preview"].includes(game.phase);

  useEffect(() => {
    if (game.phase === "match_intro") {
      return schedule(() => setGame((value) => ({ ...value, phase: "round_intro" })), PHASE_TIMING_MS.match_intro);
    }

    if (game.phase === "round_intro") {
      return schedule(() => {
        const nextCard = getAvailableCards(game.player)[0];
        if (nextCard) setSelectedId(nextCard.id);
        setEnergy(0);
        setDamageBoost(false);
        setSelectionOpen(false);
        setPending(null);
        setTurnSeconds(TURN_SECONDS);

        if (game.first === "enemy") {
          const enemyMove = chooseEnemyMove(game.enemy, game.player, game.round.round);

          setEnemyLockedMove(enemyMove);
          setGame((value) => ({
            ...value,
            phase: "opponent_turn",
            round: {
              ...value.round,
              enemyCardId: enemyMove.card.id,
              enemyEnergyBid: enemyMove.energy,
            },
          }));
          return;
        }

        setEnemyLockedMove(null);
        setGame((value) => ({ ...value, phase: "player_turn" }));
      }, PHASE_TIMING_MS.round_intro);
    }

    if (game.phase === "opponent_turn") {
      return schedule(() => {
        setGame((value) => ({ ...value, phase: pending ? "battle_intro" : "player_turn" }));
      }, PHASE_TIMING_MS.opponent_turn);
    }

    if (game.phase === "battle_intro") {
      return schedule(() => setGame((value) => ({ ...value, phase: "damage_apply" })), PHASE_TIMING_MS.battle_intro);
    }

    if (game.phase === "damage_apply" && pending) {
      return schedule(() => {
        const applied = applyOutcome(game, pending);
        const nextCard = getAvailableCards(applied.player)[0];

        if (nextCard) setSelectedId(nextCard.id);
        setEnergy(0);
        setDamageBoost(false);
        setPending(null);
        setEnemyLockedMove(null);
        setGame(applied);
      }, 1200 + pending.clash.damage * 220);
    }

    if (game.phase === "round_result") {
      return schedule(() => setGame((value) => startNextRound(value)), PHASE_TIMING_MS.round_result);
    }

    if (game.phase === "match_result") {
      return schedule(() => setGame((value) => ({ ...value, phase: "reward_summary" })), PHASE_TIMING_MS.match_result);
    }
  }, [game, pending]);

  useEffect(() => {
    let startedAt = 0;
    const resetHandle = window.setTimeout(() => {
      startedAt = Date.now();
      setTurnSeconds(TURN_SECONDS);
    }, 0);

    if (!playerDecisionActive) {
      return () => window.clearTimeout(resetHandle);
    }

    const interval = window.setInterval(() => {
      if (startedAt === 0) return;
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setTurnSeconds(Math.max(0, TURN_SECONDS - elapsedSeconds));
    }, 250);
    const timeout = window.setTimeout(() => autoSubmitRef.current(), TURN_SECONDS * 1000);

    return () => {
      window.clearTimeout(resetHandle);
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [game.round.round, playerDecisionActive]);

  function confirmSelection() {
    if (!selected) return;

    submitSelection(selected, selectedEnergy, damageBoost);
  }

  function submitSelection(card: NonNullable<typeof selected>, energyBid: number, boosted: boolean) {
    if (!card || locked || card.used) return;

    const boostCost = boosted ? DAMAGE_BOOST_COST : 0;
    const maxEnergy = Math.max(0, game.player.energy - boostCost);
    const legalEnergy = Math.max(0, Math.min(energyBid, maxEnergy));
    const effectiveBoost = boosted && game.player.energy >= legalEnergy + DAMAGE_BOOST_COST;
    const knownEnemyMove = game.first === "enemy" ? enemyLockedMove ?? chooseEnemyMove(game.enemy, game.player, game.round.round) : undefined;
    const outcome = resolveRound(game.player, game.enemy, card, legalEnergy, effectiveBoost, game.first, game.round.round, knownEnemyMove);
    const enemyMove = knownEnemyMove ?? { card: outcome.clash.enemyCard, energy: outcome.clash.enemyEnergy };

    setSelectedId(card.id);
    setSelectionOpen(false);
    setTurnSeconds(TURN_SECONDS);
    setPending(outcome);
    setEnemyLockedMove(enemyMove);
    setGame((value) => ({
      ...value,
      phase: knownEnemyMove ? "battle_intro" : "opponent_turn",
      round: {
        ...value.round,
        playerCardId: card.id,
        enemyCardId: enemyMove.card.id,
        playerEnergyBid: legalEnergy,
        enemyEnergyBid: enemyMove.energy,
        clash: outcome.clash,
      },
    }));
  }

  useEffect(() => {
    autoSubmitRef.current = () => {
      if (pending || !["player_turn", "card_preview"].includes(game.phase)) return;

      const availableCards = getAvailableCards(game.player);
      if (availableCards.length === 0) return;

      const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
      const randomEnergy = Math.floor(Math.random() * (game.player.energy + 1));

      submitSelection(randomCard, randomEnergy, false);
    };
  });

  function reset() {
    const next = createInitialGame({ playerCollectionIds, playerDeckIds });
    const firstCard = getAvailableCards(next.player)[0];

    setGame(next);
    setSelectedId(firstCard?.id);
    setEnergy(0);
    setDamageBoost(false);
    setPending(null);
    setEnemyLockedMove(null);
    setSelectionOpen(false);
    setTurnSeconds(TURN_SECONDS);
  }

  function toggleBoost() {
    if (locked) return;
    if (!damageBoost) {
      if (!canBoost) return;
      setEnergy((value) => Math.min(value, Math.max(0, game.player.energy - DAMAGE_BOOST_COST)));
      setDamageBoost(true);
    } else {
      setDamageBoost(false);
    }
  }

  function closeSelection() {
    setSelectionOpen(false);
    setGame((value) => (value.phase === "card_preview" ? { ...value, phase: "player_turn" } : value));
  }

  return (
    <main className="relative isolate min-h-screen w-screen overflow-hidden bg-[#05080b] px-[min(14px,1.4vw)] py-2 text-[#f8eed8] max-[620px]:overflow-y-auto max-[620px]:p-2">
      <SceneBackground />

      {!boardHidden ? (
      <div className="relative z-10">
      <section className={topBarClass()}>
        <div className={barButtonClass()} data-testid="turn-timer">⌛ {turnSeconds} сек</div>
        <NamePlate name={game.enemy.name} energy={game.enemy.energy} health={game.enemy.hp} statuses={game.enemy.statuses} />
        <button className={barButtonClass("border-l border-white/10 hover:bg-[linear-gradient(180deg,#ffe08a,#c98326)] hover:text-[#15100a]")} type="button" onClick={onOpenCollection}>
          Колоди
        </button>
      </section>

      <Hand
        cards={game.enemy.hand}
        fighter={game.enemy}
        opponent={game.player}
        owner="enemy"
        active={activeHand === "enemy"}
        selectedId={activeClash?.enemyCard.id}
        playedCardId={enemyPlayedCardId}
      />

      <section
        className={cn(
          "relative z-10 mx-auto grid w-[min(980px,100%)] items-center gap-3 p-0",
          "mt-1 min-h-[154px] grid-cols-[minmax(260px,680px)] justify-center",
          "max-[760px]:mt-3 max-[760px]:grid-cols-1",
        )}
      >
        <div className="relative grid min-h-[154px] place-items-center gap-2.5 overflow-hidden border-y-2 border-[#c98b27]/55 bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.68)_12%_88%,transparent),radial-gradient(circle_at_center,rgba(255,214,73,0.16),transparent_44%)] shadow-[0_0_26px_rgba(0,0,0,0.58),inset_0_0_0_1px_rgba(255,231,151,0.12)] before:absolute before:inset-x-[10%] before:top-1/2 before:h-[64px] before:-translate-y-1/2 before:border-y before:border-[#59d9ff]/25 before:bg-[linear-gradient(90deg,transparent,rgba(14,28,35,0.84),transparent)] before:content-[''] max-[760px]:order-2">
          <strong className="relative z-[1] min-w-[210px] px-[18px] text-center text-[clamp(30px,4.1vw,56px)] font-black uppercase leading-none text-[#ffd742] [font-family:Impact,Arial_Narrow,sans-serif] [text-shadow:0_0_16px_rgba(255,204,51,0.8),0_4px_0_rgba(0,0,0,0.75)]" data-testid="round-status">
            {getPhaseTitle(game.phase, game.first, verdict)}
          </strong>

          {game.phase === "opponent_turn" ? <OpponentThinkingIndicator /> : null}

          <div className="relative z-[1] grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className={scoreClass()}>{activeClash?.enemyAttack ?? "?"}</span>
            <b className="text-[13px] uppercase tracking-[0.12em] text-[#fff8d4]">атака</b>
            <span className={scoreClass()}>{activeClash?.playerAttack ?? preview.attack}</span>
          </div>

          <div className="relative z-[1]">
            <AttackAnimation clash={activeClash} phase={game.phase} first={activeClash?.first ?? game.first} />
          </div>

          <p className="relative z-[1] max-w-[520px] px-2 text-center text-sm font-extrabold uppercase tracking-[0.03em] text-[#f4e7c4]">{arenaText}</p>
        </div>
      </section>

      <Hand
        cards={game.player.hand}
        fighter={game.player}
        opponent={game.enemy}
        owner="player"
        active={activeHand === "player"}
        selectedId={selectedId}
        onPick={(card) => {
          if (!locked && !card.used) {
            setSelectedId(card.id);
            setSelectionOpen(true);
            setGame((value) => ({
              ...value,
              phase: "card_preview",
              round: { ...value.round, playerCardId: card.id },
            }));
          }
        }}
        disabled={locked}
      />

      <section className={bottomBarClass()}>
        <div className={barButtonClass()} data-testid="round-marker">
          Раунд {game.round.round}
        </div>
        <NamePlate name={game.player.name} player energy={game.player.energy} health={game.player.hp} statuses={game.player.statuses} />
        <button className={barButtonClass("border-l border-white/10 hover:bg-[linear-gradient(180deg,#ffe08a,#c98326)] hover:text-[#15100a]")} onClick={reset} type="button">
          Новий бій
        </button>
      </section>
      </div>
      ) : null}

      {selectionOpen && selected && game.phase === "card_preview" ? (
        <SelectionOverlay
          selected={selected}
          enemy={game.enemy}
          player={game.player}
          knownEnemyCard={enemyLockedMove?.card}
          knownEnemyEnergy={enemyLockedMove?.energy}
          energy={selectedEnergy}
          maxEnergy={maxEnergyForCard}
          damageBoost={damageBoost}
          boostCost={DAMAGE_BOOST_COST}
          previewAttack={preview.attack}
          previewDamage={previewDamage}
          canBoost={canBoost}
          onClose={closeSelection}
          onMinus={() => setEnergy((value) => Math.max(0, Math.min(value, maxEnergyForCard) - 1))}
          onPlus={() => setEnergy((value) => Math.min(maxEnergyForCard, value + 1))}
          onToggleBoost={toggleBoost}
          onConfirm={confirmSelection}
        />
      ) : null}

      <PhaseOverlay game={game} verdict={verdict} onReset={reset} />
      {showBattle && pending ? <BattleOverlay outcome={pending} player={game.player} enemy={game.enemy} phase={game.phase} /> : null}
    </main>
  );
}

function schedule(callback: () => void, delay: number) {
  const timer = window.setTimeout(callback, delay);
  return () => window.clearTimeout(timer);
}

function PhaseOverlay({
  game,
  verdict,
  onReset,
}: {
  game: GameState;
  verdict: string;
  onReset: () => void;
}) {
  if (["player_turn", "card_preview", "opponent_turn", "battle_intro", "damage_apply"].includes(game.phase)) return null;

  if (game.phase === "reward_summary") {
    return <RewardOverlay result={game.matchResult} rewards={game.rewards} onReset={onReset} />;
  }

  const banner = getBanner(game.phase, game.round.round, game.lastClash?.winner);
  const title = banner ? "" : getOverlayTitle(game.phase, game.round.round, verdict);
  const subtitle = getOverlaySubtitle(game, verdict);

  return (
    <section
      className="fixed inset-0 z-30 grid place-items-center bg-[#05080b] bg-[length:cover] bg-center p-3"
      data-testid="phase-overlay"
      data-phase={game.phase}
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(4,7,10,0.08),rgba(4,7,10,0.48) 54%,rgba(4,7,10,0.92)),url('/nexus-assets/backgrounds/arena-bar-1024x576.png')",
      }}
    >
      <div className="relative grid min-h-[min(620px,94vh)] w-[min(980px,96vw)] place-items-center overflow-hidden rounded-md border-2 border-[#d6a03b]/70 bg-black/12 p-5 text-center shadow-[0_0_0_1px_rgba(0,0,0,0.82),0_28px_90px_rgba(0,0,0,0.72),inset_0_0_90px_rgba(0,0,0,0.42)]">
        <div className="grid justify-items-center gap-3">
          {banner ? <Image src={banner.src} alt={banner.alt} width={banner.width} height={banner.height} className="h-auto w-[min(520px,86vw)] drop-shadow-[0_12px_28px_rgba(0,0,0,0.7)]" priority /> : null}
          {title ? (
            <strong className="text-[clamp(52px,8vw,112px)] font-black uppercase leading-[0.92] text-[#ffe08a] [font-family:Impact,Arial_Narrow,sans-serif] [text-shadow:0_0_20px_rgba(255,62,180,0.8),0_5px_0_rgba(0,0,0,0.78)]">
              {title}
            </strong>
          ) : null}
          {subtitle ? <span className="max-w-[620px] border-y border-[#d6a03b]/35 bg-black/58 px-5 py-2 text-base font-black uppercase tracking-[0.05em] text-[#fff8df] max-[620px]:text-xs">{subtitle}</span> : null}
        </div>
      </div>
    </section>
  );
}

function RewardOverlay({
  result,
  rewards,
  onReset,
}: {
  result?: MatchResult;
  rewards?: RewardSummary;
  onReset: () => void;
}) {
  const title = result === "player" ? "Винагороди за перемогу" : result === "draw" ? "Винагороди за нічию" : "Винагороди за бій";

  return (
    <section className="fixed inset-0 z-50 grid place-items-center bg-[#05080b] p-3 backdrop-blur-[4px]" data-testid="reward-summary">
      <div className="relative grid w-[min(680px,94vw)] gap-4 rounded-md border-2 border-[#d6a03b]/75 bg-[linear-gradient(180deg,rgba(12,18,22,0.98),rgba(4,6,9,0.98))] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.76),inset_0_0_80px_rgba(255,188,50,0.08)]">
        <div className="grid grid-cols-[72px_minmax(0,1fr)_92px] items-center gap-4 max-[620px]:grid-cols-[56px_minmax(0,1fr)]">
          <Image src="/nexus-assets/characters/cyber-brawler-thumb.png" alt="" width={72} height={90} className="h-[72px] w-[58px] object-cover object-top" />
          <div className="grid gap-2">
            <strong className="text-3xl font-black uppercase leading-none text-[#ffe08a] max-[620px]:text-2xl">{title}</strong>
            <ProgressBar value={rewards?.levelProgress ?? 0} label={`XP +${rewards?.matchXp ?? 0}`} />
          </div>
          <button
            className="min-h-[44px] rounded-md border-2 border-black/60 bg-[linear-gradient(180deg,#fff26d,#e3b51e_54%,#a66d12)] px-3 text-sm font-black uppercase text-[#1a1408] max-[620px]:col-span-full"
            type="button"
            onClick={onReset}
          >
            Новий бій
          </button>
        </div>

        <div className="grid gap-2">
          {(rewards?.cardRewards ?? []).map((reward) => (
            <div key={reward.cardId} className="grid grid-cols-[minmax(112px,180px)_minmax(0,1fr)_54px] items-center gap-3 rounded border border-white/12 bg-black/28 px-3 py-2 max-[620px]:grid-cols-1">
              <strong className="truncate text-sm font-black uppercase text-[#fff8df]">{reward.cardName}</strong>
              <ProgressBar value={reward.levelProgress} label={`картка +${reward.xp}`} compact />
              <span className="text-right text-sm font-black text-[#ffe08a] max-[620px]:text-left">+{reward.xp}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ value, label, compact = false }: { value: number; label: string; compact?: boolean }) {
  return (
    <div className="grid gap-1">
      <div className={cn("relative overflow-hidden rounded-full border border-black/60 bg-black/55", compact ? "h-4" : "h-6")}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#49d2e7,#ffe08a,#70dc57)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="text-xs font-black uppercase text-[#d9ceb2]">{label}</span>
    </div>
  );
}

function OpponentThinkingIndicator() {
  return (
    <div
      className="relative z-[1] flex min-h-[30px] items-center gap-2 rounded-full border border-[#ff5f58]/45 bg-black/62 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#ffd7d2] shadow-[0_0_18px_rgba(255,65,58,0.28)]"
      data-testid="opponent-thinking"
    >
      <span className="relative grid h-3.5 w-3.5 place-items-center" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5f58]/55" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ff5f58] shadow-[0_0_10px_rgba(255,95,88,0.9)]" />
      </span>
      <span>Суперник обирає відповідь</span>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        <i className="block h-1.5 w-1.5 animate-bounce rounded-full bg-[#ffd7d2]" />
        <i className="block h-1.5 w-1.5 animate-bounce rounded-full bg-[#ffd7d2] [animation-delay:120ms]" />
        <i className="block h-1.5 w-1.5 animate-bounce rounded-full bg-[#ffd7d2] [animation-delay:240ms]" />
      </span>
    </div>
  );
}

function showsResolvedClash(phase: Phase) {
  return ["round_result", "match_result", "reward_summary"].includes(phase);
}

function getActiveHand(phase: Phase): Side | null {
  if (phase === "player_turn" || phase === "card_preview") return "player";
  if (phase === "opponent_turn") return "enemy";
  return null;
}

function getArenaText(game: GameState, clash: Clash | null, verdict: string) {
  if (!clash) {
    if (game.phase === "match_intro") return "Матч завантажується: бійці виходять на арену.";
    if (game.phase === "round_intro") return `Раунд ${game.round.round}. Арена вільна, картки чекають на вибір.`;
    return "Обери бійця, вклади енергію й випусти його на арену.";
  }

  if (game.phase === "opponent_turn") return "Картку обрано. Суперник відповідає своїм ходом.";
  if (game.phase === "damage_apply") return `${clash.winner === "player" ? clash.playerCard.name : clash.enemyCard.name} перемагає. Завдано ${clash.damage} шкоди.`;
  if (game.phase === "match_result" || game.phase === "reward_summary") return `${verdict}. Завдано ${clash.damage} шкоди.`;
  if (game.phase === "round_result") return `${roundResultText(clash.winner)} Завдано ${clash.damage} шкоди.`;

  return "Обирай наступну картку.";
}

function getPhaseTitle(phase: Phase, _first: Side, verdict: string) {
  if (phase === "match_result" || phase === "reward_summary") return verdict;
  if (phase === "round_intro") return "Раунд";
  if (phase === "opponent_turn") return "Хід суперника";
  if (phase === "battle_intro") return "Бой";
  if (phase === "damage_apply") return "Шкода";
  if (phase === "round_result") return "Підсумок раунду";
  return "Твій хід";
}

function getOverlayTitle(phase: Phase, round: number, verdict: string) {
  if (phase === "match_intro") return "Матч";
  if (phase === "round_intro") return `Раунд ${round}`;
  if (phase === "opponent_turn") return "Хід суперника";
  if (phase === "round_result") return "Раунд завершено";
  if (phase === "match_result") return verdict;
  return "";
}

function getOverlaySubtitle(game: GameState, verdict: string) {
  if (game.phase === "match_intro") return `${game.player.name} vs ${game.enemy.name} · HP ${game.player.hp}/${game.enemy.hp} · енергія ${game.player.energy}/${game.enemy.energy}`;
  if (game.phase === "round_intro") return "Картки готові. Обери бійця.";
  if (game.phase === "opponent_turn") return "Картку гравця зафіксовано, суперник обирає відповідь";
  if (game.phase === "round_result" && game.lastClash) return `${game.lastClash.damage} шкоди. Наступний раунд за мить.`;
  if (game.phase === "match_result") return verdict ? "Бій завершено." : "";
  return "";
}

function getBanner(phase: Phase, round: number, winner?: Side) {
  if (phase === "round_result" && winner) {
    return winner === "player"
      ? { src: "/nexus-assets/banners/round-won.png", alt: "Раунд виграно", width: 520, height: 104 }
      : { src: "/nexus-assets/banners/round-lost.png", alt: "Раунд програно", width: 520, height: 104 };
  }
  if (phase === "match_result" && winner === "enemy") return { src: "/nexus-assets/banners/defeat.png", alt: "Поразка", width: 430, height: 108 };
  if (phase === "round_intro" && [1, 3, 4].includes(round)) return { src: `/nexus-assets/banners/round-${round}.png`, alt: `Раунд ${round}`, width: 360, height: 104 };
  return null;
}

function roundResultText(winner: Side) {
  return winner === "player" ? "Раунд виграно!" : "Раунд програно.";
}

function getVerdict(result?: MatchResult) {
  if (!result) return "";
  if (result === "draw") return "Нічия";
  return result === "player" ? "Перемога" : "Поразка";
}

function topBarClass() {
  return cn(
    barShellClass(),
    "mt-0 grid-cols-[92px_minmax(220px,1fr)_82px]",
    "max-[960px]:grid-cols-[76px_minmax(0,1fr)_68px] max-[760px]:grid-cols-[58px_minmax(0,1fr)_54px]",
  );
}

function bottomBarClass() {
  return cn(
    barShellClass(),
    "mt-2 grid-cols-[100px_minmax(220px,1fr)_100px] border-[#d6a03b]/80",
    "max-[960px]:grid-cols-[82px_minmax(0,1fr)_82px] max-[760px]:grid-cols-[64px_minmax(0,1fr)_64px]",
  );
}

function barShellClass() {
  return "relative z-10 mx-auto grid min-h-[50px] w-[min(860px,100%)] items-center overflow-hidden rounded-md border border-[#d6a03b]/70 bg-[linear-gradient(180deg,rgba(10,18,22,0.96),rgba(3,6,9,0.96)),repeating-linear-gradient(135deg,rgba(255,255,255,0.07)_0_1px,transparent_1px_8px)] shadow-[0_10px_26px_rgba(0,0,0,0.58),inset_0_0_0_1px_rgba(255,231,151,0.1)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[#ffe08a]/45 before:content-[''] max-[760px]:min-h-[46px]";
}

function barButtonClass(extra?: string) {
  return cn(
    "grid min-h-[50px] place-items-center bg-black/35 text-xs font-black uppercase tracking-[0.03em] text-[#fff8d8] max-[760px]:min-h-[46px] max-[760px]:text-[9px]",
    extra,
  );
}

function scoreClass() {
  return "min-w-[64px] rounded border border-[#d6a03b]/45 bg-black/70 px-3 py-1.5 text-center text-[28px] font-black text-[#ffe08a] shadow-[inset_0_0_10px_rgba(255,224,138,0.1)]";
}
