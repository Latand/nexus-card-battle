import { describe, expect, test } from "bun:test";
import { MatchmakingQueue } from "../src/features/matchmaking/queue";

function fakeClock(initial = 0) {
  let now = initial;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
    set(value: number) {
      now = value;
    },
  };
}

describe("MatchmakingQueue", () => {
  test("two sessions within ±100 ELO pair on the next tick", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue<{ name: string }>({ clock: clock.now });

    queue.enqueue({ sessionId: "a", eloRating: 1000, payload: { name: "A" } });
    expect(queue.tryPair()).toEqual([]);

    queue.enqueue({ sessionId: "b", eloRating: 1080, payload: { name: "B" } });
    const pairs = queue.tryPair();

    expect(pairs).toHaveLength(1);
    expect(queue.size()).toBe(0);
    const pair = pairs[0];
    const ids = [pair.left.sessionId, pair.right.sessionId].sort();
    expect(ids).toEqual(["a", "b"]);
  });

  test("two sessions exactly ±100 ELO apart pair (boundary inclusive)", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue({ clock: clock.now });

    queue.enqueue({ sessionId: "a", eloRating: 1000, payload: null });
    queue.enqueue({ sessionId: "b", eloRating: 1100, payload: null });

    expect(queue.tryPair()).toHaveLength(1);
  });

  test("two sessions 500 ELO apart do NOT pair until enough time has passed", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue({ clock: clock.now });

    queue.enqueue({ sessionId: "a", eloRating: 1000, payload: null });
    queue.enqueue({ sessionId: "b", eloRating: 1500, payload: null });

    expect(queue.tryPair()).toEqual([]);

    // After 5s each side accepts ±200 (100 + 1*100). Still too narrow for 500 apart.
    clock.advance(5_000);
    expect(queue.tryPair()).toEqual([]);

    // After 20s each side accepts ±500 (100 + 4*100). 500 diff is within bounds.
    clock.advance(15_000);
    expect(queue.tryPair()).toHaveLength(1);
    expect(queue.size()).toBe(0);
  });

  test("symmetric find-anyone: both sides past 60s pair regardless of ELO gap", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue({ clock: clock.now });

    queue.enqueue({ sessionId: "veteran-low", eloRating: 1000, payload: null });
    queue.enqueue({ sessionId: "veteran-high", eloRating: 2500, payload: null });
    clock.advance(60_000);

    expect(queue.tryPair()).toHaveLength(1);
    expect(queue.size()).toBe(0);
  });

  test("asymmetric find-anyone: a >60s waiter pairs with a fresh wildly-mismatched newcomer (one-sided 60s drop is sufficient)", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue({ clock: clock.now });

    queue.enqueue({ sessionId: "A", eloRating: 1000, payload: null });
    clock.advance(65_000);
    queue.enqueue({ sessionId: "B", eloRating: 2000, payload: null });

    const pairs = queue.tryPair();

    expect(pairs).toHaveLength(1);
    const ids = [pairs[0].left.sessionId, pairs[0].right.sessionId].sort();
    expect(ids).toEqual(["A", "B"]);
    expect(queue.size()).toBe(0);
  });

  test("early-window both-sides-must-accept: under 60s on both sides, a narrow-window newcomer will NOT pair with a wider-window waiter", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue({ clock: clock.now });

    queue.enqueue({ sessionId: "wider-2000", eloRating: 2000, payload: null });
    clock.advance(45_000);
    // Wider side's window after 45s = 100 + (45/5)*100 = 1000 — accepts ELO 1000.

    queue.enqueue({ sessionId: "fresh-1000", eloRating: 1000, payload: null });
    clock.advance(1_000);
    // Fresh side's window = 100 + (1/5)*100 = 120 — does NOT accept ELO 2000.
    // Both sides are still under 60s, so the symmetric rule applies.
    expect(queue.tryPair()).toEqual([]);

    // Once the wider side crosses 60s, the asymmetric rule kicks in and they pair.
    clock.advance(15_000);
    expect(queue.tryPair()).toHaveLength(1);
  });

  test("expanding window pairs the closest-ELO candidate when multiple candidates are valid", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue({ clock: clock.now });

    queue.enqueue({ sessionId: "a", eloRating: 1000, payload: "A" });
    queue.enqueue({ sessionId: "b", eloRating: 1090, payload: "B" });
    queue.enqueue({ sessionId: "c", eloRating: 1050, payload: "C" });

    const pairs = queue.tryPair();

    expect(pairs).toHaveLength(1);
    const pair = pairs[0];
    const ids = [pair.left.sessionId, pair.right.sessionId].sort();
    // A's closest in-window candidate is C (diff 50), not B (diff 90).
    expect(ids).toEqual(["a", "c"]);
    expect(queue.size()).toBe(1);
    expect(queue.has("b")).toBe(true);
  });

  test("dequeue removes a session and prevents subsequent pairing", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue({ clock: clock.now });

    queue.enqueue({ sessionId: "a", eloRating: 1000, payload: null });
    queue.enqueue({ sessionId: "b", eloRating: 1050, payload: null });

    expect(queue.dequeue("b")).toBe(true);
    expect(queue.has("b")).toBe(false);
    expect(queue.size()).toBe(1);
    expect(queue.tryPair()).toEqual([]);

    queue.enqueue({ sessionId: "c", eloRating: 1080, payload: null });
    expect(queue.tryPair()).toHaveLength(1);
  });

  test("dequeue returns false for an unknown sessionId", () => {
    const queue = new MatchmakingQueue();
    expect(queue.dequeue("missing")).toBe(false);
  });

  test("tryPair drains multiple non-overlapping pairs in a single tick", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue({ clock: clock.now });

    queue.enqueue({ sessionId: "a", eloRating: 1000, payload: null });
    queue.enqueue({ sessionId: "b", eloRating: 1050, payload: null });
    queue.enqueue({ sessionId: "c", eloRating: 2000, payload: null });
    queue.enqueue({ sessionId: "d", eloRating: 2050, payload: null });

    const pairs = queue.tryPair();
    expect(pairs).toHaveLength(2);
    expect(queue.size()).toBe(0);
  });

  test("re-enqueue after pairing is allowed and resets the waiting clock", () => {
    const clock = fakeClock();
    const queue = new MatchmakingQueue({ clock: clock.now });

    queue.enqueue({ sessionId: "a", eloRating: 1000, payload: null });
    queue.enqueue({ sessionId: "b", eloRating: 1050, payload: null });
    expect(queue.tryPair()).toHaveLength(1);

    clock.advance(60_000);
    queue.enqueue({ sessionId: "a", eloRating: 1000, payload: null });
    queue.enqueue({ sessionId: "c", eloRating: 5000, payload: null });
    // Both fresh — windows are ±100 each, ELOs are 4000 apart, no pair.
    expect(queue.tryPair()).toEqual([]);
  });

  test("pairing payload travels back to the caller untouched", () => {
    const clock = fakeClock();
    type Payload = { identity: string; deck: string[] };
    const queue = new MatchmakingQueue<Payload>({ clock: clock.now });

    const aPayload: Payload = { identity: "A", deck: ["card-1"] };
    const bPayload: Payload = { identity: "B", deck: ["card-2"] };
    queue.enqueue({ sessionId: "a", eloRating: 1000, payload: aPayload });
    queue.enqueue({ sessionId: "b", eloRating: 1050, payload: bPayload });

    const [pair] = queue.tryPair();
    const byId = new Map([
      [pair.left.sessionId, pair.left.payload],
      [pair.right.sessionId, pair.right.payload],
    ]);
    expect(byId.get("a")).toBe(aPayload);
    expect(byId.get("b")).toBe(bPayload);
  });
});
