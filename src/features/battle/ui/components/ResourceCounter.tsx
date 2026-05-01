import { cn } from "@/shared/lib/cn";
import { MAX_ENERGY, MAX_HEALTH } from "../../model/constants";

export function ResourceCounter({
  label,
  value,
  tone,
  max,
}: {
  label: string;
  value: number;
  tone: "health" | "energy";
  max?: number;
}) {
  const limit = max ?? (tone === "energy" ? MAX_ENERGY : MAX_HEALTH);

  return (
    <div className="grid min-h-[58px] min-w-0 content-center gap-1 border-x border-white/10 px-2 max-[960px]:min-h-[52px] max-[960px]:px-1.5 max-[760px]:min-h-[46px] max-[760px]:gap-0.5 max-[620px]:px-1">
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="min-w-0 truncate text-[9px] font-black uppercase tracking-[0.08em] text-[#c6d5d8] max-[760px]:hidden">
          {label}
        </span>
        <strong
          className={cn(
            "grid h-[18px] min-w-7 place-items-center rounded-full px-1.5 text-[13px] font-black leading-none text-[#16110b] shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]",
            "max-[760px]:mx-auto max-[760px]:h-4 max-[760px]:min-w-6 max-[760px]:text-[11px]",
            tone === "energy" ? "bg-[linear-gradient(180deg,#fff0a1,#d99a22)]" : "bg-[linear-gradient(180deg,#c8ff88,#47bd4e)]",
          )}
        >
          {Math.max(0, value)}
        </strong>
      </div>
      <ResourcePills value={value} max={limit} tone={tone} />
    </div>
  );
}

export function ResourcePills({
  value,
  max,
  tone,
  dense = false,
  slots,
}: {
  value: number;
  max: number;
  tone: "health" | "energy";
  dense?: boolean;
  slots?: number;
}) {
  const current = Math.max(0, Math.floor(value));
  const slotCount = slots ?? Math.max(max, current);
  const activeSlots = slots ? Math.ceil((Math.min(current, max) / Math.max(1, max)) * slotCount) : Math.min(current, slotCount);

  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-center",
        dense ? "gap-0.5" : "gap-[3px] max-[760px]:gap-0.5",
      )}
      aria-hidden="true"
    >
      {Array.from({ length: slotCount }).map((_, index) => {
        const active = index < activeSlots;

        return (
          <i
            key={index}
            className={cn(
              "block flex-1 rounded-full border transition-[opacity,filter,transform] duration-300",
              dense ? "h-[7px] min-w-[4px] max-w-[18px]" : "h-[9px] min-w-[5px] max-w-[18px] max-[760px]:h-[7px] max-[760px]:min-w-[3px]",
              active
                ? tone === "energy"
                  ? "border-[#7a4810] bg-[linear-gradient(180deg,#fff7b7,#ffc43a_46%,#a85d12)] shadow-[0_0_8px_rgba(255,204,63,0.58),inset_0_-2px_0_rgba(0,0,0,0.18)]"
                  : "border-[#1f6831] bg-[linear-gradient(180deg,#d4ff96,#5ed263_48%,#207d39)] shadow-[0_0_8px_rgba(96,227,86,0.62),inset_0_-2px_0_rgba(0,0,0,0.18)]"
                : "border-[#101417] bg-black/55 opacity-45 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]",
            )}
          />
        );
      })}
    </div>
  );
}

export function NamePlate({ name, player = false }: { name: string; player?: boolean }) {
  return (
    <div
      className={cn(
        "relative grid min-h-[58px] place-items-center overflow-hidden max-[960px]:min-h-[52px] max-[760px]:min-h-[46px]",
        player
          ? "bg-[linear-gradient(90deg,rgba(244,190,77,0.20),rgba(0,0,0,0.42),rgba(244,190,77,0.20))]"
          : "bg-[linear-gradient(90deg,rgba(73,210,231,0.16),rgba(0,0,0,0.42),rgba(73,210,231,0.16))]",
        "before:absolute before:left-[-10px] before:top-0 before:h-full before:w-[34px] before:bg-[linear-gradient(135deg,transparent_0_48%,rgba(73,210,231,0.72)_49%_55%,transparent_56%)] before:content-['']",
        "after:absolute after:right-[-10px] after:top-0 after:h-full after:w-[34px] after:scale-x-[-1] after:bg-[linear-gradient(135deg,transparent_0_48%,rgba(73,210,231,0.72)_49%_55%,transparent_56%)] after:content-['']",
      )}
    >
      <strong className="relative z-[1] text-2xl font-black uppercase tracking-[0.02em] text-[#f4fbff] max-[960px]:text-xl max-[760px]:text-base max-[620px]:text-[13px]">
        {name}
      </strong>
    </div>
  );
}
