"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import { ProjectileSprite } from "./ProjectileSprite";

export type AttackAnimationProps = {
  /** Which side throws — projectiles travel from this side toward the other. */
  fromSide: "player" | "enemy";
  /** Number of projectiles in the volley. Defaults to 3. */
  count?: number;
  /** Total duration of the projectile flight in ms. */
  durationMs?: number;
  /** Fires once when the impact frame triggers (mid-flight). */
  onImpact?: () => void;
  /** Fires when the full animation finishes. */
  onComplete?: () => void;
  /** Optional caption shown at the impact frame (e.g. "Завдано 3 урону"). */
  caption?: string;
  /**
   * Where the projectile lands.
   * - "opposite-card" → opposite card slot, horizontal flight (current spec).
   * - "card"          → legacy alias for "opposite-card".
   * - "player-hud" / "enemy-hud" → legacy HUD-arc targets (deprecated, mapped
   *   onto horizontal flight to keep older callers working).
   * Defaults to "opposite-card".
   */
  target?: "opposite-card" | "card" | "player-hud" | "enemy-hud";
  className?: string;
};

/**
 * Card-to-card projectile volley used during clash. Spans the full overlay
 * stage and arcs projectiles from the throwing side to the defender.
 */
export function AttackAnimation({
  fromSide,
  count = 3,
  durationMs = 820,
  onImpact,
  onComplete,
  caption,
  target = "opposite-card",
  className,
}: AttackAnimationProps) {
  void target;
  const [showImpact, setShowImpact] = useState(false);

  useEffect(() => {
    const impactT = window.setTimeout(() => {
      setShowImpact(true);
      onImpact?.();
    }, Math.round(durationMs * 0.55));
    const doneT = window.setTimeout(() => {
      onComplete?.();
    }, durationMs + 240);
    return () => {
      window.clearTimeout(impactT);
      window.clearTimeout(doneT);
    };
  }, [durationMs, onImpact, onComplete]);

  return (
    <div
      data-testid="attack-animation"
      data-from={fromSide}
      className={cn("pointer-events-none relative h-full w-full overflow-visible", className)}
    >
      {Array.from({ length: count }).map((_, index) => {
        const size = 42 + (index % 3) * 8;
        const direction: 1 | -1 = fromSide === "player" ? -1 : 1;
        // Owner spec: projectiles fly HORIZONTALLY only between card slots.
        // Direction is purely a function of throwing side; legacy HUD-arc
        // keyframes are no longer used.
        const animationClass =
          fromSide === "player"
            ? "animate-[nexus-throw-horizontal-right_var(--duration)_var(--delay)_both]"
            : "animate-[nexus-throw-horizontal-left_var(--duration)_var(--delay)_both]";
        return (
          <i
            key={index}
            data-testid="attack-projectile"
            data-target={target}
            className={cn(
              "absolute opacity-0 [animation-fill-mode:both] [animation-iteration-count:1] [animation-timing-function:cubic-bezier(0.2,0.8,0.35,1)]",
              animationClass,
            )}
            style={
              {
                "--duration": `${durationMs}ms`,
                "--delay": `${index * 180}ms`,
                width: `${size}px`,
                height: `${size}px`,
                left: "calc(50% - 16px)",
                top: `calc(50% - ${size / 2}px + ${(index % 3) * 12 - 12}px)`,
              } as CSSProperties
            }
          >
            <ProjectileSprite kind={index + 1} direction={direction} scale={1.12} />
          </i>
        );
      })}

      {showImpact && caption ? (
        <strong
          data-testid="attack-caption"
          className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 animate-[nexus-caption-pop_340ms_ease_both] rounded-full border border-[rgba(255,224,138,0.45)] bg-black/60 px-3 py-[7px] text-base text-[#ffe08a]"
        >
          {caption}
        </strong>
      ) : null}

      {showImpact ? (
        <span
          data-testid="attack-impact-flash"
          aria-hidden
          className="absolute left-1/2 top-1/2 z-[1] block h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,224,138,0.9),rgba(255,140,40,0.4)_45%,transparent_72%)] animate-[nexus-caption-pop_300ms_ease_both]"
        />
      ) : null}
    </div>
  );
}

export default AttackAnimation;
