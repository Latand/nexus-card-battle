export type PresenceSession = { id: string };

export type OnlinePresenceSendError = {
  sessionId: string;
  error: unknown;
};

export type OnlinePresenceBroadcastOptions = {
  send: (sessionId: string, payload: { type: "online_count"; count: number }) => void;
  onSendError?: (failure: OnlinePresenceSendError) => void;
};

export class OnlinePresence {
  private readonly sessionIds = new Set<string>();

  add(session: PresenceSession): void {
    if (!session || typeof session.id !== "string" || session.id.length === 0) return;
    this.sessionIds.add(session.id);
  }

  remove(session: PresenceSession): void {
    if (!session || typeof session.id !== "string" || session.id.length === 0) return;
    this.sessionIds.delete(session.id);
  }

  has(sessionId: string): boolean {
    return this.sessionIds.has(sessionId);
  }

  count(): number {
    return this.sessionIds.size;
  }

  // Invokes `send` once per active session with the current count. A throw from
  // any single send is caught and reported via `onSendError` so a failing
  // socket cannot prevent the broadcast from reaching the rest of the room.
  broadcastCount(options: OnlinePresenceBroadcastOptions): void {
    const payload = { type: "online_count" as const, count: this.sessionIds.size };
    for (const sessionId of this.sessionIds) {
      try {
        options.send(sessionId, payload);
      } catch (error) {
        options.onSendError?.({ sessionId, error });
      }
    }
  }
}
