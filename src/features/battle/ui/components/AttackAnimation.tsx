import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import { EXCHANGE_THROWS } from "../../model/constants";
import { otherSide } from "../../model/game";
import type { Clash, Phase, Side } from "../../model/types";
import { ProjectileSprite } from "./ProjectileSprite";

export function AttackAnimation({ clash, phase, first }: { clash: Clash | null; phase: Phase; first: Side }) {
  if (!clash || phase === "ready" || phase === "summary") {
    return (
      <div className="relative h-[78px] w-[min(420px,100%)] overflow-visible" data-phase="idle">
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-[0.12em] text-[rgba(255,232,137,0.38)]">
          готово
        </span>
      </div>
    );
  }

  if (phase === "exchange") {
    return (
      <div className="relative h-[78px] w-[min(420px,100%)] overflow-visible" data-phase="exchange">
        {Array.from({ length: EXCHANGE_THROWS }).map((_, index) => {
          const from = index % 2 === 0 ? first : otherSide(first);
          return <Projectile key={`${clash.round}-exchange-${index}`} from={from} index={index} kind={index} mode="exchange" />;
        })}
      </div>
    );
  }

  return (
    <div className="relative h-[78px] w-[min(420px,100%)] overflow-visible" data-phase="damage">
      <strong className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 animate-[klanz-caption-pop_340ms_ease_both] rounded-full border border-[rgba(255,224,138,0.45)] bg-black/60 px-3 py-[7px] text-base text-[#ffe08a]">
        {clash.damage} урона нанесено
      </strong>
      {Array.from({ length: clash.damage }).map((_, index) => (
        <Projectile key={`${clash.round}-damage-${index}`} from={clash.winner} index={index} kind={index + 1} mode="damage" />
      ))}
    </div>
  );
}

function Projectile({
  from,
  index,
  kind,
  mode,
}: {
  from: Side;
  index: number;
  kind: number;
  mode: "exchange" | "damage";
}) {
  const size = mode === "damage" ? 42 + (index % 3) * 8 : 46 + (index % 4) * 7;
  const direction = from === "player" ? -1 : 1;

  return (
    <i
      className={cn(
        "absolute opacity-0 [animation-fill-mode:both] [animation-iteration-count:1] [animation-timing-function:cubic-bezier(0.2,0.8,0.35,1)]",
        from === "player" ? "animate-[klanz-throw-player_var(--duration)_var(--delay)_both]" : "animate-[klanz-throw-enemy_var(--duration)_var(--delay)_both]",
      )}
      style={
        {
          "--i": index % (mode === "damage" ? 5 : 4),
          "--duration": mode === "damage" ? "820ms" : "520ms",
          "--delay": mode === "damage" ? `${index * 220}ms` : `${index * 260}ms`,
          width: `${size}px`,
          height: `${size}px`,
          left: "calc(50% - 16px)",
          top: mode === "damage" ? `${12 + (index % 5) * 10}px` : `${14 + (index % 4) * 13}px`,
        } as CSSProperties
      }
    >
      <ProjectileSprite kind={kind} direction={direction} scale={mode === "damage" ? 1.12 : 1} />
    </i>
  );
}
