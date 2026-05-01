"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { DAMAGE_BOOST_COST, TURN_SECONDS } from "../model/constants";
import { enemyIds, playerIds } from "../model/cards";
import { makeFighter, otherSide, resolveRound, score } from "../model/game";
import type { Clash, Outcome, Phase, Side } from "../model/types";
import { AttackAnimation } from "./components/AttackAnimation";
import { BattleCard } from "./components/BattleCard";
import { BattleOverlay } from "./components/BattleOverlay";
import { Hand } from "./components/Hand";
import { NamePlate, ResourceCounter } from "./components/ResourceCounter";
import { SceneBackground } from "./components/SceneBackground";
import { SelectionOverlay } from "./components/SelectionOverlay";

export function BattleGame() {
  const [player, setPlayer] = useState(() => makeFighter("Игрок", "Лидер улицы", playerIds));
  const [enemy, setEnemy] = useState(() => makeFighter("Соперник", "Гость арены", enemyIds));
  const [selectedId, setSelectedId] = useState(playerIds[0]);
  const [energy, setEnergy] = useState(1);
  const [damageBoost, setDamageBoost] = useState(false);
  const [first, setFirst] = useState<Side>("player");
  const [history, setHistory] = useState<Clash[]>([]);
  const [lastClash, setLastClash] = useState<Clash | null>(null);
  const [pending, setPending] = useState<Outcome | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [selectionOpen, setSelectionOpen] = useState(false);

  const selected = player.hand.find((card) => card.id === selectedId)!;
  const boostCost = damageBoost ? DAMAGE_BOOST_COST : 0;
  const maxEnergyForCard = Math.max(0, player.energy - boostCost);
  const selectedEnergy = Math.min(energy, maxEnergyForCard);
  const canBoost = !damageBoost ? player.energy >= selectedEnergy + DAMAGE_BOOST_COST : true;
  const busy = pending !== null;
  const finished = player.health <= 0 || enemy.health <= 0 || player.used.length >= 4;
  const activeClash = pending?.clash ?? lastClash;
  const preview = score(selected, selectedEnergy, first === "player");
  const previewDamage = selected.damage + (damageBoost ? 2 : 0);
  const roundLabel = Math.min(player.used.length + 1, 4);
  const showDuel = pending !== null;

  const verdict = useMemo(() => {
    if (!finished) return "";
    if (player.health === enemy.health) return "Ничья";
    return player.health > enemy.health ? "Победа игрока" : "Победа соперника";
  }, [enemy.health, finished, player.health]);

  useEffect(() => {
    if (!pending) return;

    if (phase === "exchange") {
      const timer = window.setTimeout(() => setPhase("damage"), 1900);
      return () => window.clearTimeout(timer);
    }

    if (phase === "damage") {
      const timer = window.setTimeout(() => {
        setPlayer(pending.nextPlayer);
        setEnemy(pending.nextEnemy);
        setHistory((items) => [pending.clash, ...items]);
        setLastClash(pending.clash);
        setFirst((value) => otherSide(value));

        const nextCard = pending.nextPlayer.hand.find((card) => !pending.nextPlayer.used.includes(card.id));
        if (nextCard) setSelectedId(nextCard.id);
        setEnergy(Math.min(1, pending.nextPlayer.energy));
        setDamageBoost(false);
        setPending(null);
        setPhase("summary");
      }, 1100 + pending.clash.damage * 220);

      return () => window.clearTimeout(timer);
    }
  }, [pending, phase]);

  function play() {
    if (busy || finished || player.used.includes(selected.id)) return;
    const effectiveBoost = damageBoost && player.energy >= selectedEnergy + DAMAGE_BOOST_COST;
    const outcome = resolveRound(player, enemy, selected, selectedEnergy, effectiveBoost, first);
    setSelectionOpen(false);
    setPending(outcome);
    setLastClash(outcome.clash);
    setPhase("exchange");
  }

  function reset() {
    setPlayer(makeFighter("Игрок", "Лидер улицы", playerIds));
    setEnemy(makeFighter("Соперник", "Гость арены", enemyIds));
    setSelectedId(playerIds[0]);
    setEnergy(1);
    setDamageBoost(false);
    setFirst(Math.random() > 0.5 ? "player" : "enemy");
    setHistory([]);
    setLastClash(null);
    setPending(null);
    setPhase("ready");
    setSelectionOpen(false);
  }

  function toggleBoost() {
    if (busy || finished) return;
    if (!damageBoost) {
      if (!canBoost) return;
      setEnergy((value) => Math.min(value, Math.max(0, player.energy - DAMAGE_BOOST_COST)));
      setDamageBoost(true);
    } else {
      setDamageBoost(false);
    }
  }

  const arenaText = getArenaText(phase, activeClash, finished, verdict);

  return (
    <main className="relative isolate min-h-screen overflow-x-hidden bg-[#120f12] px-[min(18px,2vw)] py-3 text-[#f8eed8] max-[620px]:p-2">
      <SceneBackground />

      <section className={topBarClass()}>
        <div className={barButtonClass()}>⌛ {TURN_SECONDS} сек</div>
        <ResourceCounter label="Энергия" value={enemy.energy} tone="energy" />
        <NamePlate name={enemy.name} />
        <ResourceCounter label="Жизни" value={enemy.health} tone="health" />
        <button className={barButtonClass("border-l border-white/10 hover:bg-[linear-gradient(180deg,#ffe08a,#c98326)] hover:text-[#15100a]")} type="button">
          Меню
        </button>
      </section>

      <Hand cards={enemy.hand} used={enemy.used} owner="enemy" selectedId={activeClash?.enemyCard.id} />

      <section
        className={cn(
          "mx-auto grid w-[min(1240px,100%)] items-center gap-3.5 p-0",
          showDuel
            ? "mt-[-34px] min-h-[286px] grid-cols-[minmax(170px,230px)_minmax(260px,1fr)_minmax(170px,230px)]"
            : "mt-[-20px] min-h-[178px] grid-cols-[minmax(260px,760px)] justify-center",
          "max-[760px]:mt-3 max-[760px]:grid-cols-1",
        )}
      >
        {showDuel ? (
          <div className="grid place-items-center max-[760px]:order-1">
            <BattleCard card={pending.clash.enemyCard} compact />
          </div>
        ) : null}

        <div className="relative grid min-h-[206px] place-items-center gap-3.5 border-y-[3px] border-[rgba(255,224,138,0.34)] bg-[radial-gradient(circle_at_center,rgba(255,224,138,0.16),transparent_38%),linear-gradient(90deg,transparent,rgba(0,0,0,0.36),transparent)] max-[760px]:order-2">
          <strong className="min-w-[210px] px-[18px] text-center text-[clamp(26px,3.2vw,42px)] font-black uppercase leading-none text-[#49ff38] [text-shadow:0_0_12px_rgba(73,255,56,0.8),0_2px_0_rgba(0,0,0,0.55)]" data-testid="round-status">
            {verdict || (first === "player" ? "Твой ход" : "Ход соперника")}
          </strong>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3.5">
            <span className={scoreClass()}>{activeClash?.enemyAttack ?? "?"}</span>
            <b className="text-[13px] uppercase tracking-[0.12em] text-[#fff8d4]">атака</b>
            <span className={scoreClass()}>{activeClash?.playerAttack ?? preview.attack}</span>
          </div>

          <AttackAnimation clash={activeClash} phase={phase} first={activeClash?.first ?? first} />

          <p className="max-w-[460px] text-center font-extrabold text-[#f4e7c4]">{arenaText}</p>
        </div>

        {showDuel ? (
          <div className="grid place-items-center max-[760px]:order-3">
            <BattleCard card={pending.clash.playerCard} compact />
          </div>
        ) : null}
      </section>

      <Hand
        cards={player.hand}
        used={player.used}
        owner="player"
        selectedId={selectedId}
        onPick={(card) => {
          if (!busy && !finished) {
            setSelectedId(card.id);
            setSelectionOpen(true);
          }
        }}
        disabled={busy || finished}
      />

      <section className={bottomBarClass()}>
        <div className={barButtonClass()} data-testid="round-marker">
          Раунд {roundLabel}
        </div>
        <ResourceCounter label="Энергия" value={player.energy} tone="energy" />
        <NamePlate name={player.name} player />
        <ResourceCounter label="Жизни" value={player.health} tone="health" />
        <button className={barButtonClass("border-l border-white/10 hover:bg-[linear-gradient(180deg,#ffe08a,#c98326)] hover:text-[#15100a]")} onClick={reset} type="button">
          Новый бой
        </button>
      </section>

      <section className="mx-auto mt-2 block w-[min(1240px,100%)]">
        <div className="grid grid-cols-[minmax(160px,220px)_minmax(160px,1fr)_112px] items-center gap-3 rounded-lg border-2 border-[rgba(244,190,77,0.5)] bg-[linear-gradient(135deg,rgba(41,32,29,0.96),rgba(18,17,20,0.94)),repeating-linear-gradient(135deg,rgba(255,255,255,0.06)_0_1px,transparent_1px_8px)] p-3 shadow-[0_14px_36px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(255,255,255,0.08)] max-[960px]:grid-cols-[minmax(140px,190px)_minmax(150px,1fr)_96px] max-[760px]:grid-cols-1">
          <div>
            <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#d8bd82]">{selected.clan}</span>
            <strong className="mt-0.5 block text-[22px]">{selected.name}</strong>
          </div>
          <div className="grid gap-[5px] max-[960px]:hidden">
            <b className="min-w-[78px] rounded-md bg-black/30 px-2 py-1.5 text-center text-[13px] text-[#fff8df]">Атака {preview.attack}</b>
            <b className="min-w-[78px] rounded-md bg-black/30 px-2 py-1.5 text-center text-[13px] text-[#fff8df]">Урон {previewDamage}</b>
          </div>
          <button className="min-h-11 cursor-pointer rounded-lg border-2 border-[#ffe08a] bg-[linear-gradient(180deg,#ffe08a,#c98326)] px-[18px] font-black text-[#18100d] shadow-[0_10px_24px_rgba(0,0,0,0.36)] disabled:cursor-not-allowed disabled:opacity-45" onClick={() => setSelectionOpen(true)} disabled={busy || finished}>
            Выбор
          </button>
        </div>
      </section>

      <section className="mx-auto mt-2 grid w-[min(1240px,100%)] origin-top scale-[0.92] grid-cols-4 gap-2 rounded-lg border-2 border-[rgba(244,190,77,0.5)] bg-[linear-gradient(135deg,rgba(41,32,29,0.96),rgba(18,17,20,0.94)),repeating-linear-gradient(135deg,rgba(255,255,255,0.06)_0_1px,transparent_1px_8px)] p-2.5 shadow-[0_14px_36px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(255,255,255,0.08)] max-[760px]:grid-cols-1">
        {history.length === 0 ? (
          <span className="min-h-[58px] rounded-md bg-black/30 p-2 text-[#e4d8bf]">Лог пуст. Первый бросок решит темп боя.</span>
        ) : (
          history.map((item) => (
            <article key={item.round} className="min-h-[58px] rounded-md bg-black/30 p-2">
              <b className="block text-[#ffe08a]">Раунд {item.round}</b>
              <span className="block leading-tight text-[#e4d8bf]">
                {item.playerCard.name} [{item.playerAttack}] против {item.enemyCard.name} [{item.enemyAttack}]
              </span>
              <small className="block leading-tight text-[#e4d8bf]">{item.text}</small>
            </article>
          ))
        )}
      </section>

      {selectionOpen && !busy && !finished ? (
        <SelectionOverlay
          selected={selected}
          enemy={enemy}
          player={player}
          energy={selectedEnergy}
          maxEnergy={maxEnergyForCard}
          damageBoost={damageBoost}
          boostCost={DAMAGE_BOOST_COST}
          previewAttack={preview.attack}
          previewDamage={previewDamage}
          canBoost={canBoost}
          onClose={() => setSelectionOpen(false)}
          onMinus={() => setEnergy((value) => Math.max(0, Math.min(value, maxEnergyForCard) - 1))}
          onPlus={() => setEnergy((value) => Math.min(maxEnergyForCard, value + 1))}
          onToggleBoost={toggleBoost}
          onConfirm={play}
        />
      ) : null}

      {pending ? <BattleOverlay outcome={pending} player={player} enemy={enemy} phase={phase} /> : null}
    </main>
  );
}

function getArenaText(phase: Phase, clash: Clash | null, finished: boolean, verdict: string) {
  if (!clash) return "Выбери бойца, вложи энергию и выпусти его на улицу.";
  if (phase === "exchange") {
    return `Обмен ударами: ${clash.playerCard.name} ${clash.playerAttack} против ${clash.enemyCard.name} ${clash.enemyAttack}.`;
  }
  if (phase === "damage") {
    const winner = clash.winner === "player" ? clash.playerCard.name : clash.enemyCard.name;
    return `${winner} победил. ${clash.damage} урона нанесено.`;
  }
  if (finished) return `${verdict}. ${clash.damage} урона нанесено.`;
  return `${clash.damage} урона нанесено. Выбирай следующую карту.`;
}

function topBarClass() {
  return cn(
    barShellClass(),
    "mt-0.5 grid-cols-[120px_84px_minmax(190px,1fr)_84px_94px]",
    "max-[960px]:grid-cols-[92px_72px_minmax(150px,1fr)_72px_72px] max-[760px]:grid-cols-[74px_58px_minmax(0,1fr)_58px_68px] max-[620px]:grid-cols-[58px_48px_minmax(0,1fr)_48px_56px]",
  );
}

function bottomBarClass() {
  return cn(
    barShellClass(),
    "mt-[-20px] grid-cols-[112px_84px_minmax(190px,1fr)_84px_112px] border-[rgba(244,190,77,0.68)]",
    "max-[960px]:grid-cols-[92px_72px_minmax(150px,1fr)_72px_72px] max-[760px]:grid-cols-[74px_58px_minmax(0,1fr)_58px_68px] max-[620px]:grid-cols-[58px_48px_minmax(0,1fr)_48px_56px]",
  );
}

function barShellClass() {
  return "relative mx-auto grid min-h-[58px] w-[min(1240px,100%)] items-center overflow-hidden rounded-lg border-2 border-[rgba(73,210,231,0.58)] bg-[linear-gradient(180deg,rgba(16,24,30,0.94),rgba(11,13,17,0.94)),repeating-linear-gradient(135deg,rgba(255,255,255,0.06)_0_1px,transparent_1px_9px)] shadow-[0_16px_34px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(255,255,255,0.08)] max-[760px]:rounded-md";
}

function barButtonClass(extra?: string) {
  return cn(
    "grid min-h-[58px] place-items-center bg-black/35 text-sm font-black uppercase text-[#fff8d8] max-[960px]:min-h-[52px] max-[960px]:text-xs max-[760px]:min-h-[46px] max-[760px]:text-[10px] max-[620px]:text-[9px]",
    extra,
  );
}

function scoreClass() {
  return "min-w-[74px] rounded-lg bg-black/60 px-3 py-2 text-center text-[34px] font-black text-[#ffe08a]";
}
