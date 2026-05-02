import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import type { Clash, Phase, Side } from "../../model/types";
import { ProjectileSprite } from "./ProjectileSprite";

export function AttackAnimation({ clash, phase }: { clash: Clash | null; phase: Phase; first: Side }) {
  if (!clash || phase !== "damage_apply") {
    return (
      <div className="relative h-[78px] w-[min(420px,100%)] overflow-visible" data-phase="idle">
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-[0.12em] text-[rgba(255,232,137,0.38)]">
          готово
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-[78px] w-[min(420px,100%)] overflow-visible" data-phase="damage">
      <strong className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 animate-[nexus-caption-pop_340ms_ease_both] rounded-full border border-[rgba(255,224,138,0.45)] bg-black/60 px-3 py-[7px] text-base text-[#ffe08a]">
        {clash.damage} урона нанесено
      </strong>
      {Array.from({ length: clash.damage }).map((_, index) => (
        <Projectile key={`${clash.round}-damage-${index}`} from={clash.winner} index={index} kind={index + 1} />
      ))}
    </div>
  );
}

function Projectile({
  from,
  index,
  kind,
}: {
  from: Side;
  index: number;
  kind: number;
}) {
  const size = 42 + (index % 3) * 8;
  const direction = from === "player" ? -1 : 1;

  return (
    <i
      className={cn(
        "absolute opacity-0 [animation-fill-mode:both] [animation-iteration-count:1] [animation-timing-function:cubic-bezier(0.2,0.8,0.35,1)]",
        from === "player" ? "animate-[nexus-throw-player_var(--duration)_var(--delay)_both]" : "animate-[nexus-throw-enemy_var(--duration)_var(--delay)_both]",
      )}
      style={
        {
          "--i": index % 5,
          "--duration": "820ms",
          "--delay": `${index * 220}ms`,
          width: `${size}px`,
          height: `${size}px`,
          left: "calc(50% - 16px)",
          top: `${12 + (index % 5) * 10}px`,
        } as CSSProperties
      }
    >
      <ProjectileSprite kind={kind} direction={direction} scale={1.12} />
    </i>
  );
}
