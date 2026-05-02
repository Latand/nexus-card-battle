import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import type { Card, Rarity } from "../../model/types";
import { CardTooltip } from "./CardTooltip";

const rarityLabels: Record<Rarity, string> = {
  Common: "Звичайна",
  Rare: "Рідкісна",
  Unique: "Унікальна",
  Legend: "Легендарна",
};

export function BattleCard({
  card,
  compact = false,
  clanBonusActive,
  abilityActive,
  bonusVisible = true,
  className,
}: {
  card: Card;
  compact?: boolean;
  clanBonusActive?: boolean;
  abilityActive?: boolean;
  bonusVisible?: boolean;
  className?: string;
}) {
  const abilityName = card.ability.name;
  const abilityDescription = card.ability.description;
  const bonusName = card.bonus.name;
  const bonusDescription = card.bonus.description;
  const style = {
    containerType: "inline-size",
    "--accent": card.accent,
    backgroundImage: [
      "linear-gradient(180deg, rgba(255,255,255,0.08), transparent 12%)",
      `linear-gradient(135deg, color-mix(in srgb, ${card.accent}, transparent 62%), rgba(23,17,21,0.72) 60%)`,
      "url('/nexus-assets/cards/nexus-card-frame.png')",
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
        "battle-card-face",
        "relative min-h-[292px] overflow-hidden rounded-[10px] border-[3px] border-[#1f1510] text-left",
        "before:pointer-events-none before:absolute before:inset-[10px] before:rounded-md before:border before:border-[rgba(255,238,184,0.35)] before:content-['']",
        compact && "compact battle-card-face--compact w-[min(216px,24vw)] min-h-[298px]",
        className,
      )}
      style={style}
    >
      <div className="battle-card-meta absolute inset-x-[7.5%] top-[1.7%] z-[2] grid grid-cols-[minmax(0,1fr)_minmax(0,44%)] items-start gap-1">
        <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.08em] text-[#d8bd82]">{rarityLabels[card.rarity]}</span>
        <b className="min-w-0 truncate text-right text-[11px] leading-none text-[#fff2c1]">{card.clan}</b>
      </div>

      <div
        className="battle-card-art absolute inset-x-[8.5%] top-[15%] z-[1] h-[34%] overflow-hidden rounded-[7px] border-2 border-[rgba(255,238,184,0.62)]"
        style={{ background: card.portrait }}
      >
        <Image
          src={card.artUrl}
          alt=""
          fill
          sizes="220px"
          className="object-cover object-top opacity-80 mix-blend-screen"
        />
        <i className="absolute inset-[18px_20px_auto_auto] h-[78px] w-14 rotate-[18deg] border-[3px] border-[rgba(255,255,255,0.38)]" />
      </div>

      <div className="battle-card-name absolute inset-x-[8%] top-[51.8%] z-[2] truncate text-[clamp(18px,8.7cqw,24px)] font-black leading-none text-[#fff6d0] [text-shadow:0_2px_0_rgba(0,0,0,0.8)]">
        {card.name}
      </div>

      <b className="battle-card-stat battle-card-stat--power absolute left-[7.2%] top-[72.8%] z-[2] grid aspect-square w-[21.5%] place-items-center rounded-full bg-[radial-gradient(circle_at_36%_30%,#fff7c2_0_18%,#ffe08a_20%_62%,#a96c20_64%)] pt-px text-[clamp(19px,9.3cqw,28px)] font-black leading-none text-[#160f0f] shadow-[inset_0_-5px_0_rgba(0,0,0,0.18),0_1px_0_rgba(255,255,255,0.32)]">
        {card.power}
      </b>
      <b className="battle-card-stat battle-card-stat--damage absolute left-[71.2%] top-[72.8%] z-[2] grid aspect-square w-[21.5%] place-items-center rounded-full bg-[radial-gradient(circle_at_36%_30%,#ff9b83_0_18%,#e9503f_20%_62%,#8d2119_64%)] pt-px text-[clamp(19px,9.3cqw,28px)] font-black leading-none text-[#fff8e8] shadow-[inset_0_-5px_0_rgba(0,0,0,0.2),0_1px_0_rgba(255,255,255,0.26)]">
        {card.damage}
      </b>

      <div className="battle-card-traits absolute inset-x-[30%] top-[72.9%] z-[2] grid gap-[4px]">
        <CardTooltip
          className="block min-w-0"
          eyebrow="Уміння"
          title={abilityName}
          description={abilityDescription}
        >
          <span
            data-card-ability
            className={cn(
              "battle-card-trait battle-card-trait--ability flex min-h-[20px] w-full min-w-0 items-center justify-center gap-[3px] truncate rounded px-[5px] py-[4px] text-center text-[clamp(8px,3.9cqw,11px)] leading-none",
              abilityActive === false
                ? "bg-[rgba(0,0,0,0.3)] text-[#8c836f]"
                : "bg-[rgba(0,0,0,0.42)] text-[#eadfc5]",
            )}
          >
            <em className="battle-card-trait-kind not-italic">У</em>
            <span className="battle-card-trait-text min-w-0 truncate">{abilityName}</span>
          </span>
        </CardTooltip>
        <CardTooltip
          className="block min-w-0"
          eyebrow="Бонус"
          title={bonusName}
          description={bonusDescription}
        >
          <span
            data-card-bonus
            className={cn(
              "battle-card-trait battle-card-trait--bonus flex min-h-[20px] w-full min-w-0 items-center justify-center gap-[3px] truncate rounded border px-[5px] py-[4px] text-center text-[clamp(8px,3.9cqw,11px)] leading-none",
              !bonusVisible
                ? "border-white/5 bg-[rgba(0,0,0,0.3)] text-[#7f7869]"
                : clanBonusActive === false
                  ? "border-white/5 bg-[rgba(0,0,0,0.28)] text-[#8c836f]"
                  : "border-[color-mix(in_srgb,var(--accent),#fff_18%)] bg-[rgba(0,0,0,0.5)] text-[#fff2c6] shadow-[0_0_9px_color-mix(in_srgb,var(--accent),transparent_56%)]",
            )}
          >
            <em className="battle-card-trait-kind not-italic">Б</em>
            <span className="battle-card-trait-text min-w-0 truncate">{bonusName}</span>
          </span>
        </CardTooltip>
      </div>
    </article>
  );
}
