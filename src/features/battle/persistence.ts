import type { GameState } from "./model/types";

// Bumped any time the GameState shape changes in a non-back-compat way; older
// payloads are silently discarded so a stale resume never crashes the app.
const STORAGE_KEY = "nexus.battle.session.v1";

type Envelope = {
  v: 1;
  savedAt: number;
  game: GameState;
};

export function saveBattleSession(game: GameState) {
  if (typeof window === "undefined") return;
  try {
    const envelope: Envelope = { v: 1, savedAt: Date.now(), game };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // localStorage may be full or disabled; resume is a best-effort feature.
  }
}

export function loadBattleSession(): GameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope | { v?: number };
    if (!parsed || parsed.v !== 1) return null;
    const game = (parsed as Envelope).game;
    if (!game || !game.player || !game.enemy) return null;
    return game;
  } catch {
    return null;
  }
}

export function clearBattleSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}

export function hasBattleSession() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
