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
const FRAME_URL = "/nexus-assets/cards/nexus-card-frame-generated.png";

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
      `linear-gradient(180deg, color-mix(in srgb, ${card.accent}, transparent 82%), transparent 30%, color-mix(in srgb, ${card.accent}, transparent 88%))`,
      `url('${FRAME_URL}')`,
    ].join(", "),
    backgroundPosition: "center",
    backgroundSize: "100% 100%, 100% 100%",
    backgroundRepeat: "no-repeat",
    boxShadow:
      `0 0 0 1px color-mix(in srgb, ${card.accent}, #f8e7aa 20%), ` +
      "0 14px 30px rgba(0,0,0,0.42)",
  } as CSSProperties;

  return (
    <article
      className={cn(
        "battle-card-face",
        "relative aspect-[2/3] min-h-[292px] overflow-hidden rounded-[10px] text-left",
        compact && "compact battle-card-face--compact w-[min(216px,24vw)] min-h-[298px]",
        className,
      )}
      style={style}
    >
      <div className="battle-card-meta absolute left-[14.7%] top-[5.05%] z-[3] grid h-[4.4%] w-[70.6%] grid-cols-[minmax(0,1fr)_minmax(0,42%)] items-center gap-[4%] px-[3%]">
        <span className="min-w-0 truncate text-[clamp(4px,3.85cqw,10px)] font-black uppercase tracking-[0.08em] text-[#dec48c]">
          {rarityLabels[card.rarity]}
        </span>
        <b className="min-w-0 truncate text-right text-[clamp(4px,3.75cqw,10px)] font-black leading-none text-[#fff2c1]">{card.clan}</b>
      </div>

      <div
        className="battle-card-art absolute left-[11%] top-[11.1%] z-[1] h-[39.5%] w-[78%] overflow-hidden rounded-[6px]"
        style={{ background: card.portrait }}
      >
        <Image
          src={card.artUrl}
          alt=""
          fill
          sizes="220px"
          className="object-cover object-top opacity-82 mix-blend-screen"
        />
        <i className="absolute inset-[16%_8%_auto_auto] h-[56%] w-[22%] rotate-[18deg] border-[3px] border-[rgba(255,255,255,0.34)]" />
      </div>

      <div className="battle-card-name absolute left-[8.5%] top-[54.6%] z-[3] grid h-[6.4%] w-[83%] place-items-center overflow-hidden px-[4%] text-[clamp(5px,5.2cqw,16px)] font-black leading-none text-[#fff6d0] [text-shadow:0_2px_0_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.72)]">
        <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-center">{card.name}</span>
      </div>

      <StatSocket centerX="20.7%" centerY="67.4%" tone="power" value={card.power} />
      <StatSocket centerX="79.3%" centerY="67.4%" tone="damage" value={card.damage} />

      <TraitSlot
        active={abilityActive !== false}
        description={abilityDescription}
        eyebrow="Уміння"
        title={abilityName}
        top="75.8%"
      />
      <TraitSlot
        active={bonusVisible && clanBonusActive !== false}
        description={bonusDescription}
        disabled={!bonusVisible}
        eyebrow="Бонус"
        title={bonusName}
        top="84.9%"
      />
    </article>
  );
}

function StatSocket({
  centerX,
  centerY,
  tone,
  value,
}: {
  centerX: string;
  centerY: string;
  tone: "power" | "damage";
  value: number;
}) {
  return (
    <b
      className={cn(
        "battle-card-stat absolute z-[3] grid aspect-square w-[14.2%] -translate-x-1/2 -translate-y-1/2 place-items-center text-center text-[clamp(7px,9.4cqw,29px)] font-black leading-none",
        tone === "power"
          ? "battle-card-stat--power text-[#ffe08a] [text-shadow:0_2px_0_rgba(0,0,0,0.95),0_0_8px_rgba(255,224,138,0.42)]"
          : "battle-card-stat--damage text-[#ff7668] [text-shadow:0_2px_0_rgba(0,0,0,0.95),0_0_8px_rgba(255,92,72,0.42)]",
      )}
      style={{ left: centerX, top: centerY }}
    >
      <span>{value}</span>
    </b>
  );
}

function TraitSlot({
  active,
  description,
  disabled = false,
  eyebrow,
  title,
  top,
}: {
  active: boolean;
  description: string;
  disabled?: boolean;
  eyebrow: string;
  title: string;
  top: string;
}) {
  return (
    <div
      data-card-ability={eyebrow === "Уміння" ? "true" : undefined}
      data-card-bonus={eyebrow === "Бонус" ? "true" : undefined}
      className={cn(
        "battle-card-trait absolute left-[8.5%] z-[3] h-[5.9%] w-[83%]",
        disabled
          ? "text-[#736c5e]"
          : active
            ? "text-[#fff2c6] [text-shadow:0_1px_0_rgba(0,0,0,0.84)]"
            : "text-[#8f8777]",
      )}
      style={{ top }}
    >
      <CardTooltip className="block h-full w-full min-w-0" eyebrow={eyebrow} title={title} description={description}>
        <span className="grid h-full w-full min-w-0 place-items-center overflow-hidden px-[2.1%] text-center text-[clamp(3.5px,3.35cqw,9px)] leading-none">
          <span className="battle-card-trait-text block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center font-black uppercase tracking-[0.01em] [text-shadow:0_1px_0_rgba(0,0,0,0.95),0_0_6px_rgba(0,0,0,0.7)]">{title}</span>
        </span>
      </CardTooltip>
    </div>
  );
}
