import { cn } from "@/shared/lib/cn";

export type AtmosphericBackgroundProps = {
  children: React.ReactNode;
  withParticles?: boolean;
  className?: string;
};

/**
 * Three-layer fixed background for all static screens.
 *  L1: solid bg color
 *  L2: blurred painted arena image at 14% opacity
 *  L3: optional warm-dust particle drift
 * Children render above on a transparent flex column.
 */
export function AtmosphericBackground({
  children,
  withParticles = true,
  className,
}: AtmosphericBackgroundProps) {
  return (
    <div className={cn("relative min-h-dvh text-ink bg-bg", className)}>
      <div className="atmos-root" aria-hidden>
        <div className="atmos-image" />
        {withParticles && <div className="bg-particles" />}
      </div>
      <div className="atmos-content">{children}</div>
    </div>
  );
}

export default AtmosphericBackground;
