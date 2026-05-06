// Lightweight SFX helper for the clash overlay. Sound files live in
// /public/nexus-assets/sounds/. If a file is missing the audio.play()
// promise rejects silently - that is intentional. Generation of the
// underlying mp3s happens in a parallel task; this helper degrades
// gracefully when the assets aren't present yet.
import { getProjectileAssetForClan } from "./projectileAssets";

type SoundKind =
  | "hit"
  | "crit"
  | "death"
  | "projectileLaunch"
  | "projectileCardImpact"
  | "projectileImpact"
  | "projectileBodyImpact"
  | "roundEnd"
  | "matchStart"
  | "roundStart"
  | "playerTurn"
  | "opponentTurn"
  | "playerMove"
  | "opponentMove"
  | "victory"
  | "defeat";

type SoundOptions = {
  clan?: string;
};

const SOUNDS: Partial<Record<SoundKind, string | string[]>> = {
  hit: [
    "/nexus-assets/sounds/hit-1.mp3",
    "/nexus-assets/sounds/hit-2.mp3",
    "/nexus-assets/sounds/hit-3.mp3",
    "/nexus-assets/sounds/hit-4.mp3",
    "/nexus-assets/sounds/hit-5.mp3",
  ],
  crit: "/nexus-assets/sounds/crit-1.mp3",
  death: "/nexus-assets/sounds/death.mp3",
  projectileLaunch: "/nexus-assets/sounds/projectile-launch.mp3",
  projectileCardImpact: [
    "/nexus-assets/sounds/hit-1.mp3",
    "/nexus-assets/sounds/hit-2.mp3",
    "/nexus-assets/sounds/hit-3.mp3",
    "/nexus-assets/sounds/hit-4.mp3",
    "/nexus-assets/sounds/hit-5.mp3",
  ],
  projectileImpact: "/nexus-assets/sounds/projectile-impact.mp3",
  projectileBodyImpact: "/nexus-assets/sounds/projectile-impact.mp3",
  roundEnd: "/nexus-assets/sounds/round-end.mp3",
  matchStart: "/nexus-assets/sounds/ui/match-start.mp3",
  roundStart: "/nexus-assets/sounds/ui/round-start.mp3",
  playerTurn: "/nexus-assets/sounds/ui/player-turn.mp3",
  opponentTurn: "/nexus-assets/sounds/ui/opponent-turn.mp3",
  playerMove: "/nexus-assets/sounds/ui/player-move.mp3",
  opponentMove: "/nexus-assets/sounds/ui/opponent-move.mp3",
  victory: "/nexus-assets/sounds/ui/victory.mp3",
  defeat: "/nexus-assets/sounds/ui/defeat.mp3",
};

const PROJECTILE_SOUND_SUFFIXES: Partial<Record<SoundKind, string>> = {
  projectileLaunch: "launch",
  projectileCardImpact: "card-impact",
  projectileBodyImpact: "body-impact",
};

export function playSound(kind: SoundKind, volume = 0.55, options: SoundOptions = {}): void {
  if (typeof window === "undefined") return;
  const src = getSoundSrc(kind, options);
  if (!src) return;

  try {
    const audio = new Audio(src);
    audio.volume = volume;
    void audio.play().catch(() => {
      /* user gesture not done yet, or asset missing - ignore */
    });
  } catch {
    /* no-op */
  }
}

function getSoundSrc(kind: SoundKind, options: SoundOptions) {
  const clanSound = getClanProjectileSoundSrc(kind, options.clan);
  if (clanSound) return clanSound;

  const entry = SOUNDS[kind];
  if (!entry) return "";
  return Array.isArray(entry)
    ? entry[Math.floor(Math.random() * entry.length)]
    : entry;
}

function getClanProjectileSoundSrc(kind: SoundKind, clan: string | undefined) {
  const suffix = PROJECTILE_SOUND_SUFFIXES[kind];
  if (!suffix) return "";

  const asset = getProjectileAssetForClan(clan);
  if (!asset) return "";
  return `/nexus-assets/sounds/projectiles/${asset.slug}-${suffix}.mp3`;
}
