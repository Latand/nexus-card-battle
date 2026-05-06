import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { clanProjectileAssets } from "../src/features/battle/ui/v2/effects/projectileAssets.ts";

const rootDir = path.resolve(import.meta.dirname, "..");
const stripDir = path.join(rootDir, "public/nexus-assets/projectiles/clans/animated");
const previewDir = path.join(rootDir, "docs/generated-assets/projectile-animation-previews");
const frameDir = path.join(previewDir, "frames");
const clanPreviewDir = path.join(previewDir, "clans");
const compositeGifPath = path.join(rootDir, "docs/generated-assets/projectile-animation-preview.gif");
const compositeWebpPath = path.join(rootDir, "docs/generated-assets/projectile-animation-preview.webp");
const indexPath = path.join(previewDir, "index.html");

const frameCount = 3;
const loopOrder = [0, 1, 2, 1];
const delayMs = 90;

await mkdir(frameDir, { recursive: true });
await mkdir(clanPreviewDir, { recursive: true });

if (!hasCommand("magick")) {
  throw new Error("ImageMagick `magick` is required to render animated preview GIF/WebP files.");
}

const frameCache = new Map();
for (const asset of clanProjectileAssets) {
  frameCache.set(asset.slug, await readStripFrames(asset.slug));
}

const compositeFrames = [];
for (const frameIndex of loopOrder) {
  const framePath = path.join(frameDir, `projectiles-${frameIndex}.png`);
  await writeCompositeFrame(frameIndex, framePath);
  compositeFrames.push(framePath);
}
await renderAnimation(compositeFrames, compositeGifPath);
await renderAnimation(compositeFrames, compositeWebpPath);

for (const asset of clanProjectileAssets) {
  const clanFrames = [];
  for (const frameIndex of loopOrder) {
    const framePath = path.join(frameDir, `${asset.slug}-${frameIndex}.png`);
    await writeClanFrame(asset.slug, frameIndex, framePath);
    clanFrames.push(framePath);
  }
  await renderAnimation(clanFrames, path.join(clanPreviewDir, `${asset.slug}.gif`));
}

await writeIndex();

console.log(`wrote ${path.relative(rootDir, compositeGifPath)}`);
console.log(`wrote ${path.relative(rootDir, compositeWebpPath)}`);
console.log(`wrote ${path.relative(rootDir, clanPreviewDir)}/*.gif`);
console.log(`wrote ${path.relative(rootDir, indexPath)}`);

async function readStripFrames(slug) {
  const stripPath = path.join(stripDir, `${slug}.png`);
  if (!existsSync(stripPath)) throw new Error(`Missing animated strip: ${stripPath}`);

  const metadata = await sharp(stripPath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Cannot read strip dimensions: ${stripPath}`);
  }

  const frameWidth = Math.floor(metadata.width / frameCount);
  const frames = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    frames.push(
      await sharp(stripPath)
        .extract({ left: frameIndex * frameWidth, top: 0, width: frameWidth, height: metadata.height })
        .ensureAlpha()
        .png()
        .toBuffer(),
    );
  }
  return { frames, frameWidth, frameHeight: metadata.height };
}

async function writeCompositeFrame(frameIndex, outPath) {
  const cols = 6;
  const projectileSize = 104;
  const tile = 128;
  const rows = Math.ceil(clanProjectileAssets.length / cols);
  const width = cols * tile;
  const height = rows * tile;
  const checker = makeChecker(width, height, 12);
  const composites = [];

  for (let index = 0; index < clanProjectileAssets.length; index += 1) {
    const asset = clanProjectileAssets[index];
    const cache = frameCache.get(asset.slug);
    const projectile = await sharp(cache.frames[frameIndex])
      .resize(projectileSize, projectileSize, { fit: "contain", kernel: "lanczos3" })
      .png()
      .toBuffer();
    const left = (index % cols) * tile + Math.floor((tile - projectileSize) / 2);
    const top = Math.floor(index / cols) * tile + Math.floor((tile - projectileSize) / 2);
    composites.push({ input: projectile, left, top });
  }

  await sharp(checker, { raw: { width, height, channels: 4 } })
    .composite(composites)
    .png()
    .toFile(outPath);
}

async function writeClanFrame(slug, frameIndex, outPath) {
  const canvas = 224;
  const projectileSize = 176;
  const checker = makeChecker(canvas, canvas, 12);
  const projectile = await sharp(frameCache.get(slug).frames[frameIndex])
    .resize(projectileSize, projectileSize, { fit: "contain", kernel: "lanczos3" })
    .png()
    .toBuffer();

  await sharp(checker, { raw: { width: canvas, height: canvas, channels: 4 } })
    .composite([{ input: projectile, left: Math.floor((canvas - projectileSize) / 2), top: Math.floor((canvas - projectileSize) / 2) }])
    .png()
    .toFile(outPath);
}

async function renderAnimation(framePaths, outPath) {
  const args = [
    ...framePaths.flatMap((framePath) => ["-delay", String(Math.round(delayMs / 10)), framePath]),
    "-loop",
    "0",
    outPath,
  ];
  const result = spawnSync("magick", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`magick failed for ${outPath}: ${result.stderr || result.stdout}`);
  }
}

async function writeIndex() {
  const items = clanProjectileAssets.map((asset) => {
    const src = `clans/${asset.slug}.gif`;
    return `<figure><img src="${src}" alt="${escapeHtml(asset.clan)} projectile animation"><figcaption>${escapeHtml(asset.clan)}</figcaption></figure>`;
  });

  await writeFile(indexPath, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexus Projectile Animations</title>
  <style>
    body { margin: 0; background: #0b0f14; color: #e8edf5; font-family: system-ui, sans-serif; }
    main { padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 16px; font-weight: 650; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: 14px; }
    figure { margin: 0; padding: 10px; background: #111821; border: 1px solid #243142; border-radius: 8px; }
    img { width: 100%; display: block; border-radius: 4px; }
    figcaption { margin-top: 8px; font-size: 12px; color: #aab6c7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style>
</head>
<body>
  <main>
    <h1>Nexus Projectile Animations</h1>
    <section class="grid">
      ${items.join("\n      ")}
    </section>
  </main>
</body>
</html>
`);
}

function makeChecker(width, height, square) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (Math.floor(x / square) + Math.floor(y / square)) % 2 ? 178 : 224;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

function hasCommand(command) {
  const result = spawnSync("zsh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
