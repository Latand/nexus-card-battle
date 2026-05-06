import { cn } from "@/shared/lib/cn";

export type EnergyBarProps = {
  value: number;
  max: number;
  label?: string;
  className?: string;
  "data-testid"?: string;
};

const FILL = "#f0c668";
const RAIL = "#3a2f15";

export function EnergyBar({ value, max, label, className, ...rest }: EnergyBarProps) {
  const safeValue = Math.max(0, value);
  const safeMax = Math.max(1, max, safeValue);
  const pct = (safeValue / safeMax) * 100;
  return (
    <div
      className={cn("flex items-center gap-2 min-w-0", className)}
      data-component="energy-bar"
      data-testid={rest["data-testid"]}
      role="progressbar"
      aria-label={label ?? "Енергія"}
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={safeMax}
    >
      <span
        className="relative block flex-1 h-[6px] rounded-full overflow-hidden"
        style={{ backgroundColor: RAIL }}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%`, backgroundColor: FILL }}
        />
      </span>
      <span className="font-mono tabular-nums text-[12px] leading-none text-ink/85 min-w-[1.5ch] text-right">
        {safeValue}
      </span>
    </div>
  );
}

export default EnergyBar;
