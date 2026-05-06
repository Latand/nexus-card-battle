import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { getProjectileAssetForClan } from "./projectileAssets";

const projectileAssets = [
  {
    src: "/nexus-assets/projectiles/fire-orb.png",
    glow: "drop-shadow-[0_0_12px_rgba(255,100,33,0.84)]",
  },
  {
    src: "/nexus-assets/projectiles/plasma-bolt.png",
    glow: "drop-shadow-[0_0_14px_rgba(89,223,255,0.86)]",
  },
  {
    src: "/nexus-assets/projectiles/saw-disc.png",
    glow: "drop-shadow-[0_0_13px_rgba(255,212,60,0.76)]",
  },
  {
    src: "/nexus-assets/projectiles/toxic-orb.png",
    glow: "drop-shadow-[0_0_14px_rgba(232,75,255,0.78)]",
  },
];

export function ProjectileSprite({
  kind = 1,
  clan,
  direction,
  scale = 1,
}: {
  kind?: number;
  clan?: string;
  direction: 1 | -1;
  scale?: number;
}) {
  const fallbackAsset = projectileAssets[Math.abs(kind) % projectileAssets.length];
  const clanAsset = getProjectileAssetForClan(clan);
  const animatedSrc = clanAsset ? `/nexus-assets/projectiles/clans/animated/${clanAsset.slug}.png` : "";
  const [clanAssetLoaded, setClanAssetLoaded] = useState(false);
  const [animatedAssetLoaded, setAnimatedAssetLoaded] = useState(false);
  const activeAsset = (animatedAssetLoaded || clanAssetLoaded) && clanAsset ? clanAsset : fallbackAsset;
  const glowRgb = getGlowRgb(activeAsset.glow);

  useEffect(() => {
    setClanAssetLoaded(false);
    setAnimatedAssetLoaded(false);
  }, [animatedSrc, clanAsset?.src]);

  return (
    <span
      className={cn(
        "absolute inset-0 bg-contain bg-center bg-no-repeat animate-[nexus-projectile-spin_var(--spin)_linear_infinite]",
        activeAsset.glow,
      )}
      style={
        {
          backgroundImage: animatedAssetLoaded || clanAssetLoaded ? "none" : `url('${fallbackAsset.src}')`,
          imageRendering: "auto",
          "--sprite-flip": direction,
          "--sprite-scale": scale,
          "--sprite-turn": direction === 1 ? "360deg" : "-360deg",
          "--spin": `${820 + (Math.abs(kind) % 4) * 170}ms`,
          "--projectile-glow-rgb": glowRgb,
        } as CSSProperties
      }
    >
      <span aria-hidden className="nexus-projectile-aura" />
      <span aria-hidden className="nexus-projectile-streak" />
      {animatedSrc ? (
        <>
          <img
            alt=""
            aria-hidden
            className="hidden"
            draggable={false}
            src={animatedSrc}
            onLoad={() => setAnimatedAssetLoaded(true)}
            onError={() => setAnimatedAssetLoaded(false)}
          />
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 bg-contain bg-no-repeat animate-[nexus-projectile-frames_360ms_linear_infinite]",
              animatedAssetLoaded ? "block" : "hidden",
            )}
            style={{ backgroundImage: `url('${animatedSrc}')`, backgroundSize: "300% 100%", imageRendering: "auto" }}
          />
        </>
      ) : null}
      {clanAsset ? (
        <img
          alt=""
          aria-hidden
          className={cn(
            "h-full w-full object-contain",
            clanAssetLoaded && !animatedAssetLoaded ? "block" : "hidden",
          )}
          draggable={false}
          src={clanAsset.src}
          onLoad={() => setClanAssetLoaded(true)}
          onError={() => setClanAssetLoaded(false)}
        />
      ) : null}
    </span>
  );
}

function getGlowRgb(glow: string) {
  const match = /rgba\((\d+),(\d+),(\d+),/.exec(glow);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : "120 220 255";
}

export default ProjectileSprite;
