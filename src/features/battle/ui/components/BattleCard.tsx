import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import type { Card } from "../../model/types";

export function BattleCard({ card, compact = false }: { card: Card; compact?: boolean }) {
  const style = {
    "--accent": card.accent,
    backgroundImage: [
      "linear-gradient(180deg, rgba(255,255,255,0.08), transparent 12%)",
      `linear-gradient(135deg, color-mix(in srgb, ${card.accent}, transparent 62%), rgba(23,17,21,0.72) 60%)`,
      "url('/generated/klanz-card-frame.png')",
    ].join(", "),
    backgroundPosition: "center",
    backgroundSize: "auto, auto, cover",
    backgroundRepeat: "no-repeat",
    boxShadow:
      `inset 0 0 0 3px color-mix(in srgb, ${card.accent}, #fff 20%), ` +
      "inset 0 0 0 7px rgba(0,0,0,0.55), 0 14px 30px rgba(0,0,0,0.42)",
  } as CSSProperties;

  return (
    <article
      className={cn(
        "relative grid min-h-[292px] overflow-hidden rounded-[10px] border-[3px] border-[#1f1510] text-left",
        "grid-rows-[auto_112px_auto_auto_minmax(58px,auto)]",
        "before:pointer-events-none before:absolute before:inset-[10px] before:rounded-md before:border before:border-[rgba(255,238,184,0.35)] before:content-['']",
        compact && "w-[min(216px,24vw)] min-h-[298px]",
      )}
      style={style}
    >
      <div className="relative z-[1] flex justify-between gap-2 px-[18px] pb-2 pt-3.5">
        <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#d8bd82]">{card.rarity}</span>
        <b className="text-right text-[11px] leading-none text-[#fff2c1]">{card.clan}</b>
      </div>

      <div
        className="relative mx-[18px] min-h-28 overflow-hidden rounded-[7px] border-2 border-[rgba(255,238,184,0.62)] before:absolute before:bottom-[-34px] before:left-1/2 before:h-32 before:w-[82px] before:-translate-x-1/2 before:rounded-[44px_44px_18px_18px] before:border-[5px] before:border-[rgba(255,255,255,0.72)] before:bg-[rgba(0,0,0,0.22)] before:content-['']"
        style={{ background: card.portrait }}
      >
        <i className="absolute inset-[18px_20px_auto_auto] h-[78px] w-14 rotate-[18deg] border-[3px] border-[rgba(255,255,255,0.38)]" />
      </div>

      <div className="relative z-[1] min-h-[34px] px-[18px] pb-0.5 pt-2 text-[21px] font-black leading-none text-[#fff6d0]">
        {card.name}
      </div>

      <div className="z-[1] flex gap-[9px] px-[18px] pb-[7px]">
        <b className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-[3px] border-[#201412] bg-[#ffe08a] pt-px text-[22px] leading-none text-[#160f0f] shadow-[inset_0_-5px_0_rgba(0,0,0,0.16)]">
          {card.power}
        </b>
        <b className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-[3px] border-[#201412] bg-[#e9503f] pt-px text-[22px] leading-none text-[#fff8e8] shadow-[inset_0_-5px_0_rgba(0,0,0,0.16)]">
          {card.damage}
        </b>
      </div>

      <div className="z-[1] grid min-h-[58px] gap-1 px-[18px] pb-4">
        <span className="block min-h-[22px] overflow-hidden text-ellipsis rounded bg-[rgba(0,0,0,0.34)] px-[7px] py-[5px] text-[11px] leading-[1.18] text-[#eadfc5]">
          {card.ability}
        </span>
        <span className="block min-h-[22px] overflow-hidden text-ellipsis rounded bg-[rgba(0,0,0,0.34)] px-[7px] py-[5px] text-[11px] leading-[1.18] text-[#eadfc5]">
          {card.bonus}
        </span>
      </div>
    </article>
  );
}
