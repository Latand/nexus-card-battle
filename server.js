/* eslint-disable @typescript-eslint/no-require-imports */
// bun runtime resolves .ts requires natively via the bun server.js start
// command (see package.json `start`/`dev`); do not switch to plain node here.
const { createServer } = require("node:http");
const crypto = require("node:crypto");
const next = require("next");
const { WebSocketServer } = require("ws");
const { cards } = require("./src/features/battle/model/cards.ts");
const { getMongoPlayerProfileStore } = require("./src/features/player/profile/mongo.ts");
const {
  computeLevelFromXp,
  createNewStoredPlayerProfile,
  isSamePlayerIdentity,
  parsePlayerIdentity,
  toPlayerProfile,
} = require("./src/features/player/profile/types.ts");
const { getOwnedCardIds, addToInventory } = require("./src/features/inventory/inventoryOps.ts");
const { computeLevelUpBonusForRange } = require("./src/features/player/profile/progression.ts");
const { applyAndSummarizeMatchRewards, applyPvpMatchRewardsForBothSides } = require("./src/features/player/profile/api.ts");
const { makeFighter } = require("./src/features/battle/model/domain/fighters.ts");
const { resolveRound } = require("./src/features/battle/model/domain/roundResolver.ts");
const { DAMAGE_BOOST_COST } = require("./src/features/battle/model/constants.ts");
const { MatchmakingQueue } = require("./src/features/matchmaking/queue.ts");
const { OnlinePresence } = require("./src/features/presence/onlinePresence.ts");

const dev = process.argv.includes("--dev") || process.env.NODE_ENV === "development";
const hostname = getCliValue("--hostname") || process.env.HOSTNAME || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);

let requestHandler = (_request, response) => {
  response.statusCode = 503;
  response.end("Server is starting.");
};
const server = createServer((request, response) => {
  if (handleTestProfileRequest(request, response)) return;
  requestHandler(request, response);
});
const app = next({ dev, hostname, port, httpServer: server });
const handle = app.getRequestHandler();

const sessions = new Map();
const matches = new Map();
const chatHistory = [];
const testPlayerProfileStore = process.env.NEXUS_TEST_PROFILE_STORE === "1" ? createMemoryPlayerProfileStore() : null;
const matchmakingQueue = new MatchmakingQueue();
const onlinePresence = new OnlinePresence();
const BATTLE_HAND_SIZE = 4;
const MIN_DECK_SIZE = 9;
const MAX_CHAT_MESSAGES = 200;
const MAX_CHAT_TEXT_LENGTH = 240;
const TURN_SECONDS = Number.parseInt(process.env.PVP_TURN_SECONDS || "75", 10);
const TURN_TIMEOUT_GRACE_SECONDS = Number.parseInt(process.env.PVP_TURN_TIMEOUT_GRACE_SECONDS || "10", 10);
const MATCHMAKING_TICK_MS = Number.parseInt(process.env.PVP_MATCHMAKING_TICK_MS || "5000", 10);
const activeCardIds = new Set(cards.map((card) => card.id));
const GUEST_NAME_ADJECTIVES = [
  "Веселий",
  "Сміливий",
  "Хитрий",
  "Швидкий",
  "Зоряний",
  "Бадьорий",
  "Мудрий",
  "Дикий",
  "Гучний",
  "Сяйний",
  "Впертий",
  "Таємний",
];
const GUEST_NAME_NOUNS = [
  "Панда",
  "Фенікс",
  "Єнот",
  "Краб",
  "Дракон",
  "Бобер",
  "Сокіл",
  "Кіт",
  "Бізон",
  "Лемур",
  "Вомбат",
  "Лис",
];

app.prepare().then(() => {
  requestHandler = (request, response) => {
    handle(request, response);
  };

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname !== "/ws") {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    const session = {
      id: createId("tab"),
      ws,
      alive: true,
      user: null,
      guestName: createGuestSessionName(),
      queuedDeckIds: [],
      queuedCollectionIds: [],
      matchId: null,
    };

    sessions.set(session.id, session);
    onlinePresence.add(session);
    send(session, { type: "session", clientId: session.id, playerName: session.guestName });
    send(session, { type: "chat_history", messages: chatHistory });
    broadcastOnlineCount();

    ws.on("pong", () => {
      session.alive = true;
    });

    ws.on("message", (data) => {
      let message;

      try {
        message = JSON.parse(String(data));
      } catch {
        sendError(session, "Bad JSON message.");
        return;
      }

      handleSocketMessage(session, message);
    });

    ws.on("close", () => {
      cleanupSession(session);
    });

    ws.on("error", () => {
      cleanupSession(session);
    });
  });

  const heartbeat = setInterval(() => {
    for (const session of sessions.values()) {
      if (!session.alive) {
        cleanupSession(session);
        session.ws.terminate();
        continue;
      }

      session.alive = false;
      session.ws.ping();
    }
  }, 30_000);

  // Re-attempt pairing periodically so already-queued sessions whose ELO
  // window has expanded (without any new enqueue triggering it) still match.
  const matchmakingTick = setInterval(() => {
    drainMatchmakingPairs();
  }, MATCHMAKING_TICK_MS);

  wss.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(matchmakingTick);
  });

  server.listen(port, hostname, () => {
    console.log(`> Нексус server listening on http://${hostname}:${port}`);
  });
});

function handleSocketMessage(session, message) {
  if (!message || typeof message.type !== "string") {
    sendError(session, "Message type is required.");
    return;
  }

  if (message.type === "join_human") {
    joinHumanQueue(session, message).catch((error) => {
      console.error("PvP join failed.", error);
      sendError(session, "Player profile is unavailable.");
    });
    return;
  }

  if (message.type === "cancel_queue") {
    cancelQueue(session);
    return;
  }

  if (message.type === "set_user") {
    session.user = sanitizeUser(message.user);
    send(session, { type: "session", clientId: session.id, playerName: getSessionDisplayName(session) });
    return;
  }

  if (message.type === "submit_move") {
    submitMove(session, message);
    return;
  }

  if (message.type === "turn_timeout") {
    submitTurnTimeout(session, message);
    return;
  }

  if (message.type === "leave_match") {
    leaveMatch(session);
    return;
  }

  if (message.type === "chat_message") {
    publishChatMessage(session, message);
    return;
  }

  if (message.type === "ping") {
    send(session, { type: "pong" });
  }
}

function publishChatMessage(session, message) {
  const text = sanitizeChatText(message.text);
  if (!text) {
    sendError(session, "Chat message is empty.");
    return;
  }

  const chatMessage = {
    id: createId("chat"),
    authorId: session.id,
    authorName: getSessionDisplayName(session),
    text,
    createdAt: Date.now(),
  };

  chatHistory.push(chatMessage);
  if (chatHistory.length > MAX_CHAT_MESSAGES) {
    chatHistory.splice(0, chatHistory.length - MAX_CHAT_MESSAGES);
  }

  for (const activeSession of sessions.values()) {
    send(activeSession, { type: "chat_message", ...chatMessage });
  }
}

async function joinHumanQueue(session, message) {
  const clientDeckIds = sanitizeStringArray(message.deckIds);
  const clientCollectionIds = sanitizeStringArray(message.collectionIds);
  session.user = sanitizeUser(message.user);

  const deckError = validateKnownCardIds(clientDeckIds, "deck");
  if (deckError) {
    sendError(session, deckError);
    return;
  }

  const collectionError = validateKnownCardIds(clientCollectionIds, "collection");
  if (collectionError) {
    sendError(session, collectionError);
    return;
  }

  if (Array.isArray(message.deckIds) && clientDeckIds.length < MIN_DECK_SIZE) {
    sendError(session, `Deck must contain at least ${MIN_DECK_SIZE} cards.`);
    return;
  }

  const missingCollectionIds = Array.isArray(message.collectionIds)
    ? getMissingCollectionDeckIds(clientDeckIds, clientCollectionIds)
    : [];
  if (missingCollectionIds.length > 0) {
    sendError(session, `Deck contains cards outside the collection: ${missingCollectionIds.join(", ")}`);
    return;
  }

  const identity = parseSocketPlayerIdentity(message.identity);
  if (!identity) {
    sendError(session, "Player identity is required for PvP.");
    return;
  }

  const profile = await getPlayerProfileStore().findOrCreateByIdentity(identity);
  const profileLoadout = validateProfileBattleLoadout(profile);
  if (profileLoadout.error) {
    sendError(session, profileLoadout.error);
    return;
  }

  if (clientDeckIds.length > 0 && !sameStringArray(clientDeckIds, profileLoadout.deckIds)) {
    sendError(session, "PvP deck must match the saved profile deck.");
    return;
  }

  if (!sessions.has(session.id) || !isOpen(session.ws)) return;

  leaveMatch(session);
  cancelQueue(session, { silent: true });

  // ELO is read fresh per enqueue. A failure here MUST surface as an error to
  // the client — silently substituting a default would corrupt matchmaking
  // (everyone-defaults-to-1000 collapses skill-based pairing).
  let queueEloRating;
  try {
    queueEloRating = toPlayerProfile(profile).eloRating;
  } catch (error) {
    console.error("PvP queue ELO read failed.", error);
    sendError(session, "Player profile is unavailable.");
    return;
  }

  session.queuedDeckIds = profileLoadout.deckIds;
  session.queuedCollectionIds = profileLoadout.collectionIds;
  session.queuedIdentity = identity;

  matchmakingQueue.enqueue({
    sessionId: session.id,
    eloRating: queueEloRating,
    payload: { identity },
  });

  drainMatchmakingPairs();

  // Only ack `queued` if the drain did not immediately pair this session,
  // matching the prior FIFO semantics (a paired session goes straight to
  // `match_ready`).
  if (matchmakingQueue.has(session.id)) {
    send(session, { type: "queued" });
  }
}

function cancelQueue(session, options = {}) {
  matchmakingQueue.dequeue(session.id);

  session.queuedDeckIds = [];
  session.queuedCollectionIds = [];
  session.queuedIdentity = null;

  if (!options.silent) {
    send(session, { type: "queue_cancelled" });
  }
}

function drainMatchmakingPairs() {
  const pairs = matchmakingQueue.tryPair();
  for (const pair of pairs) {
    const left = sessions.get(pair.left.sessionId);
    const right = sessions.get(pair.right.sessionId);
    const leftReady = isQueueReadySession(left);
    const rightReady = isQueueReadySession(right);

    if (leftReady && rightReady) {
      createMatch(left, right);
      continue;
    }

    // A paired session vanished or already entered a match between the queue
    // returning it and us materializing the match. Re-enqueue the survivor at
    // its captured ELO so the next tick can rematch it without an ELO re-read.
    if (leftReady) reenqueueWithCapturedElo(left, pair.left.eloRating);
    if (rightReady) reenqueueWithCapturedElo(right, pair.right.eloRating);
  }
}

function isQueueReadySession(session) {
  return Boolean(session && isOpen(session.ws) && session.matchId === null && session.queuedIdentity);
}

function reenqueueWithCapturedElo(session, eloRating) {
  if (matchmakingQueue.has(session.id)) return;
  matchmakingQueue.enqueue({
    sessionId: session.id,
    eloRating,
    payload: { identity: session.queuedIdentity },
  });
}

function createMatch(left, right) {
  const hands = dealBattleHands(left.queuedDeckIds, right.queuedDeckIds);
  const leftFighter = createMatchFighter(left, hands.left);
  const rightFighter = createMatchFighter(right, hands.right);
  const match = {
    id: createId("match"),
    playerIds: [left.id, right.id],
    firstPlayerId: left.id,
    round: 1,
    moves: {},
    expectedPlayerId: left.id,
    turnTimer: null,
    turnTimerToken: 0,
    rewardsApplied: false,
    players: {
      [left.id]: {
        id: left.id,
        name: getSessionDisplayName(left),
        telegramId: left.user?.telegramId,
        identity: left.queuedIdentity,
        deckIds: left.queuedDeckIds,
        collectionIds: left.queuedCollectionIds,
        handIds: hands.left,
        usedCardIds: [],
        fighter: leftFighter,
      },
      [right.id]: {
        id: right.id,
        name: getSessionDisplayName(right),
        telegramId: right.user?.telegramId,
        identity: right.queuedIdentity,
        deckIds: right.queuedDeckIds,
        collectionIds: right.queuedCollectionIds,
        handIds: hands.right,
        usedCardIds: [],
        fighter: rightFighter,
      },
    },
  };

  left.matchId = match.id;
  right.matchId = match.id;
  left.queuedDeckIds = [];
  right.queuedDeckIds = [];
  left.queuedCollectionIds = [];
  right.queuedCollectionIds = [];
  left.queuedIdentity = null;
  right.queuedIdentity = null;
  matches.set(match.id, match);
  startTurnTimer(match, match.firstPlayerId);

  const publicPlayers = buildPublicMatchPlayers(match);

  for (const playerId of match.playerIds) {
    const player = sessions.get(playerId);
    const opponentId = getOpponentId(match, playerId);

    send(player, {
      type: "match_ready",
      matchId: match.id,
      playerId,
      opponentId,
      firstPlayerId: match.firstPlayerId,
      players: publicPlayers,
      round: match.round,
    });
  }
}

function buildPublicMatchPlayers(match) {
  const publicPlayers = {};
  for (const id of match.playerIds) {
    const internal = match.players[id];
    if (!internal) continue;
    publicPlayers[id] = {
      id: internal.id,
      name: internal.name,
      telegramId: internal.telegramId,
      deckIds: internal.deckIds,
      collectionIds: internal.collectionIds,
      handIds: internal.handIds,
      usedCardIds: internal.usedCardIds,
    };
  }
  return publicPlayers;
}

function submitMove(session, message) {
  const match = getSessionMatch(session);
  if (!match) {
    sendError(session, "No active match.");
    return;
  }

  if (message.matchId !== match.id || message.round !== match.round) {
    sendError(session, "Move is for a stale match or round.");
    return;
  }

  const move = sanitizeMove(message.move);
  if (!move) {
    sendError(session, "Invalid move.");
    return;
  }

  const player = match.players[session.id];
  const opponentId = getOpponentId(match, session.id);
  const hasFirstMove = Boolean(match.moves[match.firstPlayerId]);

  if (match.expectedPlayerId && session.id !== match.expectedPlayerId) {
    sendError(session, "It is not your turn.");
    return;
  }

  const validationError = validateAuthoritativeMove(player, move);
  if (validationError) {
    sendError(session, validationError);
    return;
  }

  if (session.id !== match.firstPlayerId && !hasFirstMove) {
    sendError(session, "Wait for the first player move.");
    return;
  }

  if (match.moves[session.id]) {
    sendError(session, "Move already submitted.");
    return;
  }

  match.moves[session.id] = move;

  if (session.id === match.firstPlayerId) {
    startTurnTimer(match, opponentId);
    send(session, {
      type: "first_move",
      matchId: match.id,
      round: match.round,
      playerId: session.id,
      opponentId,
      move,
    });
    send(sessions.get(opponentId), {
      type: "first_move",
      matchId: match.id,
      round: match.round,
      playerId: session.id,
      opponentId,
      move: maskMoveForOpponent(move),
    });
    return;
  }

  if (!match.moves[opponentId]) {
    sendError(session, "Opponent move is missing.");
    return;
  }

  const resolvedRound = match.round;
  const resolvedFirstPlayerId = match.firstPlayerId;
  const moves = { ...match.moves };
  const nextFirstPlayerId = getOpponentId(match, resolvedFirstPlayerId);

  for (const [playerId, submittedMove] of Object.entries(moves)) {
    const matchPlayer = match.players[playerId];
    if (matchPlayer && !matchPlayer.usedCardIds.includes(submittedMove.cardId)) {
      matchPlayer.usedCardIds.push(submittedMove.cardId);
    }
  }

  const matchOutcome = applyServerRoundOutcome(match, resolvedFirstPlayerId, moves);

  match.round += 1;
  match.firstPlayerId = nextFirstPlayerId;
  match.expectedPlayerId = nextFirstPlayerId;
  match.moves = {};

  broadcast(match, {
    type: "round_resolved",
    matchId: match.id,
    round: resolvedRound,
    firstPlayerId: resolvedFirstPlayerId,
    nextFirstPlayerId,
    moves,
  });

  if (matchOutcome) {
    finalizePvpMatch(match, matchOutcome).catch((error) => {
      console.error("PvP reward finalization failed.", error);
    });
    return;
  }

  startTurnTimer(match, nextFirstPlayerId);
}

function applyServerRoundOutcome(match, firstPlayerId, moves) {
  const secondPlayerId = getOpponentId(match, firstPlayerId);
  const firstPlayer = match.players[firstPlayerId];
  const secondPlayer = match.players[secondPlayerId];
  const firstMove = moves[firstPlayerId];
  const secondMove = moves[secondPlayerId];
  if (!firstPlayer || !secondPlayer || !firstMove || !secondMove) return null;

  const firstCard = findFighterHandCard(firstPlayer.fighter, firstMove.cardId);
  const secondCard = findFighterHandCard(secondPlayer.fighter, secondMove.cardId);
  if (!firstCard || !secondCard) return null;

  const outcome = resolveRound(
    firstPlayer.fighter,
    secondPlayer.fighter,
    firstCard,
    Number(firstMove.energy) || 0,
    Boolean(firstMove.boosted),
    "player",
    match.round,
    {
      card: secondCard,
      energy: Number(secondMove.energy) || 0,
      damageBoost: Boolean(secondMove.boosted),
    },
  );

  firstPlayer.fighter = outcome.nextPlayer;
  secondPlayer.fighter = outcome.nextEnemy;

  if (!outcome.matchResult) return null;

  const winnerSessionId = outcome.matchResult === "draw"
    ? null
    : outcome.matchResult === "player"
      ? firstPlayerId
      : secondPlayerId;

  return { matchResult: outcome.matchResult, winnerSessionId };
}

function findFighterHandCard(fighter, cardId) {
  return fighter.hand.find((card) => card.id === cardId && !fighter.usedCardIds.includes(cardId));
}

function validateAuthoritativeMove(player, move) {
  if (!player?.handIds?.includes(move.cardId)) return "Card is not in the battle hand.";
  if (player.usedCardIds.includes(move.cardId)) return "Card was already used.";

  const fighter = player.fighter;
  if (!fighter) return "Server has no fighter state for the move.";

  const fighterCard = fighter.hand.find((card) => card.id === move.cardId);
  if (!fighterCard || fighterCard.used || fighter.usedCardIds.includes(move.cardId)) {
    return "Card is not playable on the server fighter.";
  }

  if (move.energy < 0 || move.energy > fighter.energy) {
    return "Energy bid exceeds the fighter's available energy.";
  }

  if (move.boosted && fighter.energy < move.energy + DAMAGE_BOOST_COST) {
    return "Damage boost requires more energy than the fighter has.";
  }

  return null;
}

async function finalizePvpMatch(match, outcome) {
  if (match.rewardsApplied) return;
  match.rewardsApplied = true;
  clearTurnTimer(match);

  const store = getPlayerProfileStore();
  const sides = match.playerIds
    .map((playerId) => {
      const player = match.players[playerId];
      if (!player?.identity) return null;
      return { key: playerId, identity: player.identity, result: bucketForPlayer(playerId, outcome) };
    })
    .filter(Boolean);

  let outcomes = [];
  if (sides.length === 2) {
    outcomes = await applyPvpMatchRewardsForBothSides(store, sides, {
      onEloReadFailure: ({ key, error }) => {
        console.error("PvP ELO read failed for player.", { playerId: key, error });
      },
    });
  } else {
    outcomes = await Promise.all(
      sides.map(async (side) => {
        try {
          const { summary } = await applyAndSummarizeMatchRewards(store, side.identity, { mode: "pvp", result: side.result });
          return { key: side.key, summary };
        } catch (error) {
          return { key: side.key, summary: null, error };
        }
      }),
    );
  }

  for (const { key, summary, error } of outcomes) {
    if (error) console.error("PvP reward apply failed for player.", { playerId: key, error });
    const session = sessions.get(key);
    if (!session || !summary) continue;
    send(session, { type: "reward_summary", matchId: match.id, payload: summary });
  }

  for (const playerId of match.playerIds) {
    const player = sessions.get(playerId);
    if (player?.matchId === match.id) {
      player.matchId = null;
    }
  }

  matches.delete(match.id);
}

function bucketForPlayer(playerId, outcome) {
  if (outcome.matchResult === "draw") return "draw";
  return outcome.winnerSessionId === playerId ? "win" : "loss";
}

function submitTurnTimeout(session, message) {
  const match = getSessionMatch(session);
  if (!match) {
    sendError(session, "No active match.");
    return;
  }

  if (message.matchId !== match.id || message.round !== match.round) {
    sendError(session, "Timeout is for a stale match or round.");
    return;
  }

  if (session.id !== match.expectedPlayerId) {
    sendError(session, "Timeout can only be submitted by the active player.");
    return;
  }

  forfeitMatch(match, session.id, "timeout");
}

function leaveMatch(session) {
  const match = getSessionMatch(session);
  if (!match) return;

  const opponentId = getOpponentId(match, session.id);
  const opponent = sessions.get(opponentId);

  if (opponent) {
    opponent.matchId = null;
    send(opponent, { type: "opponent_left", matchId: match.id });
  }

  session.matchId = null;
  clearTurnTimer(match);
  matches.delete(match.id);
}

function startTurnTimer(match, expectedPlayerId) {
  clearTurnTimer(match);
  match.expectedPlayerId = expectedPlayerId;
  const timeoutMs = Math.max(1, TURN_SECONDS + TURN_TIMEOUT_GRACE_SECONDS) * 1000;
  const token = match.turnTimerToken + 1;
  match.turnTimerToken = token;
  match.turnTimer = setTimeout(() => {
    const current = matches.get(match.id);
    if (!current || current.turnTimerToken !== token || current.expectedPlayerId !== expectedPlayerId) return;

    forfeitMatch(current, expectedPlayerId, "timeout");
  }, timeoutMs);
}

function clearTurnTimer(match) {
  if (match?.turnTimer) {
    clearTimeout(match.turnTimer);
    match.turnTimer = null;
  }
}

function forfeitMatch(match, loserId, reason) {
  const winnerId = getOpponentId(match, loserId);
  clearTurnTimer(match);

  broadcast(match, {
    type: "match_forfeit",
    matchId: match.id,
    round: match.round,
    loserId,
    winnerId,
    reason,
  });

  finalizePvpMatch(match, { matchResult: "player", winnerSessionId: winnerId }).catch((error) => {
    console.error("PvP forfeit reward finalization failed.", error);
  });
}

function cleanupSession(session) {
  if (!sessions.has(session.id)) return;

  cancelQueue(session, { silent: true });

  const activeMatch = getSessionMatch(session);
  if (activeMatch && !activeMatch.rewardsApplied) {
    forfeitMatchByDisconnect(activeMatch, session.id);
  } else {
    leaveMatch(session);
  }

  sessions.delete(session.id);
  onlinePresence.remove(session);
  broadcastOnlineCount();
}

function forfeitMatchByDisconnect(match, loserId) {
  const winnerId = getOpponentId(match, loserId);
  clearTurnTimer(match);

  const winnerSession = sessions.get(winnerId);
  if (winnerSession) {
    send(winnerSession, {
      type: "match_forfeit",
      matchId: match.id,
      round: match.round,
      loserId,
      winnerId,
      reason: "disconnect",
    });
  }

  finalizePvpMatch(match, { matchResult: "player", winnerSessionId: winnerId }).catch((error) => {
    console.error("PvP disconnect reward finalization failed.", error);
  });
}

function getSessionMatch(session) {
  if (!session.matchId) return null;
  return matches.get(session.matchId) || null;
}

function getOpponentId(match, playerId) {
  return match.playerIds.find((id) => id !== playerId);
}

function broadcast(match, message) {
  for (const playerId of match.playerIds) {
    send(sessions.get(playerId), message);
  }
}

function send(session, message) {
  if (!session || !isOpen(session.ws)) return;
  session.ws.send(JSON.stringify(message));
}

function broadcastOnlineCount() {
  onlinePresence.broadcastCount({
    send: (sessionId, payload) => {
      send(sessions.get(sessionId), payload);
    },
    onSendError: ({ sessionId, error }) => {
      console.error("Online presence broadcast failed for session.", { sessionId, error });
    },
  });
}

function sendError(session, message) {
  send(session, { type: "error", message });
}

function getPlayerProfileStore() {
  return testPlayerProfileStore ?? getMongoPlayerProfileStore();
}

function parseSocketPlayerIdentity(value) {
  try {
    return parsePlayerIdentity(value);
  } catch {
    return null;
  }
}

function validateProfileBattleLoadout(profile) {
  const deckIds = getProfileCardIds(profile.deckIds);
  const rawOwnedCardIds = getOwnedCardIdsFromProfile(profile);
  const collectionIds = unique(rawOwnedCardIds.filter((cardId) => activeCardIds.has(cardId)));
  const duplicateDeckIds = duplicateValues(deckIds);

  if (duplicateDeckIds.length > 0) {
    return { error: `Saved deck contains duplicate card ids: ${duplicateDeckIds.join(", ")}` };
  }

  const deckError = validateKnownCardIds(deckIds, "saved deck");
  if (deckError) {
    return { error: deckError };
  }

  if (deckIds.length < MIN_DECK_SIZE) {
    return { error: `Saved deck must contain at least ${MIN_DECK_SIZE} cards.` };
  }

  const missingOwnedIds = getMissingCollectionDeckIds(deckIds, rawOwnedCardIds);
  if (missingOwnedIds.length > 0) {
    return { error: `Saved deck contains non-owned card ids: ${missingOwnedIds.join(", ")}` };
  }

  return { deckIds, collectionIds };
}

function isOpen(ws) {
  return ws && ws.readyState === 1;
}

function getProfileCardIds(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.length > 0);
}

function getOwnedCardIdsFromProfile(profile) {
  if (Array.isArray(profile?.ownedCards) && profile.ownedCards.length > 0) {
    return getOwnedCardIds(profile.ownedCards);
  }
  return getProfileCardIds(profile?.ownedCardIds);
}

function parseOwnedCardsInput(ownedCards, legacyOwnedCardIds) {
  if (Array.isArray(ownedCards)) {
    let result = [];
    for (const entry of ownedCards) {
      if (!entry || typeof entry.cardId !== "string" || !entry.cardId
        || !Number.isInteger(entry.count) || entry.count <= 0) {
        // Test seed endpoint — log loudly so a malformed fixture surfaces in
        // CI rather than silently producing an empty inventory.
        console.warn("/__test/player-profile: dropping malformed ownedCards entry.", { entry });
        continue;
      }
      result = addToInventory(result, entry.cardId, entry.count);
    }
    return result;
  }

  return getProfileCardIds(legacyOwnedCardIds).map((cardId) => ({ cardId, count: 1 }));
}

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string" && item.length > 0))];
}

function validateKnownCardIds(cardIds, source) {
  const unknown = cardIds.filter((cardId) => !activeCardIds.has(cardId));
  if (unknown.length === 0) return null;
  return `Unknown ${source} card ids: ${unknown.join(", ")}`;
}

function getMissingCollectionDeckIds(deckIds, collectionIds) {
  const collection = new Set(collectionIds);
  return deckIds.filter((cardId) => !collection.has(cardId));
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates];
}

function unique(values) {
  return [...new Set(values)];
}

function sanitizeMove(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.cardId !== "string" || value.cardId.length === 0) return null;

  return {
    cardId: value.cardId,
    energy: Math.max(0, Math.min(12, Number.parseInt(String(value.energy ?? 0), 10) || 0)),
    boosted: Boolean(value.boosted),
  };
}

function maskMoveForOpponent(move) {
  return {
    cardId: move.cardId,
  };
}

function sanitizeUser(value) {
  if (!value || typeof value !== "object") return null;

  const telegramId = sanitizeShortString(value.telegramId, 64);
  const name = sanitizeShortString(value.name, 80);
  const username = sanitizeShortString(value.username, 64);

  if (!telegramId && !name && !username) return null;

  return { telegramId, name, username };
}

function sanitizeChatText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_TEXT_LENGTH);
}

function sanitizeShortString(value, maxLength) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function getSessionDisplayName(session) {
  return session.user?.name || session.user?.username || session.guestName || "Гравець";
}

function createGuestSessionName() {
  return `${randomNamePart(GUEST_NAME_ADJECTIVES)} ${randomNamePart(GUEST_NAME_NOUNS)}`;
}

function randomNamePart(parts) {
  return parts[crypto.randomInt(parts.length)];
}

function selectBattleHandIds(deckIds) {
  return shuffle(deckIds).slice(0, BATTLE_HAND_SIZE);
}

function createMatchFighter(session, handIds) {
  const collectionIds = session.queuedCollectionIds.length > 0 ? session.queuedCollectionIds : session.queuedDeckIds;
  const fighter = makeFighter(session.id, getSessionDisplayName(session), "PvP", collectionIds, session.queuedDeckIds);
  const hand = handIds
    .map((cardId) => cards.find((card) => card.id === cardId))
    .filter((card) => Boolean(card))
    .map((card) => ({ ...card, used: false }));

  return { ...fighter, hand };
}

function dealBattleHands(leftDeckIds, rightDeckIds) {
  if (sameStringArray(leftDeckIds, rightDeckIds) && leftDeckIds.length >= BATTLE_HAND_SIZE * 2) {
    const shuffledDeckIds = shuffle(leftDeckIds);

    return {
      left: shuffledDeckIds.slice(0, BATTLE_HAND_SIZE),
      right: shuffledDeckIds.slice(BATTLE_HAND_SIZE, BATTLE_HAND_SIZE * 2),
    };
  }

  let left = selectBattleHandIds(leftDeckIds);
  let right = selectBattleHandIds(rightDeckIds);

  if (sameStringArray(left, right)) {
    right = selectDistinctBattleHandIds(rightDeckIds, left);
  }

  return { left, right };
}

function selectDistinctBattleHandIds(deckIds, otherHandIds) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const handIds = selectBattleHandIds(deckIds);
    if (!sameStringArray(handIds, otherHandIds)) return handIds;
  }

  const differentIds = shuffle(deckIds.filter((cardId) => !otherHandIds.includes(cardId)));
  const sharedIds = shuffle(deckIds.filter((cardId) => otherHandIds.includes(cardId)));
  const fallback = [...differentIds, ...sharedIds].slice(0, BATTLE_HAND_SIZE);

  return fallback.length === BATTLE_HAND_SIZE ? fallback : selectBattleHandIds(deckIds);
}

function sameStringArray(left, right) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function shuffle(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function handleTestProfileRequest(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname !== "/__test/player-profile") return false;

  if (!testPlayerProfileStore) {
    response.statusCode = 404;
    response.end("Not found.");
    return true;
  }

  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: "method_not_allowed" }));
    return true;
  }

  readJsonRequest(request)
    .then((body) => {
      const identity = parsePlayerIdentity(body.identity);
      const seededProfile = testPlayerProfileStore.seedProfile({
        id: sanitizeShortString(body.id, 128) || createId("test_player"),
        identity,
        ownedCards: parseOwnedCardsInput(body.ownedCards, body.ownedCardIds),
        deckIds: getProfileCardIds(body.deckIds),
        starterFreeBoostersRemaining: Number.isInteger(body.starterFreeBoostersRemaining)
          ? Math.max(0, body.starterFreeBoostersRemaining)
          : 0,
        openedBoosterIds: getProfileCardIds(body.openedBoosterIds),
        crystals: nonNegativeIntegerOrUndefined(body.crystals),
        totalXp: nonNegativeIntegerOrUndefined(body.totalXp),
        wins: nonNegativeIntegerOrUndefined(body.wins),
        losses: nonNegativeIntegerOrUndefined(body.losses),
        draws: nonNegativeIntegerOrUndefined(body.draws),
        eloRating: nonNegativeIntegerOrUndefined(body.eloRating),
        avatarUrl: typeof body.avatarUrl === "string" && body.avatarUrl.trim() ? body.avatarUrl.trim() : undefined,
      });

      response.statusCode = 200;
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ player: seededProfile }));
    })
    .catch((error) => {
      response.statusCode = 400;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "invalid_test_profile", message: error.message }));
    });

  return true;
}

function readJsonRequest(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64_000) {
        reject(new Error("request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function createMemoryPlayerProfileStore() {
  const profiles = [];

  return {
    async findOrCreateByIdentity(identity) {
      const existing = profiles.find((profile) => isSamePlayerIdentity(profile.identity, identity));
      if (existing) return existing;

      const profile = createNewStoredPlayerProfile(createId("test_player"), identity);
      profiles.push(profile);
      return profile;
    },
    seedProfile(profile) {
      const definedFields = {};
      for (const [key, value] of Object.entries(profile)) {
        if (value !== undefined) definedFields[key] = value;
      }
      const nextProfile = {
        ...createNewStoredPlayerProfile(profile.id, profile.identity),
        ...definedFields,
      };
      const existingIndex = profiles.findIndex((item) => isSamePlayerIdentity(item.identity, nextProfile.identity));

      if (existingIndex >= 0) profiles[existingIndex] = nextProfile;
      else profiles.push(nextProfile);

      return nextProfile;
    },
    async setAvatarUrl(identity, avatarUrl) {
      const index = profiles.findIndex((profile) => isSamePlayerIdentity(profile.identity, identity));
      if (index < 0) {
        throw new Error("Player profile did not exist for avatar update.");
      }

      profiles[index] = { ...profiles[index], avatarUrl };
      return profiles[index];
    },
    async applyMatchRewards(identity, rewards) {
      const index = profiles.findIndex((profile) => isSamePlayerIdentity(profile.identity, identity));
      if (index < 0) {
        throw new Error("Player profile did not exist for match rewards apply.");
      }

      const current = profiles[index];
      const counterField = rewards.result === "win" ? "wins" : rewards.result === "loss" ? "losses" : "draws";

      const afterIncrement = {
        ...current,
        totalXp: current.totalXp + rewards.deltaXp,
        crystals: current.crystals + rewards.matchCrystals,
        [counterField]: (current[counterField] ?? 0) + 1,
        ...(typeof rewards.eloRating === "number" && Number.isFinite(rewards.eloRating)
          ? { eloRating: Math.max(0, Math.round(rewards.eloRating)) }
          : {}),
      };
      profiles[index] = afterIncrement;

      const xpBeforeMatch = Math.max(0, afterIncrement.totalXp - rewards.deltaXp);
      const oldLevel = computeLevelFromXp(xpBeforeMatch).level;
      const newLevel = computeLevelFromXp(afterIncrement.totalXp).level;
      if (newLevel <= oldLevel) return { profile: afterIncrement, milestoneCardRewards: [] };

      const bonus = computeLevelUpBonusForRange(oldLevel, newLevel);
      let latest = afterIncrement;
      if (bonus > 0) {
        latest = { ...afterIncrement, crystals: afterIncrement.crystals + bonus };
        profiles[index] = latest;
      }

      // Op-C — milestone-card grant. Test-mode store does NOT need to import
      // the full milestones module; the milestone cards are computed inside
      // the Mongo store path. The server-test memory store keeps Op-C empty
      // (the e2e Playwright tests that depend on milestone tiles inject a
      // mocked /api/player/match-finished response anyway).
      return { profile: latest, milestoneCardRewards: [] };
    },
  };
}

function nonNegativeIntegerOrUndefined(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function getCliValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
