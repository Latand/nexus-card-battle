import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { clanProjectileAssets } from "../src/features/battle/ui/v2/effects/projectileAssets.ts";

const sourcePath = process.argv[2];
const cols = Number.parseInt(getArg("--cols") ?? "6", 10);
const outputSize = Number.parseInt(getArg("--size") ?? "16", 10);
const outputDir = path.resolve(
  import.meta.dirname,
  "..",
  "public/nexus-assets/projectiles/clans",
);

if (!sourcePath) {
  throw new Error("Usage: bun scripts/split-projectile-spritesheet.mjs <spritesheet.png> [--cols=6] [--size=16]");
}

await mkdir(outputDir, { recursive: true });

const metadata = await sharp(sourcePath).metadata();
if (!metadata.width || !metadata.height) {
  throw new Error(`Cannot read image dimensions from ${sourcePath}`);
}

const rows = Math.ceil(clanProjectileAssets.length / cols);
const tileWidth = Math.floor(metadata.width / cols);
const tileHeight = Math.floor(metadata.height / rows);

for (let index = 0; index < clanProjectileAssets.length; index += 1) {
  const asset = clanProjectileAssets[index];
  const left = (index % cols) * tileWidth;
  const top = Math.floor(index / cols) * tileHeight;
  const { data, info } = await sharp(sourcePath)
    .extract({ left, top, width: tileWidth, height: tileHeight })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  removeFlatGreenChroma(data);

  const outPath = path.join(outputDir, `${asset.slug}.png`);
  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(outputSize, outputSize, { fit: "contain", kernel: "nearest" })
    .png()
    .toFile(outPath);

  console.log(`wrote ${asset.slug}.png`);
}

function removeFlatGreenChroma(data) {
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (red < 32 && green > 220 && blue < 32) {
      data[index + 3] = 0;
    }
  }
}

function getArg(name) {
  const match = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : undefined;
}
