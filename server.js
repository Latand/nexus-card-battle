/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("node:http");
const crypto = require("node:crypto");
const next = require("next");
const { WebSocketServer } = require("ws");

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

  if (deckIds.length < 8) {
    sendError(session, "Deck must contain at least 8 cards.");
    return;
  }

  leaveMatch(session);
  cancelQueue(session, { silent: true });

  session.queuedDeckIds = deckIds;
  session.queuedCollectionIds = collectionIds.length > 0 ? collectionIds : deckIds;

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
  const match = {
    id: createId("match"),
    playerIds: [left.id, right.id],
    firstPlayerId: left.id,
    round: 1,
    moves: {},
    players: {
      [left.id]: {
        id: left.id,
        deckIds: left.queuedDeckIds,
        collectionIds: left.queuedCollectionIds,
      },
      [right.id]: {
        id: right.id,
        deckIds: right.queuedDeckIds,
        collectionIds: right.queuedCollectionIds,
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

  const opponentId = getOpponentId(match, session.id);
  const hasFirstMove = Boolean(match.moves[match.firstPlayerId]);

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
    broadcast(match, {
      type: "first_move",
      matchId: match.id,
      round: match.round,
      playerId: session.id,
      opponentId,
      move,
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

  match.round += 1;
  match.firstPlayerId = nextFirstPlayerId;
  match.moves = {};

  broadcast(match, {
    type: "round_resolved",
    matchId: match.id,
    round: resolvedRound,
    firstPlayerId: resolvedFirstPlayerId,
    nextFirstPlayerId,
    moves,
  });
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

function sanitizeMove(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.cardId !== "string" || value.cardId.length === 0) return null;

  return {
    cardId: value.cardId,
    energy: Math.max(0, Math.min(12, Number.parseInt(String(value.energy ?? 0), 10) || 0)),
    boosted: Boolean(value.boosted),
  };
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function getCliValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
