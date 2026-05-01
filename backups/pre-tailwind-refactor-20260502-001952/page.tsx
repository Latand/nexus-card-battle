"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const MAX_HEALTH = 12;
const MAX_ENERGY = 12;
const EXCHANGE_THROWS = 6;
const DAMAGE_THROWS_CAP = 12;
const DAMAGE_BOOST_COST = 3;
const TURN_SECONDS = 75;

type Side = "player" | "enemy";
type Phase = "ready" | "exchange" | "damage" | "summary";

type Card = {
  id: string;
  clan: string;
  name: string;
  power: number;
  damage: number;
  ability: string;
  bonus: string;
  rarity: "Common" | "Rare" | "Uniq" | "Legend";
  portrait: string;
  accent: string;
};

type Fighter = {
  name: string;
  title: string;
  health: number;
  energy: number;
  hand: Card[];
  used: string[];
};

type Clash = {
  round: number;
  first: Side;
  playerCard: Card;
  enemyCard: Card;
  playerAttack: number;
  enemyAttack: number;
  playerEnergy: number;
  enemyEnergy: number;
  boostedDamage: boolean;
  winner: Side;
  damage: number;
  text: string;
};

type Outcome = {
  clash: Clash;
  nextPlayer: Fighter;
  nextEnemy: Fighter;
};

const cards: Card[] = [
  {
    id: "alpha",
    clan: "Alpha",
    name: "Верита",
    power: 8,
    damage: 5,
    ability: "благо 1",
    bonus: "+2 силы",
    rarity: "Legend",
    portrait:
      "radial-gradient(circle at 48% 20%, #fff6d1 0 9%, transparent 10%), linear-gradient(155deg, #f7d36a, #b44334 45%, #2b1414)",
    accent: "#f3c44f",
  },
  {
    id: "fury",
    clan: "Fury",
    name: "Рэдлайн",
    power: 7,
    damage: 4,
    ability: "+8 атаки",
    bonus: "+8 атаки",
    rarity: "Rare",
    portrait:
      "radial-gradient(circle at 55% 22%, #ffe2cb 0 8%, transparent 9%), linear-gradient(145deg, #ff7d4b, #8f1f2e 52%, #1d0b10)",
    accent: "#f05b3d",
  },
  {
    id: "micron",
    clan: "Micron",
    name: "Байт-Ведьма",
    power: 5,
    damage: 6,
    ability: "гнев: +2 урон",
    bonus: "+2 урона",
    rarity: "Uniq",
    portrait:
      "radial-gradient(circle at 45% 21%, #dffeff 0 8%, transparent 9%), linear-gradient(145deg, #68f0d2, #1b837d 48%, #101c2a)",
    accent: "#41d6c0",
  },
  {
    id: "dahack",
    clan: "Da:Hack",
    name: "Нулл Кид",
    power: 6,
    damage: 7,
    ability: "- способность",
    bonus: "-4 атаки соп.",
    rarity: "Uniq",
    portrait:
      "radial-gradient(circle at 52% 20%, #f1e9ff 0 8%, transparent 9%), linear-gradient(150deg, #a891ff, #4c338f 52%, #130d27)",
    accent: "#9277ff",
  },
  {
    id: "aliens",
    clan: "Aliens",
    name: "Ззард",
    power: 8,
    damage: 6,
    ability: "урон = урону соп.",
    bonus: "- бонус",
    rarity: "Legend",
    portrait:
      "radial-gradient(circle at 48% 21%, #efffc1 0 8%, transparent 9%), linear-gradient(145deg, #b4e34d, #55762b 48%, #172211)",
    accent: "#a7d94a",
  },
  {
    id: "metro",
    clan: "Metropolis",
    name: "Майкрофт",
    power: 7,
    damage: 4,
    ability: "крах: +1 жизнь",
    bonus: "-2 энергии",
    rarity: "Rare",
    portrait:
      "radial-gradient(circle at 50% 20%, #d9faff 0 8%, transparent 9%), linear-gradient(145deg, #4fd9ff, #255c8d 52%, #111927)",
    accent: "#49bfe8",
  },
  {
    id: "enigma",
    clan: "Enigma",
    name: "Аспид",
    power: 5,
    damage: 5,
    ability: "хамелеон",
    bonus: "ничья: шанс выше",
    rarity: "Rare",
    portrait:
      "radial-gradient(circle at 47% 21%, #ffe7f6 0 8%, transparent 9%), linear-gradient(145deg, #ef82b8, #80335e 52%, #23101d)",
    accent: "#df6aa5",
  },
  {
    id: "toyz",
    clan: "Toyz",
    name: "Чин-Чин",
    power: 4,
    damage: 8,
    ability: "крах: +1 эн",
    bonus: "-13 атаки",
    rarity: "Common",
    portrait:
      "radial-gradient(circle at 52% 20%, #fff3bd 0 8%, transparent 9%), linear-gradient(145deg, #ffd45c, #c17d28 52%, #2a180c)",
    accent: "#ffbf3d",
  },
];

const playerIds = ["alpha", "fury", "micron", "dahack"];
const enemyIds = ["aliens", "metro", "enigma", "toyz"];

function makeFighter(name: string, title: string, ids: string[]): Fighter {
  return {
    name,
    title,
    health: MAX_HEALTH,
    energy: MAX_ENERGY,
    hand: ids.map((id) => cards.find((card) => card.id === id)!),
    used: [],
  };
}

function score(card: Card, energy: number, first: boolean) {
  let power = card.power;
  let attack = power * (energy + 1);

  if (card.id === "alpha" && energy >= 2) {
    power += 2;
    attack = power * (energy + 1);
  }

  if (card.id === "fury" && first) attack += 8;

  return { attack, damage: card.damage };
}

function enemyMove(enemy: Fighter, playerHealth: number) {
  const available = enemy.hand.filter((card) => !enemy.used.includes(card.id));
  const card =
    available.find((item) => item.damage >= playerHealth) ??
    [...available].sort((a, b) => b.power + b.damage - (a.power + a.damage))[0];
  const energy = Math.min(enemy.energy, Math.max(0, 2 + Math.floor(Math.random() * 3)));

  return { card, energy };
}

function resolveRound(
  player: Fighter,
  enemy: Fighter,
  playerCard: Card,
  playerEnergy: number,
  damageBoost: boolean,
  first: Side,
): Outcome {
  const enemyChoice = enemyMove(enemy, player.health);
  const playerScore = score(playerCard, playerEnergy, first === "player");
  const enemyScore = score(enemyChoice.card, enemyChoice.energy, first === "enemy");

  let playerAttack = playerScore.attack;
  let enemyAttack = enemyScore.attack;
  if (playerCard.id === "dahack") enemyAttack = Math.max(0, enemyAttack - 4);
  if (enemyChoice.card.id === "dahack") playerAttack = Math.max(0, playerAttack - 4);

  let winner: Side;
  if (playerAttack === enemyAttack) {
    const bias = playerCard.id === "enigma" ? 0.65 : enemyChoice.card.id === "enigma" ? 0.35 : 0.5;
    winner = Math.random() < bias ? "player" : "enemy";
  } else {
    winner = playerAttack > enemyAttack ? "player" : "enemy";
  }

  let playerDamage = playerScore.damage + (damageBoost ? 2 : 0);
  let enemyDamage = enemyScore.damage;
  if (playerCard.id === "micron" && playerAttack - enemyAttack >= 10) playerDamage += 2;
  if (enemyChoice.card.id === "micron" && enemyAttack - playerAttack >= 10) enemyDamage += 2;

  const nextPlayer: Fighter = {
    ...player,
    energy: Math.max(0, player.energy - playerEnergy - (damageBoost ? DAMAGE_BOOST_COST : 0)),
    used: [...player.used, playerCard.id],
  };
  const nextEnemy: Fighter = {
    ...enemy,
    energy: Math.max(0, enemy.energy - enemyChoice.energy),
    used: [...enemy.used, enemyChoice.card.id],
  };

  const damage = winner === "player" ? playerDamage : enemyDamage;
  if (winner === "player") nextEnemy.health = Math.max(0, nextEnemy.health - damage);
  if (winner === "enemy") nextPlayer.health = Math.max(0, nextPlayer.health - damage);

  if (winner === "enemy" && playerCard.id === "toyz") nextPlayer.energy += 1;
  if (winner === "player" && enemyChoice.card.id === "toyz") nextEnemy.energy += 1;
  if (winner === "enemy" && playerCard.id === "metro") {
    nextPlayer.health = Math.min(MAX_HEALTH, nextPlayer.health + 1);
  }
  if (winner === "player" && enemyChoice.card.id === "metro") {
    nextEnemy.health = Math.min(MAX_HEALTH, nextEnemy.health + 1);
  }

  const winnerCard = winner === "player" ? playerCard : enemyChoice.card;
  const loserName = winner === "player" ? enemy.name : player.name;
  const clash: Clash = {
    round: nextPlayer.used.length,
    first,
    playerCard,
    enemyCard: enemyChoice.card,
    playerAttack,
    enemyAttack,
    playerEnergy,
    enemyEnergy: enemyChoice.energy,
    boostedDamage: damageBoost,
    winner,
    damage,
    text: `${winnerCard.name} пробивает ${loserName}: ${damage} урона нанесено`,
  };

  return { clash, nextPlayer, nextEnemy };
}

function otherSide(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

export default function Home() {
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
    <main className={styles.scene}>
      <div className={styles.city} />
      <section className={styles.matchBar}>
        <div className={styles.timerPlate}>⌛ {TURN_SECONDS} сек</div>
        <ResourceCounter label="Энергия" value={enemy.energy} tone="energy" />
        <div className={styles.namePlate}>
          <strong>{enemy.name}</strong>
        </div>
        <ResourceCounter label="Жизни" value={enemy.health} tone="health" />
        <button className={styles.menuButton} type="button">
          Меню
        </button>
      </section>

      <Hand cards={enemy.hand} used={enemy.used} owner="enemy" selectedId={activeClash?.enemyCard.id} />

      <section className={`${styles.arena} ${showDuel ? styles.duelArena : styles.readyArena}`}>
        {showDuel ? (
          <div className={styles.activeSlot}>
            <BattleCard card={pending.clash.enemyCard} compact />
          </div>
        ) : null}

        <div className={styles.exchange} data-phase={phase}>
          <strong className={styles.turnBanner} data-testid="round-status">
            {verdict || (first === "player" ? "Твой ход" : "Ход соперника")}
          </strong>
          <div className={styles.scoreLine}>
            <span>{activeClash?.enemyAttack ?? "?"}</span>
            <b>атака</b>
            <span>{activeClash?.playerAttack ?? preview.attack}</span>
          </div>

          <AttackAnimation clash={activeClash} phase={phase} first={activeClash?.first ?? first} />

          <p>{arenaText}</p>
        </div>

        {showDuel ? (
          <div className={styles.activeSlot}>
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

      <section className={styles.playerBar}>
        <div className={styles.roundMarker} data-testid="round-marker">
          Раунд {roundLabel}
        </div>
        <ResourceCounter label="Энергия" value={player.energy} tone="energy" />
        <div className={`${styles.namePlate} ${styles.playerName}`}>
          <strong>{player.name}</strong>
        </div>
        <ResourceCounter label="Жизни" value={player.health} tone="health" />
        <button className={styles.resetMini} onClick={reset} type="button">
          Новый бой
        </button>
      </section>

      <section className={styles.command}>
        <div className={styles.controls}>
          <div className={styles.selectedTitle}>
            <span>{selected.clan}</span>
            <strong>{selected.name}</strong>
          </div>

          <div className={styles.combatPreview}>
            <b>Атака {preview.attack}</b>
            <b>Урон {previewDamage}</b>
          </div>

          <button className={styles.play} onClick={() => setSelectionOpen(true)} disabled={busy || finished}>
            Выбор
          </button>
        </div>
      </section>

      <section className={styles.log}>
        {history.length === 0 ? (
          <span>Лог пуст. Первый бросок решит темп боя.</span>
        ) : (
          history.map((item) => (
            <article key={item.round}>
              <b>Раунд {item.round}</b>
              <span>
                {item.playerCard.name} [{item.playerAttack}] против {item.enemyCard.name} [{item.enemyAttack}]
              </span>
              <small>{item.text}</small>
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

function SelectionOverlay({
  selected,
  enemy,
  player,
  energy,
  maxEnergy,
  damageBoost,
  boostCost,
  previewAttack,
  previewDamage,
  canBoost,
  onClose,
  onMinus,
  onPlus,
  onToggleBoost,
  onConfirm,
}: {
  selected: Card;
  enemy: Fighter;
  player: Fighter;
  energy: number;
  maxEnergy: number;
  damageBoost: boolean;
  boostCost: number;
  previewAttack: number;
  previewDamage: number;
  canBoost: boolean;
  onClose: () => void;
  onMinus: () => void;
  onPlus: () => void;
  onToggleBoost: () => void;
  onConfirm: () => void;
}) {
  const enemyPreview = getEnemyPreview(enemy, player.health);

  return (
    <section className={styles.selectionOverlay} data-testid="selection-overlay" aria-label="Выбор карты">
      <button className={styles.selectionBackdrop} type="button" aria-label="Закрыть выбор" onClick={onClose} />
      <div className={styles.selectionDialog}>
        <button className={styles.selectionClose} type="button" aria-label="Закрыть выбор" onClick={onClose}>
          ×
        </button>

        <div className={styles.selectionCard}>
          <BattleCard card={selected} compact />
        </div>

        <div className={styles.selectionMenu}>
          <div className={styles.selectionName}>
            <span>{selected.clan}</span>
            <strong>{selected.name}</strong>
          </div>

          <div className={styles.selectionStepper}>
            <button type="button" data-testid="energy-minus" aria-label="Меньше энергии" onClick={onMinus} disabled={energy <= 0}>
              -
            </button>
            <strong data-testid="selection-energy">x{energy}</strong>
            <button type="button" data-testid="energy-plus" aria-label="Больше энергии" onClick={onPlus} disabled={energy >= maxEnergy}>
              +
            </button>
            <b>{maxEnergy}</b>
          </div>

          <div className={styles.selectionCharge} aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <i key={index} className={index < Math.min(energy, 4) ? styles.chargeOn : ""} />
            ))}
          </div>

          <button
            type="button"
            className={`${styles.selectionBoost} ${damageBoost ? styles.selectionBoostOn : ""}`}
            data-testid="damage-boost-toggle"
            onClick={onToggleBoost}
            disabled={!damageBoost && !canBoost}
          >
            <span>+2 урона</span>
            <b>{boostCost}</b>
          </button>

          <div className={styles.selectionPreview}>
            <span>Атака {previewAttack}</span>
            <span>Урон {previewDamage}</span>
          </div>

          <button className={styles.selectionOk} type="button" data-testid="selection-ok" onClick={onConfirm}>
            OK
          </button>
        </div>

        <strong className={styles.selectionVs}>VS</strong>

        {enemyPreview ? (
          <div className={styles.selectionEnemy}>
            <BattleCard card={enemyPreview} compact />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getEnemyPreview(enemy: Fighter, playerHealth: number) {
  const available = enemy.hand.filter((card) => !enemy.used.includes(card.id));
  return (
    available.find((item) => item.damage >= playerHealth) ??
    [...available].sort((a, b) => b.power + b.damage - (a.power + a.damage))[0]
  );
}

function BattleOverlay({
  outcome,
  player,
  enemy,
  phase,
}: {
  outcome: Outcome;
  player: Fighter;
  enemy: Fighter;
  phase: Phase;
}) {
  const { clash } = outcome;
  const isDamage = phase === "damage";
  const playerHealth = isDamage ? outcome.nextPlayer.health : player.health;
  const enemyHealth = isDamage ? outcome.nextEnemy.health : enemy.health;
  const playerEnergy = isDamage ? outcome.nextPlayer.energy : player.energy;
  const enemyEnergy = isDamage ? outcome.nextEnemy.energy : enemy.energy;
  const loser: Side = clash.winner === "player" ? "enemy" : "player";
  const isFinisher = isDamage && (loser === "player" ? outcome.nextPlayer.health <= 0 : outcome.nextEnemy.health <= 0);
  const statusText =
    phase === "exchange"
      ? `${clash.playerAttack} против ${clash.enemyAttack}`
      : isFinisher
        ? `Добивание: ${clash.damage} урона`
        : `${clash.damage} урона нанесено`;

  return (
    <section
      className={styles.battleOverlay}
      data-testid="battle-overlay"
      data-phase={phase}
      data-winner={clash.winner}
    >
      <div className={styles.battleWindow}>
        <div className={`${styles.duelHud} ${styles.duelHudPlayer}`}>
          <DuelStatus
            fighter={player}
            health={playerHealth}
            energy={playerEnergy}
            usedEnergy={clash.playerEnergy}
            attack={clash.playerAttack}
          />
        </div>
        <div className={`${styles.duelHud} ${styles.duelHudEnemy}`}>
          <DuelStatus
            fighter={enemy}
            health={enemyHealth}
            energy={enemyEnergy}
            usedEnergy={clash.enemyEnergy}
            attack={clash.enemyAttack}
          />
        </div>

        <div className={styles.duelStage}>
          <div className={`${styles.duelCard} ${styles.duelCardPlayer} ${loser === "player" && isDamage ? styles.takingHit : ""}`}>
            <BattleCard card={clash.playerCard} compact />
          </div>

          <DuelProjectiles clash={clash} phase={phase} finisher={isFinisher} />

          <div className={`${styles.duelCard} ${styles.duelCardEnemy} ${loser === "enemy" && isDamage ? styles.takingHit : ""}`}>
            <BattleCard card={clash.enemyCard} compact />
          </div>
        </div>

        <div className={styles.duelCaption}>
          <strong>{phase === "exchange" ? "Обмен ударами" : isFinisher ? "Последний удар" : "Урон"}</strong>
          <span>{statusText}</span>
        </div>
      </div>
    </section>
  );
}

function DuelStatus({
  fighter,
  health,
  energy,
  usedEnergy,
  attack,
}: {
  fighter: Fighter;
  health: number;
  energy: number;
  usedEnergy: number;
  attack: number;
}) {
  return (
    <article className={styles.duelStatus}>
      <strong>{fighter.name}</strong>
      <DuelBar label="Жизнь" value={health} max={MAX_HEALTH} tone="health" />
      <div className={styles.duelNumbers}>
        <span>Энергия {energy}</span>
        <span>Вложено {usedEnergy}</span>
        <span>Атака {attack}</span>
      </div>
      <DuelBar label="Энергия" value={energy} max={MAX_ENERGY} tone="energy" />
    </article>
  );
}

function DuelBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "health" | "energy" }) {
  return (
    <div className={`${styles.duelBar} ${styles[tone]}`}>
      <span>{label}</span>
      <i style={{ "--value": `${Math.max(0, Math.min(100, (value / max) * 100))}%` } as React.CSSProperties} />
      <b>{value}</b>
    </div>
  );
}

function DuelProjectiles({ clash, phase, finisher }: { clash: Clash; phase: Phase; finisher: boolean }) {
  if (phase === "exchange") {
    return (
      <div className={styles.duelProjectiles} aria-hidden="true">
        {Array.from({ length: EXCHANGE_THROWS + 2 }).map((_, index) => {
          const from = index % 2 === 0 ? clash.first : otherSide(clash.first);
          return <DuelProjectile key={`${clash.round}-duel-${index}`} from={from} index={index} kind={index % 4} mode="exchange" />;
        })}
      </div>
    );
  }

  const throws = Math.min(DAMAGE_THROWS_CAP, clash.damage);

  return (
    <div className={styles.duelProjectiles} aria-hidden="true">
      {Array.from({ length: throws }).map((_, index) => (
        <DuelProjectile key={`${clash.round}-hit-${index}`} from={clash.winner} index={index} kind={(index + 1) % 4} mode="damage" />
      ))}
      {finisher ? <DuelProjectile from={clash.winner} index={throws + 1} kind={4} mode="finish" /> : null}
    </div>
  );
}

function DuelProjectile({
  from,
  index,
  kind,
  mode,
}: {
  from: Side;
  index: number;
  kind: number;
  mode: "exchange" | "damage" | "finish";
}) {
  const modeClass =
    mode === "exchange" ? styles.duelModeExchange : mode === "damage" ? styles.duelModeDamage : styles.duelModeFinish;

  return (
    <i
      className={`${styles.duelProjectile} ${styles[`duelKind${kind}`]} ${modeClass} ${
        from === "player" ? styles.fromPlayer : styles.fromEnemy
      }`}
      style={{ "--i": index, "--row": index % 5 } as React.CSSProperties}
    />
  );
}

function ResourceCounter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "health" | "energy";
}) {
  return (
    <div className={`${styles.resourceCounter} ${styles[tone]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function AttackAnimation({ clash, phase, first }: { clash: Clash | null; phase: Phase; first: Side }) {
  if (!clash || phase === "ready" || phase === "summary") {
    return (
      <div className={styles.attackTrack} data-phase="idle">
        <span className={styles.trackHint}>готово</span>
      </div>
    );
  }

  if (phase === "exchange") {
    return (
      <div className={styles.attackTrack} data-phase="exchange">
        {Array.from({ length: EXCHANGE_THROWS }).map((_, index) => {
          const from = index % 2 === 0 ? first : otherSide(first);
          return <Projectile key={`${clash.round}-exchange-${index}`} from={from} index={index} mode="exchange" />;
        })}
      </div>
    );
  }

  return (
    <div className={styles.attackTrack} data-phase="damage">
      <strong className={styles.damageCaption}>{clash.damage} урона нанесено</strong>
      {Array.from({ length: clash.damage }).map((_, index) => (
        <Projectile key={`${clash.round}-damage-${index}`} from={clash.winner} index={index} mode="damage" />
      ))}
    </div>
  );
}

function Projectile({ from, index, mode }: { from: Side; index: number; mode: "exchange" | "damage" }) {
  return (
    <i
      className={`${styles.projectile} ${styles[mode]} ${from === "player" ? styles.fromPlayer : styles.fromEnemy}`}
      style={{ "--i": index } as React.CSSProperties}
    />
  );
}

function Hand({
  cards,
  used,
  owner,
  selectedId,
  onPick,
  disabled,
}: {
  cards: Card[];
  used: string[];
  owner: Side;
  selectedId?: string;
  onPick?: (card: Card) => void;
  disabled?: boolean;
}) {
  return (
    <section className={`${styles.hand} ${styles[`${owner}Hand`]}`}>
      {cards.map((card) =>
        owner === "player" ? (
          <button
            key={card.id}
            data-testid={`player-card-${card.id}`}
            className={`${styles.cardButton} ${selectedId === card.id ? styles.chosen : ""} ${used.includes(card.id) ? styles.spent : ""}`}
            onClick={() => onPick?.(card)}
            disabled={disabled || used.includes(card.id)}
          >
            <BattleCard card={card} />
          </button>
        ) : (
          <div
            key={card.id}
            data-testid={`enemy-card-${card.id}`}
            className={`${styles.cardButton} ${selectedId === card.id ? styles.chosen : ""} ${used.includes(card.id) ? styles.spent : ""}`}
          >
            <BattleCard card={card} />
          </div>
        ),
      )}
    </section>
  );
}

function BattleCard({ card, compact = false }: { card: Card; compact?: boolean }) {
  return (
    <article
      className={`${styles.battleCard} ${compact ? styles.compact : ""}`}
      style={{ "--accent": card.accent } as React.CSSProperties}
    >
      <div className={styles.cardTop}>
        <span>{card.rarity}</span>
        <b>{card.clan}</b>
      </div>
      <div className={styles.portrait} style={{ background: card.portrait }}>
        <i />
      </div>
      <div className={styles.cardName}>{card.name}</div>
      <div className={styles.stats}>
        <b title="Сила">{card.power}</b>
        <b title="Урон">{card.damage}</b>
      </div>
      <div className={styles.abilities}>
        <span>{card.ability}</span>
        <span>{card.bonus}</span>
      </div>
    </article>
  );
}
