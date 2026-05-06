"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { requestBattleAiMove } from "@/features/battle/ai/client";
import { DEFAULT_BATTLE_AI_MODEL_LABEL } from "@/features/battle/ai/modelInfo";
import { postMatchFinished } from "@/features/player/profile/client";
import { useLobbyChat } from "@/features/presence/client";
import { readStableSessionName, rememberStableSessionName } from "@/features/presence/sessionName";
import type { PlayerIdentity, PlayerProfile } from "@/features/player/profile/types";
import { computeLevelFromXp } from "@/features/player/profile/types";
import { cn } from "@/shared/lib/cn";
import { Modal } from "@/shared/ui/v2/Modal";
import type { TelegramPlayer } from "@/shared/lib/telegram";
import { cards } from "../model/cards";
import { isClanBonusActive } from "../model/clans";
import { DAMAGE_BOOST_COST, PHASE_TIMING_MS, TURN_SECONDS } from "../model/constants";
import { clearBattleSession, loadBattleSession, saveBattleSession } from "../persistence";
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
import type { BattleHandCard } from "./v2/molecules/BattleHand";
import type { CenterStageVariant } from "./v2/molecules/CenterStage";
import { BattleArena, type BattleArenaClash, type BattleArenaSplash } from "./v2/screens/BattleArena";
import { playSound } from "./v2/effects/sound";
import { MatchEndOverlay, type MatchEndRewards } from "./v2/organisms/MatchEndOverlay";
import {
  MatchmakingScreen,
  type MatchmakingChatMessage,
  type MatchmakingStatus,
} from "./v2/screens/MatchmakingScreen";

type BattleGameProps = {
  playerCollectionIds?: string[];
  playerDeckIds?: string[];
  playerIdentity?: PlayerIdentity;
  playerName?: string;
  playerEloRating?: number;
  telegramPlayer?: TelegramPlayer;
  mode?: "ai" | "human";
  avatarUrl?: string;
  onOpenCollection?: () => void;
  onSwitchMode?: (mode: "ai" | "human") => void;
  onPlayerUpdated?: (profile: PlayerProfile) => void;
};

type HumanMatchStatus = "idle" | "connecting" | "queued" | "matched" | "opponent_left" | "forfeit" | "error" | "closed";
const BOT_FALLBACK_DELAY_MS = 5_000;
const REMOTE_AI_CLIENT_BUDGET_MS = 4_000;

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
  damageBoost?: boolean;
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

export function BattleGame({ playerCollectionIds, playerDeckIds, playerIdentity, playerName, playerEloRating, telegramPlayer, mode = "ai", avatarUrl, onOpenCollection, onSwitchMode, onPlayerUpdated }: BattleGameProps = {}) {
  const isHumanMatch = mode === "human";
  // createInitialGame throws on under-populated decks (e.g. refresh into
  // /battle before the parent profile/deck props have hydrated). Wrap in a
  // try so the lazy initializer can still fall back to a persisted session.
  const initialGame = useMemo<GameState | null>(() => {
    try {
      return createInitialGame({ playerCollectionIds, playerDeckIds, playerName, playerEloRating });
    } catch {
      return null;
    }
  }, [playerCollectionIds, playerDeckIds, playerName, playerEloRating]);
  // Bot matches resume mid-match across refresh by hydrating from localStorage.
  // Live arena matches cannot resume cleanly (server-authoritative + socket), so they
  // always starts fresh and never reads/writes the persistence slot.
  const [game, setGame] = useState<GameState>(() => {
    if (!isHumanMatch) {
      const persisted = normalizeLoadedAiGame(loadBattleSession());
      if (persisted && !persisted.matchResult) return persisted;
    }
    if (!initialGame) {
      throw new Error("BattleGame mounted without a usable deck or persisted session");
    }
    return initialGame;
  });
  const [selectedId, setSelectedId] = useState(() => getAvailableCards(game.player)[0]?.id);
  const [energy, setEnergy] = useState(0);
  const [damageBoost, setDamageBoost] = useState(false);
  const [pending, setPending] = useState<Outcome | null>(null);
  const [enemyLockedMove, setEnemyLockedMove] = useState<KnownEnemyMove | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState(TURN_SECONDS);
  const [roundWinnerCardIds, setRoundWinnerCardIds] = useState<ReadonlySet<string>>(() => new Set());
  const [hudDamageFlash, setHudDamageFlash] = useState<"player" | "enemy" | null>(null);
  // Per-projectile HUD HP override: while ClashOverlay's barrage super-phase
  // runs, each projectile impact decrements one HP pill in the persistent
  // BattleHud. The actual game state is updated atomically via applyOutcome
  // once the overlay calls onDone — this override is purely visual glue.
  const [hudHpOverride, setHudHpOverride] = useState<{ player?: number; enemy?: number }>({});
  const [clashOverlayDone, setClashOverlayDone] = useState(false);
  const [humanStatus, setHumanStatus] = useState<HumanMatchStatus>(isHumanMatch ? "connecting" : "idle");
  const [humanMessage, setHumanMessage] = useState("");
  const [humanSessionId, setHumanSessionId] = useState("");
  const [humanSessionName, setHumanSessionName] = useState("");
  const [humanOnlineCount, setHumanOnlineCount] = useState<number | null>(null);
  const [matchmakingQueuedAt, setMatchmakingQueuedAt] = useState<number | null>(null);
  const [matchmakingWaitingSeconds, setMatchmakingWaitingSeconds] = useState(0);
  const [humanChatMessages, setHumanChatMessages] = useState<HumanChatMessage[]>([]);
  const [humanChatDraft, setHumanChatDraft] = useState("");
  // Lobby chat for the matchmaking screen — at queue time there is no opponent
  // yet, so we surface the global lobby websocket chat.
  const [lobbyChatDraft, setLobbyChatDraft] = useState("");
  const lobbyChatEnabled = isHumanMatch && humanStatus !== "matched";
  const lobbyChat = useLobbyChat(playerName, { enabled: lobbyChatEnabled });
  const [matchInfo, setMatchInfo] = useState<HumanMatchInfo | null>(null);
  const [persistedRewards, setPersistedRewards] = useState<RewardSummary | null>(null);
  const [persistedRewardsError, setPersistedRewardsError] = useState<string | null>(null);
  const [surrendering, setSurrendering] = useState(false);
  const [surrenderConfirmOpen, setSurrenderConfirmOpen] = useState(false);
  const persistedMatchSignatureRef = useRef<string | null>(null);
  const surrenderedMatchRef = useRef(false);
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
  const stableHumanNameRef = useRef("");
  const mountedRef = useRef(true);
  const aiMoveRequestIdRef = useRef(0);
  const soundCueRef = useRef({ turn: "", splash: "", matchEnd: "", opponentMove: "" });

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      aiMoveRequestIdRef.current += 1;
    };
  }, []);

  // Persist AI-mode game state across refreshes; clear once a match concludes
  // so the next entry to the battle screen starts a fresh fight.
  useEffect(() => {
    if (isHumanMatch) return;
    if (game.matchResult) {
      clearBattleSession();
      return;
    }
    saveBattleSession(game);
  }, [game, isHumanMatch]);

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
      setMatchmakingQueuedAt(null);
      setHumanChatMessages([]);
      setHumanChatDraft("");
    }, 0);
    socketRef.current = socket;
    remoteFirstMoveRef.current = null;
    const stableHumanName = playerName?.trim() || readStableSessionName();
    stableHumanNameRef.current = stableHumanName;
    humanSessionNameRef.current = stableHumanName;

    socket.addEventListener("open", () => {
      sendSocketMessage(socket, {
        type: "join_human",
        deckIds: playerDeckIds,
        collectionIds: playerCollectionIds,
        identity: playerIdentity,
        user: getHumanSocketUser(telegramPlayer, stableHumanName),
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
      setMatchmakingQueuedAt(null);
    });

    socket.addEventListener("error", () => {
      if (disposed) return;
      setHumanStatus("error");
      setMatchmakingQueuedAt(null);
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
  }, [isHumanMatch, playerCollectionIds, playerDeckIds, playerIdentity, playerName, telegramPlayer]);

  useEffect(() => {
    if (!isHumanMatch || humanStatus !== "queued") return;

    const fallbackTimer = window.setTimeout(() => {
      const socket = socketRef.current;
      if (isSocketOpen(socket)) {
        sendSocketMessage(socket, { type: "cancel_queue" });
        socket.close();
      }
      setHumanMessage("На арені зараз немає живого суперника — випускаємо AI-бота.");
      resetAiMatch();
      onSwitchMode?.("ai");
    }, BOT_FALLBACK_DELAY_MS);

    return () => window.clearTimeout(fallbackTimer);
  }, [humanStatus, isHumanMatch, onSwitchMode]);

  useEffect(() => {
    if (!isHumanMatch || humanStatus !== "queued" || matchmakingQueuedAt === null) {
      setMatchmakingWaitingSeconds(0);
      return;
    }

    const updateWaitingSeconds = () => {
      setMatchmakingWaitingSeconds(Math.max(0, Math.floor((Date.now() - matchmakingQueuedAt) / 1000)));
    };

    updateWaitingSeconds();
    const interval = window.setInterval(updateWaitingSeconds, 250);

    return () => window.clearInterval(interval);
  }, [humanStatus, isHumanMatch, matchmakingQueuedAt]);

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
          stopsAbility: false,
        },
      })
    : { attack: 0, damage: 0 };
  const previewDamage = preview.damage + (damageBoost ? 2 : 0);
  const verdict = useMemo(() => getVerdict(game.matchResult), [game.matchResult]);
  const showBattle = pending !== null && ["battle_intro", "damage_apply"].includes(game.phase);
  const humanBlockingOverlay = isHumanMatch && humanStatus !== "matched";
  const humanDisplayName = (playerName?.trim() || humanSessionName).trim();
  const activeHand = getActiveHand(game.phase);
  const enemySelectedCardId = activeClash?.enemyCard.id ?? enemyLockedMove?.card.id;
  const enemyPlayedCardId = pending?.clash.enemyCard.id ?? game.round.enemyCardId;
  const playerDecisionActive = pending === null && ["player_turn", "card_preview"].includes(game.phase);
  const turnWarningActive = playerDecisionActive && turnSeconds <= 10;
  const canSurrender = !humanBlockingOverlay && !surrendering && !game.matchResult && game.phase !== "reward_summary";

  useEffect(() => {
    if (humanBlockingOverlay) return;

    const side = game.phase === "player_turn" ? "player" : game.phase === "opponent_turn" ? "opponent" : null;
    if (!side) return;

    const signature = `${game.round.round}:${side}`;
    if (soundCueRef.current.turn === signature) return;

    soundCueRef.current.turn = signature;
    playSound(side === "player" ? "playerTurn" : "opponentTurn", 0.36);
  }, [game.phase, game.round.round, humanBlockingOverlay]);

  useEffect(() => {
    if (humanBlockingOverlay) return;
    if (game.phase !== "match_intro" && game.phase !== "round_intro") return;

    const signature = `${game.phase}:${game.round.round}`;
    if (soundCueRef.current.splash === signature) return;

    soundCueRef.current.splash = signature;
    playSound(game.phase === "match_intro" ? "matchStart" : "roundStart", 0.34);
  }, [game.phase, game.round.round, humanBlockingOverlay]);

  useEffect(() => {
    if (game.phase !== "reward_summary" || !game.matchResult) return;

    const signature = `${game.matchResult}:${game.round.round}`;
    if (soundCueRef.current.matchEnd === signature) return;

    soundCueRef.current.matchEnd = signature;
    if (game.matchResult === "player") {
      playSound("victory", 0.42);
    } else if (game.matchResult === "enemy") {
      playSound("defeat", 0.38);
    } else {
      playSound("roundEnd", 0.38);
    }
  }, [game.matchResult, game.phase, game.round.round]);

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
              playOpponentMoveCue(soundCueRef, game.round.round, enemyMove.card.id);
              setEnemyLockedMove(enemyMove);
              setGame((value) => ({
                ...value,
                phase: "player_turn",
                turnDeadlineAt: startTurnDeadline(),
                round: {
                  ...value.round,
                  enemyCardId: enemyMove.card.id,
                  enemyEnergyBid: enemyMove.energy ?? value.round.enemyEnergyBid,
                  enemyDamageBoost: enemyMove.damageBoost,
                },
              }));
              return;
            }

            setEnemyLockedMove(null);
            setGame((value) => ({ ...value, phase: "opponent_turn" }));
            return;
          }

          const requestId = ++aiMoveRequestIdRef.current;
          setEnemyLockedMove(null);
          setGame((value) => ({
            ...value,
            phase: "opponent_turn",
          }));
          chooseAiEnemyMove(game).then((enemyMove) => {
            if (!isCurrentAiMoveRequest(requestId, game.round.round)) return;

            playOpponentMoveCue(soundCueRef, game.round.round, enemyMove.card.id);
            setEnemyLockedMove(enemyMove);
            setGame((value) => {
              if (value.round.round !== game.round.round || value.first !== "enemy" || value.phase !== "opponent_turn") return value;

              return {
                ...value,
                phase: "player_turn",
                turnDeadlineAt: startTurnDeadline(),
                round: {
                  ...value.round,
                  enemyCardId: enemyMove.card.id,
                  enemyEnergyBid: enemyMove.energy,
                  enemyDamageBoost: enemyMove.damageBoost,
                },
              };
            });
          });
          return;
        }

        setEnemyLockedMove(null);
        setGame((value) => ({ ...value, phase: "player_turn", turnDeadlineAt: startTurnDeadline() }));
      }, PHASE_TIMING_MS.round_intro);
    }

    if (game.phase === "opponent_turn") {
      if (isHumanMatch) return;
      if (!pending && aiMoveRequestIdRef.current === 0 && game.first === "player" && game.round.playerCardId) {
        const playerCard = findCardInHand(game.player.hand, game.round.playerCardId);
        if (!playerCard) return;

        const requestId = ++aiMoveRequestIdRef.current;
        chooseAiEnemyMove(game, playerCard).then((enemyMove) => {
          if (!isCurrentAiMoveRequest(requestId, game.round.round)) return;

          playOpponentMoveCue(soundCueRef, game.round.round, enemyMove.card.id);
          const outcome = resolveRound(
            game.player,
            game.enemy,
            playerCard,
            game.round.playerEnergyBid,
            Boolean(game.round.playerDamageBoost),
            game.first,
            game.round.round,
            enemyMove,
          );

          setPending(outcome);
          setRoundWinnerCardIds((value) => addRoundWinnerCardId(value, outcome.clash));
          setEnemyLockedMove(enemyMove);
          setGame((value) => {
            if (value.round.round !== game.round.round || value.phase !== "opponent_turn") return value;

            return {
              ...value,
              phase: "battle_intro",
              turnDeadlineAt: undefined,
              round: {
                ...value.round,
                enemyCardId: enemyMove.card.id,
                enemyEnergyBid: enemyMove.energy,
                enemyDamageBoost: enemyMove.damageBoost,
                clash: outcome.clash,
              },
            };
          });
        });
        return;
      }
      if (!pending) return;

      return schedule(() => {
        setGame((value) => ({ ...value, phase: "battle_intro", turnDeadlineAt: undefined }));
      }, PHASE_TIMING_MS.opponent_turn);
    }

    if (game.phase === "battle_intro") {
      // Overlay drives its own end-of-fight signal; flip into damage_apply
      // immediately so the same overlay keeps rendering through both
      // super-phases (card combat + projectile barrage). The previous
      // fixed-duration intro is gone — the overlay owns its timeline.
      setGame((value) => (value.phase === "battle_intro" ? { ...value, phase: "damage_apply" } : value));
      return;
    }

    if (game.phase === "damage_apply" && pending) {
      if (!clashOverlayDone) return;

      const applied = applyOutcome(game, pending);
      const nextCard = getAvailableCards(applied.player)[0];

      if (nextCard) setSelectedId(nextCard.id);
      setEnergy(0);
      setDamageBoost(false);
      setPending(null);
      setHudHpOverride({});
      setClashOverlayDone(false);
      resolvingHumanRoundRef.current = null;
      setEnemyLockedMove(null);

      // Owner spec (Issue 4): when the match has ended, skip the battlefield
      // render with HP=0 and jump straight to reward_summary (which opens
      // MatchEndOverlay). Owner spec (Issue 3): otherwise advance directly
      // into round_intro so the splash covers the cards BEFORE the new round
      // is visible — the legacy `round_result` recap was rendering the new
      // hand for ~2300ms before the splash kicked in.
      if (applied.matchResult) {
        setGame({ ...applied, phase: "reward_summary" });
      } else {
        setGame(startNextRound(applied));
      }
      return;
    }

    if (game.phase === "round_result") {
      return schedule(() => setGame((value) => startNextRound(value)), PHASE_TIMING_MS.round_result);
    }

    if (game.phase === "match_result") {
      return schedule(() => setGame((value) => ({ ...value, phase: "reward_summary" })), PHASE_TIMING_MS.match_result);
    }
  }, [game, humanStatus, isHumanMatch, pending, clashOverlayDone]);

  useEffect(() => {
    if (isHumanMatch || pending || !["battle_intro", "damage_apply"].includes(game.phase)) return;

    const restored = rebuildPendingOutcomeFromRound(game);
    if (!restored) return;

    setPending(restored.outcome);
    setEnemyLockedMove(restored.enemyMove);
    setRoundWinnerCardIds((value) => addRoundWinnerCardId(value, restored.outcome.clash));
    setGame((value) => ({
      ...value,
      phase: "battle_intro",
      turnDeadlineAt: undefined,
      round: {
        ...value.round,
        clash: restored.outcome.clash,
      },
    }));
  }, [game, isHumanMatch, pending]);

  useEffect(() => {
    if (isHumanMatch) return;
    if (game.phase !== "match_result" && game.phase !== "reward_summary") return;
    if (!game.matchResult) return;
    if (!playerIdentity) return;

    const result = matchResultToBucket(game.matchResult);
    const surrendered = result === "loss" && surrenderedMatchRef.current;
    // Effect runs once for match_result and again for reward_summary; the ref dedupes the POST.
    const signature = `${game.matchResult}:${result}:${surrendered ? "surrender" : "normal"}`;
    if (persistedMatchSignatureRef.current === signature) return;
    persistedMatchSignatureRef.current = signature;

    let cancelled = false;
    const opponentEloBefore = game.enemy.aiProfile?.eloRating;
    postMatchFinished({ identity: playerIdentity, mode: "pve", result, opponentEloBefore, ...(surrendered ? { surrendered: true } : {}) })
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
    if (!playerDecisionActive) {
      setTurnSeconds(TURN_SECONDS);
      return;
    }

    const deadlineAt = game.turnDeadlineAt ?? startTurnDeadline();
    if (!game.turnDeadlineAt) {
      setGame((value) =>
        ["player_turn", "card_preview"].includes(value.phase) && !value.turnDeadlineAt
          ? { ...value, turnDeadlineAt: deadlineAt }
          : value,
      );
    }

    const updateSeconds = () => {
      const elapsedMs = deadlineAt - Date.now();
      setTurnSeconds(Math.max(0, Math.ceil(elapsedMs / 1000)));
    };

    const interval = window.setInterval(() => {
      updateSeconds();
    }, 250);
    updateSeconds();
    const timeout = window.setTimeout(() => autoSubmitRef.current(), Math.max(0, deadlineAt - Date.now()));

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [game.round.round, game.turnDeadlineAt, playerDecisionActive]);

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

    playSound("playerMove", 0.42);

    if (game.first === "player") {
      const requestGame = game;
      const requestId = ++aiMoveRequestIdRef.current;

      setSelectedId(card.id);
      setSelectionOpen(false);
      setTurnSeconds(TURN_SECONDS);
      setEnemyLockedMove(null);
      setGame((value) => ({
        ...value,
        phase: "opponent_turn",
        turnDeadlineAt: undefined,
        round: {
          ...value.round,
          playerCardId: card.id,
          playerEnergyBid: legalEnergy,
          playerDamageBoost: effectiveBoost,
        },
      }));

      chooseAiEnemyMove(requestGame, card).then((enemyMove) => {
        if (!isCurrentAiMoveRequest(requestId, requestGame.round.round)) return;

        playOpponentMoveCue(soundCueRef, requestGame.round.round, enemyMove.card.id);
        const outcome = resolveRound(
          requestGame.player,
          requestGame.enemy,
          card,
          legalEnergy,
          effectiveBoost,
          requestGame.first,
          requestGame.round.round,
          enemyMove,
        );

        setPending(outcome);
        setRoundWinnerCardIds((value) => addRoundWinnerCardId(value, outcome.clash));
        setEnemyLockedMove(enemyMove);
        setGame((value) => {
          if (value.round.round !== requestGame.round.round || value.phase !== "opponent_turn") return value;

          return {
            ...value,
            phase: "battle_intro",
            turnDeadlineAt: undefined,
            round: {
              ...value.round,
              enemyCardId: enemyMove.card.id,
              enemyEnergyBid: enemyMove.energy,
              enemyDamageBoost: enemyMove.damageBoost,
              clash: outcome.clash,
            },
          };
        });
      });
      return;
    }

    const knownEnemyMove =
      enemyLockedMove?.energy !== undefined
        ? ({
            card: enemyLockedMove.card,
            energy: enemyLockedMove.energy,
            damageBoost: Boolean(enemyLockedMove.damageBoost),
          } satisfies EnemyMove)
        : chooseEnemyMove(game.enemy, game.player, game.round.round, { visiblePlayerCard: card, first: game.first });
    const outcome = resolveRound(game.player, game.enemy, card, legalEnergy, effectiveBoost, game.first, game.round.round, knownEnemyMove);
    const enemyMove = knownEnemyMove;

    setSelectedId(card.id);
    setSelectionOpen(false);
    setTurnSeconds(TURN_SECONDS);
    setPending(outcome);
    setRoundWinnerCardIds((value) => addRoundWinnerCardId(value, outcome.clash));
    setEnemyLockedMove(enemyMove);
    setGame((value) => ({
      ...value,
      phase: knownEnemyMove ? "battle_intro" : "opponent_turn",
      turnDeadlineAt: undefined,
      round: {
        ...value.round,
        playerCardId: card.id,
        enemyCardId: enemyMove.card.id,
        playerEnergyBid: legalEnergy,
        enemyEnergyBid: enemyMove.energy,
        playerDamageBoost: effectiveBoost,
        enemyDamageBoost: enemyMove.damageBoost,
        clash: outcome.clash,
      },
    }));
  }

  function submitHumanSelection(card: NonNullable<typeof selected>, legalEnergy: number, boosted: boolean) {
    const currentMatch = matchInfoRef.current;
    const socket = socketRef.current;

    if (!currentMatch || !isSocketOpen(socket)) {
      setHumanStatus("error");
      setHumanMessage("З'єднання арени ще не готове для ходу.");
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

    playSound("playerMove", 0.42);
    setSelectedId(card.id);
    setSelectionOpen(false);
    setTurnSeconds(TURN_SECONDS);
    setGame((value) => ({
      ...value,
      phase: "opponent_turn",
      turnDeadlineAt: undefined,
      round: {
        ...value.round,
        playerCardId: card.id,
        enemyCardId: enemyLockedMove?.card.id ?? value.round.enemyCardId,
        playerEnergyBid: legalEnergy,
        enemyEnergyBid: enemyLockedMove?.energy ?? value.round.enemyEnergyBid,
        playerDamageBoost: boosted,
        enemyDamageBoost: enemyLockedMove?.damageBoost ?? value.round.enemyDamageBoost,
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
        if (!stableHumanNameRef.current) {
          stableHumanNameRef.current = rememberStableSessionName(nextSessionName);
        }
        const displaySessionName = stableHumanNameRef.current || nextSessionName;
        humanSessionNameRef.current = displaySessionName;
        setHumanSessionName(displaySessionName);
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
      setMatchmakingQueuedAt(Date.now());
      return;
    }

    if (message.type === "match_ready") {
      const nextMatch = normalizeHumanMatch(message);

      if (!nextMatch) {
      setHumanStatus("error");
      setHumanMessage("Сервер арени надіслав матч без потрібних даних.");
      setMatchmakingQueuedAt(null);
      return;
      }

      const nextGame = createHumanGame(nextMatch, playerName || humanSessionNameRef.current);
      const firstCard = getAvailableCards(nextGame.player)[0];

      clearHumanMessageBuffers();
      resetSoundCues(soundCueRef);
      surrenderedMatchRef.current = false;
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
      setSurrendering(false);
      setSurrenderConfirmOpen(false);
      setHumanStatus("matched");
      setHumanMessage("");
      setMatchmakingQueuedAt(null);
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
      setHumanMessage(typeof message.message === "string" ? message.message : "Сервер арени повернув помилку.");
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
    playOpponentMoveCue(soundCueRef, message.round, message.move.cardId);

    if (currentGame.phase !== "opponent_turn" || currentGame.first !== "enemy") return;

    const enemyMove = createKnownEnemyMoveFromHumanMove(currentGame, message.move);
    if (!enemyMove) return;

    setEnemyLockedMove(enemyMove);
    setGame((value) => ({
      ...value,
      phase: "player_turn",
      turnDeadlineAt: startTurnDeadline(),
      round: {
        ...value.round,
        enemyCardId: enemyMove.card.id,
        enemyEnergyBid: enemyMove.energy ?? value.round.enemyEnergyBid,
        enemyDamageBoost: enemyMove.damageBoost,
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
      setHumanMessage("Не вдалося зіставити карти раунду з поточною рукою.");
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

    if (message.firstPlayerId === currentMatch.playerId) {
      playOpponentMoveCue(soundCueRef, message.round, opponentMove.cardId);
    }
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
      turnDeadlineAt: undefined,
      round: {
        ...value.round,
        playerCardId: playerCard.id,
        enemyCardId: enemyCard.id,
        playerEnergyBid: playerMove.energy,
        enemyEnergyBid: opponentMove.energy,
        playerDamageBoost: playerMove.boosted,
        enemyDamageBoost: opponentMove.boosted,
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
    setMatchmakingQueuedAt(null);
    setPending(null);
    setEnemyLockedMove(null);
    setRoundWinnerCardIds(new Set());
    setSelectionOpen(false);
    setTurnSeconds(0);
    setSurrendering(false);
    setSurrenderConfirmOpen(false);
    clearHumanMessageBuffers();
    setGame((value) => ({
      ...value,
      phase: "reward_summary",
      turnDeadlineAt: undefined,
      matchResult,
    }));
  }


  function restartHumanQueue() {
    const socket = socketRef.current;

    setHumanStatus(isSocketOpen(socket) ? "queued" : "closed");
    setHumanMessage("");
    setMatchmakingQueuedAt(isSocketOpen(socket) ? Date.now() : null);
    setMatchInfo(null);
    setPending(null);
    setEnemyLockedMove(null);
    setRoundWinnerCardIds(new Set());
    setSelectionOpen(false);
    setSurrendering(false);
    setSurrenderConfirmOpen(false);
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
      user: getHumanSocketUser(telegramPlayer, stableHumanNameRef.current),
    });
  }

  function sendHumanChatMessage() {
    const socket = socketRef.current;
    const text = humanChatDraft.replace(/\s+/g, " ").trim();
    if (!text || !isSocketOpen(socket)) return;

    sendSocketMessage(socket, { type: "chat_message", text });
    setHumanChatDraft("");
  }

  async function chooseAiEnemyMove(currentGame: GameState, visiblePlayerCard?: Card): Promise<EnemyMove> {
    const fallback = chooseEnemyMove(currentGame.enemy, currentGame.player, currentGame.round.round, {
      visiblePlayerCard,
      first: currentGame.first,
    });

    const remoteMove = requestBattleAiMove(currentGame, { visiblePlayerCard }).catch((error) => {
      console.warn("Remote AI move failed; using local fallback.", error instanceof Error ? error.message : "Unknown error");
      return fallback;
    });

    return withLocalAiBudget(remoteMove, fallback);
  }

  function withLocalAiBudget(remoteMove: Promise<EnemyMove>, fallback: EnemyMove): Promise<EnemyMove> {
    let timeout: number | undefined;
    const localMove = new Promise<EnemyMove>((resolve) => {
      timeout = window.setTimeout(() => resolve(fallback), REMOTE_AI_CLIENT_BUDGET_MS);
    });

    return Promise.race([remoteMove, localMove]).finally(() => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    });
  }

  function isCurrentAiMoveRequest(requestId: number, round: number) {
    return mountedRef.current && aiMoveRequestIdRef.current === requestId && gameRef.current.round.round === round && !gameRef.current.matchResult;
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

  function resetAiMatch() {
    aiMoveRequestIdRef.current += 1;
    surrenderedMatchRef.current = false;
    resetSoundCues(soundCueRef);

    const next = createInitialGame({ playerCollectionIds, playerDeckIds, playerName, playerEloRating });
    const firstCard = getAvailableCards(next.player)[0];

    setGame(next);
    setSelectedId(firstCard?.id);
    setEnergy(0);
    setDamageBoost(false);
    setPending(null);
    setEnemyLockedMove(null);
    setRoundWinnerCardIds(new Set());
    setSelectionOpen(false);
    setTurnSeconds(TURN_SECONDS);
    setMatchmakingQueuedAt(null);
    setPersistedRewards(null);
    setPersistedRewardsError(null);
    setSurrendering(false);
    setSurrenderConfirmOpen(false);
    persistedMatchSignatureRef.current = null;
  }

  function startArenaSearch() {
    resetAiMatch();
    if (isHumanMatch) {
      restartHumanQueue();
      return;
    }

    setHumanStatus("connecting");
    setHumanMessage("");
    setMatchmakingQueuedAt(null);
    onSwitchMode?.("human");
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

  function surrenderMatch() {
    if (!canSurrender) return;
    setSurrenderConfirmOpen(true);
  }

  function confirmSurrenderMatch() {
    if (!canSurrender) return;

    setSurrenderConfirmOpen(false);
    setSurrendering(true);
    setSelectionOpen(false);
    setPending(null);
    setEnemyLockedMove(null);
    setTurnSeconds(0);
    setClashOverlayDone(false);
    setHudHpOverride({});

    if (isHumanMatch) {
      const currentMatch = matchInfoRef.current;
      const socket = socketRef.current;
      if (!currentMatch || !isSocketOpen(socket)) {
        setSurrendering(false);
        setSurrenderConfirmOpen(false);
        setHumanStatus("error");
        setHumanMessage("З'єднання арени ще не готове для здачі.");
        return;
      }

      sendSocketMessage(socket, {
        type: "surrender_match",
        matchId: currentMatch.matchId,
      });
      return;
    }

    aiMoveRequestIdRef.current += 1;
    surrenderedMatchRef.current = true;
    persistedMatchSignatureRef.current = null;
    setGame((value) => ({
      ...value,
      phase: "reward_summary",
      matchResult: "enemy",
    }));
  }

  // ── v2 hand prop construction (kept inline so existing state names flow through) ──
  const playerHandCards: BattleHandCard[] = game.player.hand.map((card) => ({
    card,
    used: card.used,
    selectable: !locked && !card.used,
    selected: selectedId === card.id,
    medal: card.used && roundWinnerCardIds.has(card.id),
    played: card.id === game.round.playerCardId,
  }));
  const enemyHandCards: BattleHandCard[] = game.enemy.hand.map((card) => ({
    card,
    used: card.used,
    selected: enemySelectedCardId === card.id,
    medal: card.used && roundWinnerCardIds.has(card.id),
    played: card.id === enemyPlayedCardId,
  }));
  const arenaMode: "ai" | "pvp" = mode === "human" ? "pvp" : "ai";
  const aiModelLabel = game.enemy.aiProfile?.modelLabel ?? DEFAULT_BATTLE_AI_MODEL_LABEL;
  const centerVariant = pickCenterStageVariant(game, verdict, arenaMode);

  // Splash drives the cover overlay (replaces legacy PhaseOverlay).
  const splash: BattleArenaSplash | undefined = (() => {
    if (game.phase === "match_intro") {
      return { phase: "match_intro", opponentName: game.enemy.name, mode: arenaMode, aiModelLabel };
    }
    if (game.phase === "round_intro") {
      return { phase: "round_intro", round: game.round.round };
    }
    // match_result splash intentionally suppressed — MatchEndOverlay (which
    // opens at reward_summary) provides the verdict header. The legacy neon
    // "ПЕРЕМОГА" cover that previously rendered here is gone by design.
    return undefined;
  })();

  // Clash overlay payload is sourced from the in-flight `pending` outcome
  // (the resolved clash hasn't been applied to game state yet).
  const arenaClash: BattleArenaClash | undefined = showBattle && pending
    ? {
        playerCard: pending.clash.playerCard,
        enemyCard: pending.clash.enemyCard,
        playerAttack: pending.clash.playerAttack,
        enemyAttack: pending.clash.enemyAttack,
        playerDamage: pending.clash.winner === "player" ? pending.clash.damage : 0,
        enemyDamage: pending.clash.winner === "enemy" ? pending.clash.damage : 0,
        playerEnergy: pending.clash.playerEnergy,
        enemyEnergy: pending.clash.enemyEnergy,
        winner: pending.clash.winner,
      }
    : undefined;

  // Reward content for MatchEndOverlay — uses persisted summary when available,
  // falling back to the in-game rewards stub for AI matches that haven't yet
  // hit the network.
  const matchEndOpen = game.phase === "reward_summary";
  const matchEndVariant: "victory" | "defeat" =
    game.matchResult === "player" ? "victory" : "defeat";
  const matchEndRewards = mapRewardsForMatchEnd(persistedRewards ?? game.rewards);

  const matchmakingChatMessages: MatchmakingChatMessage[] = lobbyChatEnabled
    ? lobbyChat.chatMessages.map((message) => ({
        id: message.id,
        authorId: message.authorId,
        authorName: message.authorName,
        text: message.text,
        ts: message.createdAt,
      }))
    : [];
  const sendLobbyChatDraft = () => {
    if (!lobbyChatEnabled) return;
    if (!lobbyChat.sendMessage(lobbyChatDraft)) return;
    setLobbyChatDraft("");
  };
  const matchmakingStatus: MatchmakingStatus = mapHumanStatusToMatchmaking(humanStatus);
  const matchmakingDeckSize = playerDeckIds?.length ?? game.player.hand.length;

  // Hand select callback — opens card pick preview when allowed.
  const onSelectHandCard = (cardId: string) => {
    const card = game.player.hand.find((entry) => entry.id === cardId);
    if (!card || locked || card.used) return;
    setSelectedId(card.id);
    setSelectionOpen(true);
    setGame((value) => ({
      ...value,
      phase: "card_preview",
      round: { ...value.round, playerCardId: card.id },
    }));
  };

  return (
    <main
      data-testid="battle-game"
      data-mode={arenaMode}
      className={cn(
        "battle-screen relative isolate min-h-screen w-screen overflow-hidden text-[#f8eed8]",
      )}
    >
      {humanBlockingOverlay ? (
        <MatchmakingScreen
          status={matchmakingStatus}
          deckSize={matchmakingDeckSize}
          elo={playerEloRating ?? 0}
          onlineCount={humanOnlineCount}
          waitingSeconds={matchmakingWaitingSeconds}
          playerName={humanDisplayName}
          statusMessage={humanMessage || undefined}
          chat={{
            messages: matchmakingChatMessages,
            draft: lobbyChatDraft,
            sessionId: lobbyChat.sessionId,
            onDraftChange: setLobbyChatDraft,
            onSend: sendLobbyChatDraft,
          }}
          onCancel={onOpenCollection ?? (() => {})}
          onRetry={restartHumanQueue}
        />
      ) : (
        <BattleArena
          game={game}
          player={
            hudHpOverride.player !== undefined
              ? { ...game.player, hp: hudHpOverride.player }
              : game.player
          }
          enemy={
            hudHpOverride.enemy !== undefined
              ? { ...game.enemy, hp: hudHpOverride.enemy }
              : game.enemy
          }
          mode={arenaMode}
          centerVariant={centerVariant}
          playerHand={playerHandCards}
          enemyHand={enemyHandCards}
          selectedCardId={selectedId}
          energyBid={selectedEnergy}
          damageBoost={damageBoost}
          cardPickOpen={selectionOpen && Boolean(selected) && game.phase === "card_preview"}
          cardPickPreview={{ attack: preview.attack, damage: previewDamage }}
          maxEnergyForCard={maxEnergyForCard}
          boostCost={DAMAGE_BOOST_COST}
          canBoost={canBoost}
          knownEnemyCard={enemyLockedMove?.card}
          clash={arenaClash}
          clashPhase={game.phase}
          splash={splash}
          timer={{ secondsLeft: turnSeconds, warning: turnWarningActive }}
          activeHand={activeHand}
          playerDamageFlash={hudDamageFlash === "player"}
          enemyDamageFlash={hudDamageFlash === "enemy"}
          onClashImpact={(loser) => {
            setHudDamageFlash(loser);
            setTimeout(() => setHudDamageFlash(null), 700);
          }}
          onClashProjectileImpact={(loser, _index, hpRemaining) => {
            // Decrement the persistent BattleHud HP one pill per projectile.
            setHudHpOverride((value) => ({ ...value, [loser]: hpRemaining }));
          }}
          onClashDone={() => setClashOverlayDone(true)}
          onSelectCard={onSelectHandCard}
          onEnergyMinus={() => setEnergy((value) => Math.max(0, Math.min(value, maxEnergyForCard) - 1))}
          onEnergyPlus={() => setEnergy((value) => Math.min(maxEnergyForCard, value + 1))}
          onEnergyChange={(next) => setEnergy(Math.max(0, Math.min(maxEnergyForCard, next)))}
          onToggleBoost={toggleBoost}
          onConfirmPick={confirmSelection}
          onCancelPick={closeSelection}
          onLeave={onOpenCollection ?? (() => {})}
          onSurrender={surrenderMatch}
          canSurrender={canSurrender}
          onOpenDecks={() => {
            // TODO(owner): wire deck-management modal. Today GameRoot only
            // exposes onOpenCollection (which both Leaves the match AND opens
            // the collection/deck screen) — there is no dedicated deck modal
            // route yet. Falling back to onOpenCollection so the button works.
            (onOpenCollection ?? (() => {}))();
          }}
        />
      )}

      <MatchEndOverlay
        open={matchEndOpen}
        variant={matchEndVariant}
        mode={arenaMode}
        playerName={game.player.name}
        opponentName={game.enemy.name}
        rewards={matchEndRewards}
        avatarUrl={avatarUrl}
        errorText={persistedRewardsError ?? undefined}
        onPlayAgain={startArenaSearch}
        onGoToCollection={onOpenCollection ?? (() => {})}
      />

      <SurrenderConfirmModal
        open={surrenderConfirmOpen}
        onCancel={() => setSurrenderConfirmOpen(false)}
        onConfirm={confirmSurrenderMatch}
      />

    </main>
  );
}

function SurrenderConfirmModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} size="sm" ariaLabel="Підтвердити здачу">
      <div className="grid gap-4 p-5 sm:p-6">
        <div className="grid gap-2">
          <h2 className="text-sm font-black uppercase tracking-[0.14em] text-accent">
            Здатись?
          </h2>
          <p className="text-sm leading-relaxed text-ink-mute">
            Бій завершиться поразкою. Суперник отримає звичайну ELO-нагороду, а з тебе зніметься половина звичайного мінуса.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-md border border-accent-quiet text-[12px] font-bold uppercase tracking-[0.12em] text-ink-mute hover:text-ink hover:bg-accent/5"
          >
            Ні
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-testid="surrender-confirm"
            className="h-11 rounded-md border border-danger/70 bg-danger/12 text-[12px] font-bold uppercase tracking-[0.12em] text-danger hover:bg-danger/20"
          >
            Здатись
          </button>
        </div>
      </div>
    </Modal>
  );
}

function mapRewardsForMatchEnd(summary: RewardSummary | undefined): MatchEndRewards {
  const xpDelta = summary?.deltaXp ?? 0;
  const newTotalXp = summary?.newTotals?.totalXp;
  const levelInfo = typeof newTotalXp === "number" ? computeLevelFromXp(newTotalXp) : null;
  return {
    xp: {
      delta: xpDelta,
      current: levelInfo?.xpIntoLevel ?? 0,
      max: levelInfo?.xpForNextLevel ?? Math.max(xpDelta, 100),
      levelUp: summary?.leveledUp,
      newLevel: summary?.newTotals?.level,
    },
    elo: {
      delta: summary?.deltaElo ?? 0,
      current: summary?.newTotals?.eloRating ?? 0,
    },
    crystals: summary?.deltaCrystals ?? 0,
    milestone: summary?.milestoneCardRewards?.[0]
      ? {
          id: summary.milestoneCardRewards[0].cardId,
          label: summary.milestoneCardRewards[0].cardName,
        }
      : undefined,
  };
}

function mapHumanStatusToMatchmaking(status: HumanMatchStatus): MatchmakingStatus {
  if (status === "idle") return "connecting";
  return status as MatchmakingStatus;
}

function pickCenterStageVariant(
  game: GameState,
  _verdict: string,
  arenaMode: "ai" | "pvp",
): CenterStageVariant {
  const phase = game.phase;
  if (phase === "match_intro") {
    return {
      kind: "match_intro",
      opponentName: game.enemy.name,
      mode: arenaMode,
      aiModelLabel: game.enemy.aiProfile?.modelLabel ?? DEFAULT_BATTLE_AI_MODEL_LABEL,
    };
  }
  if (phase === "round_intro") return { kind: "round_intro", round: game.round.round };
  if (phase === "opponent_turn") return { kind: "opponent_thinking" };
  if ((phase === "round_result" || phase === "match_result" || phase === "reward_summary") && game.lastClash) {
    const winner: "player" | "opponent" | "draw" =
      game.lastClash.winner === "player" ? "player" : game.lastClash.winner === "enemy" ? "opponent" : "draw";
    return { kind: "round_result", winner, damage: game.lastClash.damage };
  }
  // your_turn fallback covers player_turn, card_preview, battle_intro, damage_apply
  return { kind: "your_turn" };
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

function startTurnDeadline() {
  return Date.now() + TURN_SECONDS * 1000;
}

function normalizeLoadedAiGame(game: GameState | null): GameState | null {
  if (!game) return null;

  if (game.phase === "card_preview") {
    return {
      ...game,
      phase: "player_turn",
      round: {
        ...game.round,
        playerCardId: undefined,
        playerEnergyBid: 0,
        playerDamageBoost: false,
      },
    };
  }

  if (game.phase === "player_turn" && !game.turnDeadlineAt) {
    return { ...game, turnDeadlineAt: startTurnDeadline() };
  }

  return game;
}

function rebuildPendingOutcomeFromRound(game: GameState) {
  const playerCardId = game.round.playerCardId;
  const enemyCardId = game.round.enemyCardId;
  if (!playerCardId || !enemyCardId) return null;

  const playerCard = findCardInHand(game.player.hand, playerCardId);
  const enemyCard = findCardInHand(game.enemy.hand, enemyCardId);
  if (!playerCard || !enemyCard) return null;

  const enemyMove: EnemyMove = {
    card: enemyCard,
    energy: game.round.enemyEnergyBid,
    damageBoost: Boolean(game.round.enemyDamageBoost),
  };
  const outcome = resolveRound(
    game.player,
    game.enemy,
    playerCard,
    game.round.playerEnergyBid,
    Boolean(game.round.playerDamageBoost),
    game.first,
    game.round.round,
    enemyMove,
  );

  return { outcome, enemyMove };
}

function createKnownEnemyMoveFromHumanMove(game: GameState, move: HumanFirstMove): KnownEnemyMove | null {
  const card = findCardInHand(game.enemy.hand, move.cardId);
  if (!card) return null;

  return {
    card,
    ...(typeof move.energy === "number" ? { energy: move.energy } : {}),
    ...(typeof move.boosted === "boolean" ? { damageBoost: move.boosted } : {}),
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

function getHumanSocketUser(telegramPlayer: TelegramPlayer | undefined, stableName: string) {
  if (telegramPlayer?.telegramId || telegramPlayer?.name || telegramPlayer?.username) return telegramPlayer;
  return stableName ? { name: stableName } : telegramPlayer;
}

function isSocketOpen(socket: WebSocket | null): socket is WebSocket {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}

function schedule(callback: () => void, delay: number) {
  const timer = window.setTimeout(callback, delay);
  return () => window.clearTimeout(timer);
}

function resetSoundCues(soundCueRef: { current: { turn: string; splash: string; matchEnd: string; opponentMove: string } }) {
  soundCueRef.current = { turn: "", splash: "", matchEnd: "", opponentMove: "" };
}

function playOpponentMoveCue(
  soundCueRef: { current: { opponentMove: string } },
  round: number,
  cardId: string | undefined,
) {
  const signature = `${round}:${cardId ?? "unknown"}`;
  if (soundCueRef.current.opponentMove === signature) return;
  soundCueRef.current.opponentMove = signature;
  playSound("opponentMove", 0.38);
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

function showsResolvedClash(phase: Phase) {
  return ["round_result", "match_result", "reward_summary"].includes(phase);
}

function getActiveHand(phase: Phase): Side | null {
  if (phase === "player_turn" || phase === "card_preview") return "player";
  if (phase === "opponent_turn") return "enemy";
  return null;
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
