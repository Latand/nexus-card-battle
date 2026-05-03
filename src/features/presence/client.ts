"use client";

import { useEffect, useState } from "react";

type OnlineCountMessage = {
  type: "online_count";
  count: number;
};

// Listens to the presence WebSocket and exposes the latest broadcast count.
// Returns `null` until the first `online_count` message arrives so callers can
// distinguish "haven't heard from the server yet" from a real "0 online".
export function useOnlineCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof WebSocket === "undefined") return;

    let disposed = false;
    const url = getPresenceSocketUrl();
    const socket = new WebSocket(url);

    socket.addEventListener("message", (event) => {
      if (disposed) return;
      const parsed = parseOnlineCountMessage(event.data);
      if (parsed === null) return;
      setCount(parsed);
    });

    return () => {
      disposed = true;
      try {
        socket.close();
      } catch {
        // Closing an already-closed socket is fine; nothing to do.
      }
    };
  }, []);

  return count;
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

function getPresenceSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
