"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { cards } from "../model/cards";
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
import type { Card, Clash, GameState, MatchResult, Outcome, Phase, RewardSummary, Side } from "../model/types";
import { BattleOverlay } from "./components/BattleOverlay";
import { Hand } from "./components/Hand";
import { NamePlate } from "./components/ResourceCounter";
import { SceneBackground } from "./components/SceneBackground";
import { SelectionOverlay } from "./components/SelectionOverlay";

type BattleGameProps = {
  playerCollectionIds?: string[];
  playerDeckIds?: string[];
  playerName?: string;
  mode?: "ai" | "human";
  onOpenCollection?: () => void;
};

type HumanMatchStatus = "idle" | "connecting" | "queued" | "matched" | "opponent_left" | "error" | "closed";

type HumanMove = {
  cardId: string;
  energy: number;
  boosted: boolean;
};

type HumanMatchPlayer = {
  id: string;
  deckIds: string[];
  collectionIds: string[];
  handIds?: string[];
  usedCardIds?: string[];
};

type HumanMatchInfo = {
  matchId: string;
  playerId: string;
  opponentId: string;
  firstPlayerId: string;
  players: Record<string, HumanMatchPlayer>;
  round: number;
};

type HumanSocketMessage = {
  type: string;
  [key: string]: unknown;
};

type HumanFirstMoveMessage = HumanSocketMessage & {
  type: "first_move";
  matchId: string;
  round: number;
  playerId: string;
  move: HumanMove;
};

type HumanRoundResolvedMessage = HumanSocketMessage & {
  type: "round_resolved";
  matchId: string;
  round: number;
  firstPlayerId: string;
  nextFirstPlayerId: string;
  moves: Record<string, HumanMove>;
};

export function BattleGame({ playerCollectionIds, playerDeckIds, playerName, mode = "ai", onOpenCollection }: BattleGameProps = {}) {
  const isHumanMatch = mode === "human";
  const initialGame = useMemo(
    () => createInitialGame({ playerCollectionIds, playerDeckIds, playerName }),
    [playerCollectionIds, playerDeckIds, playerName],
  );
  const [game, setGame] = useState(() => initialGame);
  const [selectedId, setSelectedId] = useState(() => getAvailableCards(initialGame.player)[0]?.id);
  const [energy, setEnergy] = useState(0);
  const [damageBoost, setDamageBoost] = useState(false);
  const [pending, setPending] = useState<Outcome | null>(null);
  const [enemyLockedMove, setEnemyLockedMove] = useState<EnemyMove | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState(TURN_SECONDS);
  const [humanStatus, setHumanStatus] = useState<HumanMatchStatus>(isHumanMatch ? "connecting" : "idle");
  const [humanMessage, setHumanMessage] = useState("");
  const [matchInfo, setMatchInfo] = useState<HumanMatchInfo | null>(null);
  const autoSubmitRef = useRef(() => {});
  const socketRef = useRef<WebSocket | null>(null);
  const gameRef = useRef(game);
  const matchInfoRef = useRef(matchInfo);
  const remoteFirstMoveRef = useRef<{ round: number; move: HumanMove } | null>(null);
  const humanMessageHandlerRef = useRef<(message: HumanSocketMessage) => void>(() => {});

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    matchInfoRef.current = matchInfo;
  }, [matchInfo]);

  useEffect(() => {
    humanMessageHandlerRef.current = handleHumanSocketMessage;
  });

  useEffect(() => {
    if (!isHumanMatch) return;

    let disposed = false;
    const socket = new WebSocket(getHumanSocketUrl());
    const resetHumanState = window.setTimeout(() => {
      if (disposed) return;
      setHumanStatus("connecting");
      setMatchInfo(null);
    }, 0);
    socketRef.current = socket;
    remoteFirstMoveRef.current = null;

    socket.addEventListener("open", () => {
      sendSocketMessage(socket, {
        type: "join_human",
        deckIds: playerDeckIds,
        collectionIds: playerCollectionIds,
      });
    });

    socket.addEventListener("message", (event) => {
      if (disposed) return;
      let message: HumanSocketMessage;

      try {
        message = JSON.parse(String(event.data)) as HumanSocketMessage;
      } catch {
        setHumanStatus("error");
        return;
      }

      humanMessageHandlerRef.current(message);
    });

    socket.addEventListener("close", () => {
      if (disposed) return;
      setHumanStatus("closed");
    });

    socket.addEventListener("error", () => {
      if (disposed) return;
      setHumanStatus("error");
    });

    return () => {
      disposed = true;
      window.clearTimeout(resetHumanState);
      if (isSocketOpen(socket)) {
        sendSocketMessage(socket, { type: "leave_match" });
      }
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [isHumanMatch, playerCollectionIds, playerDeckIds]);

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
  const humanBlockingOverlay = isHumanMatch && humanStatus !== "matched";
  const boardHidden = !["player_turn", "card_preview", "opponent_turn"].includes(game.phase);
  const activeHand = getActiveHand(game.phase);
  const enemySelectedCardId = activeClash?.enemyCard.id ?? enemyLockedMove?.card.id;
  const enemyPlayedCardId = pending?.clash.enemyCard.id ?? game.round.enemyCardId;
  const playerDecisionActive = pending === null && ["player_turn", "card_preview"].includes(game.phase);

  useEffect(() => {
    if (isHumanMatch && humanStatus !== "matched") return;

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
          if (isHumanMatch) {
            const remoteMove = remoteFirstMoveRef.current?.round === game.round.round ? remoteFirstMoveRef.current.move : null;
            const enemyMove = remoteMove ? createEnemyMoveFromHumanMove(game, remoteMove) : null;

            if (enemyMove) {
              setEnemyLockedMove(enemyMove);
              setGame((value) => ({
                ...value,
                phase: "player_turn",
                round: {
                  ...value.round,
                  enemyCardId: enemyMove.card.id,
                  enemyEnergyBid: enemyMove.energy,
                },
              }));
              return;
            }

            setEnemyLockedMove(null);
            setGame((value) => ({ ...value, phase: "opponent_turn" }));
            return;
          }

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
      if (isHumanMatch) return;

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
  }, [game, humanStatus, isHumanMatch, pending]);

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

    if (isHumanMatch) {
      submitHumanSelection(card, legalEnergy, effectiveBoost);
      return;
    }

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

  function submitHumanSelection(card: NonNullable<typeof selected>, legalEnergy: number, boosted: boolean) {
    const currentMatch = matchInfoRef.current;
    const socket = socketRef.current;

    if (!currentMatch || !isSocketOpen(socket)) {
      setHumanStatus("error");
      setHumanMessage("PvP-з'єднання ще не готове для ходу.");
      return;
    }

    sendSocketMessage(socket, {
      type: "submit_move",
      matchId: currentMatch.matchId,
      round: game.round.round,
      move: {
        cardId: card.id,
        energy: legalEnergy,
        boosted,
      },
    });

    setSelectedId(card.id);
    setSelectionOpen(false);
    setTurnSeconds(TURN_SECONDS);
    setGame((value) => ({
      ...value,
      phase: "opponent_turn",
      round: {
        ...value.round,
        playerCardId: card.id,
        enemyCardId: enemyLockedMove?.card.id ?? value.round.enemyCardId,
        playerEnergyBid: legalEnergy,
        enemyEnergyBid: enemyLockedMove?.energy ?? value.round.enemyEnergyBid,
      },
    }));
  }

  function handleHumanSocketMessage(message: HumanSocketMessage) {
    if (message.type === "queued") {
      setHumanStatus("queued");
      setHumanMessage("");
      return;
    }

    if (message.type === "match_ready") {
      const nextMatch = normalizeHumanMatch(message);

      if (!nextMatch) {
        setHumanStatus("error");
        setHumanMessage("PvP-сервер надіслав матч без потрібних даних.");
        return;
      }

      const nextGame = createHumanGame(nextMatch, playerName);
      const firstCard = getAvailableCards(nextGame.player)[0];

      remoteFirstMoveRef.current = null;
      setMatchInfo(nextMatch);
      setGame(nextGame);
      setSelectedId(firstCard?.id);
      setEnergy(0);
      setDamageBoost(false);
      setPending(null);
      setEnemyLockedMove(null);
      setSelectionOpen(false);
      setTurnSeconds(TURN_SECONDS);
      setHumanStatus("matched");
      setHumanMessage("");
      return;
    }

    if (message.type === "first_move") {
      handleHumanFirstMove(message as HumanFirstMoveMessage);
      return;
    }

    if (message.type === "round_resolved") {
      handleHumanRoundResolved(message as HumanRoundResolvedMessage);
      return;
    }

    if (message.type === "opponent_left") {
      setHumanStatus("opponent_left");
      setHumanMessage("Суперник вийшов з матчу.");
      setMatchInfo(null);
      return;
    }

    if (message.type === "error") {
      setHumanStatus("error");
      setHumanMessage(typeof message.message === "string" ? message.message : "PvP-сервер повернув помилку.");
    }
  }

  function handleHumanFirstMove(message: HumanFirstMoveMessage) {
    const currentMatch = matchInfoRef.current;
    const currentGame = gameRef.current;

    if (!currentMatch || message.matchId !== currentMatch.matchId || message.round !== currentGame.round.round) return;
    if (message.playerId === currentMatch.playerId) return;

    remoteFirstMoveRef.current = { round: message.round, move: message.move };

    if (currentGame.phase !== "opponent_turn" || currentGame.first !== "enemy") return;

    const enemyMove = createEnemyMoveFromHumanMove(currentGame, message.move);
    if (!enemyMove) return;

    setEnemyLockedMove(enemyMove);
    setGame((value) => ({
      ...value,
      phase: "player_turn",
      round: {
        ...value.round,
        enemyCardId: enemyMove.card.id,
        enemyEnergyBid: enemyMove.energy,
      },
    }));
  }

  function handleHumanRoundResolved(message: HumanRoundResolvedMessage) {
    const currentMatch = matchInfoRef.current;
    const currentGame = gameRef.current;
    if (!currentMatch || message.matchId !== currentMatch.matchId || message.round !== currentGame.round.round) return;

    const playerMove = message.moves[currentMatch.playerId];
    const opponentMove = message.moves[currentMatch.opponentId];
    if (!playerMove || !opponentMove) return;

    const playerCard = findCardInHand(currentGame.player.hand, playerMove.cardId);
    const enemyCard = findCardInHand(currentGame.enemy.hand, opponentMove.cardId);
    if (!playerCard || !enemyCard) {
      setHumanStatus("error");
      setHumanMessage("Не вдалося зіставити карти PvP-раунду з поточною рукою.");
      return;
    }

    const first = message.firstPlayerId === currentMatch.playerId ? "player" : "enemy";
    const enemyMove = { card: enemyCard, energy: opponentMove.energy };
    const outcome = resolveRound(
      currentGame.player,
      currentGame.enemy,
      playerCard,
      playerMove.energy,
      playerMove.boosted,
      first,
      message.round,
      enemyMove,
    );

    remoteFirstMoveRef.current = null;
    setSelectedId(playerCard.id);
    setSelectionOpen(false);
    setTurnSeconds(TURN_SECONDS);
    setPending(outcome);
    setEnemyLockedMove(enemyMove);
    setGame((value) => ({
      ...value,
      first,
      phase: "battle_intro",
      round: {
        ...value.round,
        playerCardId: playerCard.id,
        enemyCardId: enemyCard.id,
        playerEnergyBid: playerMove.energy,
        enemyEnergyBid: opponentMove.energy,
        clash: outcome.clash,
      },
    }));
  }

  function restartHumanQueue() {
    const socket = socketRef.current;

    setHumanStatus(isSocketOpen(socket) ? "queued" : "closed");
    setHumanMessage("");
    setMatchInfo(null);
    setPending(null);
    setEnemyLockedMove(null);
    setSelectionOpen(false);
    remoteFirstMoveRef.current = null;

    if (!isSocketOpen(socket)) return;

    sendSocketMessage(socket, { type: "leave_match" });
    sendSocketMessage(socket, {
      type: "join_human",
      deckIds: playerDeckIds,
      collectionIds: playerCollectionIds,
    });
  }

  useEffect(() => {
    autoSubmitRef.current = () => {
      if (isHumanMatch) return;
      if (pending || !["player_turn", "card_preview"].includes(game.phase)) return;

      const availableCards = getAvailableCards(game.player);
      if (availableCards.length === 0) return;

      const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
      const randomEnergy = Math.floor(Math.random() * (game.player.energy + 1));

      submitSelection(randomCard, randomEnergy, false);
    };
  });

  function reset() {
    if (isHumanMatch) {
      restartHumanQueue();
      return;
    }

    const next = createInitialGame({ playerCollectionIds, playerDeckIds, playerName });
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

      {humanBlockingOverlay ? (
        <HumanMatchOverlay status={humanStatus} message={humanMessage} onOpenCollection={onOpenCollection} />
      ) : null}

      {!humanBlockingOverlay && !boardHidden ? (
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
        selectedId={enemySelectedCardId}
        playedCardId={enemyPlayedCardId}
      />

      <section
        className={cn(
          "relative z-10 mx-auto grid w-[min(980px,100%)] items-center gap-3 p-0",
          "mt-1 min-h-[132px] grid-cols-[minmax(260px,680px)] justify-center",
          "max-[760px]:mt-3 max-[760px]:grid-cols-1",
        )}
      >
        <div className="relative grid min-h-[132px] place-items-center gap-3 overflow-hidden border-y-2 border-[#c98b27]/55 bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.68)_12%_88%,transparent),radial-gradient(circle_at_center,rgba(255,214,73,0.16),transparent_44%)] shadow-[0_0_26px_rgba(0,0,0,0.58),inset_0_0_0_1px_rgba(255,231,151,0.12)] max-[760px]:order-2">
          <strong className="relative z-[1] min-w-[210px] px-[18px] text-center text-[clamp(30px,4.1vw,56px)] font-black uppercase leading-none text-[#ffd742] [font-family:Impact,Arial_Narrow,sans-serif] [text-shadow:0_0_16px_rgba(255,204,51,0.8),0_4px_0_rgba(0,0,0,0.75)]" data-testid="round-status">
            {getPhaseTitle(game.phase, game.first, verdict)}
          </strong>

          {game.phase === "opponent_turn" ? <OpponentThinkingIndicator /> : null}

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

      {!humanBlockingOverlay ? <PhaseOverlay game={game} verdict={verdict} onReset={reset} /> : null}
      {!humanBlockingOverlay && showBattle && pending ? <BattleOverlay outcome={pending} player={game.player} enemy={game.enemy} phase={game.phase} /> : null}
    </main>
  );
}

function normalizeHumanMatch(message: HumanSocketMessage): HumanMatchInfo | null {
  if (
    typeof message.matchId !== "string" ||
    typeof message.playerId !== "string" ||
    typeof message.opponentId !== "string" ||
    typeof message.firstPlayerId !== "string" ||
    typeof message.players !== "object" ||
    message.players === null
  ) {
    return null;
  }

  const players = message.players as Record<string, HumanMatchPlayer>;
  const player = players[message.playerId];
  const opponent = players[message.opponentId];

  if (!isHumanMatchPlayer(player) || !isHumanMatchPlayer(opponent)) return null;

  return {
    matchId: message.matchId,
    playerId: message.playerId,
    opponentId: message.opponentId,
    firstPlayerId: message.firstPlayerId,
    players,
    round: typeof message.round === "number" ? message.round : 1,
  };
}

function isHumanMatchPlayer(value: unknown): value is HumanMatchPlayer {
  if (!value || typeof value !== "object") return false;

  const player = value as HumanMatchPlayer;
  return (
    Array.isArray(player.deckIds) &&
    Array.isArray(player.collectionIds) &&
    (player.handIds === undefined || Array.isArray(player.handIds)) &&
    (player.usedCardIds === undefined || Array.isArray(player.usedCardIds))
  );
}

function createHumanGame(match: HumanMatchInfo, playerName?: string) {
  const player = match.players[match.playerId];
  const opponent = match.players[match.opponentId];
  const game = createInitialGame({
    playerCollectionIds: player.collectionIds.length > 0 ? player.collectionIds : player.deckIds,
    playerDeckIds: player.deckIds,
    enemyCollectionIds: opponent.collectionIds.length > 0 ? opponent.collectionIds : opponent.deckIds,
    enemyDeckIds: opponent.deckIds,
    playerName,
  });

  return {
    ...game,
    first: match.firstPlayerId === match.playerId ? "player" : "enemy",
    round: {
      ...game.round,
      round: match.round,
    },
    player: {
      ...game.player,
      hand: buildHumanHand(player.handIds ?? player.deckIds.slice(0, 4)),
      usedCardIds: player.usedCardIds ?? [],
    },
    enemy: {
      ...game.enemy,
      hand: buildHumanHand(opponent.handIds ?? opponent.deckIds.slice(0, 4)),
      usedCardIds: opponent.usedCardIds ?? [],
    },
  } satisfies GameState;
}

function buildHumanHand(cardIds: string[]) {
  return cardIds
    .map((cardId) => cards.find((card) => card.id === cardId))
    .filter((card): card is Card => Boolean(card))
    .map((card) => ({ ...card, used: false }));
}

function findCardInHand(hand: Card[], cardId: string) {
  return hand.find((card) => card.id === cardId);
}

function createEnemyMoveFromHumanMove(game: GameState, move: HumanMove): EnemyMove | null {
  const card = findCardInHand(game.enemy.hand, move.cardId);
  if (!card) return null;

  return {
    card,
    energy: move.energy,
  };
}

function getHumanSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function sendSocketMessage(socket: WebSocket, message: unknown) {
  if (!isSocketOpen(socket)) return;
  socket.send(JSON.stringify(message));
}

function isSocketOpen(socket: WebSocket | null): socket is WebSocket {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}

function schedule(callback: () => void, delay: number) {
  const timer = window.setTimeout(callback, delay);
  return () => window.clearTimeout(timer);
}

function HumanMatchOverlay({
  status,
  message,
  onOpenCollection,
}: {
  status: HumanMatchStatus;
  message: string;
  onOpenCollection?: () => void;
}) {
  const title = getHumanOverlayTitle(status);
  const subtitle = message || getHumanOverlaySubtitle(status);
  const active = status === "connecting" || status === "queued";

  return (
    <section className="fixed inset-0 z-40 grid place-items-center bg-[#05080b]/78 p-3 backdrop-blur-[4px]" data-testid="human-match-overlay">
      <div className="grid w-[min(560px,94vw)] gap-4 rounded-md border-2 border-[#65d7e9]/55 bg-[linear-gradient(180deg,rgba(17,24,28,0.98),rgba(5,7,10,0.98))] p-5 text-center shadow-[0_24px_70px_rgba(0,0,0,0.72),inset_0_0_80px_rgba(101,215,233,0.08)]">
        <div className="grid justify-items-center gap-3">
          {active ? (
            <span className="relative grid h-14 w-14 place-items-center rounded-full border border-[#65d7e9]/45 bg-[#65d7e9]/10">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#65d7e9]/30" />
              <span className="relative h-5 w-5 rounded-full bg-[#65d7e9] shadow-[0_0_18px_rgba(101,215,233,0.85)]" />
            </span>
          ) : null}
          <strong className="text-[clamp(30px,6vw,54px)] font-black uppercase leading-none text-[#ffe08a] [font-family:Impact,Arial_Narrow,sans-serif] [text-shadow:0_4px_0_rgba(0,0,0,0.74)]">
            {title}
          </strong>
          <span className="max-w-[440px] text-sm font-black uppercase tracking-[0.04em] text-[#d9ceb2]">{subtitle}</span>
        </div>
        {onOpenCollection ? (
          <button
            className="mx-auto min-h-[42px] rounded-md border border-white/12 bg-white/[0.06] px-4 text-xs font-black uppercase text-[#efe3c5] transition hover:border-[#ffe08a]/45 hover:bg-[#ffe08a]/12"
            type="button"
            onClick={onOpenCollection}
          >
            До колоди
          </button>
        ) : null}
      </div>
    </section>
  );
}

function getHumanOverlayTitle(status: HumanMatchStatus) {
  if (status === "connecting") return "Підключення";
  if (status === "queued") return "Пошук суперника";
  if (status === "opponent_left") return "Суперник вийшов";
  if (status === "error") return "PvP помилка";
  if (status === "closed") return "З'єднання закрите";
  return "PvP";
}

function getHumanOverlaySubtitle(status: HumanMatchStatus) {
  if (status === "connecting") return "Підключаємося до живого матчу.";
  if (status === "queued") return "Чекаємо іншого гравця. Хід не буде підмінятися ІІ.";
  if (status === "opponent_left") return "Матч зупинено, бо другий гравець залишив арену.";
  if (status === "error") return "Спробуй повернутися до колоди й запустити PvP ще раз.";
  if (status === "closed") return "Сервер закрив з'єднання з матчем.";
  return "";
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
  if (game.phase === "damage_apply") return `${clash.winner === "player" ? clash.playerCard.name : clash.enemyCard.name} перемагає. Завдано ${clash.damage} урону.`;
  if (game.phase === "match_result" || game.phase === "reward_summary") return `${verdict}. Завдано ${clash.damage} урону.`;
  if (game.phase === "round_result") return `${roundResultText(clash.winner)} Завдано ${clash.damage} урону.`;

  return "Обирай наступну картку.";
}

function getPhaseTitle(phase: Phase, _first: Side, verdict: string) {
  if (phase === "match_result" || phase === "reward_summary") return verdict;
  if (phase === "round_intro") return "Раунд";
  if (phase === "opponent_turn") return "Хід суперника";
  if (phase === "battle_intro") return "Бой";
  if (phase === "damage_apply") return "Урон";
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
  if (game.phase === "round_result" && game.lastClash) return `${game.lastClash.damage} урону. Наступний раунд за мить.`;
  if (game.phase === "match_result") return verdict ? "Бій завершено." : "";
  return "";
}

function getBanner(phase: Phase, round: number, winner?: Side) {
  if (phase === "round_result" && winner) {
    return winner === "player"
      ? { src: "/nexus-assets/banners/round-won.png", alt: "Раунд за тобою", width: 520, height: 104 }
      : { src: "/nexus-assets/banners/round-lost.png", alt: "Раунд за суперником", width: 520, height: 104 };
  }
  if (phase === "match_result" && winner === "enemy") return { src: "/nexus-assets/banners/defeat.png", alt: "Програш", width: 430, height: 108 };
  if (phase === "round_intro" && [1, 3, 4].includes(round)) return { src: `/nexus-assets/banners/round-${round}.png`, alt: `Раунд ${round}`, width: 360, height: 104 };
  return null;
}

function roundResultText(winner: Side) {
  return winner === "player" ? "Раунд за тобою!" : "Раунд за суперником.";
}

function getVerdict(result?: MatchResult) {
  if (!result) return "";
  if (result === "draw") return "Нічия";
  return result === "player" ? "Перемога" : "Програш";
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
