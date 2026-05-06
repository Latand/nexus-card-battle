import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PUBLIC_ASSET_ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "nexus-assets", "integrations");
const PUBLIC_ASSET_URL_ROOT = "/nexus-assets/integrations";
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_DIMENSION = 32;
const MAX_DIMENSION = 4096;
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

export type FetchAsset = typeof fetch;

export async function ingestRemoteImage(input: {
  url: string;
  kind: "glyph" | "card";
  ownerId: string;
  assetId: string;
  fetcher?: FetchAsset;
}) {
  const remoteUrl = parseRemoteAssetUrl(input.url);
  const response = await (input.fetcher ?? fetch)(remoteUrl);
  if (!response.ok) {
    throw new IntegrationAssetError(`${input.kind} URL returned ${response.status}.`);
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

function parseRemoteAssetUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntegrationAssetError("asset URL must be a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IntegrationAssetError("asset URL must use http or https.");
  }

  return url;
}

function safePathPart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}
