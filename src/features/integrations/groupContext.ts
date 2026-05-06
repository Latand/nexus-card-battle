import { createHmac, timingSafeEqual } from "crypto";

export type GroupLaunchContext = {
  chatId: string;
  expiresAt: number;
};

export class GroupContextError extends Error {
  constructor(
    readonly code: "group_context_missing" | "group_context_invalid" | "group_context_expired" | "group_context_unconfigured",
    message: string,
    readonly status = 403,
  ) {
    super(message);
    this.name = "GroupContextError";
  }
}

export function signGroupLaunchContext(input: { chatId: string; now?: Date; ttlSeconds?: number }) {
  const now = input.now ?? new Date();
  const ttlSeconds = input.ttlSeconds ?? 10 * 60;
  const payload: GroupLaunchContext = {
    chatId: input.chatId,
    expiresAt: Math.floor(now.getTime() / 1000) + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyGroupLaunchContext(value: unknown, options: { now?: Date } = {}): GroupLaunchContext {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GroupContextError("group_context_missing", "Signed group context is required.");
  }

  const [encodedPayload, signature, extra] = value.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    throw new GroupContextError("group_context_invalid", "Signed group context is invalid.");
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) {
    throw new GroupContextError("group_context_invalid", "Signed group context is invalid.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new GroupContextError("group_context_invalid", "Signed group context is invalid.");
  }

  if (!isRecord(payload) || typeof payload.chatId !== "string" || typeof payload.expiresAt !== "number") {
    throw new GroupContextError("group_context_invalid", "Signed group context is invalid.");
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= nowSeconds) {
    throw new GroupContextError("group_context_expired", "Signed group context has expired.");
  }

  return {
    chatId: payload.chatId,
    expiresAt: payload.expiresAt,
  };
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getGroupContextSecret()).update(encodedPayload).digest("base64url");
}

function getGroupContextSecret() {
  const secret = process.env.GROUP_CONTEXT_SIGNING_SECRET || process.env.INTEGRATION_API_TOKEN;
  if (!secret) {
    throw new GroupContextError("group_context_unconfigured", "Group context signing secret is not configured.", 500);
  }
  return secret;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
