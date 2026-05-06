import { lookup as dnsLookup } from "node:dns/promises";
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";

const PUBLIC_ASSET_ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "nexus-assets", "integrations");
const PUBLIC_ASSET_URL_ROOT = "/nexus-assets/integrations";
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_DIMENSION = 32;
const MAX_DIMENSION = 4096;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const SUPPORTED_FORMATS = new Set(["png", "jpeg", "webp", "gif"]);
const EXT_BY_FORMAT: Record<string, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
};

export class IntegrationAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationAssetError";
  }
}

export type ResolvedAddress = { address: string; family: number };
export type HostLookup = (hostname: string) => Promise<readonly ResolvedAddress[]>;
export type SafeRemoteAssetUrl = {
  href: string;
  url: URL;
  hostname: string;
  resolvedAddress: ResolvedAddress;
};
type PinnedLookupCallback = (error: NodeJS.ErrnoException | null, address: string | ResolvedAddress[], family?: number) => void;
export type FetchAsset = (asset: SafeRemoteAssetUrl, init?: RequestInit) => Promise<Response>;

export async function ingestRemoteImage(input: {
  url: string;
  kind: "glyph" | "card";
  ownerId: string;
  assetId: string;
  fetcher?: FetchAsset;
  lookupHost?: HostLookup;
  timeoutMs?: number;
  maxRedirects?: number;
}) {
  const response = await fetchRemoteAsset({
    url: input.url,
    kind: input.kind,
    fetcher: input.fetcher ?? nodeHttpsPinnedAssetFetch,
    lookupHost: input.lookupHost ?? defaultLookupHost,
    timeoutMs: input.timeoutMs ?? FETCH_TIMEOUT_MS,
    maxRedirects: input.maxRedirects ?? MAX_REDIRECTS,
  });
  if (!response.ok) {
    throw new IntegrationAssetError(`${input.kind} URL returned ${response.status}.`);
  }

  const contentLength = parseContentLength(response.headers.get("content-length"));
  if (contentLength !== undefined && contentLength > MAX_BYTES) {
    throw new IntegrationAssetError(`${input.kind} image must be between 1 byte and ${MAX_BYTES} bytes.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > MAX_BYTES) {
    throw new IntegrationAssetError(`${input.kind} image must be between 1 byte and ${MAX_BYTES} bytes.`);
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytes, { animated: false }).metadata();
  } catch {
    throw new IntegrationAssetError(`${input.kind} image is not a supported image.`);
  }

  if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
    throw new IntegrationAssetError(`${input.kind} image type is not supported.`);
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < MIN_DIMENSION || height < MIN_DIMENSION || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new IntegrationAssetError(`${input.kind} image dimensions are outside ${MIN_DIMENSION}-${MAX_DIMENSION}px.`);
  }

  const extension = EXT_BY_FORMAT[metadata.format] ?? metadata.format;
  const ownerDir = safePathPart(input.ownerId);
  const assetBase = safePathPart(input.assetId);
  const relativePath = path.join(ownerDir, `${assetBase}.${extension}`);
  const absolutePath = path.join(PUBLIC_ASSET_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);

  return `${PUBLIC_ASSET_URL_ROOT}/${ownerDir}/${assetBase}.${extension}`;
}

async function fetchRemoteAsset(input: {
  url: string;
  kind: "glyph" | "card";
  fetcher: FetchAsset;
  lookupHost: HostLookup;
  timeoutMs: number;
  maxRedirects: number;
}) {
  let current = await assertSafeRemoteAssetUrl(input.url, input.lookupHost);

  for (let redirectCount = 0; redirectCount <= input.maxRedirects; redirectCount += 1) {
    const response = await input.fetcher(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(input.timeoutMs),
    }).catch((error) => {
      throw new IntegrationAssetError(`${input.kind} URL could not be fetched: ${error instanceof Error ? error.message : "unknown error"}.`);
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }
    await response.body?.cancel().catch(() => undefined);

    if (redirectCount >= input.maxRedirects) {
      throw new IntegrationAssetError(`${input.kind} URL redirected too many times.`);
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new IntegrationAssetError(`${input.kind} URL redirected without a Location header.`);
    }

    current = await assertSafeRemoteAssetUrl(resolveRedirectUrl(location, current.href), input.lookupHost);
  }

  throw new IntegrationAssetError(`${input.kind} URL redirected too many times.`);
}

async function assertSafeRemoteAssetUrl(value: string, lookupHost: HostLookup): Promise<SafeRemoteAssetUrl> {
  const url = parseRemoteAssetUrl(value);
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new IntegrationAssetError("asset URL must include a hostname.");
  }
  if (url.username || url.password) {
    throw new IntegrationAssetError("asset URL must not include credentials.");
  }
  if (url.port && url.port !== "443") {
    throw new IntegrationAssetError("asset URL must use the default HTTPS port.");
  }
  if (isDisallowedHostname(hostname)) {
    throw new IntegrationAssetError("asset URL hostname is not allowed.");
  }

  const addresses = await resolveAssetHost(hostname, lookupHost);
  if (addresses.length === 0) {
    throw new IntegrationAssetError("asset URL hostname did not resolve.");
  }

  for (const address of addresses) {
    if (isDisallowedIpAddress(address.address)) {
      throw new IntegrationAssetError("asset URL resolves to a private or reserved address.");
    }
  }

  return {
    href: url.toString(),
    url,
    hostname,
    resolvedAddress: addresses[0],
  };
}

function parseRemoteAssetUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntegrationAssetError("asset URL must be a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new IntegrationAssetError("asset URL must use https.");
  }

  return url;
}

function resolveRedirectUrl(location: string, currentUrl: string) {
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    throw new IntegrationAssetError("asset redirect location must be a valid URL.");
  }
}

async function resolveAssetHost(hostname: string, lookupHost: HostLookup) {
  const family = isIP(hostname);
  if (family) {
    return [{ address: hostname, family }];
  }

  try {
    return await lookupHost(hostname);
  } catch (error) {
    throw new IntegrationAssetError(`asset URL hostname could not be resolved: ${error instanceof Error ? error.message : "unknown error"}.`);
  }
}

async function defaultLookupHost(hostname: string) {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function nodeHttpsPinnedAssetFetch(asset: SafeRemoteAssetUrl, init: RequestInit = {}) {
  return new Promise<Response>((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(new Error("Request aborted."));
      return;
    }

    let settled = false;
    const options: RequestOptions = {
      method: "GET",
      lookup: createPinnedLookup(asset),
      servername: isIP(asset.hostname) ? undefined : asset.hostname,
    };
    const request = httpsRequest(asset.url, options, (response) => {
      settled = true;
      const status = response.statusCode && response.statusCode >= 200 && response.statusCode <= 599 ? response.statusCode : 599;
      const body = canHaveResponseBody(status) ? (Readable.toWeb(response) as unknown as ReadableStream<Uint8Array>) : null;
      resolve(
        new Response(body, {
          status,
          statusText: response.statusMessage,
          headers: toWebHeaders(response.headers),
        }),
      );
    });

    const abort = () => {
      request.destroy(new Error("Request aborted."));
    };
    init.signal?.addEventListener("abort", abort, { once: true });

    request.on("error", (error) => {
      init.signal?.removeEventListener("abort", abort);
      if (!settled) {
        reject(error);
      }
    });
    request.on("close", () => {
      init.signal?.removeEventListener("abort", abort);
    });
    request.end();
  });
}

function createPinnedLookup(asset: SafeRemoteAssetUrl): NonNullable<RequestOptions["lookup"]> {
  return ((hostname: string, options: unknown, callback?: PinnedLookupCallback) => {
    const cb = typeof options === "function" ? options : callback;
    if (!cb) return;

    if (normalizeHostname(hostname) !== asset.hostname) {
      const error = new Error("Pinned asset lookup received an unexpected hostname.") as NodeJS.ErrnoException;
      error.code = "ERR_INVALID_HOSTNAME";
      cb(error, "", 0);
      return;
    }

    const wantsAll = typeof options === "object" && options !== null && "all" in options && Boolean((options as { all?: boolean }).all);
    if (wantsAll) {
      cb(null, [asset.resolvedAddress]);
      return;
    }

    cb(null, asset.resolvedAddress.address, asset.resolvedAddress.family);
  }) as NonNullable<RequestOptions["lookup"]>;
}

function toWebHeaders(headers: IncomingHttpHeaders) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(name, item);
      }
      continue;
    }
    result.set(name, value);
  }
  return result;
}

function canHaveResponseBody(status: number) {
  return status !== 204 && status !== 205 && status !== 304;
}

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function normalizeHostname(hostname: string) {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  return withoutBrackets.replace(/\.$/, "").toLowerCase();
}

function isDisallowedHostname(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata.google.internal";
}

function isDisallowedIpAddress(address: string) {
  const normalized = normalizeHostname(address);
  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (ipv4Tail && isDisallowedIpv4Address(ipv4Tail)) {
    return true;
  }

  if (isIP(normalized) === 4) {
    return isDisallowedIpv4Address(normalized);
  }
  if (isIP(normalized) === 6) {
    return isDisallowedIpv6Address(normalized);
  }
  return true;
}

function isDisallowedIpv4Address(address: string) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isDisallowedIpv6Address(address: string) {
  const zoneFree = address.split("%", 1)[0].toLowerCase();
  const mappedIpv4 = parseMappedIpv4Address(zoneFree);
  if (mappedIpv4) {
    return isDisallowedIpv4Address(mappedIpv4);
  }

  const firstHextet = Number.parseInt(zoneFree.split(":", 1)[0] || "0", 16);
  if (!Number.isFinite(firstHextet)) {
    return true;
  }

  return (
    zoneFree === "::" ||
    zoneFree === "::1" ||
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xff00) === 0xff00 ||
    zoneFree.startsWith("2001:db8:")
  );
}

function parseMappedIpv4Address(address: string) {
  const dotted = address.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (dotted) return dotted;

  const hex = address.match(/^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return undefined;

  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return undefined;
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function parseContentLength(value: string | null) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function safePathPart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}
