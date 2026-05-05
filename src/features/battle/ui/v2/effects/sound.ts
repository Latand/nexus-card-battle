// Lightweight SFX helper for the clash overlay. Sound files live in
// /public/nexus-assets/sounds/. If a file is missing the audio.play()
// promise rejects silently — that is intentional. Generation of the
// underlying mp3s happens in a parallel task; this helper degrades
// gracefully when the assets aren't present yet.

type SoundKind =
  | "hit"
  | "crit"
  | "death"
  | "projectileLaunch"
  | "projectileImpact"
  | "roundEnd";

const SOUNDS: Record<SoundKind, string | string[]> = {
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
  projectileImpact: "/nexus-assets/sounds/projectile-impact.mp3",
  roundEnd: "/nexus-assets/sounds/round-end.mp3",
};

export function playSound(kind: SoundKind, volume = 0.55): void {
  if (typeof window === "undefined") return;
  const entry = SOUNDS[kind];
  const src = Array.isArray(entry)
    ? entry[Math.floor(Math.random() * entry.length)]
    : entry;
  if (!src) return;
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    void audio.play().catch(() => {
      /* user gesture not done yet, or asset missing — ignore */
    });
  } catch {
    /* no-op */
  }
}
