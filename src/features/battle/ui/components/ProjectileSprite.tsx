import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";

const projectileAssets = [
  {
    src: "/generated/projectiles/fire-orb.png",
    glow: "drop-shadow-[0_0_12px_rgba(255,100,33,0.84)]",
  },
  {
    src: "/generated/projectiles/plasma-bolt.png",
    glow: "drop-shadow-[0_0_14px_rgba(89,223,255,0.86)]",
  },
  {
    src: "/generated/projectiles/saw-disc.png",
    glow: "drop-shadow-[0_0_13px_rgba(255,212,60,0.76)]",
  },
  {
    src: "/generated/projectiles/toxic-orb.png",
    glow: "drop-shadow-[0_0_14px_rgba(232,75,255,0.78)]",
  },
];

export function ProjectileSprite({
  kind,
  direction,
  scale = 1,
}: {
  kind: number;
  direction: 1 | -1;
  scale?: number;
}) {
  const asset = projectileAssets[Math.abs(kind) % projectileAssets.length];

  return (
    <span
      className={cn(
        "absolute inset-0 bg-contain bg-center bg-no-repeat animate-[nexus-projectile-spin_var(--spin)_linear_infinite]",
        asset.glow,
      )}
      style={
        {
          backgroundImage: `url('${asset.src}')`,
          "--sprite-flip": direction,
          "--sprite-scale": scale,
          "--sprite-turn": direction === 1 ? "360deg" : "-360deg",
          "--spin": `${820 + (Math.abs(kind) % 4) * 170}ms`,
        } as CSSProperties
      }
    />
  );
}
