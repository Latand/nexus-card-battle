"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const MAX_HEALTH = 12;
const MAX_ENERGY = 12;
const EXCHANGE_THROWS = 6;

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
    energy: Math.max(0, player.energy - playerEnergy - (damageBoost ? 3 : 0)),
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

  const selected = player.hand.find((card) => card.id === selectedId)!;
  const boostCost = damageBoost ? 3 : 0;
  const maxEnergyForCard = Math.max(0, player.energy - boostCost);
  const selectedEnergy = Math.min(energy, maxEnergyForCard);
  const canBoost = !damageBoost ? player.energy >= selectedEnergy + 3 : true;
  const busy = pending !== null;
  const finished = player.health <= 0 || enemy.health <= 0 || player.used.length >= 4;
  const activeClash = pending?.clash ?? lastClash;
  const preview = score(selected, selectedEnergy, first === "player");
  const previewDamage = selected.damage + (damageBoost ? 2 : 0);
  const roundLabel = Math.min(player.used.length + 1, 4);

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
    const effectiveBoost = damageBoost && player.energy >= selectedEnergy + 3;
    const outcome = resolveRound(player, enemy, selected, selectedEnergy, effectiveBoost, first);
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
  }

  function toggleBoost() {
    if (busy || finished) return;
    if (!damageBoost) {
      if (!canBoost) return;
      setEnergy((value) => Math.min(value, Math.max(0, player.energy - 3)));
      setDamageBoost(true);
    } else {
      setDamageBoost(false);
    }
  }

  const arenaText = getArenaText(phase, activeClash, finished, verdict);

  return (
    <main className={styles.scene}>
      <div className={styles.city} />
      <section className={styles.topbar}>
        <FighterHud fighter={enemy} side="enemy" active={first === "enemy" && !finished} />
        <div className={styles.roundPlate}>
          <span>Раунд {roundLabel}/4</span>
          <strong data-testid="round-status">
            {verdict || (first === "player" ? "Твой ход первый" : "Соперник первый")}
          </strong>
        </div>
        <button className={styles.reset} onClick={reset}>
          Новый бой
        </button>
      </section>

      <Hand cards={enemy.hand} used={enemy.used} owner="enemy" selectedId={activeClash?.enemyCard.id} />

      <section className={styles.arena}>
        <div className={styles.activeSlot}>
          {activeClash ? <BattleCard card={activeClash.enemyCard} compact /> : <div className={styles.emptyCard}>?</div>}
        </div>

        <div className={styles.exchange} data-phase={phase}>
          <div className={styles.scoreLine}>
            <span>{activeClash?.enemyAttack ?? "?"}</span>
            <b>атака</b>
            <span>{activeClash?.playerAttack ?? preview.attack}</span>
          </div>

          <AttackAnimation clash={activeClash} phase={phase} first={activeClash?.first ?? first} />

          <p>{arenaText}</p>
        </div>

        <div className={styles.activeSlot}>
          <BattleCard card={activeClash?.playerCard ?? selected} compact />
        </div>
      </section>

      <section className={styles.command}>
        <FighterHud fighter={player} side="player" active={first === "player" && !finished} />
        <div className={styles.controls}>
          <div className={styles.selectedTitle}>
            <span>{selected.clan}</span>
            <strong>{selected.name}</strong>
          </div>

          <EnergyPicker
            value={selectedEnergy}
            max={maxEnergyForCard}
            total={player.energy}
            boostReserved={boostCost}
            disabled={busy || finished}
            onChange={(value) => setEnergy(value)}
          />

          <button
            type="button"
            className={`${styles.boostButton} ${damageBoost ? styles.boostOn : ""}`}
            disabled={busy || finished || (!damageBoost && !canBoost)}
            onClick={toggleBoost}
          >
            <span>+2 урона</span>
            <small>3 энергии</small>
          </button>

          <div className={styles.combatPreview}>
            <b>Атака {preview.attack}</b>
            <b>Урон {previewDamage}</b>
          </div>

          <button className={styles.play} onClick={play} disabled={busy || finished}>
            {busy ? "Бой..." : "Сыграть"}
          </button>
        </div>
      </section>

      <Hand
        cards={player.hand}
        used={player.used}
        owner="player"
        selectedId={selectedId}
        onPick={(card) => {
          if (!busy) setSelectedId(card.id);
        }}
        disabled={busy || finished}
      />

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

function FighterHud({ fighter, side, active }: { fighter: Fighter; side: Side; active: boolean }) {
  return (
    <article className={`${styles.hud} ${styles[side]} ${active ? styles.active : ""}`}>
      <div className={styles.avatar}>
        <span>{side === "player" ? "Л" : "В"}</span>
      </div>
      <div>
        <span>{fighter.title}</span>
        <strong>{fighter.name}</strong>
      </div>
      <div className={styles.meters}>
        <PillMeter label="Жизни" value={fighter.health} max={MAX_HEALTH} tone="health" />
        <PillMeter label="Энергия" value={fighter.energy} max={MAX_ENERGY} tone="energy" />
      </div>
    </article>
  );
}

function PillMeter({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "health" | "energy";
}) {
  return (
    <div className={`${styles.pillMeter} ${styles[tone]}`}>
      <span>
        {label} {value}
      </span>
      <div>
        {Array.from({ length: max }).map((_, index) => (
          <i key={index} className={index < value ? styles.pillOn : ""} />
        ))}
      </div>
    </div>
  );
}

function EnergyPicker({
  value,
  max,
  total,
  boostReserved,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  total: number;
  boostReserved: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={styles.energyPicker}>
      <div className={styles.energyHeader}>
        <span>
          Энергия в карту: <b>{value}</b>
        </span>
        <small>
          доступно {max} / всего {total}
          {boostReserved > 0 ? `, урон держит ${boostReserved}` : ""}
        </small>
      </div>
      <div className={styles.energyButtons}>
        <button type="button" disabled={disabled} onClick={() => onChange(0)} className={value === 0 ? styles.energyZeroOn : ""}>
          0
        </button>
        {Array.from({ length: MAX_ENERGY }).map((_, index) => {
          const amount = index + 1;
          const state =
            amount <= value ? styles.energySelected : amount <= max ? styles.energyAvailable : styles.energyUnavailable;
          return (
            <button
              key={amount}
              type="button"
              disabled={disabled || amount > max}
              className={state}
              onClick={() => onChange(amount)}
              aria-label={`${amount} энергии`}
              title={amount <= max ? `${amount} энергии` : `Недоступно: всего ${total}`}
            />
          );
        })}
      </div>
    </div>
  );
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
            className={`${styles.cardButton} ${selectedId === card.id ? styles.chosen : ""} ${used.includes(card.id) ? styles.spent : ""}`}
            onClick={() => onPick?.(card)}
            disabled={disabled || used.includes(card.id)}
          >
            <BattleCard card={card} />
          </button>
        ) : (
          <div
            key={card.id}
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
