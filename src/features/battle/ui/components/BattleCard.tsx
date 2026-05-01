import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import type { Card } from "../../model/types";

export function BattleCard({ card, compact = false }: { card: Card; compact?: boolean }) {
  const style = {
    containerType: "inline-size",
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
        "relative min-h-[292px] overflow-hidden rounded-[10px] border-[3px] border-[#1f1510] text-left",
        "before:pointer-events-none before:absolute before:inset-[10px] before:rounded-md before:border before:border-[rgba(255,238,184,0.35)] before:content-['']",
        compact && "w-[min(216px,24vw)] min-h-[298px]",
      )}
      style={style}
    >
      <div className="absolute inset-x-[7.5%] top-[1.7%] z-[2] flex justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#d8bd82]">{card.rarity}</span>
        <b className="text-right text-[11px] leading-none text-[#fff2c1]">{card.clan}</b>
      </div>

      <div
        className="absolute inset-x-[8.5%] top-[15%] z-[1] h-[34%] overflow-hidden rounded-[7px] border-2 border-[rgba(255,238,184,0.62)] before:absolute before:bottom-[-30%] before:left-1/2 before:h-[116%] before:w-[38%] before:-translate-x-1/2 before:rounded-[44px_44px_18px_18px] before:border-[5px] before:border-[rgba(255,255,255,0.72)] before:bg-[rgba(0,0,0,0.22)] before:content-['']"
        style={{ background: card.portrait }}
      >
        <i className="absolute inset-[18px_20px_auto_auto] h-[78px] w-14 rotate-[18deg] border-[3px] border-[rgba(255,255,255,0.38)]" />
      </div>

      <div className="absolute inset-x-[8%] top-[51.8%] z-[2] truncate text-[clamp(18px,8.7cqw,24px)] font-black leading-none text-[#fff6d0] [text-shadow:0_2px_0_rgba(0,0,0,0.8)]">
        {card.name}
      </div>

      <b className="absolute left-[7.2%] top-[72.8%] z-[2] grid aspect-square w-[21.5%] place-items-center rounded-full bg-[radial-gradient(circle_at_36%_30%,#fff7c2_0_18%,#ffe08a_20%_62%,#a96c20_64%)] pt-px text-[clamp(19px,9.3cqw,28px)] font-black leading-none text-[#160f0f] shadow-[inset_0_-5px_0_rgba(0,0,0,0.18),0_1px_0_rgba(255,255,255,0.32)]">
        {card.power}
      </b>
      <b className="absolute left-[71.2%] top-[72.8%] z-[2] grid aspect-square w-[21.5%] place-items-center rounded-full bg-[radial-gradient(circle_at_36%_30%,#ff9b83_0_18%,#e9503f_20%_62%,#8d2119_64%)] pt-px text-[clamp(19px,9.3cqw,28px)] font-black leading-none text-[#fff8e8] shadow-[inset_0_-5px_0_rgba(0,0,0,0.2),0_1px_0_rgba(255,255,255,0.26)]">
        {card.damage}
      </b>

      <div className="absolute inset-x-[30%] top-[72.9%] z-[2] grid gap-[4px]">
        <span className="block min-h-[20px] truncate rounded bg-[rgba(0,0,0,0.42)] px-[5px] py-[4px] text-center text-[clamp(8px,3.9cqw,11px)] leading-none text-[#eadfc5]">
          {card.ability}
        </span>
        <span className="block min-h-[20px] truncate rounded bg-[rgba(0,0,0,0.42)] px-[5px] py-[4px] text-center text-[clamp(8px,3.9cqw,11px)] leading-none text-[#eadfc5]">
          {card.bonus}
        </span>
      </div>
    </article>
  );
}
