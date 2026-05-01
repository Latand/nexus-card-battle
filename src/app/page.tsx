"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type ClanCard = {
  id: string;
  clan: string;
  name: string;
  power: number;
  damage: number;
  ability: string;
  palette: string;
  sigil: string;
};

type Fighter = {
  name: string;
  health: number;
  energy: number;
  hand: ClanCard[];
  used: string[];
};

type RoundLog = {
  round: number;
  actor: string;
  defender: string;
  card: ClanCard;
  rival: ClanCard;
  energy: number;
  rivalEnergy: number;
  attack: number;
  rivalAttack: number;
  result: string;
};

const baseDeck: ClanCard[] = [
  {
    id: "alpha",
    clan: "Alpha",
    name: "Steel Veda",
    power: 6,
    damage: 4,
    ability: "+2 силы при ставке 2+ энергии",
    palette: "linear-gradient(145deg, #e7f1ff, #4974b8 52%, #18243d)",
    sigil: "A",
  },
  {
    id: "fury",
    clan: "Fury",
    name: "Redline",
    power: 5,
    damage: 5,
    ability: "+8 атаки, если ходит первым",
    palette: "linear-gradient(145deg, #ffe5d1, #d8492f 48%, #331711)",
    sigil: "F",
  },
  {
    id: "micron",
    clan: "Micron",
    name: "Byte Witch",
    power: 4,
    damage: 6,
    ability: "+2 урона при победе с перевесом 10+",
    palette: "linear-gradient(145deg, #d9fff6, #22a68f 50%, #102d2d)",
    sigil: "M",
  },
  {
    id: "dahack",
    clan: "Da:Hack",
    name: "Null Kid",
    power: 7,
    damage: 3,
    ability: "Снижает атаку соперника на 4",
    palette: "linear-gradient(145deg, #ece7ff, #6a54c9 48%, #201842)",
    sigil: "D",
  },
  {
    id: "aliens",
    clan: "Aliens",
    name: "Yuri-13",
    power: 3,
    damage: 7,
    ability: "-1 энергия сопернику после раунда",
    palette: "linear-gradient(145deg, #f4ffd7, #96b83f 48%, #263414)",
    sigil: "X",
  },
  {
    id: "metro",
    clan: "Metropolis",
    name: "Neon Clerk",
    power: 8,
    damage: 2,
    ability: "+1 энергия себе после проигрыша",
    palette: "linear-gradient(145deg, #dcfbff, #2c7ea0 52%, #101d30)",
    sigil: "N",
  },
  {
    id: "enigma",
    clan: "Enigma",
    name: "Aspid",
    power: 5,
    damage: 4,
    ability: "При ничьей атаки бросок монеты выгоднее",
    palette: "linear-gradient(145deg, #ffe4f0, #bd4e86 50%, #341529)",
    sigil: "E",
  },
  {
    id: "toyz",
    clan: "Toyz",
    name: "Chin-Chin",
    power: 2,
    damage: 8,
    ability: "Крах: +2 энергии при проигрыше",
    palette: "linear-gradient(145deg, #fff5bf, #e7a82c 52%, #3a2410)",
    sigil: "T",
  },
];

const starterA = ["alpha", "fury", "micron", "dahack"];
const starterB = ["aliens", "metro", "enigma", "toyz"];

function buildFighter(name: string, ids: string[]): Fighter {
  return {
    name,
    health: 12,
    energy: 12,
    hand: ids.map((id) => baseDeck.find((card) => card.id === id)!),
    used: [],
  };
}

function aiPick(fighter: Fighter, rivalHealth: number) {
  const available = fighter.hand.filter((card) => !fighter.used.includes(card.id));
  const card =
    available.find((item) => item.damage >= rivalHealth) ??
    [...available].sort((a, b) => b.power + b.damage - (a.power + a.damage))[0];
  const energy = Math.min(fighter.energy, Math.max(0, Math.ceil((12 - fighter.health) / 3) + 1));
  return { card, energy };
}

function attackValue(card: ClanCard, energy: number, isFirst: boolean) {
  let power = card.power;
  let attack = power * (energy + 1);
  const damage = card.damage;

  if (card.id === "alpha" && energy >= 2) {
    power += 2;
    attack = power * (energy + 1);
  }

  if (card.id === "fury" && isFirst) {
    attack += 8;
  }

  return { attack, damage };
}

function resolveRound(
  player: Fighter,
  opponent: Fighter,
  playerCard: ClanCard,
  playerEnergy: number,
  first: "player" | "opponent",
) {
  const { card: rivalCard, energy: rivalEnergy } = aiPick(opponent, player.health);
  const playerStats = attackValue(playerCard, playerEnergy, first === "player");
  const rivalStats = attackValue(rivalCard, rivalEnergy, first === "opponent");

  let playerAttack = playerStats.attack;
  let rivalAttack = rivalStats.attack;
  if (playerCard.id === "dahack") rivalAttack = Math.max(0, rivalAttack - 4);
  if (rivalCard.id === "dahack") playerAttack = Math.max(0, playerAttack - 4);

  let winner: "player" | "opponent";
  if (playerAttack === rivalAttack) {
    const enigmaBias =
      playerCard.id === "enigma" ? 0.62 : rivalCard.id === "enigma" ? 0.38 : 0.5;
    winner = Math.random() < enigmaBias ? "player" : "opponent";
  } else {
    winner = playerAttack > rivalAttack ? "player" : "opponent";
  }

  let playerDamage = playerStats.damage;
  let rivalDamage = rivalStats.damage;
  if (playerCard.id === "micron" && playerAttack - rivalAttack >= 10) playerDamage += 2;
  if (rivalCard.id === "micron" && rivalAttack - playerAttack >= 10) rivalDamage += 2;

  const nextPlayer: Fighter = {
    ...player,
    energy: Math.max(0, player.energy - playerEnergy),
    used: [...player.used, playerCard.id],
  };
  const nextOpponent: Fighter = {
    ...opponent,
    energy: Math.max(0, opponent.energy - rivalEnergy),
    used: [...opponent.used, rivalCard.id],
  };

  if (winner === "player") {
    nextOpponent.health = Math.max(0, nextOpponent.health - playerDamage);
  } else {
    nextPlayer.health = Math.max(0, nextPlayer.health - rivalDamage);
  }

  if (playerCard.id === "aliens") nextOpponent.energy = Math.max(0, nextOpponent.energy - 1);
  if (rivalCard.id === "aliens") nextPlayer.energy = Math.max(0, nextPlayer.energy - 1);
  if (winner === "opponent" && playerCard.id === "metro") nextPlayer.energy += 1;
  if (winner === "player" && rivalCard.id === "metro") nextOpponent.energy += 1;
  if (winner === "opponent" && playerCard.id === "toyz") nextPlayer.energy += 2;
  if (winner === "player" && rivalCard.id === "toyz") nextOpponent.energy += 2;

  const log: RoundLog = {
    round: nextPlayer.used.length,
    actor: player.name,
    defender: opponent.name,
    card: playerCard,
    rival: rivalCard,
    energy: playerEnergy,
    rivalEnergy,
    attack: playerAttack,
    rivalAttack,
    result:
      winner === "player"
        ? `${playerCard.name} пробивает на ${playerDamage}`
        : `${rivalCard.name} отвечает на ${rivalDamage}`,
  };

  return { nextPlayer, nextOpponent, log };
}

export default function Home() {
  const [player, setPlayer] = useState(() => buildFighter("Игрок", starterA));
  const [opponent, setOpponent] = useState(() => buildFighter("Соперник", starterB));
  const [selectedCard, setSelectedCard] = useState("alpha");
  const [energy, setEnergy] = useState(1);
  const [first, setFirst] = useState<"player" | "opponent">(() =>
    Math.random() > 0.5 ? "player" : "opponent",
  );
  const [logs, setLogs] = useState<RoundLog[]>([]);

  const selected = player.hand.find((card) => card.id === selectedCard)!;
  const round = player.used.length + 1;
  const isFinished = player.health <= 0 || opponent.health <= 0 || round > 4;
  const result = useMemo(() => {
    if (!isFinished) return "";
    if (player.health === opponent.health) return "Ничья по жизням";
    return player.health > opponent.health ? "Победа игрока" : "Победа соперника";
  }, [isFinished, opponent.health, player.health]);

  function playRound() {
    if (isFinished || player.used.includes(selected.id)) return;
    const { nextPlayer, nextOpponent, log } = resolveRound(
      player,
      opponent,
      selected,
      Math.min(energy, player.energy),
      first,
    );
    setPlayer(nextPlayer);
    setOpponent(nextOpponent);
    setLogs((items) => [log, ...items]);
    setFirst((value) => (value === "player" ? "opponent" : "player"));
    const nextCard = nextPlayer.hand.find((card) => !nextPlayer.used.includes(card.id));
    if (nextCard) setSelectedCard(nextCard.id);
    setEnergy(Math.min(1, nextPlayer.energy));
  }

  function resetBattle() {
    setPlayer(buildFighter("Игрок", starterA));
    setOpponent(buildFighter("Соперник", starterB));
    setSelectedCard("alpha");
    setEnergy(1);
    setFirst(Math.random() > 0.5 ? "player" : "opponent");
    setLogs([]);
  }

  return (
    <main className={styles.battlefield}>
      <section className={styles.header}>
        <div>
          <p className={styles.kicker}>Klanz battle prototype</p>
          <h1>Бой кланов: 4 хода, 8 карт</h1>
        </div>
        <button className={styles.reset} onClick={resetBattle}>
          Новый бой
        </button>
      </section>

      <section className={styles.scoreboard}>
        <FighterPanel fighter={player} active={first === "player"} />
        <div className={styles.roundBadge}>
          <span>Ход</span>
          <strong>{Math.min(round, 4)} / 4</strong>
          <small>{first === "player" ? "первым ходит игрок" : "первым ходит соперник"}</small>
        </div>
        <FighterPanel fighter={opponent} active={first === "opponent"} />
      </section>

      <section className={styles.table}>
        <div className={styles.hand}>
          {player.hand.map((card) => (
            <CardButton
              key={card.id}
              card={card}
              disabled={player.used.includes(card.id) || isFinished}
              selected={selectedCard === card.id}
              onClick={() => setSelectedCard(card.id)}
            />
          ))}
        </div>

        <div className={styles.controlPanel}>
          <div className={styles.preview}>
            <ClanArt card={selected} />
            <div>
              <span>{selected.clan}</span>
              <strong>{selected.name}</strong>
              <p>{selected.ability}</p>
            </div>
          </div>

          <label className={styles.energyControl}>
            <span>Энергия в карту: {energy}</span>
            <input
              type="range"
              min="0"
              max={player.energy}
              value={energy}
              onChange={(event) => setEnergy(Number(event.target.value))}
              disabled={isFinished}
            />
          </label>

          <div className={styles.attackReadout}>
            <span>Атака</span>
            <strong>{attackValue(selected, energy, first === "player").attack}</strong>
            <small>сила x (энергия + 1)</small>
          </div>

          <button className={styles.play} onClick={playRound} disabled={isFinished}>
            Сыграть раунд
          </button>
          {result && <p className={styles.result}>{result}</p>}
        </div>

        <div className={styles.hand}>
          {opponent.hand.map((card) => (
            <article
              key={card.id}
              className={`${styles.card} ${opponent.used.includes(card.id) ? styles.used : ""}`}
            >
              <ClanArt card={card} />
              <CardStats card={card} />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.log}>
        <h2>Лог боя</h2>
        {logs.length === 0 ? (
          <p>Выбери карту, вложи энергию и начни первый раунд.</p>
        ) : (
          logs.map((item) => (
            <article key={item.round}>
              <strong>Раунд {item.round}</strong>
              <span>
                {item.card.name} ({item.attack}) против {item.rival.name} ({item.rivalAttack}).
                {` ${item.result}.`}
              </span>
              <small>
                Энергия: {item.energy} / {item.rivalEnergy}
              </small>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

function FighterPanel({ fighter, active }: { fighter: Fighter; active: boolean }) {
  return (
    <article className={`${styles.fighter} ${active ? styles.active : ""}`}>
      <span>{fighter.name}</span>
      <strong>{fighter.health} HP</strong>
      <small>{fighter.energy} энергии</small>
    </article>
  );
}

function CardButton({
  card,
  disabled,
  selected,
  onClick,
}: {
  card: ClanCard;
  disabled: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${styles.card} ${selected ? styles.selected : ""} ${disabled ? styles.used : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <ClanArt card={card} />
      <CardStats card={card} />
    </button>
  );
}

function ClanArt({ card }: { card: ClanCard }) {
  return (
    <div className={styles.art} style={{ background: card.palette }}>
      <span>{card.sigil}</span>
      <i />
    </div>
  );
}

function CardStats({ card }: { card: ClanCard }) {
  return (
    <div className={styles.cardStats}>
      <span>{card.clan}</span>
      <strong>{card.name}</strong>
      <div>
        <b>{card.power}</b>
        <b>{card.damage}</b>
      </div>
      <small>{card.ability}</small>
    </div>
  );
}
