"use client";

import { useEffect, useState } from "react";
import { readStableSessionName, rememberStableSessionName, resolveStableUserName } from "./sessionName";

export type LobbyChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
};

type OnlineCountMessage = {
  type: "online_count";
  count: number;
};

type LobbyState = {
  onlineCount: number | null;
  sessionId: string;
  playerName: string;
  chatMessages: LobbyChatMessage[];
};

const CHAT_LIMIT = 200;
const CHAT_TEXT_LIMIT = 240;
const NAME_FALLBACK = "Гравець";

let lobbySocket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUserName = "";
const subscribers = new Set<() => void>();
const lobbyState: LobbyState = {
  onlineCount: null,
  sessionId: "",
  playerName: "",
  chatMessages: [],
};

// Listens to the shared lobby WebSocket and exposes the latest broadcast count.
// Returns `null` until the first `online_count` message arrives so callers can
// distinguish "haven't heard from the server yet" from a real "0 online".
export function useOnlineCount(): number | null {
  const [count, setCount] = useState(lobbyState.onlineCount);

  useEffect(() => {
    return subscribeLobby(() => setCount(lobbyState.onlineCount));
  }, []);

  return count;
}

export function useLobbyChat(userName?: string) {
  const [snapshot, setSnapshot] = useState<LobbyState>(() => ({ ...lobbyState, chatMessages: [...lobbyState.chatMessages] }));

  useEffect(() => {
    return subscribeLobby(() => setSnapshot({ ...lobbyState, chatMessages: [...lobbyState.chatMessages] }));
  }, []);

  useEffect(() => {
    setLobbyUserName(userName);
  }, [userName]);

  return {
    ...snapshot,
    sendMessage: sendLobbyChatMessage,
  };
}

export function parseOnlineCountMessage(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const message = parsed as Partial<OnlineCountMessage>;
  if (message.type !== "online_count") return null;
  if (typeof message.count !== "number" || !Number.isFinite(message.count) || message.count < 0) return null;
  return Math.floor(message.count);
}

function subscribeLobby(listener: () => void) {
  subscribers.add(listener);
  ensureLobbySocket();
  listener();

  return () => {
    subscribers.delete(listener);
    if (subscribers.size > 0) return;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try {
      lobbySocket?.close();
    } catch {
      // Closing an already-closed socket is fine; nothing to do.
    }
    lobbySocket = null;
  };
}

function ensureLobbySocket() {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return;
  if (lobbySocket && (lobbySocket.readyState === WebSocket.CONNECTING || lobbySocket.readyState === WebSocket.OPEN)) return;

  const socket = new WebSocket(getPresenceSocketUrl());
  lobbySocket = socket;

  socket.addEventListener("open", () => {
    if (!pendingUserName) pendingUserName = readStableSessionName();
    sendLobbyUserName();
  });

  socket.addEventListener("message", (event) => {
    handleLobbySocketMessage(event.data);
  });

  socket.addEventListener("close", () => {
    if (lobbySocket === socket) lobbySocket = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    try {
      socket.close();
    } catch {
      // The close path schedules reconnect when there are still subscribers.
    }
  });
}

function scheduleReconnect() {
  if (subscribers.size === 0 || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureLobbySocket();
  }, 1000);
}

function handleLobbySocketMessage(raw: unknown) {
  if (typeof raw !== "string") return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const message = parsed as Record<string, unknown>;

  if (message.type === "online_count") {
    const count = parseOnlineCountMessage(raw);
    if (count !== null) {
      lobbyState.onlineCount = count;
      notifyLobbySubscribers();
    }
    return;
  }

  if (message.type === "session") {
    if (typeof message.clientId === "string") lobbyState.sessionId = message.clientId;
    if (typeof message.playerName === "string") {
      const playerName = message.playerName.trim().slice(0, 80);
      if (!pendingUserName) {
        const stableName = rememberStableSessionName(playerName);
        if (stableName) pendingUserName = stableName;
      }
      lobbyState.playerName = pendingUserName || playerName;
    }
    notifyLobbySubscribers();
    return;
  }

  if (message.type === "chat_history") {
    lobbyState.chatMessages = normalizeLobbyChatHistory(message.messages);
    notifyLobbySubscribers();
    return;
  }

  if (message.type === "chat_message") {
    const chatMessage = normalizeLobbyChatMessage(message);
    if (!chatMessage) return;
    lobbyState.chatMessages = appendLobbyChatMessage(lobbyState.chatMessages, chatMessage);
    notifyLobbySubscribers();
  }
}

function setLobbyUserName(userName: string | undefined) {
  const next = resolveStableUserName(userName);
  if (pendingUserName === next) return;
  pendingUserName = next;
  sendLobbyUserName();
}

function sendLobbyUserName() {
  if (!pendingUserName || !isLobbySocketOpen()) return;
  lobbySocket?.send(JSON.stringify({ type: "set_user", user: { name: pendingUserName } }));
}

function sendLobbyChatMessage(value: string) {
  const text = value.replace(/\s+/g, " ").trim().slice(0, CHAT_TEXT_LIMIT);
  if (!text || !isLobbySocketOpen()) return false;
  lobbySocket?.send(JSON.stringify({ type: "chat_message", text }));
  return true;
}

function normalizeLobbyChatHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeLobbyChatMessage).filter((message): message is LobbyChatMessage => Boolean(message)).slice(-CHAT_LIMIT);
}

function normalizeLobbyChatMessage(value: unknown): LobbyChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.authorId !== "string" || !record.authorId) return null;
  if (typeof record.text !== "string" || !record.text.trim()) return null;

  return {
    id: record.id,
    authorId: record.authorId,
    authorName: typeof record.authorName === "string" && record.authorName.trim() ? record.authorName.trim().slice(0, 80) : NAME_FALLBACK,
    text: record.text.trim().slice(0, CHAT_TEXT_LIMIT),
    createdAt: typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
  };
}

function appendLobbyChatMessage(messages: LobbyChatMessage[], message: LobbyChatMessage) {
  const withoutDuplicate = messages.filter((item) => item.id !== message.id);
  return [...withoutDuplicate, message].slice(-CHAT_LIMIT);
}

function notifyLobbySubscribers() {
  subscribers.forEach((listener) => listener());
}

function isLobbySocketOpen() {
  return Boolean(lobbySocket && lobbySocket.readyState === WebSocket.OPEN);
}

function getPresenceSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
