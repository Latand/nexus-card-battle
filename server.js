/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("node:http");
const crypto = require("node:crypto");
const next = require("next");
const { WebSocketServer } = require("ws");
const { cards } = require("./src/features/battle/model/cards.ts");

const dev = process.argv.includes("--dev") || process.env.NODE_ENV === "development";
const hostname = getCliValue("--hostname") || process.env.HOSTNAME || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);

let requestHandler = (_request, response) => {
  response.statusCode = 503;
  response.end("Server is starting.");
};
const server = createServer((request, response) => {
  requestHandler(request, response);
});
const app = next({ dev, hostname, port, httpServer: server });
const handle = app.getRequestHandler();

const sessions = new Map();
const matches = new Map();
let waitingSessionId = null;
const BATTLE_HAND_SIZE = 4;
const MIN_DECK_SIZE = 9;
const TURN_SECONDS = Number.parseInt(process.env.PVP_TURN_SECONDS || "75", 10);
const TURN_TIMEOUT_GRACE_SECONDS = Number.parseInt(process.env.PVP_TURN_TIMEOUT_GRACE_SECONDS || "10", 10);
const activeCardIds = new Set(cards.map((card) => card.id));

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
      queuedDeckIds: [],
      queuedCollectionIds: [],
      matchId: null,
    };

    sessions.set(session.id, session);
    send(session, { type: "session", clientId: session.id });

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

  wss.on("close", () => {
    clearInterval(heartbeat);
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
    joinHumanQueue(session, message);
    return;
  }

  if (message.type === "cancel_queue") {
    cancelQueue(session);
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

  if (message.type === "ping") {
    send(session, { type: "pong" });
  }
}

function joinHumanQueue(session, message) {
  const deckIds = sanitizeStringArray(message.deckIds);
  const collectionIds = sanitizeStringArray(message.collectionIds);
  session.user = sanitizeUser(message.user);

  const deckError = validateKnownCardIds(deckIds, "deck");
  if (deckError) {
    sendError(session, deckError);
    return;
  }

  const collectionError = validateKnownCardIds(collectionIds, "collection");
  if (collectionError) {
    sendError(session, collectionError);
    return;
  }

  if (deckIds.length < MIN_DECK_SIZE) {
    sendError(session, `Deck must contain at least ${MIN_DECK_SIZE} cards.`);
    return;
  }

  const missingCollectionIds = getMissingCollectionDeckIds(deckIds, collectionIds);
  if (missingCollectionIds.length > 0) {
    sendError(session, `Deck contains cards outside the collection: ${missingCollectionIds.join(", ")}`);
    return;
  }

  leaveMatch(session);
  cancelQueue(session, { silent: true });

  session.queuedDeckIds = deckIds;
  session.queuedCollectionIds = collectionIds;

  if (waitingSessionId && waitingSessionId !== session.id) {
    const opponent = sessions.get(waitingSessionId);
    waitingSessionId = null;

    if (opponent && isOpen(opponent.ws) && opponent.matchId === null) {
      createMatch(opponent, session);
      return;
    }
  }

  waitingSessionId = session.id;
  send(session, { type: "queued" });
}

function cancelQueue(session, options = {}) {
  if (waitingSessionId === session.id) {
    waitingSessionId = null;
  }

  session.queuedDeckIds = [];
  session.queuedCollectionIds = [];

  if (!options.silent) {
    send(session, { type: "queue_cancelled" });
  }
}

function createMatch(left, right) {
  const hands = dealBattleHands(left.queuedDeckIds, right.queuedDeckIds);
  const match = {
    id: createId("match"),
    playerIds: [left.id, right.id],
    firstPlayerId: left.id,
    round: 1,
    moves: {},
    expectedPlayerId: left.id,
    turnTimer: null,
    turnTimerToken: 0,
    players: {
      [left.id]: {
        id: left.id,
        name: getSessionDisplayName(left),
        telegramId: left.user?.telegramId,
        deckIds: left.queuedDeckIds,
        collectionIds: left.queuedCollectionIds,
        handIds: hands.left,
        usedCardIds: [],
      },
      [right.id]: {
        id: right.id,
        name: getSessionDisplayName(right),
        telegramId: right.user?.telegramId,
        deckIds: right.queuedDeckIds,
        collectionIds: right.queuedCollectionIds,
        handIds: hands.right,
        usedCardIds: [],
      },
    },
  };

  left.matchId = match.id;
  right.matchId = match.id;
  left.queuedDeckIds = [];
  right.queuedDeckIds = [];
  left.queuedCollectionIds = [];
  right.queuedCollectionIds = [];
  matches.set(match.id, match);
  startTurnTimer(match, match.firstPlayerId);

  for (const playerId of match.playerIds) {
    const player = sessions.get(playerId);
    const opponentId = getOpponentId(match, playerId);

    send(player, {
      type: "match_ready",
      matchId: match.id,
      playerId,
      opponentId,
      firstPlayerId: match.firstPlayerId,
      players: match.players,
      round: match.round,
    });
  }
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

  if (!player.handIds.includes(move.cardId)) {
    sendError(session, "Card is not in the battle hand.");
    return;
  }

  if (player.usedCardIds.includes(move.cardId)) {
    sendError(session, "Card was already used.");
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
  startTurnTimer(match, nextFirstPlayerId);
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

  for (const playerId of match.playerIds) {
    const player = sessions.get(playerId);
    if (player?.matchId === match.id) {
      player.matchId = null;
    }
  }

  matches.delete(match.id);
}

function cleanupSession(session) {
  if (!sessions.has(session.id)) return;

  cancelQueue(session, { silent: true });
  leaveMatch(session);
  sessions.delete(session.id);
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

function sendError(session, message) {
  send(session, { type: "error", message });
}

function isOpen(ws) {
  return ws && ws.readyState === 1;
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

function sanitizeShortString(value, maxLength) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function getSessionDisplayName(session) {
  return session.user?.name || session.user?.username || "Гравець";
}

function selectBattleHandIds(deckIds) {
  return shuffle(deckIds).slice(0, BATTLE_HAND_SIZE);
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

function getCliValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
