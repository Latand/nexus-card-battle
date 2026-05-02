import { cn } from "@/shared/lib/cn";
import { MAX_ENERGY, MAX_HEALTH } from "../../model/constants";
import type { FighterStatus } from "../../model/types";

type ResourceTone = "health" | "energy" | "attack";

const activePillByTone: Record<ResourceTone, string> = {
  energy: "border-[#7a4810] bg-[linear-gradient(180deg,#fff08a,#ffc22e_46%,#a7600d)] shadow-[0_0_7px_rgba(255,204,63,0.58),inset_0_-2px_0_rgba(0,0,0,0.18)]",
  health: "border-[#176927] bg-[linear-gradient(180deg,#bbff83,#3fd94c_48%,#14762b)] shadow-[0_0_7px_rgba(96,227,86,0.62),inset_0_-2px_0_rgba(0,0,0,0.18)]",
  attack: "border-[#0c5b70] bg-[linear-gradient(180deg,#c6fbff,#43c5e4_48%,#126a8c)] shadow-[0_0_7px_rgba(78,211,244,0.58),inset_0_-2px_0_rgba(0,0,0,0.2)]",
};

const counterBadgeByTone: Record<ResourceTone, string> = {
  energy: "bg-[linear-gradient(180deg,#ffe371,#c88613)]",
  health: "bg-[linear-gradient(180deg,#9dff63,#21a72d)]",
  attack: "bg-[linear-gradient(180deg,#aaf5ff,#1587aa)] text-[#f5feff]",
};

export function ResourceCounter({
  label,
  value,
  tone,
  max,
}: {
  label: string;
  value: number;
  tone: ResourceTone;
  max?: number;
}) {
  const limit = max ?? (tone === "health" ? MAX_HEALTH : MAX_ENERGY);

  return (
    <div className="grid min-h-[44px] min-w-0 content-center gap-1 border-x border-[#d49d32]/20 bg-black/20 px-2 max-[960px]:min-h-[40px] max-[760px]:gap-0.5 max-[620px]:px-1">
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="min-w-0 truncate text-[9px] font-black uppercase tracking-[0.08em] text-[#d7caa9] max-[760px]:hidden">
          {label}
        </span>
        <strong
          className={cn(
            "grid h-[17px] min-w-7 place-items-center rounded-sm border border-black/60 px-1.5 text-[12px] font-black leading-none text-[#101207] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_8px_rgba(0,0,0,0.6)]",
            "max-[760px]:mx-auto max-[760px]:h-4 max-[760px]:min-w-6 max-[760px]:text-[11px]",
            counterBadgeByTone[tone],
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
  tone: ResourceTone;
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
        dense ? "gap-[1px]" : "gap-[3px] max-[760px]:gap-0.5",
      )}
      aria-hidden="true"
    >
      {Array.from({ length: slotCount }).map((_, index) => {
        const active = index < activeSlots;

        return (
          <i
            key={index}
            className={cn(
              "block flex-1 rounded-[2px] border transition-[opacity,filter,transform] duration-300",
              dense ? "h-[7px] min-w-[3px] max-w-[14px]" : "h-[8px] min-w-[5px] max-w-[18px] max-[760px]:h-[7px] max-[760px]:min-w-[3px]",
              active ? activePillByTone[tone] : "border-[#101417] bg-black/60 opacity-45 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]",
            )}
          />
        );
      })}
    </div>
  );
}

export function NamePlate({
  name,
  player = false,
  energy,
  health,
  statuses = [],
}: {
  name: string;
  player?: boolean;
  energy?: number;
  health?: number;
  statuses?: FighterStatus[];
}) {
  const withResources = energy !== undefined && health !== undefined;

  return (
    <div
      className={cn(
        "battle-nameplate",
        "relative grid min-h-[50px] min-w-0 overflow-hidden px-3 py-1 max-[960px]:min-h-[46px] max-[620px]:px-1.5",
        withResources
          ? "grid-cols-2 grid-rows-[auto_auto_auto] items-center gap-x-3 gap-y-0.5 max-[620px]:gap-x-2"
          : "place-items-center",
        player
          ? "bg-[linear-gradient(90deg,rgba(244,190,77,0.20),rgba(0,0,0,0.42),rgba(244,190,77,0.20))]"
          : "bg-[linear-gradient(90deg,rgba(73,210,231,0.16),rgba(0,0,0,0.42),rgba(73,210,231,0.16))]",
        "before:absolute before:left-[-10px] before:top-0 before:h-full before:w-[34px] before:bg-[linear-gradient(135deg,transparent_0_48%,rgba(73,210,231,0.72)_49%_55%,transparent_56%)] before:content-['']",
        "after:absolute after:right-[-10px] after:top-0 after:h-full after:w-[34px] after:scale-x-[-1] after:bg-[linear-gradient(135deg,transparent_0_48%,rgba(73,210,231,0.72)_49%_55%,transparent_56%)] after:content-['']",
      )}
    >
      <strong className="relative z-[1] col-span-full min-w-0 truncate text-center text-xl font-black uppercase tracking-[0.02em] text-[#f4fbff] max-[960px]:text-lg max-[760px]:text-base max-[620px]:text-[13px]">
        {name}
      </strong>
      {withResources ? <CompactResource label="Енергія" value={energy} tone="energy" /> : null}
      {withResources ? <CompactResource label="HP" value={health} tone="health" align="right" /> : null}
      {withResources && statuses.length > 0 ? (
        <div className="relative z-[1] col-span-full min-w-0">
          <StatusBadges statuses={statuses} compact />
        </div>
      ) : null}
    </div>
  );
}

export function StatusBadges({ statuses, compact = false }: { statuses: FighterStatus[]; compact?: boolean }) {
  if (statuses.length === 0) return null;

  return (
    <div className={cn("flex min-w-0 flex-wrap justify-center gap-1", compact && "gap-0.5")} data-testid="fighter-statuses">
      {statuses.map((status) => (
        <span
          key={status.id}
          className={cn(
            "max-w-full truncate rounded-sm border px-1.5 py-0.5 font-black uppercase leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
            compact ? "text-[8px]" : "text-[10px]",
            status.kind === "poison"
              ? "border-[#77e06d]/35 bg-[#123f22]/78 text-[#b8ff9f]"
              : "border-[#ffe08a]/45 bg-[#49370e]/78 text-[#ffe9a8]",
          )}
          title={`${status.source}: ${getStatusLabel(status)}`}
        >
          {getStatusLabel(status)}
        </span>
      ))}
    </div>
  );
}

function getStatusLabel(status: FighterStatus) {
  const stack = status.stacks > 1 ? ` x${status.stacks}` : "";
  if (status.kind === "poison") {
    return `Отрута ${status.amount}${status.min !== undefined ? `/${status.min}` : ""}${stack}`;
  }

  return `Благословення +${status.amount}${stack}`;
}

function CompactResource({
  label,
  value,
  tone,
  align = "left",
}: {
  label: string;
  value: number;
  tone: "health" | "energy";
  align?: "left" | "right";
}) {
  return (
    <div className={cn("relative z-[1] grid w-full min-w-0 gap-0.5", align === "right" ? "justify-items-end" : "justify-items-start")}>
      <span className="flex h-5 max-w-full items-center gap-1 rounded-sm border border-white/10 bg-black/45 px-1.5 text-[11px] font-black leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] max-[620px]:h-4 max-[620px]:gap-0.5 max-[620px]:px-1 max-[620px]:text-[9px]">
        {tone === "energy" ? <EnergyIcon label={label} /> : <b className="text-[#9dff63]">{label}</b>}
        <strong className="text-[#fff8df]">{Math.max(0, value)}</strong>
      </span>
      <div className="w-full min-w-[86px] max-w-[136px] max-[620px]:min-w-[72px] max-[620px]:max-w-[96px]">
        <ResourcePills value={value} max={tone === "energy" ? MAX_ENERGY : MAX_HEALTH} tone={tone} dense />
      </div>
    </div>
  );
}

function EnergyIcon({ label }: { label: string }) {
  return (
    <b className="relative grid h-3.5 w-3 place-items-center" aria-label={label} title={label}>
      <span
        className="block h-3.5 w-2.5 bg-[#ffe371] shadow-[0_0_8px_rgba(255,227,113,0.75)] [clip-path:polygon(54%_0,100%_0,66%_42%,100%_42%,35%_100%,48%_55%,0_55%)]"
        aria-hidden="true"
      />
    </b>
  );
}
