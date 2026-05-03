export const ELO_WINDOW_BASE = 100;
export const ELO_WINDOW_STEP_SECONDS = 5;
export const ELO_WINDOW_DROP_AFTER_SECONDS = 60;

export type MatchmakingClock = () => number;

export type MatchmakingSession<TPayload = unknown> = {
  sessionId: string;
  eloRating: number;
  payload: TPayload;
};

type QueuedEntry<TPayload> = MatchmakingSession<TPayload> & { queuedAt: number };

export type MatchmakingPair<TPayload = unknown> = {
  left: MatchmakingSession<TPayload>;
  right: MatchmakingSession<TPayload>;
};

export class MatchmakingQueue<TPayload = unknown> {
  private readonly entries = new Map<string, QueuedEntry<TPayload>>();
  private readonly clock: MatchmakingClock;

  constructor(options: { clock?: MatchmakingClock } = {}) {
    this.clock = options.clock ?? Date.now;
  }

  size(): number {
    return this.entries.size;
  }

  has(sessionId: string): boolean {
    return this.entries.has(sessionId);
  }

  enqueue(session: MatchmakingSession<TPayload>): void {
    this.entries.set(session.sessionId, {
      ...session,
      queuedAt: this.clock(),
    });
  }

  dequeue(sessionId: string): boolean {
    return this.entries.delete(sessionId);
  }

  // Returns 0..N pairs. Each call drains as many mutually-acceptable pairs as
  // the current windows allow at the current clock value, removing both sides
  // of every paired match from the queue.
  tryPair(): MatchmakingPair<TPayload>[] {
    const now = this.clock();
    const pairs: MatchmakingPair<TPayload>[] = [];

    while (true) {
      const next = this.findNextPair(now);
      if (!next) break;

      this.entries.delete(next.left.sessionId);
      this.entries.delete(next.right.sessionId);
      pairs.push({
        left: toPublicSession(next.left),
        right: toPublicSession(next.right),
      });
    }

    return pairs;
  }

  private findNextPair(now: number): { left: QueuedEntry<TPayload>; right: QueuedEntry<TPayload> } | null {
    // Sort by queuedAt so the longest-waiting candidate is served first; ties
    // are broken by sessionId for determinism.
    const queued = [...this.entries.values()].sort((a, b) => {
      if (a.queuedAt !== b.queuedAt) return a.queuedAt - b.queuedAt;
      return a.sessionId < b.sessionId ? -1 : 1;
    });

    for (let i = 0; i < queued.length; i += 1) {
      const left = queued[i];
      let bestRight: QueuedEntry<TPayload> | null = null;
      let bestEloDiff = Number.POSITIVE_INFINITY;

      for (let j = 0; j < queued.length; j += 1) {
        if (i === j) continue;
        const right = queued[j];
        if (!isMutuallyAcceptable(left, right, now)) continue;

        const diff = Math.abs(left.eloRating - right.eloRating);
        if (diff < bestEloDiff) {
          bestEloDiff = diff;
          bestRight = right;
        }
      }

      if (bestRight) {
        return { left, right: bestRight };
      }
    }

    return null;
  }
}

function toPublicSession<TPayload>(entry: QueuedEntry<TPayload>): MatchmakingSession<TPayload> {
  return {
    sessionId: entry.sessionId,
    eloRating: entry.eloRating,
    payload: entry.payload,
  };
}

function isMutuallyAcceptable<TPayload>(
  left: QueuedEntry<TPayload>,
  right: QueuedEntry<TPayload>,
  now: number,
): boolean {
  return acceptsCandidate(left, right, now) && acceptsCandidate(right, left, now);
}

function acceptsCandidate<TPayload>(
  asker: QueuedEntry<TPayload>,
  candidate: QueuedEntry<TPayload>,
  now: number,
): boolean {
  const secondsWaited = Math.max(0, (now - asker.queuedAt) / 1000);
  if (secondsWaited >= ELO_WINDOW_DROP_AFTER_SECONDS) return true;
  const window = ELO_WINDOW_BASE + (secondsWaited / ELO_WINDOW_STEP_SECONDS) * ELO_WINDOW_BASE;
  return Math.abs(asker.eloRating - candidate.eloRating) <= window;
}
