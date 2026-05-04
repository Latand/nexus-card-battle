"use client";

const STABLE_SESSION_NAME_KEY = "nexus:stable-session-name";
const NAME_FALLBACK = "Гравець";
const NAME_LIMIT = 80;

export function readStableSessionName() {
  if (typeof window === "undefined") return "";

  try {
    return normalizeSessionName(window.localStorage.getItem(STABLE_SESSION_NAME_KEY));
  } catch {
    return "";
  }
}

export function rememberStableSessionName(value: unknown) {
  const name = normalizeSessionName(value);
  if (!name || typeof window === "undefined") return "";

  try {
    window.localStorage.setItem(STABLE_SESSION_NAME_KEY, name);
  } catch {
    // Storage can be blocked in private contexts; the in-memory session name still works.
  }

  return name;
}

export function resolveStableUserName(userName: string | undefined) {
  const explicitName = normalizeSessionName(userName);
  if (explicitName) return explicitName;
  return readStableSessionName();
}

function normalizeSessionName(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, NAME_LIMIT);
  return trimmed && trimmed !== NAME_FALLBACK ? trimmed : "";
}
