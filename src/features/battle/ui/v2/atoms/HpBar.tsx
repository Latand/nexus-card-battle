"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";

export type HpBarProps = {
  value: number;
  max: number;
  label?: string;
  className?: string;
  "data-testid"?: string;
};

const FILL = "#6ba35f";
const RAIL = "#1d2a1c";
const DAMAGE_FLASH = "#d97056";
const FLASH_MS = 600;

export function HpBar({ value, max, label, className, ...rest }: HpBarProps) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.max(0, Math.min(value, safeMax));
  const pct = (safeValue / safeMax) * 100;

  // Track previous value to flash a danger-coloured overlay when HP drops.
  const prevRef = useRef(safeValue);
  const [flash, setFlash] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    if (safeValue < prev) {
      setFlash({ from: prev, to: safeValue });
      const t = setTimeout(() => setFlash(null), FLASH_MS);
      prevRef.current = safeValue;
      return () => clearTimeout(t);
    }
    prevRef.current = safeValue;
  }, [safeValue]);

  const flashLeft = flash ? (flash.to / safeMax) * 100 : 0;
  const flashWidth = flash ? ((flash.from - flash.to) / safeMax) * 100 : 0;

  return (
    <div
      className={cn("flex items-center gap-2 min-w-0", className)}
      data-component="hp-bar"
      data-testid={rest["data-testid"]}
      role="progressbar"
      aria-label={label ?? "Здоров'я"}
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={safeMax}
    >
      <span
        className="relative block flex-1 h-[6px] rounded-full overflow-hidden"
        style={{ backgroundColor: RAIL }}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: FILL,
            transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        {flash && (
          <span
            className="absolute inset-y-0 rounded-full opacity-80 animate-pulse"
            style={{
              left: `${flashLeft}%`,
              width: `${flashWidth}%`,
              backgroundColor: DAMAGE_FLASH,
            }}
          />
        )}
      </span>
      <span className="font-mono tabular-nums text-[12px] leading-none text-ink/85 min-w-[1.5ch] text-right">
        {safeValue}
      </span>
    </div>
  );
}

export default HpBar;
