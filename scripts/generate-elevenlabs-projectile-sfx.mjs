import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const promptPath = path.join(rootDir, "docs/generated-assets/projectile-asset-prompts.md");
const projectileOutputDir = path.join(rootDir, "public/nexus-assets/sounds/projectiles");
const uiOutputDir = path.join(rootDir, "public/nexus-assets/sounds/ui");
const apiKey = process.env.ELEVENLABS_API_KEY;
const minDurationSeconds = 0.5;
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").map((value) => value.trim()).filter(Boolean)) : null;

if (!apiKey && !dryRun) {
  throw new Error("ELEVENLABS_API_KEY is required. Use --dry-run to print the planned files without generating paid audio.");
}

const promptMarkdown = await readFile(promptPath, "utf8");
const prompts = parsePrompts(promptMarkdown);
const uiPrompts = parseUiPrompts(promptMarkdown);
await mkdir(projectileOutputDir, { recursive: true });
await mkdir(uiOutputDir, { recursive: true });

for (const entry of uiPrompts) {
  await generateSound({
    outputDir: uiOutputDir,
    filename: entry.filename,
    label: entry.filename,
    durationSeconds: entry.durationSeconds,
    text: entry.text,
  });
}

for (const entry of prompts) {
  if (only && !only.has(entry.slug)) continue;

  await generateSound({
    outputDir: projectileOutputDir,
    filename: `${entry.slug}-launch.mp3`,
    label: `${entry.slug}-launch`,
    durationSeconds: 0.5,
    text: entry.launch,
  });
  await generateSound({
    outputDir: projectileOutputDir,
    filename: `${entry.slug}-card-impact.mp3`,
    label: `${entry.slug}-card-impact`,
    durationSeconds: 0.5,
    text: entry.cardImpact,
  });
  await generateSound({
    outputDir: projectileOutputDir,
    filename: `${entry.slug}-body-impact.mp3`,
    label: `${entry.slug}-body-impact`,
    durationSeconds: 0.5,
    text: entry.bodyImpact,
  });
}

async function generateSound({ outputDir, filename, label, durationSeconds, text }) {
  const filePath = path.join(outputDir, filename);
  if (!force && existsSync(filePath)) {
    console.log(`skip ${label}: already exists`);
    return;
  }

  if (dryRun) {
    console.log(`would generate ${label}: ${text}`);
    return;
  }

  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_text_to_sound_v2",
      duration_seconds: durationSeconds,
      prompt_influence: 0.75,
      loop: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs failed for ${label}: ${response.status} ${await response.text()}`);
  }

  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  console.log(`generated ${label}`);
}

function parsePrompts(markdown) {
  const entries = [];
  let current = null;

  for (const line of markdown.split("\n")) {
    const heading = /^## .+ \/ `([^`]+)`$/.exec(line);
    if (heading) {
      if (current) entries.push(assertComplete(current));
      current = { slug: heading[1] };
      continue;
    }

    if (!current) continue;
    assignPromptLine(current, line, "Launch", "launch");
    assignPromptLine(current, line, "Card impact", "cardImpact");
    assignPromptLine(current, line, "Body impact", "bodyImpact");
  }

  if (current) entries.push(assertComplete(current));
  return entries;
}

function parseUiPrompts(markdown) {
  const entries = [];
  const linePattern = /^`([^`]+\.mp3)`: `(.+)`$/;

  for (const line of markdown.split("\n")) {
    const match = linePattern.exec(line);
    if (!match) continue;
    entries.push({
      filename: match[1],
      text: match[2],
      durationSeconds: match[1] === "victory.mp3" || match[1] === "defeat.mp3" ? 0.8 : minDurationSeconds,
    });
  }

  return entries;
}

function assignPromptLine(entry, line, label, key) {
  const match = new RegExp(`^${label}: \`(.+)\`$`).exec(line);
  if (match) entry[key] = match[1];
}

function assertComplete(entry) {
  for (const key of ["slug", "launch", "cardImpact", "bodyImpact"]) {
    if (!entry[key]) throw new Error(`Incomplete projectile prompt entry: missing ${key}`);
  }
  return entry;
}
