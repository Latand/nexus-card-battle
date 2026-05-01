import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import { EXCHANGE_THROWS } from "../../model/constants";
import { otherSide } from "../../model/game";
import type { Clash, Phase, Side } from "../../model/types";

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
          return <Projectile key={`${clash.round}-exchange-${index}`} from={from} index={index} mode="exchange" />;
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
        <Projectile key={`${clash.round}-damage-${index}`} from={clash.winner} index={index} mode="damage" />
      ))}
    </div>
  );
}

function Projectile({ from, index, mode }: { from: Side; index: number; mode: "exchange" | "damage" }) {
  return (
    <i
      className={cn(
        "absolute h-[19px] w-8 rounded-[50%_50%_45%_45%] border-2 border-[rgba(255,245,204,0.82)] bg-[linear-gradient(90deg,#ffe08a,#d34b38)] opacity-0 shadow-[0_0_14px_rgba(255,196,79,0.58)] [animation-fill-mode:both] [animation-iteration-count:1] [animation-timing-function:cubic-bezier(0.2,0.8,0.35,1)]",
        from === "player" ? "animate-[klanz-throw-player_var(--duration)_var(--delay)_both]" : "animate-[klanz-throw-enemy_var(--duration)_var(--delay)_both]",
        mode === "damage" &&
          "top-[calc(12px+var(--i)*10px)] h-6 w-6 rounded-full bg-[radial-gradient(circle_at_35%_28%,#fff9cf_0_18%,#ffe08a_20%_48%,#df533f_50%_100%)]",
      )}
      style={
        {
          "--i": index % (mode === "damage" ? 5 : 4),
          "--duration": mode === "damage" ? "820ms" : "520ms",
          "--delay": mode === "damage" ? `${index * 220}ms` : `${index * 260}ms`,
          left: "calc(50% - 16px)",
          top: mode === "damage" ? `${12 + (index % 5) * 10}px` : `${14 + (index % 4) * 13}px`,
        } as CSSProperties
      }
    />
  );
}
