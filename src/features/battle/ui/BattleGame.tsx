"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { postMatchFinished } from "@/features/player/profile/client";
import type { PlayerIdentity, PlayerProfile } from "@/features/player/profile/types";
import { computeLevelFromXp } from "@/features/player/profile/types";
import { cn } from "@/shared/lib/cn";
import type { TelegramPlayer } from "@/shared/lib/telegram";
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
import type { Card, Clash, GameState, MatchResult, Outcome, Phase, Rarity, RewardSummary, Side } from "../model/types";
import { BattleOverlay } from "./components/BattleOverlay";
import { Hand } from "./components/Hand";
import { NamePlate } from "./components/ResourceCounter";
import { SceneBackground } from "./components/SceneBackground";
import { SelectionOverlay } from "./components/SelectionOverlay";
import {
  DEFAULT_REWARD_AVATAR_URL,
  computeXpProgress,
  resolveRewardAvatarUrl,
  resolveRewardTitle,
  selectVisibleTiles,
  type RewardTitle,
} from "./rewardOverlayPresenter";

type BattleGameProps = {
  playerCollectionIds?: string[];
  playerDeckIds?: string[];
  playerIdentity?: PlayerIdentity;
  playerName?: string;
  telegramPlayer?: TelegramPlayer;
  mode?: "ai" | "human";
  avatarUrl?: string;
  onOpenCollection?: () => void;
  onSwitchMode?: (mode: "ai" | "human") => void;
  onPlayerUpdated?: (profile: PlayerProfile) => void;
};

type HumanMatchStatus = "idle" | "connecting" | "queued" | "matched" | "opponent_left" | "forfeit" | "error" | "closed";

type HumanMove = {
  cardId: string;
  energy: number;
  boosted: boolean;
};

type HumanFirstMove = {
  cardId: string;
  energy?: number;
  boosted?: boolean;
};

type KnownEnemyMove = {
  card: Card;
  energy?: number;
};

type HumanMatchPlayer = {
  id: string;
  name?: string;
  telegramId?: string;
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
  move: HumanFirstMove;
};

type HumanRoundResolvedMessage = HumanSocketMessage & {
  type: "round_resolved";
  matchId: string;
  round: number;
  firstPlayerId: string;
  nextFirstPlayerId: string;
  moves: Record<string, HumanMove>;
};

type HumanForfeitMessage = HumanSocketMessage & {
  type: "match_forfeit";
  matchId: string;
  round: number;
  loserId: string;
  winnerId: string;
  reason?: string;
};

type HumanRewardSummaryMessage = HumanSocketMessage & {
  type: "reward_summary";
  matchId?: string;
  payload: RewardSummary;
};

type HumanChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
};

export function BattleGame({ playerCollectionIds, playerDeckIds, playerIdentity, playerName, telegramPlayer, mode = "ai", avatarUrl, onOpenCollection, onSwitchMode, onPlayerUpdated }: BattleGameProps = {}) {
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
  const [enemyLockedMove, setEnemyLockedMove] = useState<KnownEnemyMove | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState(TURN_SECONDS);
  const [roundWinnerCardIds, setRoundWinnerCardIds] = useState<ReadonlySet<string>>(() => new Set());
  const [humanStatus, setHumanStatus] = useState<HumanMatchStatus>(isHumanMatch ? "connecting" : "idle");
  const [humanMessage, setHumanMessage] = useState("");
  const [humanSessionId, setHumanSessionId] = useState("");
  const [humanSessionName, setHumanSessionName] = useState("");
  const [humanOnlineCount, setHumanOnlineCount] = useState<number | null>(null);
  const [humanChatMessages, setHumanChatMessages] = useState<HumanChatMessage[]>([]);
  const [humanChatDraft, setHumanChatDraft] = useState("");
  const [matchInfo, setMatchInfo] = useState<HumanMatchInfo | null>(null);
  const [persistedRewards, setPersistedRewards] = useState<RewardSummary | null>(null);
  const [persistedRewardsError, setPersistedRewardsError] = useState<string | null>(null);
  const persistedMatchSignatureRef = useRef<string | null>(null);
  const autoSubmitRef = useRef(() => {});
  const socketRef = useRef<WebSocket | null>(null);
  const gameRef = useRef(game);
  const matchInfoRef = useRef(matchInfo);
  // Outlives matchInfo so a reward_summary that arrives after forfeit/match
  // end (when matchInfo has already been cleared) can still be matched.
  const activeRewardMatchIdRef = useRef<string | null>(null);
  const remoteFirstMoveRef = useRef<{ round: number; move: HumanFirstMove } | null>(null);
  const pendingFirstMovesRef = useRef(new Map<number, HumanFirstMoveMessage>());
  const pendingRoundResolvedRef = useRef(new Map<number, HumanRoundResolvedMessage>());
  const resolvingHumanRoundRef = useRef<number | null>(null);
  const humanMessageHandlerRef = useRef<(message: HumanSocketMessage) => void>(() => {});
  const humanSessionNameRef = useRef("");

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
    if (!isHumanMatch || humanStatus !== "matched") return;
    flushBufferedHumanMessages();
  });

  useEffect(() => {
    if (!isHumanMatch) return;

    let disposed = false;
    const socket = new WebSocket(getHumanSocketUrl());
    const resetHumanState = window.setTimeout(() => {
      if (disposed) return;
      setHumanStatus("connecting");
      setMatchInfo(null);
      setHumanSessionId("");
      setHumanSessionName("");
      setHumanOnlineCount(null);
      setHumanChatMessages([]);
      setHumanChatDraft("");
    }, 0);
    socketRef.current = socket;
    remoteFirstMoveRef.current = null;
    humanSessionNameRef.current = "";

    socket.addEventListener("open", () => {
      sendSocketMessage(socket, {
        type: "join_human",
        deckIds: playerDeckIds,
        collectionIds: playerCollectionIds,
        identity: playerIdentity,
        user: telegramPlayer,
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
  }, [isHumanMatch, playerCollectionIds, playerDeckIds, playerIdentity, telegramPlayer]);

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
  const humanDisplayName = (playerName?.trim() || humanSessionName).trim();
  const boardHidden = !["player_turn", "card_preview", "opponent_turn"].includes(game.phase);
  const activeHand = getActiveHand(game.phase);
  const enemySelectedCardId = activeClash?.enemyCard.id ?? enemyLockedMove?.card.id;
  const enemyPlayedCardId = pending?.clash.enemyCard.id ?? game.round.enemyCardId;
  const playerDecisionActive = pending === null && ["player_turn", "card_preview"].includes(game.phase);
  const turnWarningActive = playerDecisionActive && turnSeconds <= 10;

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
            const enemyMove = remoteMove ? createKnownEnemyMoveFromHumanMove(game, remoteMove) : null;

            if (enemyMove) {
              setEnemyLockedMove(enemyMove);
              setGame((value) => ({
                ...value,
                phase: "player_turn",
                round: {
                  ...value.round,
                  enemyCardId: enemyMove.card.id,
                  enemyEnergyBid: enemyMove.energy ?? value.round.enemyEnergyBid,
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
        resolvingHumanRoundRef.current = null;
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
    if (isHumanMatch) return;
    if (game.phase !== "match_result" && game.phase !== "reward_summary") return;
    if (!game.matchResult) return;
    if (!playerIdentity) return;

    const result = matchResultToBucket(game.matchResult);
    // Effect runs once for match_result and again for reward_summary; the ref dedupes the POST.
    const signature = `${game.matchResult}:${result}`;
    if (persistedMatchSignatureRef.current === signature) return;
    persistedMatchSignatureRef.current = signature;

    let cancelled = false;
    postMatchFinished({ identity: playerIdentity, mode: "pve", result })
      .then((response) => {
        if (cancelled) return;
        if (Array.isArray(response.player.ownedCards)) {
          onPlayerUpdated?.(response.player);
        }
        setPersistedRewards(response.rewards);
        setPersistedRewardsError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Помилка обчислення нагороди.";
        setPersistedRewardsError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [game.matchResult, game.phase, isHumanMatch, onPlayerUpdated, playerIdentity]);

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

    const knownEnemyMove =
      game.first === "enemy"
        ? enemyLockedMove?.energy !== undefined
          ? ({ card: enemyLockedMove.card, energy: enemyLockedMove.energy } satisfies EnemyMove)
          : chooseEnemyMove(game.enemy, game.player, game.round.round)
        : undefined;
    const outcome = resolveRound(game.player, game.enemy, card, legalEnergy, effectiveBoost, game.first, game.round.round, knownEnemyMove);
    const enemyMove = knownEnemyMove ?? { card: outcome.clash.enemyCard, energy: outcome.clash.enemyEnergy };

    setSelectedId(card.id);
    setSelectionOpen(false);
    setTurnSeconds(TURN_SECONDS);
    setPending(outcome);
    setRoundWinnerCardIds((value) => addRoundWinnerCardId(value, outcome.clash));
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
    if (message.type === "session") {
      if (typeof message.clientId === "string") {
        setHumanSessionId(message.clientId);
      }
      const nextSessionName = sanitizeHumanSessionName(message.playerName);
      if (nextSessionName) {
        humanSessionNameRef.current = nextSessionName;
        setHumanSessionName(nextSessionName);
      }
      return;
    }

    if (message.type === "chat_history") {
      setHumanChatMessages(normalizeHumanChatHistory(message.messages));
      return;
    }

    if (message.type === "chat_message") {
      const chatMessage = normalizeHumanChatMessage(message);
      if (chatMessage) {
        setHumanChatMessages((value) => appendHumanChatMessage(value, chatMessage));
      }
      return;
    }

    if (message.type === "online_count") {
      const nextOnlineCount = normalizeOnlineCount(message.count);
      if (nextOnlineCount !== null) setHumanOnlineCount(nextOnlineCount);
      return;
    }

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

      const nextGame = createHumanGame(nextMatch, playerName || humanSessionNameRef.current);
      const firstCard = getAvailableCards(nextGame.player)[0];

      clearHumanMessageBuffers();
      activeRewardMatchIdRef.current = nextMatch.matchId;
      setMatchInfo(nextMatch);
      setGame(nextGame);
      setSelectedId(firstCard?.id);
      setEnergy(0);
      setDamageBoost(false);
      setPending(null);
      setEnemyLockedMove(null);
      setRoundWinnerCardIds(new Set());
      setSelectionOpen(false);
      setTurnSeconds(TURN_SECONDS);
      setHumanStatus("matched");
      setHumanMessage("");
      setPersistedRewards(null);
      setPersistedRewardsError(null);
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

    if (message.type === "match_forfeit") {
      handleHumanForfeit(message as HumanForfeitMessage);
      return;
    }

    if (message.type === "reward_summary") {
      handleHumanRewardSummary(message as HumanRewardSummaryMessage);
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

    if (!currentMatch || message.matchId !== currentMatch.matchId) return;
    if (message.round < currentGame.round.round || currentGame.matchResult) return;
    if (message.round > currentGame.round.round) {
      pendingFirstMovesRef.current.set(message.round, message);
      return;
    }

    if (message.playerId === currentMatch.playerId) return;

    remoteFirstMoveRef.current = { round: message.round, move: message.move };

    if (currentGame.phase !== "opponent_turn" || currentGame.first !== "enemy") return;

    const enemyMove = createKnownEnemyMoveFromHumanMove(currentGame, message.move);
    if (!enemyMove) return;

    setEnemyLockedMove(enemyMove);
    setGame((value) => ({
      ...value,
      phase: "player_turn",
      round: {
        ...value.round,
        enemyCardId: enemyMove.card.id,
        enemyEnergyBid: enemyMove.energy ?? value.round.enemyEnergyBid,
      },
    }));
  }

  function handleHumanRoundResolved(message: HumanRoundResolvedMessage) {
    const currentMatch = matchInfoRef.current;
    const currentGame = gameRef.current;
    if (!currentMatch || message.matchId !== currentMatch.matchId) return;
    if (message.round < currentGame.round.round || currentGame.matchResult) return;
    if (message.round > currentGame.round.round) {
      pendingRoundResolvedRef.current.set(message.round, message);
      return;
    }
    if (resolvingHumanRoundRef.current === message.round || currentGame.round.clash?.round === message.round) return;

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
    const enemyMove = { card: enemyCard, energy: opponentMove.energy, damageBoost: Boolean(opponentMove.boosted) };
    resolvingHumanRoundRef.current = message.round;
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
    setRoundWinnerCardIds((value) => addRoundWinnerCardId(value, outcome.clash));
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

  function handleHumanRewardSummary(message: HumanRewardSummaryMessage) {
    if (!message.payload) return;
    if (!message.matchId || message.matchId !== activeRewardMatchIdRef.current) return;
    setPersistedRewards(message.payload);
    setPersistedRewardsError(null);
  }

  function handleHumanForfeit(message: HumanForfeitMessage) {
    const currentMatch = matchInfoRef.current;
    if (!currentMatch || message.matchId !== currentMatch.matchId) return;

    const won = message.winnerId === currentMatch.playerId;
    const matchResult: MatchResult = won ? "player" : "enemy";

    setMatchInfo(null);
    setPending(null);
    setEnemyLockedMove(null);
    setRoundWinnerCardIds(new Set());
    setSelectionOpen(false);
    setTurnSeconds(0);
    clearHumanMessageBuffers();
    setGame((value) => ({
      ...value,
      phase: "reward_summary",
      matchResult,
    }));
  }


  function restartHumanQueue() {
    const socket = socketRef.current;

    setHumanStatus(isSocketOpen(socket) ? "queued" : "closed");
    setHumanMessage("");
    setMatchInfo(null);
    setPending(null);
    setEnemyLockedMove(null);
    setRoundWinnerCardIds(new Set());
    setSelectionOpen(false);
    setPersistedRewards(null);
    setPersistedRewardsError(null);
    activeRewardMatchIdRef.current = null;
    clearHumanMessageBuffers();

    if (!isSocketOpen(socket)) return;

    sendSocketMessage(socket, { type: "leave_match" });
    sendSocketMessage(socket, {
      type: "join_human",
      deckIds: playerDeckIds,
      collectionIds: playerCollectionIds,
      identity: playerIdentity,
      user: telegramPlayer,
    });
  }

  function sendHumanChatMessage() {
    const socket = socketRef.current;
    const text = humanChatDraft.replace(/\s+/g, " ").trim();
    if (!text || !isSocketOpen(socket)) return;

    sendSocketMessage(socket, { type: "chat_message", text });
    setHumanChatDraft("");
  }

  function flushBufferedHumanMessages() {
    const currentGame = gameRef.current;
    const round = currentGame.round.round;
    const firstMove = pendingFirstMovesRef.current.get(round);

    if (firstMove) {
      pendingFirstMovesRef.current.delete(round);
      handleHumanFirstMove(firstMove);
    }

    const roundResolved = pendingRoundResolvedRef.current.get(round);

    if (roundResolved) {
      pendingRoundResolvedRef.current.delete(round);
      handleHumanRoundResolved(roundResolved);
    }
  }

  function clearHumanMessageBuffers() {
    remoteFirstMoveRef.current = null;
    pendingFirstMovesRef.current.clear();
    pendingRoundResolvedRef.current.clear();
    resolvingHumanRoundRef.current = null;
  }

  useEffect(() => {
    autoSubmitRef.current = () => {
      if (pending || !["player_turn", "card_preview"].includes(game.phase)) return;

      if (isHumanMatch) {
        const currentMatch = matchInfoRef.current;
        const socket = socketRef.current;
        if (!currentMatch || !isSocketOpen(socket)) return;

        sendSocketMessage(socket, {
          type: "turn_timeout",
          matchId: currentMatch.matchId,
          round: game.round.round,
        });
        setSelectionOpen(false);
        setTurnSeconds(0);
        return;
      }

      const availableCards = getAvailableCards(game.player);
      if (availableCards.length === 0) return;

      const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];

      submitSelection(randomCard, 0, false);
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
    setPersistedRewards(null);
    setPersistedRewardsError(null);
    persistedMatchSignatureRef.current = null;
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
    <main className="battle-screen relative isolate min-h-screen w-screen overflow-hidden bg-[#05080b] px-[min(14px,1.4vw)] py-2 text-[#f8eed8]">
      <SceneBackground />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(255,35,35,0.32),rgba(255,35,35,0.12)_42%,transparent_72%),linear-gradient(180deg,rgba(140,12,12,0.34),rgba(20,4,4,0.12))] opacity-0 mix-blend-screen transition-opacity duration-700",
          turnWarningActive && "opacity-100",
        )}
        data-testid="turn-warning-overlay"
        aria-hidden="true"
      />

      {humanBlockingOverlay ? (
        <HumanMatchOverlay
          status={humanStatus}
          message={humanMessage}
          playerName={humanDisplayName}
          onlineCount={humanOnlineCount}
          sessionId={humanSessionId}
          chatMessages={humanChatMessages}
          chatDraft={humanChatDraft}
          onChatDraftChange={setHumanChatDraft}
          onSendChatMessage={sendHumanChatMessage}
          onOpenCollection={onOpenCollection}
          onRetryMatch={restartHumanQueue}
        />
      ) : null}

      {!humanBlockingOverlay && !boardHidden ? (
      <div className="battle-board relative z-10">
      <section className={topBarClass()}>
        <div
          className={barButtonClass(
            turnWarningActive
              ? "bg-[linear-gradient(180deg,rgba(128,18,18,0.98),rgba(44,5,5,0.86))] text-[#ffe5df] shadow-[inset_0_0_22px_rgba(255,51,45,0.42),0_0_18px_rgba(255,51,45,0.28)]"
              : undefined,
          )}
          data-testid="turn-timer"
        >
          ⌛ {turnSeconds} сек
        </div>
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
        winnerCardIds={roundWinnerCardIds}
      />

      <section
        className={cn(
          "battle-arena-panel",
          "relative z-10 mx-auto grid w-[min(980px,100%)] items-center gap-3 p-0",
          "mt-1 min-h-[132px] grid-cols-[minmax(260px,680px)] justify-center",
          "max-[760px]:mt-3 max-[760px]:grid-cols-1",
        )}
      >
        <div className="battle-arena-strip relative grid min-h-[120px] place-items-center gap-3 overflow-hidden bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.55)_12%_88%,transparent),radial-gradient(circle_at_center,rgba(255,214,73,0.14),transparent_44%)] max-[760px]:order-2 max-[760px]:min-h-[100px]">
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
        winnerCardIds={roundWinnerCardIds}
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
        <div className="grid grid-rows-2 gap-px overflow-hidden bg-black/40">
          <button
            className={cn(
              "grid place-items-center px-2 text-center text-xs font-black uppercase tracking-[0.06em] transition max-[760px]:text-[10px] max-[420px]:text-[9px]",
              mode === "ai"
                ? "bg-[linear-gradient(180deg,#fff26d,#e3b51e_54%,#a66d12)] text-[#1a1408]"
                : "bg-[#ffe08a]/12 text-[#ffe5a8] hover:bg-[#ffe08a]/24",
            )}
            onClick={() => (mode === "ai" ? reset() : onSwitchMode?.("ai"))}
            type="button"
            data-testid="reset-ai"
            aria-label="Бій з AI"
          >
            БІЙ · AI
          </button>
          <button
            className={cn(
              "grid place-items-center px-2 text-center text-xs font-black uppercase tracking-[0.06em] transition max-[760px]:text-[10px] max-[420px]:text-[9px]",
              mode === "human"
                ? "bg-[linear-gradient(180deg,#68e5f5,#218aa3_56%,#0d4151)] text-[#061116]"
                : "bg-[#65d7e9]/12 text-[#a8eef5] hover:bg-[#65d7e9]/24",
            )}
            onClick={() => (mode === "human" ? reset() : onSwitchMode?.("human"))}
            type="button"
            data-testid="reset-pvp"
            aria-label="Бій з гравцем"
          >
            БІЙ · PvP
          </button>
        </div>
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

      {!humanBlockingOverlay ? (
        <PhaseOverlay
          game={game}
          verdict={verdict}
          mode={mode}
          avatarUrl={avatarUrl}
          onReplayAi={() => (mode === "ai" ? reset() : onSwitchMode?.("ai"))}
          onReplayHuman={() => (mode === "human" ? reset() : onSwitchMode?.("human"))}
          persistedRewards={persistedRewards}
          persistedRewardsError={persistedRewardsError}
        />
      ) : null}
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
  const opponentName = opponent.name || (opponent.telegramId ? `Telegram ${opponent.telegramId}` : "Суперник");

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
      name: opponentName,
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

function createKnownEnemyMoveFromHumanMove(game: GameState, move: HumanFirstMove): KnownEnemyMove | null {
  const card = findCardInHand(game.enemy.hand, move.cardId);
  if (!card) return null;

  return {
    card,
    ...(typeof move.energy === "number" ? { energy: move.energy } : {}),
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

function sanitizeHumanSessionName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 48);
}

function normalizeOnlineCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function normalizeHumanChatHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeHumanChatMessage).filter((message): message is HumanChatMessage => Boolean(message)).slice(-200);
}

function normalizeHumanChatMessage(value: unknown): HumanChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.authorId !== "string" || !record.authorId) return null;
  if (typeof record.text !== "string" || !record.text.trim()) return null;

  return {
    id: record.id,
    authorId: record.authorId,
    authorName: typeof record.authorName === "string" && record.authorName.trim() ? record.authorName.trim().slice(0, 80) : "Гравець",
    text: record.text.trim().slice(0, 240),
    createdAt: typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
  };
}

function appendHumanChatMessage(messages: HumanChatMessage[], message: HumanChatMessage) {
  const withoutDuplicate = messages.filter((item) => item.id !== message.id);
  return [...withoutDuplicate, message].slice(-200);
}

function HumanMatchOverlay({
  status,
  message,
  playerName,
  onlineCount,
  sessionId,
  chatMessages,
  chatDraft,
  onChatDraftChange,
  onSendChatMessage,
  onOpenCollection,
  onRetryMatch,
}: {
  status: HumanMatchStatus;
  message: string;
  playerName: string;
  onlineCount: number | null;
  sessionId: string;
  chatMessages: HumanChatMessage[];
  chatDraft: string;
  onChatDraftChange: (value: string) => void;
  onSendChatMessage: () => void;
  onOpenCollection?: () => void;
  onRetryMatch?: () => void;
}) {
  const title = getHumanOverlayTitle(status);
  const subtitle = message || getHumanOverlaySubtitle(status);
  const active = status === "connecting" || status === "queued";
  const displayName = playerName || "Гравець";

  return (
    <section className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-[#05080b]/78 p-3 py-4 backdrop-blur-[4px]" data-testid="human-match-overlay">
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
        <div className="grid grid-cols-2 gap-2 text-left max-[460px]:grid-cols-1">
          <div className="rounded-md border border-[#ffe08a]/30 bg-[#17120a]/78 px-3 py-2" data-testid="human-match-session-name">
            <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#a99664]">Ім&apos;я сесії</span>
            <b className="block truncate text-sm font-black uppercase tracking-[0.03em] text-[#fff0ad]">{displayName}</b>
          </div>
          <div
            className="rounded-md border border-[#65d7e9]/30 bg-[#07161b]/78 px-3 py-2"
            data-testid="human-match-online"
            data-online-count={onlineCount === null ? "" : String(onlineCount)}
          >
            <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#8db6bf]">Онлайн зараз</span>
            {onlineCount === null ? (
              <b className="block text-sm font-black uppercase tracking-[0.03em] text-[#6f7f82]">...</b>
            ) : (
              <b className="block text-sm font-black uppercase tracking-[0.03em] text-[#d9fbff]" data-testid="human-match-online-count">
                {onlineCount} онлайн
              </b>
            )}
          </div>
        </div>
        <HumanMatchChat
          sessionId={sessionId}
          messages={chatMessages}
          draft={chatDraft}
          onDraftChange={onChatDraftChange}
          onSend={onSendChatMessage}
        />
        {onRetryMatch && ["opponent_left", "forfeit", "error", "closed"].includes(status) ? (
          <button
            className="mx-auto min-h-[42px] rounded-md border-2 border-[#65d7e9]/60 bg-[linear-gradient(180deg,#68e5f5,#218aa3_56%,#0d4151)] px-4 text-xs font-black uppercase text-[#061116] transition hover:brightness-110"
            type="button"
            onClick={onRetryMatch}
            data-testid="human-match-retry"
          >
            Знову PvP
          </button>
        ) : null}
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

function HumanMatchChat({
  sessionId,
  messages,
  draft,
  onDraftChange,
  onSend,
}: {
  sessionId: string;
  messages: HumanChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const canSend = draft.trim().length > 0;

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  return (
    <section
      className="grid gap-2 rounded-md border border-[#65d7e9]/24 bg-[#071016]/82 p-3 text-left shadow-[inset_0_0_34px_rgba(101,215,233,0.06)]"
      data-testid="human-match-chat"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8db6bf]">Чат арени</span>
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#5f7f86]">{messages.length}/200</span>
      </div>
      <div
        ref={listRef}
        className="grid max-h-[150px] min-h-[92px] content-start gap-1 overflow-y-auto pr-1 [scrollbar-color:#65d7e9_#071016] [scrollbar-width:thin]"
        data-testid="human-match-chat-list"
      >
        {messages.length === 0 ? (
          <span className="self-center text-center text-xs font-bold text-[#6f7f82]">Повідомлень ще немає.</span>
        ) : (
          messages.map((chatMessage) => {
            const own = chatMessage.authorId === sessionId;
            return (
              <article
                key={chatMessage.id}
                className={cn(
                  "max-w-[92%] rounded-md border px-2 py-1",
                  own
                    ? "justify-self-end border-[#ffe08a]/24 bg-[#201807]/86 text-right"
                    : "justify-self-start border-white/10 bg-white/[0.055]",
                )}
              >
                <b className={cn("block truncate text-[10px] font-black uppercase tracking-[0.08em]", own ? "text-[#fff0ad]" : "text-[#d9fbff]")}>
                  {chatMessage.authorName}
                </b>
                <span className="block break-words text-xs font-bold leading-snug text-[#efe3c5]">{chatMessage.text}</span>
              </article>
            );
          })
        )}
      </div>
      <form
        className="grid grid-cols-[1fr_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <input
          className="min-h-[38px] rounded-md border border-white/10 bg-black/28 px-3 text-sm font-bold text-[#f8eed8] outline-none transition placeholder:text-[#6f7f82] focus:border-[#65d7e9]/70"
          value={draft}
          maxLength={240}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Написати..."
          data-testid="human-match-chat-input"
        />
        <button
          className="min-h-[38px] rounded-md border border-[#65d7e9]/45 bg-[#65d7e9]/14 px-3 text-xs font-black uppercase text-[#d9fbff] transition enabled:hover:bg-[#65d7e9]/24 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-[#647276]"
          type="submit"
          disabled={!canSend}
          data-testid="human-match-chat-send"
        >
          OK
        </button>
      </form>
    </section>
  );
}

function getHumanOverlayTitle(status: HumanMatchStatus) {
  if (status === "connecting") return "Підключення";
  if (status === "queued") return "Пошук суперника";
  if (status === "opponent_left") return "Суперник вийшов";
  if (status === "forfeit") return "Матч завершено";
  if (status === "error") return "PvP помилка";
  if (status === "closed") return "З'єднання закрите";
  return "PvP";
}

function getHumanOverlaySubtitle(status: HumanMatchStatus) {
  if (status === "connecting") return "Підключаємося до живого матчу.";
  if (status === "queued") return "Чекаємо іншого гравця.";
  if (status === "opponent_left") return "Матч зупинено, бо другий гравець залишив арену.";
  if (status === "forfeit") return "Час ходу вийшов, результат зафіксовано для обох гравців.";
  if (status === "error") return "Спробуй повернутися до колоди й запустити PvP ще раз.";
  if (status === "closed") return "Сервер закрив з'єднання з матчем.";
  return "";
}

function PhaseOverlay({
  game,
  verdict,
  mode,
  avatarUrl,
  onReplayAi,
  onReplayHuman,
  persistedRewards,
  persistedRewardsError,
}: {
  game: GameState;
  verdict: string;
  mode: "ai" | "human";
  avatarUrl?: string;
  onReplayAi: () => void;
  onReplayHuman: () => void;
  persistedRewards: RewardSummary | null;
  persistedRewardsError: string | null;
}) {
  if (["player_turn", "card_preview", "opponent_turn", "battle_intro", "damage_apply"].includes(game.phase)) return null;

  if (game.phase === "reward_summary") {
    const overlayRewards = persistedRewards ?? game.rewards;
    const showPersistedDetails = persistedRewards !== null;
    return (
      <RewardOverlay
        result={game.matchResult}
        rewards={overlayRewards}
        mode={mode}
        playerName={game.player.name}
        avatarUrl={avatarUrl}
        onReplayAi={onReplayAi}
        onReplayHuman={onReplayHuman}
        persistedRewardsError={persistedRewardsError}
        showPersistedDetails={showPersistedDetails}
      />
    );
  }

  const title = getOverlayTitle(game.phase, game.round.round, verdict, game.lastClash?.winner);
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
  mode,
  playerName,
  avatarUrl,
  onReplayAi,
  onReplayHuman,
  persistedRewardsError,
  showPersistedDetails,
}: {
  result?: MatchResult;
  rewards?: RewardSummary;
  mode: "ai" | "human";
  playerName?: string;
  avatarUrl?: string;
  onReplayAi: () => void;
  onReplayHuman: () => void;
  persistedRewardsError: string | null;
  showPersistedDetails: boolean;
}) {
  const title = resolveRewardTitle(result);
  const visibleTiles = selectVisibleTiles(showPersistedDetails ? rewards : null);
  const userXpDelta = rewards?.deltaXp ?? 0;
  const newLevel = rewards?.newTotals?.level;
  const newTotalXp = rewards?.newTotals?.totalXp;
  const levelInfo = typeof newTotalXp === "number" ? computeLevelFromXp(newTotalXp) : null;
  const xpProgress = levelInfo
    ? computeXpProgress(levelInfo.xpIntoLevel, levelInfo.xpForNextLevel, userXpDelta)
    : null;
  const crystalsDelta = rewards?.deltaCrystals ?? 0;
  const newCrystals = rewards?.newTotals?.crystals ?? 0;
  const eloDelta = rewards?.deltaElo;
  const newElo = rewards?.newTotals?.eloRating;
  const eloLoss = typeof eloDelta === "number" && eloDelta < 0;
  const previousElo = typeof eloDelta === "number" && typeof newElo === "number" ? newElo - eloDelta : null;
  const formattedEloDelta = typeof eloDelta === "number" ? (eloDelta > 0 ? `+${eloDelta}` : `${eloDelta}`) : "";
  const displayName = (playerName ?? "").trim() || "Гравець";
  const resolvedAvatarUrl = resolveRewardAvatarUrl(avatarUrl);
  const levelUpBonus = rewards?.levelUpBonusCrystals ?? 0;

  return (
    <section className="fixed inset-0 z-50 grid place-items-center bg-[#05080b] p-3 backdrop-blur-[4px]" data-testid="reward-summary">
      <div
        className="relative grid w-[min(680px,94vw)] gap-4 rounded-md border-2 border-[#d6a03b]/75 bg-[linear-gradient(180deg,rgba(12,18,22,0.98),rgba(4,6,9,0.98))] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.76),inset_0_0_80px_rgba(255,188,50,0.08)]"
        data-result={result ?? "unknown"}
      >
        <RewardTitleBlock title={title} />

        <RewardAvatarBlock
          avatarUrl={resolvedAvatarUrl}
          playerName={displayName}
          level={newLevel ?? rewards?.newTotals?.level ?? 1}
          xpDelta={userXpDelta}
          xpProgress={xpProgress}
          showXpDelta={showPersistedDetails && userXpDelta > 0}
        />

        <div
          className="grid grid-cols-3 gap-3 max-[560px]:grid-cols-1"
          data-testid="reward-stat-tiles"
        >
          {visibleTiles.showCrystals ? (
            <RewardStatTile
              testId="reward-crystals-tile"
              icon="💎"
              label="Кристали"
              deltaText={`+${crystalsDelta}`}
              detailText={`всього ${newCrystals}`}
              tone="crystal"
              dataAttrs={{ "data-delta-crystals": String(crystalsDelta), "data-new-crystals": String(newCrystals) }}
              detailTestId="reward-crystals-line"
            />
          ) : null}

          {visibleTiles.showElo ? (
            <RewardStatTile
              testId="reward-elo-tile"
              icon="🏆"
              label="ELO"
              deltaText={formattedEloDelta}
              detailText={`${previousElo} → ${newElo}`}
              tone={eloLoss ? "loss" : "elo"}
              dataAttrs={{
                "data-delta-elo": typeof eloDelta === "number" ? String(eloDelta) : "",
                "data-new-elo": typeof newElo === "number" ? String(newElo) : "",
              }}
              detailTestId="reward-elo-line"
            />
          ) : null}

          {visibleTiles.showLevelUp ? (
            <RewardStatTile
              testId="reward-level-up-tile"
              icon="⭐"
              label="Новий рівень"
              deltaText={`Lv ${newLevel ?? "?"}`}
              detailText={`+${levelUpBonus} 💎`}
              tone="levelUp"
              dataAttrs={{
                "data-new-level": newLevel !== undefined ? String(newLevel) : "",
                "data-level-up-bonus": String(levelUpBonus),
              }}
              detailTestId="reward-level-up-headline"
            />
          ) : null}

          {visibleTiles.showMilestone
            ? rewards?.milestoneCardRewards.map((milestone, index) => (
                // Order is deterministic from milestone-table sort; cardId can
                // repeat in one match when a small rarity bucket gets picked
                // twice, so the index disambiguates the React key.
                <RewardStatTile
                  key={`${index}-${milestone.cardId}`}
                  testId="reward-milestone-tile"
                  icon="🃏"
                  label="Карта-бонус"
                  deltaText={milestone.cardName}
                  detailText={milestoneRarityLabel(milestone.rarity)}
                  tone="levelUp"
                  dataAttrs={{
                    "data-card-id": milestone.cardId,
                    "data-rarity": milestone.rarity,
                  }}
                  detailTestId="reward-milestone-detail"
                />
              ))
            : null}
        </div>

        {persistedRewardsError ? (
          <div
            className="rounded border border-[#ff6e6e]/50 bg-black/55 px-3 py-2 text-xs font-black uppercase text-[#ffd1d1]"
            data-testid="reward-persisted-error"
          >
            {persistedRewardsError}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 max-[420px]:grid-cols-1">
          <button
            className="min-h-[48px] rounded-md border-2 border-black/60 bg-[linear-gradient(180deg,#fff26d,#e3b51e_54%,#a66d12)] px-3 text-sm font-black uppercase text-[#1a1408] transition hover:brightness-110"
            type="button"
            onClick={onReplayAi}
            data-testid="reward-replay-ai"
            data-mode={mode}
          >
            AI
          </button>
          <button
            className="min-h-[48px] rounded-md border-2 border-black/60 bg-[linear-gradient(180deg,#68e5f5,#218aa3_56%,#0d4151)] px-3 text-sm font-black uppercase text-[#061116] transition hover:brightness-110"
            type="button"
            onClick={onReplayHuman}
            data-testid="reward-replay-human"
            data-mode={mode}
          >
            PvP
          </button>
        </div>
      </div>
    </section>
  );
}

function RewardTitleBlock({ title }: { title: RewardTitle }) {
  return (
    <div className="grid place-items-center" data-testid="reward-title-block" data-tone={title.tone}>
      <strong
        className={cn(
          "text-[clamp(40px,7vw,72px)] font-black uppercase leading-none [font-family:Impact,Arial_Narrow,sans-serif] [text-shadow:0_4px_0_rgba(0,0,0,0.78)]",
          rewardTitleColorClass(title.tone),
        )}
        data-testid="reward-title"
      >
        {title.text}
      </strong>
    </div>
  );
}

function rewardTitleColorClass(tone: RewardTitle["tone"]) {
  if (tone === "victory") return "text-[#ffe08a] [text-shadow:0_0_22px_rgba(255,180,46,0.6),0_4px_0_rgba(0,0,0,0.78)]";
  if (tone === "draw") return "text-[#9bd3df] [text-shadow:0_0_18px_rgba(155,211,223,0.45),0_4px_0_rgba(0,0,0,0.78)]";
  if (tone === "defeat") return "text-[#ff8a7c] [text-shadow:0_0_22px_rgba(255,80,68,0.55),0_4px_0_rgba(0,0,0,0.78)]";
  return "text-[#fff8df]";
}

function RewardAvatarBlock({
  avatarUrl,
  playerName,
  level,
  xpDelta,
  xpProgress,
  showXpDelta,
}: {
  avatarUrl: string;
  playerName: string;
  level: number;
  xpDelta: number;
  xpProgress: ReturnType<typeof computeXpProgress> | null;
  showXpDelta: boolean;
}) {
  return (
    <div
      className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4 max-[420px]:grid-cols-1 max-[420px]:justify-items-center"
      data-testid="reward-avatar-block"
    >
      <div className="relative h-[96px] w-[96px] overflow-hidden rounded-full border-2 border-[#d6a03b]/75 bg-black/55 shadow-[0_0_22px_rgba(214,160,59,0.32)]">
        <RewardAvatarImage src={avatarUrl} />
      </div>
      <div className="grid gap-2 max-[420px]:justify-items-center max-[420px]:text-center">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-xl font-black uppercase text-[#fff8df] max-[420px]:text-lg" data-testid="reward-player-name">
            {playerName}
          </strong>
          <span
            className="rounded border border-[#ffe08a]/55 bg-black/55 px-2 py-0.5 text-xs font-black uppercase tracking-[0.08em] text-[#ffe08a]"
            data-testid="reward-player-level"
          >
            Lv {level}
          </span>
        </div>
        {xpProgress ? (
          <RewardXpBar xpProgress={xpProgress} xpDelta={xpDelta} showXpDelta={showXpDelta} />
        ) : null}
      </div>
    </div>
  );
}

function RewardAvatarImage({ src }: { src: string }) {
  return <RewardAvatarImageContent key={src} src={src} />;
}

function RewardAvatarImageContent({ src }: { src: string }) {
  const [resolvedSrc, setResolvedSrc] = useState(src);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt=""
      width={96}
      height={96}
      className="h-full w-full object-cover object-top"
      data-testid="reward-avatar-image"
      data-avatar-src={resolvedSrc}
      onError={() => {
        if (resolvedSrc !== DEFAULT_REWARD_AVATAR_URL) setResolvedSrc(DEFAULT_REWARD_AVATAR_URL);
      }}
    />
  );
}

function RewardXpBar({
  xpProgress,
  xpDelta,
  showXpDelta,
}: {
  xpProgress: ReturnType<typeof computeXpProgress>;
  xpDelta: number;
  showXpDelta: boolean;
}) {
  const highlightWidth = Math.max(0, xpProgress.highlightEndPercent - xpProgress.highlightStartPercent);

  return (
    <div className="grid gap-1" data-testid="reward-xp-bar">
      <div
        className="relative h-3 overflow-hidden rounded-full border border-black/60 bg-black/55"
        role="progressbar"
        aria-valuenow={Math.round(xpProgress.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[#49d2e7]"
          style={{ width: `${xpProgress.percent}%` }}
        />
        {showXpDelta && highlightWidth > 0 ? (
          <span
            className="absolute inset-y-0 rounded-full bg-[linear-gradient(90deg,#ffe08a,#fff26d)] shadow-[0_0_10px_rgba(255,224,138,0.65)] animate-pulse"
            style={{ left: `${xpProgress.highlightStartPercent}%`, width: `${highlightWidth}%` }}
            data-testid="reward-xp-bar-delta"
          />
        ) : null}
      </div>
      <span className="text-[11px] font-black uppercase tracking-[0.06em] text-[#d9ceb2]" data-testid="reward-xp-label">
        {showXpDelta ? `+${xpDelta} XP · ` : ""}
        {xpProgress.xpIntoLevel} / {xpProgress.xpForNextLevel} XP
      </span>
    </div>
  );
}

function RewardStatTile({
  testId,
  icon,
  label,
  deltaText,
  detailText,
  tone,
  dataAttrs,
  detailTestId,
}: {
  testId: string;
  icon: string;
  label: string;
  deltaText: string;
  detailText: string;
  tone: "crystal" | "elo" | "loss" | "levelUp";
  dataAttrs?: Record<string, string>;
  detailTestId?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-rows-[auto_auto_auto] items-center gap-1 rounded border-2 px-3 py-3 text-center",
        statTileToneClass(tone),
      )}
      data-testid={testId}
      data-tone={tone}
      {...dataAttrs}
    >
      <span className="text-3xl leading-none">{icon}</span>
      <span className={cn("text-2xl font-black leading-none", statTileDeltaColorClass(tone))}>{deltaText}</span>
      <span
        className="text-[11px] font-black uppercase tracking-[0.06em] text-[#d9ceb2]"
        data-testid={detailTestId}
      >
        {label} · {detailText}
      </span>
    </div>
  );
}

function statTileToneClass(tone: "crystal" | "elo" | "loss" | "levelUp") {
  if (tone === "crystal") return "border-[#65d7e9]/45 bg-[linear-gradient(180deg,rgba(8,32,40,0.88),rgba(2,14,18,0.88))]";
  if (tone === "elo") return "border-[#ffe08a]/55 bg-[linear-gradient(180deg,rgba(40,30,8,0.88),rgba(18,12,2,0.88))]";
  if (tone === "loss") return "border-[#ff7d6e]/55 bg-[linear-gradient(180deg,rgba(48,12,12,0.88),rgba(20,4,4,0.88))]";
  return "border-[#ffe08a]/70 bg-[linear-gradient(180deg,rgba(60,38,8,0.92),rgba(20,12,2,0.92))] shadow-[0_0_18px_rgba(255,224,138,0.28)]";
}

function statTileDeltaColorClass(tone: "crystal" | "elo" | "loss" | "levelUp") {
  if (tone === "crystal") return "text-[#65d7e9]";
  if (tone === "loss") return "text-[#ff8a7c]";
  return "text-[#ffe08a]";
}

function milestoneRarityLabel(rarity: Rarity) {
  if (rarity === "Legend") return "Легенда";
  if (rarity === "Unique") return "Унікальна";
  if (rarity === "Rare") return "Рідкісна";
  return "Звичайна";
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

function getOverlayTitle(phase: Phase, round: number, verdict: string, winner?: Side) {
  if (phase === "match_intro") return "БІЙ";
  if (phase === "round_intro") return `Раунд ${round}`;
  if (phase === "opponent_turn") return "Хід суперника";
  if (phase === "round_result") {
    if (winner === "player") return "Раунд за тобою!";
    if (winner === "enemy") return "Раунд за суперником";
    return "Раунд завершено";
  }
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

function roundResultText(winner: Side) {
  return winner === "player" ? "Раунд за тобою!" : "Раунд за суперником.";
}

function addRoundWinnerCardId(value: ReadonlySet<string>, clash: Clash) {
  const winnerCardId = clash.winner === "player" ? clash.playerCard.id : clash.enemyCard.id;
  const next = new Set(value);
  next.add(winnerCardId);
  return next;
}

function getVerdict(result?: MatchResult) {
  if (!result) return "";
  if (result === "draw") return "Нічия";
  return result === "player" ? "Перемога" : "Програш";
}

function matchResultToBucket(result: MatchResult): "win" | "draw" | "loss" {
  if (result === "player") return "win";
  if (result === "draw") return "draw";
  return "loss";
}

function topBarClass() {
  return cn(
    barShellClass(),
    "mt-0 grid-cols-[96px_minmax(220px,1fr)_86px]",
    "max-[960px]:grid-cols-[78px_minmax(0,1fr)_70px] max-[760px]:grid-cols-[62px_minmax(0,1fr)_58px]",
  );
}

function bottomBarClass() {
  return cn(
    barShellClass(),
    "mt-2 grid-cols-[104px_minmax(220px,1fr)_104px]",
    "max-[960px]:grid-cols-[84px_minmax(0,1fr)_84px] max-[760px]:grid-cols-[68px_minmax(0,1fr)_68px]",
  );
}

function barShellClass() {
  return "relative z-20 mx-auto grid min-h-[54px] w-[min(880px,100%)] items-stretch overflow-hidden rounded-md bg-black/55 max-[760px]:min-h-[48px]";
}

function barButtonClass(extra?: string) {
  return cn(
    "grid min-h-[54px] place-items-center bg-black/30 px-2 text-center text-xs font-black uppercase tracking-[0.03em] text-[#fff8d8] max-[760px]:min-h-[48px] max-[760px]:px-1 max-[760px]:text-[9px] max-[420px]:text-[8px]",
    extra,
  );
}
