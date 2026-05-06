import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { clanProjectileAssets } from "../src/features/battle/ui/v2/effects/projectileAssets.ts";

const rootDir = path.resolve(import.meta.dirname, "..");
const sourceDir = path.join(rootDir, "docs/generated-assets/projectile-animation-sources");
const staticDir = path.join(rootDir, "public/nexus-assets/projectiles/clans");
const outputDir = path.join(staticDir, "animated");
const previewPath = path.join(rootDir, "docs/generated-assets/projectile-animated-preview.png");

const frameSize = 64;
const frameCount = 3;

const batches = [
  { filename: "batch-1.png", start: 0, count: 6, cols: 6 },
  { filename: "batch-2.png", start: 6, count: 6, cols: 6 },
  { filename: "batch-3.png", start: 12, count: 6, cols: 6 },
  { filename: "batch-4.png", start: 18, count: 5, cols: 5 },
];

await mkdir(outputDir, { recursive: true });

const batchSheets = await Promise.all(
  batches.map(async (batch) => {
    const sheetPath = path.join(sourceDir, batch.filename);
    return {
      ...batch,
      path: sheetPath,
      metadata: existsSync(sheetPath) ? await sharp(sheetPath).metadata() : null,
    };
  }),
);

const previewInputs = [];

for (let index = 0; index < clanProjectileAssets.length; index += 1) {
  const asset = clanProjectileAssets[index];
  const referenceFrames = await readReferenceFrames(index);
  const fallbackFrame = await readStaticFallback(asset.slug);
  const sourceFrames = referenceFrames.length === frameCount
    ? referenceFrames
    : [fallbackFrame, fallbackFrame, fallbackFrame];
  const targetAnchor = findAnchor(sourceFrames[0]);
  const alignedFrames = sourceFrames.map((frame) => alignFrameToAnchor(frame, targetAnchor));
  const glowColor = parseGlowColor(asset.glow);

  const frames = alignedFrames.map((reference, frameIndex) => {
    const mask = buildMask(reference);
    const bounds = findBounds(mask);
    return buildFrame({
      reference,
      mask,
      bounds,
      glowColor,
      slug: asset.slug,
      frameIndex,
    });
  });

  const strip = joinFrames(frames);
  const outPath = path.join(outputDir, `${asset.slug}.png`);
  await sharp(strip, {
    raw: { width: frameSize * frameCount, height: frameSize, channels: 4 },
  })
    .png()
    .toFile(outPath);

  previewInputs.push({ input: outPath, slug: asset.slug });
  console.log(`wrote animated/${asset.slug}.png`);
}

await writePreview(previewInputs);

async function readReferenceFrames(clanIndex) {
  const batch = batchSheets.find((entry) =>
    clanIndex >= entry.start && clanIndex < entry.start + entry.count
  );

  if (!batch?.metadata?.width || !batch.metadata.height || !existsSync(batch.path)) {
    return [];
  }

  const col = clanIndex - batch.start;
  const tileWidth = Math.floor(batch.metadata.width / batch.cols);
  const tileHeight = Math.floor(batch.metadata.height / frameCount);
  const frames = [];

  for (let row = 0; row < frameCount; row += 1) {
    const { data, info } = await sharp(batch.path)
      .extract({ left: col * tileWidth, top: row * tileHeight, width: tileWidth, height: tileHeight })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    removeChromaGreen(data, info.width, info.height, clanProjectileAssets[clanIndex]?.slug);

    const resized = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .resize(frameSize, frameSize, { fit: "contain", kernel: "lanczos3" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    cleanGreenEdgeSpill(resized, clanProjectileAssets[clanIndex]?.slug);
    frames.push(resized);
  }

  return frames;
}

async function readStaticFallback(slug) {
  const { data } = await sharp(path.join(staticDir, `${slug}.png`))
    .resize(frameSize, frameSize, { fit: "contain", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function buildFrame({
  reference,
  mask,
  bounds,
  glowColor,
  slug,
  frameIndex,
}) {
  const out = blankFrame();
  addLocalAura(out, mask, bounds, glowColor, frameIndex);
  addReferenceBody(out, reference, glowColor, frameIndex);
  addLocalTrail(out, reference, bounds, glowColor, frameIndex);
  addLocalSparks(out, bounds, glowColor, slug, frameIndex);
  return out;
}

function addReferenceBody(out, reference, glowColor, frameIndex) {
  const brightness = [1, 1.1, 1.04][frameIndex] ?? 1;
  const colorMix = [0, 0.05, 0.02][frameIndex] ?? 0.02;

  for (let i = 0; i < frameSize * frameSize; i += 1) {
    const offset = i * 4;
    const alpha = reference[offset + 3];
    if (alpha < 8) continue;

    const red = mixChannel(reference[offset] * brightness, glowColor[0], colorMix);
    const green = mixChannel(reference[offset + 1] * brightness, glowColor[1], colorMix);
    const blue = mixChannel(reference[offset + 2] * brightness, glowColor[2], colorMix);
    blendPixel(out, offset, red, green, blue, alpha);
  }
}

function addLocalAura(out, mask, bounds, glowColor, frameIndex) {
  const pulseAlpha = [22, 46, 34][frameIndex] ?? 28;
  const radius = frameIndex === 1 ? 7 : 5;

  for (let y = 0; y < frameSize; y += 1) {
    for (let x = 0; x < frameSize; x += 1) {
      const index = y * frameSize + x;
      if (mask[index]) continue;

      let distance = Infinity;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= frameSize || ny < 0 || ny >= frameSize) continue;
          if (!mask[ny * frameSize + nx]) continue;
          distance = Math.min(distance, Math.hypot(dx, dy));
        }
      }

      if (!Number.isFinite(distance)) continue;
      const fade = Math.max(0, 1 - distance / (radius + 1));
      const distanceBias = x < bounds.minX ? 1.18 : 0.78;
      blendPixel(out, index * 4, glowColor[0], glowColor[1], glowColor[2], pulseAlpha * fade * distanceBias);
    }
  }
}

function addLocalTrail(out, source, bounds, glowColor, frameIndex) {
  const offsetX = [4, 8, 11][frameIndex] ?? 6;
  const alphaScale = [0.12, 0.28, 0.2][frameIndex] ?? 0.18;

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const sourceIndex = (y * frameSize + x) * 4;
      const alpha = source[sourceIndex + 3];
      if (alpha < 110) continue;
      if ((x + y + frameIndex) % 3 !== 0) continue;

      const targetX = x - offsetX - ((x + y + frameIndex) % 5);
      const targetY = y + (((x + frameIndex) % 9 === 0) ? 2 : 0);
      if (targetX < 0 || targetY < 0 || targetY >= frameSize) continue;

      const targetIndex = (targetY * frameSize + targetX) * 4;
      blendPixel(out, targetIndex, glowColor[0], glowColor[1], glowColor[2], alpha * alphaScale);
    }
  }
}

function addLocalSparks(out, bounds, glowColor, slug, frameIndex) {
  let seed = hash(`${slug}:${frameIndex}`);
  const count = frameIndex === 1 ? 10 : 7;

  for (let i = 0; i < count; i += 1) {
    seed = nextSeed(seed);
    const x = Math.max(0, bounds.minX - 2 - (seed % 16));
    seed = nextSeed(seed);
    const span = Math.max(1, bounds.maxY - bounds.minY + 1);
    const y = Math.max(0, Math.min(frameSize - 1, bounds.minY + (seed % span) + ((i + frameIndex) % 5) - 2));
    const alpha = frameIndex === 1 ? 210 : 145;
    const offset = (y * frameSize + x) * 4;
    blendPixel(out, offset, glowColor[0], glowColor[1], glowColor[2], alpha);
  }
}

function joinFrames(frames) {
  const strip = Buffer.alloc(frameSize * frameCount * frameSize * 4);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const source = frames[frame];
    for (let y = 0; y < frameSize; y += 1) {
      const sourceStart = y * frameSize * 4;
      const targetStart = (y * frameSize * frameCount + frame * frameSize) * 4;
      source.copy(strip, targetStart, sourceStart, sourceStart + frameSize * 4);
    }
  }

  return strip;
}

async function writePreview(inputs) {
  const cols = 4;
  const tileWidth = frameSize * frameCount + 24;
  const tileHeight = frameSize + 24;
  const rows = Math.ceil(inputs.length / cols);
  const width = cols * tileWidth;
  const height = rows * tileHeight;
  const checker = makeChecker(width, height, 8);
  const composites = [];

  for (let index = 0; index < inputs.length; index += 1) {
    composites.push({
      input: await sharp(inputs[index].input).png().toBuffer(),
      left: (index % cols) * tileWidth + 12,
      top: Math.floor(index / cols) * tileHeight + 12,
    });
  }

  await sharp(checker, { raw: { width, height, channels: 4 } })
    .composite(composites)
    .png()
    .toFile(previewPath);
  console.log(`wrote ${path.relative(rootDir, previewPath)}`);
}

function buildMask(data) {
  const mask = new Uint8Array(frameSize * frameSize);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = data[i * 4 + 3] > 38 ? 1 : 0;
  }
  return mask;
}

function findAnchor(data) {
  const mask = buildMask(data);
  const bounds = findBounds(mask);
  if (!bounds.hasPixels) return { x: frameSize / 2, y: frameSize / 2 };

  const bodyStartX = bounds.minX + (bounds.maxX - bounds.minX + 1) * 0.38;
  let sumX = 0;
  let sumY = 0;
  let weightTotal = 0;

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (x < bodyStartX) continue;
      const offset = (y * frameSize + x) * 4;
      const alpha = data[offset + 3];
      if (alpha < 70) continue;

      const bright = Math.max(data[offset], data[offset + 1], data[offset + 2]);
      const weight = alpha * (0.4 + bright / 255);
      sumX += x * weight;
      sumY += y * weight;
      weightTotal += weight;
    }
  }

  if (weightTotal > 0) {
    return { x: sumX / weightTotal, y: sumY / weightTotal };
  }

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function alignFrameToAnchor(frame, targetAnchor) {
  const anchor = findAnchor(frame);
  const dx = Math.max(-8, Math.min(8, Math.round(targetAnchor.x - anchor.x)));
  const dy = Math.max(-6, Math.min(6, Math.round(targetAnchor.y - anchor.y)));
  if (dx === 0 && dy === 0) return Buffer.from(frame);
  return shiftFrame(frame, dx, dy);
}

function shiftFrame(frame, dx, dy) {
  const out = blankFrame();

  for (let y = 0; y < frameSize; y += 1) {
    for (let x = 0; x < frameSize; x += 1) {
      const targetX = x + dx;
      const targetY = y + dy;
      if (targetX < 0 || targetX >= frameSize || targetY < 0 || targetY >= frameSize) continue;

      const sourceOffset = (y * frameSize + x) * 4;
      const targetOffset = (targetY * frameSize + targetX) * 4;
      out[targetOffset] = frame[sourceOffset];
      out[targetOffset + 1] = frame[sourceOffset + 1];
      out[targetOffset + 2] = frame[sourceOffset + 2];
      out[targetOffset + 3] = frame[sourceOffset + 3];
    }
  }

  return out;
}

function findBounds(mask) {
  let minX = frameSize - 1;
  let minY = frameSize - 1;
  let maxX = 0;
  let maxY = 0;
  let hasPixels = false;
  for (let y = 0; y < frameSize; y += 1) {
    for (let x = 0; x < frameSize; x += 1) {
      if (!mask[y * frameSize + x]) continue;
      hasPixels = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!hasPixels) return { minX: 0, minY: 0, maxX: frameSize - 1, maxY: frameSize - 1, hasPixels: false };
  return { minX, minY, maxX, maxY, hasPixels };
}

function removeChromaGreen(data, width, height, slug) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = [];

  for (let x = 0; x < width; x += 1) {
    enqueueIfKey(x, 0);
    enqueueIfKey(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueIfKey(0, y);
    enqueueIfKey(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueueIfKey(x + 1, y);
    enqueueIfKey(x - 1, y);
    enqueueIfKey(x, y + 1);
    enqueueIfKey(x, y - 1);
  }

  const edgeMask = dilateVisited(visited, width, height, slug === "gamblers" ? 1 : 3);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if (visited[index]) {
      data[offset + 3] = 0;
      continue;
    }
    if (edgeMask[index] && isGreenFringe(data[offset], data[offset + 1], data[offset + 2], slug)) {
      data[offset + 3] = 0;
    }
  }

  function enqueueIfKey(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;

    const offset = index * 4;
    if (!isKeyGreen(data[offset], data[offset + 1], data[offset + 2], slug)) return;
    visited[index] = 1;
    queue.push(index);
  }
}

function dilateVisited(visited, width, height, radius) {
  const out = new Uint8Array(visited.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let near = false;
      for (let dy = -radius; dy <= radius && !near; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (visited[ny * width + nx]) {
            near = true;
            break;
          }
        }
      }
      out[y * width + x] = near ? 1 : 0;
    }
  }
  return out;
}

function cleanGreenEdgeSpill(data, slug) {
  const protectedGreen = slug === "gamblers" || slug === "aliens" || slug === "deviants";
  if (protectedGreen) return;

  for (let index = 0; index < frameSize * frameSize; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3];
    if (alpha === 0) continue;
    if (isGreenFringe(data[offset], data[offset + 1], data[offset + 2], slug)) {
      data[offset + 3] = Math.min(alpha, 35);
    }
  }
}

function isKeyGreen(red, green, blue, slug) {
  if (slug === "gamblers" || slug === "aliens" || slug === "deviants") {
    return green > 205 && red < 75 && blue < 75 && green - red > 145 && green - blue > 145;
  }
  return green > 145 && red < 155 && blue < 155 && green - red > 38 && green - blue > 38;
}

function isGreenFringe(red, green, blue, slug) {
  if (slug === "gamblers" || slug === "aliens" || slug === "deviants") {
    return green > 220 && red < 55 && blue < 55;
  }
  return green > 120 && green - red > 24 && green - blue > 24;
}

function blankFrame() {
  return Buffer.alloc(frameSize * frameSize * 4);
}

function parseGlowColor(glow) {
  const match = /rgba\((\d+),(\d+),(\d+),/.exec(glow);
  if (!match) return [120, 220, 255];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function mixChannel(value, target, amount) {
  return clamp(Math.round(value * (1 - amount) + target * amount));
}

function blendPixel(data, offset, red, green, blue, alpha) {
  const sourceAlpha = clamp(Math.round(alpha));
  if (sourceAlpha <= 0) return;
  const destAlpha = data[offset + 3];
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha / 255);
  if (outAlpha <= 0) return;

  data[offset] = clamp(Math.round((red * sourceAlpha + data[offset] * destAlpha * (1 - sourceAlpha / 255)) / outAlpha));
  data[offset + 1] = clamp(Math.round((green * sourceAlpha + data[offset + 1] * destAlpha * (1 - sourceAlpha / 255)) / outAlpha));
  data[offset + 2] = clamp(Math.round((blue * sourceAlpha + data[offset + 2] * destAlpha * (1 - sourceAlpha / 255)) / outAlpha));
  data[offset + 3] = clamp(Math.round(outAlpha));
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
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

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function nextSeed(seed) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
