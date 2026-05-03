import { describe, expect, test } from "bun:test";
import { OnlinePresence } from "../src/features/presence/onlinePresence";

describe("OnlinePresence", () => {
  test("starts empty", () => {
    const presence = new OnlinePresence();
    expect(presence.count()).toBe(0);
    expect(presence.has("anything")).toBe(false);
  });

  test("add tracks unique session ids", () => {
    const presence = new OnlinePresence();
    presence.add({ id: "a" });
    presence.add({ id: "b" });
    expect(presence.count()).toBe(2);
    expect(presence.has("a")).toBe(true);
    expect(presence.has("b")).toBe(true);
  });

  test("add is idempotent for the same session id", () => {
    const presence = new OnlinePresence();
    presence.add({ id: "a" });
    presence.add({ id: "a" });
    expect(presence.count()).toBe(1);
  });

  test("remove drops the session", () => {
    const presence = new OnlinePresence();
    presence.add({ id: "a" });
    presence.add({ id: "b" });
    presence.remove({ id: "a" });
    expect(presence.count()).toBe(1);
    expect(presence.has("a")).toBe(false);
    expect(presence.has("b")).toBe(true);
  });

  test("remove is idempotent for an unknown session id", () => {
    const presence = new OnlinePresence();
    presence.add({ id: "a" });
    presence.remove({ id: "ghost" });
    presence.remove({ id: "ghost" });
    expect(presence.count()).toBe(1);
  });

  test("ignores sessions without a usable id", () => {
    const presence = new OnlinePresence();
    presence.add({ id: "" });
    presence.add({} as { id: string });
    expect(presence.count()).toBe(0);
    presence.add({ id: "real" });
    presence.remove({ id: "" });
    expect(presence.count()).toBe(1);
    expect(presence.has("real")).toBe(true);
  });

  test("broadcastCount delivers the current count to every active session", () => {
    const presence = new OnlinePresence();
    presence.add({ id: "a" });
    presence.add({ id: "b" });
    presence.add({ id: "c" });

    const calls: { sessionId: string; payload: { type: string; count: number } }[] = [];
    presence.broadcastCount({
      send: (sessionId, payload) => {
        calls.push({ sessionId, payload });
      },
    });

    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((call) => call.sessionId))).toEqual(new Set(["a", "b", "c"]));
    for (const call of calls) {
      expect(call.payload).toEqual({ type: "online_count", count: 3 });
    }
  });

  test("broadcastCount with no sessions emits zero sends", () => {
    const presence = new OnlinePresence();
    let invocations = 0;
    presence.broadcastCount({
      send: () => {
        invocations += 1;
      },
    });
    expect(invocations).toBe(0);
  });

  test("a thrown send for one session does not block delivery to the rest", () => {
    const presence = new OnlinePresence();
    presence.add({ id: "a" });
    presence.add({ id: "broken" });
    presence.add({ id: "c" });

    const delivered: string[] = [];
    const failed: { sessionId: string; error: unknown }[] = [];

    presence.broadcastCount({
      send: (sessionId) => {
        if (sessionId === "broken") throw new Error("send failed");
        delivered.push(sessionId);
      },
      onSendError: (failure) => {
        failed.push(failure);
      },
    });

    expect(new Set(delivered)).toEqual(new Set(["a", "c"]));
    expect(failed).toHaveLength(1);
    expect(failed[0]?.sessionId).toBe("broken");
    expect((failed[0]?.error as Error).message).toBe("send failed");
  });

  test("count reflects the current set after add/remove churn", () => {
    const presence = new OnlinePresence();
    presence.add({ id: "a" });
    presence.add({ id: "b" });
    presence.remove({ id: "a" });
    presence.add({ id: "c" });
    presence.remove({ id: "b" });
    presence.remove({ id: "b" });
    expect(presence.count()).toBe(1);
    expect(presence.has("c")).toBe(true);
  });
});
