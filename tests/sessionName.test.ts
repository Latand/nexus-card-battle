import { afterEach, expect, test } from "bun:test";
import { readStableSessionName, rememberStableSessionName, resolveStableUserName } from "../src/features/presence/sessionName";

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("stores and reuses a stable generated session name", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  });

  expect(rememberStableSessionName("  Тихий   Дуельник  ")).toBe("Тихий Дуельник");
  expect(readStableSessionName()).toBe("Тихий Дуельник");
  expect(resolveStableUserName(undefined)).toBe("Тихий Дуельник");
  expect(resolveStableUserName(" @telegram_duelist ")).toBe("@telegram_duelist");
});

test("does not persist the generic player fallback as a stable name", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  });

  expect(rememberStableSessionName("Гравець")).toBe("");
  expect(readStableSessionName()).toBe("");
});
