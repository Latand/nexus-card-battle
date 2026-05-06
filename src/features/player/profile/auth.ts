import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isSamePlayerIdentity, parsePlayerIdentity, type PlayerIdentity } from "./types";

export const PLAYER_SESSION_COOKIE = "nexus_player_session";

const SESSION_VERSION = 1;
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24;
const DEV_SESSION_SECRET = "dev-only-nexus-card-battle-session-secret";

export type PlayerAuthResult = {
  identity: PlayerIdentity;
  setCookie?: string;
};

type PlayerSessionPayload = {
  v: typeof SESSION_VERSION;
  identity: PlayerIdentity;
  iat: number;
  exp: number;
  nonce: string;
};

export class PlayerAuthError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "PlayerAuthError";
  }
}

export function resolveAuthenticatedPlayerIdentity(
  request: Request,
  body: Record<string, unknown> = {},
  options: { allowGuestCreation?: boolean } = {},
): PlayerAuthResult {
  const claimedIdentity = body.identity === undefined ? undefined : parsePlayerIdentity(body.identity);
  const telegramInitData = parseOptionalString(body.telegramInitData);

  if (telegramInitData) {
    const identity = verifyTelegramInitData(telegramInitData);
    assertClaimedIdentityMatchesSession(claimedIdentity, identity);
    return {
      identity,
      setCookie: createPlayerSessionCookie(identity),
    };
  }

  const sessionIdentity = readPlayerSessionIdentity(request.headers.get("cookie"));
  if (sessionIdentity) {
    assertClaimedIdentityMatchesSession(claimedIdentity, sessionIdentity);
    return { identity: sessionIdentity };
  }

  if (claimedIdentity) {
    throw new PlayerAuthError("auth_required", "Authenticated player session is required.", 401);
  }

  if (options.allowGuestCreation) {
    const identity: PlayerIdentity = { mode: "guest", guestId: `guest_${randomUUID()}` };
    return {
      identity,
      setCookie: createPlayerSessionCookie(identity),
    };
  }

  throw new PlayerAuthError("auth_required", "Authenticated player session is required.", 401);
}

export function assertClaimedIdentityMatchesSession(claimedIdentity: PlayerIdentity | undefined, sessionIdentity: PlayerIdentity) {
  if (!claimedIdentity) return;
  if (isSamePlayerIdentity(claimedIdentity, sessionIdentity)) return;

  throw new PlayerAuthError("identity_mismatch", "Request identity does not match the authenticated session.", 403);
}

export function readPlayerSessionIdentity(cookieHeader: string | null | undefined): PlayerIdentity | null {
  const cookieValue = readCookie(cookieHeader, PLAYER_SESSION_COOKIE);
  if (!cookieValue) return null;

  try {
    const payload = verifySignedPayload(cookieValue);
    if (!isSessionPayload(payload)) return null;
    if (payload.exp <= nowSeconds()) return null;
    return payload.identity;
  } catch {
    return null;
  }
}

export function createPlayerSessionCookie(identity: PlayerIdentity, options: { now?: number; maxAgeSeconds?: number } = {}) {
  const maxAgeSeconds = options.maxAgeSeconds ?? getSessionMaxAgeSeconds();
  const issuedAt = options.now ?? nowSeconds();
  const payload: PlayerSessionPayload = {
    v: SESSION_VERSION,
    identity,
    iat: issuedAt,
    exp: issuedAt + maxAgeSeconds,
    nonce: randomUUID(),
  };

  return serializeCookie(PLAYER_SESSION_COOKIE, signPayload(payload), {
    maxAgeSeconds,
    httpOnly: true,
    secure: shouldUseSecureSessionCookie(),
    sameSite: "Lax",
    path: "/",
  });
}

export function createExpiredPlayerSessionCookie() {
  return serializeCookie(PLAYER_SESSION_COOKIE, "", {
    maxAgeSeconds: 0,
    httpOnly: true,
    secure: shouldUseSecureSessionCookie(),
    sameSite: "Lax",
    path: "/",
  });
}

export function verifyTelegramInitData(initData: string): PlayerIdentity {
  const botToken = getTelegramBotToken();
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new PlayerAuthError("invalid_telegram_init_data", "Telegram initData hash is missing or invalid.", 401);
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqualHex(receivedHash, expectedHash)) {
    throw new PlayerAuthError("invalid_telegram_init_data", "Telegram initData signature is invalid.", 401);
  }

  const authDate = parseInteger(params.get("auth_date"));
  if (!authDate) {
    throw new PlayerAuthError("invalid_telegram_init_data", "Telegram initData auth_date is missing.", 401);
  }
  if (nowSeconds() - authDate > getTelegramInitDataMaxAgeSeconds()) {
    throw new PlayerAuthError("stale_telegram_init_data", "Telegram initData is too old.", 401);
  }

  const user = parseTelegramUser(params.get("user"));
  return { mode: "telegram", telegramId: user.id };
}

function parseTelegramUser(value: string | null): { id: string } {
  if (!value) {
    throw new PlayerAuthError("invalid_telegram_init_data", "Telegram initData user is missing.", 401);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PlayerAuthError("invalid_telegram_init_data", "Telegram initData user is malformed.", 401);
  }

  if (!isRecord(parsed)) {
    throw new PlayerAuthError("invalid_telegram_init_data", "Telegram initData user is malformed.", 401);
  }

  const id = parsed.id;
  if ((typeof id !== "number" && typeof id !== "string") || String(id).trim() === "") {
    throw new PlayerAuthError("invalid_telegram_init_data", "Telegram initData user id is missing.", 401);
  }

  return { id: String(id).trim() };
}

function signPayload(payload: PlayerSessionPayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifySignedPayload(value: string): unknown {
  const [encodedPayload, signature, extra] = value.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    throw new PlayerAuthError("invalid_session", "Player session is malformed.", 401);
  }

  const expectedSignature = createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
  if (!safeEqualString(signature, expectedSignature)) {
    throw new PlayerAuthError("invalid_session", "Player session signature is invalid.", 401);
  }

  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
}

function isSessionPayload(value: unknown): value is PlayerSessionPayload {
  if (!isRecord(value)) return false;
  if (value.v !== SESSION_VERSION) return false;
  if (typeof value.iat !== "number" || typeof value.exp !== "number") return false;
  if (typeof value.nonce !== "string" || !value.nonce) return false;
  try {
    parsePlayerIdentity(value.identity);
    return true;
  } catch {
    return false;
  }
}

function getSessionSecret() {
  const explicit = process.env.NEXUS_SESSION_SECRET?.trim();
  if (explicit) return explicit;

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.BOT_TOKEN?.trim();
  if (botToken) {
    return createHmac("sha256", "NexusCardBattleSession").update(botToken).digest("hex");
  }

  if (process.env.NODE_ENV === "production") {
    throw new PlayerAuthError("auth_unavailable", "Player auth is not configured.", 500);
  }

  return DEV_SESSION_SECRET;
}

function getTelegramBotToken() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.BOT_TOKEN?.trim();
  if (!botToken) {
    throw new PlayerAuthError("auth_unavailable", "Telegram auth is not configured.", 500);
  }
  return botToken;
}

function getSessionMaxAgeSeconds() {
  return parsePositiveEnvInteger("NEXUS_SESSION_MAX_AGE_SECONDS") ?? DEFAULT_SESSION_MAX_AGE_SECONDS;
}

function getTelegramInitDataMaxAgeSeconds() {
  return parsePositiveEnvInteger("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS") ?? DEFAULT_TELEGRAM_INIT_DATA_MAX_AGE_SECONDS;
}

function parsePositiveEnvInteger(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function shouldUseSecureSessionCookie() {
  if (process.env.NEXUS_SESSION_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAgeSeconds: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "Strict" | "None";
    path: string;
  },
) {
  const parts = [
    `${name}=${value}`,
    `Max-Age=${options.maxAgeSeconds}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function readCookie(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(/;\s*/);
  const prefix = `${name}=`;
  return cookies.find((cookie) => cookie.startsWith(prefix))?.slice(prefix.length);
}

function parseOptionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function safeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
