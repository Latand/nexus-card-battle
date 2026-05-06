import { afterEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  PLAYER_SESSION_COOKIE,
  PlayerAuthError,
  createPlayerSessionCookie,
  readPlayerSessionIdentity,
  resolveAuthenticatedPlayerIdentity,
  verifyTelegramInitData,
} from "../src/features/player/profile/auth";
import type { PlayerIdentity } from "../src/features/player/profile/types";

const TEST_BOT_TOKEN = "123456:test-bot-token";
const TEST_SESSION_SECRET = "test-session-secret";

const originalTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const originalSessionSecret = process.env.NEXUS_SESSION_SECRET;

afterEach(() => {
  restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
  restoreEnv("NEXUS_SESSION_SECRET", originalSessionSecret);
});

describe("player auth", () => {
  test("derives Telegram identity only from signed initData", () => {
    process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
    const initData = createTelegramInitData({ id: 123456789, username: "duelist" });

    expect(verifyTelegramInitData(initData)).toEqual({
      mode: "telegram",
      telegramId: "123456789",
    });
  });

  test("rejects tampered Telegram initData", () => {
    process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
    const initData = createTelegramInitData({ id: 123456789 }).replace("123456789", "987654321");

    expect(() => verifyTelegramInitData(initData)).toThrow(PlayerAuthError);
  });

  test("rejects a claimed identity without an authenticated session", () => {
    const request = new Request("http://localhost/api/player", { method: "POST" });

    expect(() =>
      resolveAuthenticatedPlayerIdentity(request, {
        identity: { mode: "guest", guestId: "guest-forged" },
      }),
    ).toThrow(PlayerAuthError);
  });

  test("rejects a claimed identity that does not match the session cookie", () => {
    process.env.NEXUS_SESSION_SECRET = TEST_SESSION_SECRET;
    const sessionIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-session" };
    const request = new Request("http://localhost/api/player/deck", {
      method: "POST",
      headers: {
        Cookie: createPlayerSessionCookie(sessionIdentity),
      },
    });

    expect(() =>
      resolveAuthenticatedPlayerIdentity(request, {
        identity: { mode: "guest", guestId: "guest-victim" },
      }),
    ).toThrow(PlayerAuthError);
  });

  test("round-trips a signed HttpOnly player session cookie", () => {
    process.env.NEXUS_SESSION_SECRET = TEST_SESSION_SECRET;
    const identity: PlayerIdentity = { mode: "guest", guestId: "guest-cookie" };
    const cookie = createPlayerSessionCookie(identity);

    expect(cookie).toContain(`${PLAYER_SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(readPlayerSessionIdentity(cookie)).toEqual(identity);
  });
});

function createTelegramInitData(user: Record<string, unknown>) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "test-query",
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(TEST_BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return params.toString();
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
