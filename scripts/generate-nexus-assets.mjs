import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outRoot = path.join(root, "public", "nexus-assets");
const sourceSvgRoot = path.join(outRoot, "_source-svg");
const aiPortraitSource = path.join(root, "analysis", "nexus-video-frames", "portrait_chroma_test.png");
const aiPortraitChroma = path.join(
  process.env.USERPROFILE ?? "",
  ".codex",
  "generated_images",
  "019de57c-1b7e-7060-8721-5f141d2df930",
  "ig_097409446200b6110169f51f63c2688191a5dd4170e00c2d02.png",
);

const assets = [];

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

function svg(width, height, body, defs = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
    <filter id="hardText" x="-20%" y="-30%" width="140%" height="170%">
      <feDropShadow dx="0" dy="4" stdDeviation="0.5" flood-color="#2a1210" flood-opacity="0.95"/>
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#fff0b0" flood-opacity="0.22"/>
    </filter>
    <linearGradient id="steel" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#e7e5df"/>
      <stop offset="0.42" stop-color="#8b9298"/>
      <stop offset="0.62" stop-color="#f7f0d5"/>
      <stop offset="1" stop-color="#5a5151"/>
    </linearGradient>
    <linearGradient id="darkPanel" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#4b5154" stop-opacity="0.95"/>
      <stop offset="0.44" stop-color="#191a1e" stop-opacity="0.96"/>
      <stop offset="1" stop-color="#09090d" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#fff4a2"/>
      <stop offset="0.55" stop-color="#e3a23a"/>
      <stop offset="1" stop-color="#77471f"/>
    </linearGradient>
    <linearGradient id="danger" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#ff8a62"/>
      <stop offset="0.52" stop-color="#e13c38"/>
      <stop offset="1" stop-color="#641d25"/>
    </linearGradient>
    <linearGradient id="power" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#88ddff"/>
      <stop offset="0.55" stop-color="#386bd3"/>
      <stop offset="1" stop-color="#17255f"/>
    </linearGradient>
    <linearGradient id="greenGlow" x1="0" x2="1">
      <stop offset="0" stop-color="#e8ffd7" stop-opacity="0"/>
      <stop offset="0.2" stop-color="#aaff65" stop-opacity="0.9"/>
      <stop offset="0.68" stop-color="#38d16f" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#0e593e" stop-opacity="0"/>
    </linearGradient>
    ${defs}
  </defs>
  ${body}
</svg>`;
}

async function renderSvg(folder, name, width, height, body, defs = "") {
  const dir = path.join(outRoot, folder);
  const srcDir = path.join(sourceSvgRoot, folder);
  await ensureDir(dir);
  await ensureDir(srcDir);
  const svgText = svg(width, height, body, defs);
  const svgPath = path.join(srcDir, `${name}.svg`);
  const pngPath = path.join(dir, `${name}.png`);
  await writeFile(svgPath, svgText, "utf8");
  await sharp(Buffer.from(svgText)).png().toFile(pngPath);
  assets.push({ id: `${folder}/${name}`, path: `/${path.relative(path.join(root, "public"), pngPath).replaceAll("\\", "/")}`, width, height, kind: "deterministic" });
}

function titleText(text, x, y, size, fill = "url(#steel)") {
  return `
    <text x="${x}" y="${y}" text-anchor="middle"
      font-family="Impact, 'Arial Black', Arial, sans-serif"
      font-size="${size}" font-weight="900" letter-spacing="1.4"
      fill="${fill}" stroke="#311713" stroke-width="${Math.max(2, size * 0.06)}" paint-order="stroke fill"
      filter="url(#hardText)">${text}</text>`;
}

function statBadge(x, y, label, fillId, size = 36) {
  const r = size / 2;
  return `
    <g filter="url(#softShadow)">
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.18}" fill="url(#${fillId})" stroke="#140d0f" stroke-width="3"/>
      <rect x="${x + 4}" y="${y + 4}" width="${size - 8}" height="${size - 8}" rx="${size * 0.13}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>
      <text x="${x + r}" y="${y + r + size * 0.18}" text-anchor="middle" font-family="Arial Black, Arial" font-size="${size * 0.55}" fill="#fff7dc" stroke="#1a0d0d" stroke-width="2" paint-order="stroke fill">${label}</text>
    </g>`;
}

function cardFrameBody(width, height, mode = "front") {
  const pad = Math.round(width * 0.055);
  const corner = Math.round(width * 0.055);
  const artX = pad + 10;
  const artY = Math.round(height * 0.12);
  const artW = width - (pad + 10) * 2;
  const artH = Math.round(height * 0.42);
  const nameY = artY + artH + 23;
  const statY = nameY + 16;
  const textY = statY + 42;
  const textH = height - textY - pad - 8;

  return `
    <mask id="cardBodyCutout">
      <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" rx="${corner}" fill="#fff"/>
      <rect x="${artX}" y="${artY}" width="${artW}" height="${artH}" rx="8" fill="#000"/>
    </mask>
    <g filter="url(#softShadow)">
      <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" rx="${corner}" fill="rgba(21,18,22,0.84)" mask="url(#cardBodyCutout)"/>
      <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" rx="${corner}" fill="none" stroke="#1e1410" stroke-width="5"/>
      <rect x="${pad + 6}" y="${pad + 6}" width="${width - pad * 2 - 12}" height="${height - pad * 2 - 12}" rx="${corner - 3}" fill="none" stroke="url(#gold)" stroke-width="2"/>
      <path d="M${pad + 8} ${pad + 24} L${width - pad - 8} ${pad + 15} L${width - pad - 16} ${pad + 36} L${pad + 14} ${pad + 42} Z" fill="rgba(255,236,148,0.2)"/>
      <rect x="${artX}" y="${artY}" width="${artW}" height="${artH}" rx="8" fill="rgba(0,0,0,0.02)" stroke="#e8ded0" stroke-width="3"/>
      <rect x="${artX + 6}" y="${artY + 6}" width="${artW - 12}" height="${artH - 12}" rx="5" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="1"/>
      <rect x="${artX}" y="${nameY}" width="${artW}" height="26" rx="4" fill="rgba(14,16,19,0.84)" stroke="#d6c08a" stroke-width="1.5"/>
      ${statBadge(artX, statY, "7", "power", Math.round(width * 0.19))}
      ${statBadge(artX + Math.round(width * 0.22), statY, "5", "danger", Math.round(width * 0.19))}
      <rect x="${artX}" y="${textY}" width="${artW}" height="${textH * 0.46}" rx="4" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <rect x="${artX}" y="${textY + textH * 0.53}" width="${artW}" height="${textH * 0.46}" rx="4" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <path d="M${pad + 6} ${height - pad - 22} L${width - pad - 8} ${height - pad - 28}" stroke="rgba(255,235,163,0.28)" stroke-width="2"/>
    </g>
    ${mode === "front" ? `
      <text x="${artX + 10}" y="${nameY + 18}" font-family="Arial Black, Arial" font-size="${Math.round(width * 0.075)}" fill="#fff3d1" stroke="#1b1110" stroke-width="1.5" paint-order="stroke fill">ИМЯ</text>
      <text x="${artX + 8}" y="${textY + 19}" font-family="Arial Black, Arial" font-size="${Math.round(width * 0.052)}" fill="#d7efe9">+ способность</text>
      <text x="${artX + 8}" y="${textY + textH * 0.53 + 19}" font-family="Arial Black, Arial" font-size="${Math.round(width * 0.052)}" fill="#e7dfcf">+ бонус клана</text>
    ` : ""}`;
}

async function createCharacterAssets() {
  const dir = path.join(outRoot, "characters");
  await ensureDir(dir);
  await copyFile(aiPortraitChroma, path.join(dir, "cyber-brawler-chroma-source.png"));
  await sharp(aiPortraitSource).png().toFile(path.join(dir, "cyber-brawler-cutout-full.png"));
  await sharp(aiPortraitSource)
    .resize({ width: 256, height: 320, fit: "cover", position: "top" })
    .png()
    .toFile(path.join(dir, "cyber-brawler-card-portrait.png"));
  await sharp(aiPortraitSource)
    .resize({ width: 128, height: 160, fit: "cover", position: "top" })
    .png()
    .toFile(path.join(dir, "cyber-brawler-thumb.png"));
  assets.push(
    { id: "characters/cyber-brawler-chroma-source", path: "/nexus-assets/characters/cyber-brawler-chroma-source.png", width: 1024, height: 1536, kind: "imagegen-chromakey-source" },
    { id: "characters/cyber-brawler-cutout-full", path: "/nexus-assets/characters/cyber-brawler-cutout-full.png", width: 1024, height: 1536, kind: "imagegen-alpha-png" },
    { id: "characters/cyber-brawler-card-portrait", path: "/nexus-assets/characters/cyber-brawler-card-portrait.png", width: 256, height: 320, kind: "imagegen-alpha-png" },
    { id: "characters/cyber-brawler-thumb", path: "/nexus-assets/characters/cyber-brawler-thumb.png", width: 128, height: 160, kind: "imagegen-alpha-png" },
  );

  await renderSvg(
    "characters",
    "portrait-slot-silhouette",
    256,
    320,
    `<path d="M128 34c47 0 82 37 82 88 0 37-17 62-38 76 42 15 70 49 78 96H6c8-49 38-84 81-98-21-15-38-39-38-74 0-51 33-88 79-88Z" fill="rgba(18,18,22,0.74)" stroke="#e9dca8" stroke-width="5"/>
     <path d="M62 112c28-52 84-67 133-39-17-38-50-58-87-51-39 8-65 39-65 83 0 11 2 21 6 30 3-9 7-17 13-23Z" fill="rgba(255,232,132,0.2)"/>`,
  );
}

async function createCardSamples() {
  await renderSvg("cards", "card-frame-empty-192x288", 192, 288, cardFrameBody(192, 288, "empty"));
  await renderSvg("cards", "card-frame-empty-128x192", 128, 192, cardFrameBody(128, 192, "empty"));
  await renderSvg("cards", "card-frame-readable-192x288", 192, 288, cardFrameBody(192, 288, "front"));
  await renderSvg("cards", "card-selection-glow-220x320", 220, 320, `
    <rect x="15" y="15" width="190" height="290" rx="14" fill="none" stroke="#fff6a2" stroke-width="7" opacity="0.95" filter="url(#softShadow)"/>
    <rect x="22" y="22" width="176" height="276" rx="10" fill="none" stroke="#ff3d91" stroke-width="3" opacity="0.7"/>
  `);
  await renderSvg("cards", "card-used-dim-overlay-192x288", 192, 288, `
    <rect x="8" y="8" width="176" height="272" rx="11" fill="rgba(0,0,0,0.58)"/>
    <path d="M45 220 L148 70" stroke="rgba(255,255,255,0.28)" stroke-width="7" stroke-linecap="round"/>
  `);
  await renderSvg("cards", "portrait-window-mask-150x120", 150, 120, `
    <rect x="4" y="4" width="142" height="112" rx="8" fill="#ffffff"/>
  `);

  const cardW = 192;
  const cardH = 288;
  const portrait = await sharp(aiPortraitSource)
    .resize({ width: 158, height: 122, fit: "cover", position: "top" })
    .png()
    .toBuffer();
  const frameSvg = svg(cardW, cardH, `
    ${cardFrameBody(cardW, cardH, "empty")}
    <text x="28" y="179" font-family="Arial Black, Arial" font-size="15" fill="#fff3d1" stroke="#1b1110" stroke-width="1.5" paint-order="stroke fill">КВИК</text>
    <text x="30" y="236" font-family="Arial Black, Arial" font-size="10" fill="#d7efe9">+1 сила</text>
    <text x="30" y="263" font-family="Arial Black, Arial" font-size="10" fill="#e7dfcf">+2 урона</text>
  `);
  const cardPath = path.join(outRoot, "cards", "card-sample-front-power-damage.png");
  await sharp({
    create: {
      width: cardW,
      height: cardH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: portrait, left: 17, top: 35 },
      { input: Buffer.from(frameSvg), left: 0, top: 0 },
    ])
    .png()
    .toFile(cardPath);
  assets.push({ id: "cards/card-sample-front-power-damage", path: "/nexus-assets/cards/card-sample-front-power-damage.png", width: cardW, height: cardH, kind: "composite" });

  await sharp(cardPath).resize(96, 144).png().toFile(path.join(outRoot, "cards", "card-sample-mini.png"));
  assets.push({ id: "cards/card-sample-mini", path: "/nexus-assets/cards/card-sample-mini.png", width: 96, height: 144, kind: "composite" });
}

async function createUiAssets() {
  await renderSvg("ui", "duel-nameplate-left-260x34", 260, 34, `
    <path d="M3 7 Q3 3 9 3 H242 L257 17 L242 31 H9 Q3 31 3 25 Z" fill="url(#darkPanel)" stroke="#d7d8dc" stroke-width="3"/>
    <path d="M18 8 H235" stroke="rgba(255,255,255,0.26)" stroke-width="2"/>
  `);
  await renderSvg("ui", "duel-nameplate-right-260x34", 260, 34, `
    <path d="M257 7 Q257 3 251 3 H18 L3 17 L18 31 H251 Q257 31 257 25 Z" fill="url(#darkPanel)" stroke="#d7d8dc" stroke-width="3"/>
    <path d="M25 8 H242" stroke="rgba(255,255,255,0.26)" stroke-width="2"/>
  `);
  await renderSvg("ui", "hp-bar-empty-260x20", 260, 20, `
    <rect x="2" y="2" width="256" height="16" rx="8" fill="#151719" stroke="#d3d4d8" stroke-width="2"/>
    <path d="M8 7 H252" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
  `);
  await renderSvg("ui", "hp-bar-fill-green-240x14", 240, 14, `
    <rect x="0" y="0" width="240" height="14" rx="7" fill="url(#greenGlow)"/>
    <path d="M8 3 H226" stroke="#eaffd4" stroke-opacity="0.62" stroke-width="2"/>
  `);
  await renderSvg("ui", "energy-bar-fill-yellow-240x14", 240, 14, `
    <rect x="0" y="0" width="240" height="14" rx="7" fill="url(#gold)"/>
    <path d="M8 3 H226" stroke="#fffbd0" stroke-opacity="0.72" stroke-width="2"/>
  `);
  await renderSvg("ui", "energy-pip-yellow-20x20", 20, 20, `
    <circle cx="10" cy="10" r="8" fill="url(#gold)" stroke="#1d1410" stroke-width="2"/>
    <circle cx="8" cy="7" r="2.5" fill="#fff6b8"/>
  `);
  await renderSvg("ui", "power-badge-blue-42x42", 42, 42, statBadge(1, 1, "7", "power", 40));
  await renderSvg("ui", "damage-badge-red-42x42", 42, 42, statBadge(1, 1, "5", "danger", 40));
  await renderSvg("ui", "ability-row-160x24", 160, 24, `
    <rect x="1" y="1" width="158" height="22" rx="4" fill="rgba(0,0,0,0.62)" stroke="rgba(255,255,255,0.24)" stroke-width="1"/>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="#44ce7d" stroke="#0c3320" stroke-width="1"/>
  `);
  await renderSvg("ui", "yellow-warning-marker-28x38", 28, 38, `
    <path d="M14 3 L26 25 H17 L14 35 L11 25 H2 Z" fill="#ffdd54" stroke="#2b1b0d" stroke-width="3" stroke-linejoin="round"/>
    <rect x="12.2" y="10" width="3.6" height="12" rx="1.8" fill="#2b1b0d"/>
    <circle cx="14" cy="26" r="2.1" fill="#2b1b0d"/>
  `);
  await renderSvg("ui", "ok-button-70x36", 70, 36, `
    <rect x="3" y="3" width="64" height="30" rx="5" fill="url(#gold)" stroke="#2a180d" stroke-width="3"/>
    <text x="35" y="24" text-anchor="middle" font-family="Arial Black, Arial" font-size="16" fill="#291307">OK</text>
  `);
}

async function createBanners() {
  const banners = [
    ["turn-yours", "ТВОЙ ХОД", 360, 74, 46],
    ["turn-opponent", "ХОД СОПЕРНИКА", 440, 74, 40],
    ["battle", "БОЙ", 240, 104, 78],
    ["vs", "VS", 190, 120, 86],
    ["round-won", "РАУНД ВЫИГРАН", 520, 104, 54],
    ["round-lost", "РАУНД ПРОИГРАН", 520, 104, 54],
    ["defeat", "ПОРАЖЕНИЕ", 430, 108, 62],
    ["round-1", "РАУНД 1", 360, 104, 66],
    ["round-3", "РАУНД 3", 360, 104, 66],
    ["round-4", "РАУНД 4", 360, 104, 66],
  ];

  for (const [name, text, width, height, size] of banners) {
    await renderSvg("banners", name, width, height, `
      <path d="M22 ${height / 2} H${width - 22}" stroke="rgba(255,210,105,0.55)" stroke-width="8" stroke-linecap="round"/>
      <path d="M0 ${height / 2} L36 ${height / 2 - 18} H${width - 36} L${width} ${height / 2} L${width - 36} ${height / 2 + 18} H36 Z" fill="rgba(22,13,14,0.45)" stroke="rgba(255,235,166,0.5)" stroke-width="2"/>
      ${titleText(text, width / 2, height / 2 + size * 0.34, size)}
    `);
  }
}

async function createVfx() {
  await renderSvg("vfx", "projectile-green-160x64", 160, 64, `
    <path d="M13 34 C44 14 83 12 148 31 C88 55 44 54 13 34 Z" fill="url(#greenGlow)" opacity="0.92"/>
    <path d="M46 31 L88 19 L79 31 L121 29 L78 41 L88 33 Z" fill="#d8ff7d" stroke="#125135" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="124" cy="31" r="7" fill="#ecffb9"/>
  `);
  await renderSvg("vfx", "projectile-fire-120x58", 120, 58, `
    <path d="M6 30 C36 2 73 7 113 28 C72 52 33 55 6 30 Z" fill="rgba(255,82,54,0.62)"/>
    <path d="M34 30 C51 9 78 15 102 29 C78 44 51 48 34 30 Z" fill="#ffd24c"/>
    <circle cx="88" cy="29" r="9" fill="#fff3ac"/>
  `);
  await renderSvg("vfx", "projectile-ice-140x52", 140, 52, `
    <path d="M4 28 L43 11 L36 24 L84 7 L68 27 L132 20 L76 38 L86 48 L43 35 L36 45 Z" fill="#dffcff" stroke="#52cbe8" stroke-width="3" stroke-linejoin="round"/>
    <path d="M18 28 H120" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  `);
  await renderSvg("vfx", "impact-burst-128x128", 128, 128, `
    <path d="M64 4 L75 44 L111 21 L88 57 L124 65 L87 73 L111 109 L75 85 L64 124 L53 85 L17 109 L40 73 L4 65 L41 57 L17 21 L53 44 Z" fill="rgba(255,78,56,0.78)" stroke="#ffe380" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="64" cy="65" r="24" fill="#fff1a7"/>
  `);
  await renderSvg("vfx", "slash-white-160x82", 160, 82, `
    <path d="M10 66 C51 21 105 7 151 10 C104 26 55 48 10 66 Z" fill="rgba(255,255,255,0.92)"/>
    <path d="M23 73 C69 41 112 25 148 23" stroke="#78dfff" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
  `);
  await renderSvg("vfx", "target-arrow-down-44x44", 44, 44, `
    <path d="M22 39 L5 18 H15 V5 H29 V18 H39 Z" fill="#ffdf54" stroke="#2c170b" stroke-width="3" stroke-linejoin="round"/>
  `);
  await renderSvg("vfx", "screen-vignette-overlay-664x480", 664, 480, `
    <rect x="0" y="0" width="664" height="480" fill="rgba(0,0,0,0.22)"/>
    <ellipse cx="332" cy="238" rx="240" ry="150" fill="rgba(0,0,0,0)"/>
    <path d="M0 0 H664 V480 H0 Z" fill="rgba(22,0,30,0.18)"/>
  `);
}

async function createBackgroundAssets() {
  const dir = path.join(outRoot, "backgrounds");
  await ensureDir(dir);
  await sharp(path.join(root, "public", "generated", "nexus-battle-bg.png"))
    .resize({ width: 664, height: 480, fit: "cover" })
    .png()
    .toFile(path.join(dir, "arena-bar-664x480.png"));
  await sharp(path.join(root, "public", "generated", "nexus-battle-bg.png"))
    .resize({ width: 1024, height: 576, fit: "cover" })
    .png()
    .toFile(path.join(dir, "arena-bar-1024x576.png"));
  assets.push(
    { id: "backgrounds/arena-bar-664x480", path: "/nexus-assets/backgrounds/arena-bar-664x480.png", width: 664, height: 480, kind: "resized-generated-background" },
    { id: "backgrounds/arena-bar-1024x576", path: "/nexus-assets/backgrounds/arena-bar-1024x576.png", width: 1024, height: 576, kind: "resized-generated-background" },
  );

  await renderSvg("backgrounds", "arena-letterbox-bars-664x480", 664, 480, `
    <rect x="0" y="0" width="664" height="74" fill="rgba(0,0,0,0.96)"/>
    <rect x="0" y="406" width="664" height="74" fill="rgba(0,0,0,0.96)"/>
  `);
  await renderSvg("backgrounds", "board-horizontal-band-664x128", 664, 128, `
    <rect x="0" y="0" width="664" height="128" fill="rgba(238,238,225,0.5)"/>
    <path d="M0 0 H664 M0 127 H664" stroke="rgba(255,255,255,0.68)" stroke-width="2"/>
  `);
}

async function createPromptPack() {
  const promptDir = path.join(outRoot, "prompts");
  await ensureDir(promptDir);
  const prompts = {
    characterPortraitChromakey: {
      useCase: "stylized-concept",
      assetType: "game character portrait cutout for card art",
      prompt:
        "Create one original Нексус-style cyberpunk/comic battle-card character bust on a perfectly flat solid #00ff00 chroma-key background. Opaque clean silhouette, bold ink outlines, cel shading, expressive face, readable at 128x160, no text, no watermark, no green in subject, no cast shadow.",
      postprocess:
        "Run C:/Users/latan/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py with --auto-key border --soft-matte --despill, then crop to 256x320 for card portraits.",
    },
    battleVfxChromakey: {
      useCase: "stylized-concept",
      assetType: "single projectile or hit effect",
      prompt:
        "Create one isolated arcade battle VFX sprite on a perfectly flat solid #ff00ff chroma-key background: energetic projectile, hit burst, slash, or elemental effect. Keep the effect centered, crisp, high contrast, no text, no shadows, no magenta in the effect.",
    },
  };
  await writeFile(path.join(promptDir, "imagegen-prompts.json"), `${JSON.stringify(prompts, null, 2)}\n`, "utf8");
}

async function createPreviewSheet() {
  const previewItems = assets.filter((asset) => asset.path.endsWith(".png") && !asset.id.includes("_source")).slice(0, 42);
  const cellW = 180;
  const cellH = 170;
  const cols = 5;
  const rows = Math.ceil(previewItems.length / cols);
  const width = cols * cellW;
  const height = rows * cellH;
  const checker = Buffer.from(svg(width, height, `
    <rect width="${width}" height="${height}" fill="#26242a"/>
    <pattern id="check" width="24" height="24" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill="#3a3840"/>
      <rect x="12" y="12" width="12" height="12" fill="#3a3840"/>
    </pattern>
    <rect width="${width}" height="${height}" fill="url(#check)" opacity="0.75"/>
  `));

  const composites = [];
  for (let index = 0; index < previewItems.length; index += 1) {
    const item = previewItems[index];
    const file = path.join(root, "public", item.path);
    const meta = await sharp(file).metadata();
    const maxW = cellW - 24;
    const maxH = cellH - 38;
    const scale = Math.min(maxW / meta.width, maxH / meta.height, 1);
    const resized = await sharp(file)
      .resize(Math.round(meta.width * scale), Math.round(meta.height * scale), { fit: "inside" })
      .png()
      .toBuffer();
    const col = index % cols;
    const row = Math.floor(index / cols);
    const left = col * cellW + Math.round((cellW - Math.round(meta.width * scale)) / 2);
    const top = row * cellH + 12;
    composites.push({ input: resized, left, top });
    const label = Buffer.from(svg(cellW, 28, `
      <text x="${cellW / 2}" y="18" text-anchor="middle" font-family="Arial" font-size="10" fill="#f5edcc">${item.id}</text>
    `));
    composites.push({ input: label, left: col * cellW, top: row * cellH + cellH - 28 });
  }

  await sharp(checker)
    .composite(composites)
    .png()
    .toFile(path.join(outRoot, "preview-sheet.png"));
}

async function writeManifest() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceVideo: "C:/Users/latan/Downloads/Нексус.mp4",
    notes: [
      "UI, banners, card shells, bars, and VFX are deterministic transparent PNGs generated from SVG sources.",
      "Character sample was generated with ImageGen on chroma key, then converted to alpha PNG locally.",
      "Use /nexus-assets/prompts/imagegen-prompts.json to generate new card portraits and VFX variants.",
    ],
    assets,
  };
  await writeFile(path.join(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main() {
  await ensureDir(outRoot);
  await createCharacterAssets();
  await createCardSamples();
  await createUiAssets();
  await createBanners();
  await createVfx();
  await createBackgroundAssets();
  await createPromptPack();
  await writeManifest();
  await createPreviewSheet();
  console.log(`Generated ${assets.length} Нексус assets in ${path.relative(root, outRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
