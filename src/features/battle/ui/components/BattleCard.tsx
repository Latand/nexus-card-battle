import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import type { Card, Rarity } from "../../model/types";
import { CardTooltip } from "./CardTooltip";
import { ClanGlyph, getClanColor } from "./ClanGlyph";

const rarityLabels: Record<Rarity, string> = {
  Common: "COMMON",
  Rare: "RARE",
  Unique: "UNIQ",
  Legend: "LEGEND",
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
        // aspect-[2/3] only stays intact when no min-height is set: any min-h
        // larger than width × 1.5 forces the browser to widen the card to
        // satisfy aspect-ratio, causing it to overflow its container. Parents
        // size the card via width (or container width) only.
        "relative aspect-[2/3] w-full overflow-hidden rounded-[10px] text-left",
        compact && "compact battle-card-face--compact w-[min(216px,24vw)]",
        className,
      )}
      style={style}
    >
      <div className="battle-card-meta absolute left-[14.7%] top-[4.4%] z-[3] grid h-[5.6%] w-[70.6%] items-center px-[3%]">
        <span className="min-w-0 truncate text-[clamp(4px,3.85cqw,10px)] font-black uppercase tracking-[0.1em] text-[#f0d68f]">
          {rarityLabels[card.rarity]}
        </span>
      </div>

      <span
        className="battle-card-glyph absolute right-[4%] top-[4%] z-[4] grid aspect-square w-[20%] place-items-center overflow-hidden rounded-[3px]"
        style={{
          color: `color-mix(in srgb, ${getClanColor(card.clan)} 78%, #f4ebd0 22%)`,
          backgroundColor: `color-mix(in srgb, ${getClanColor(card.clan)} 14%, #0c0e10 86%)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${getClanColor(card.clan)} 40%, #000 60%), 0 2px 6px rgba(0,0,0,0.5)`,
        }}
        aria-label={card.clan}
        title={card.clan}
      >
        <ClanGlyph clan={card.clan} className="h-full w-full" strokeBoost />
      </span>

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
        "battle-card-trait absolute left-[8.5%] z-[3] h-[6.4%] w-[83%]",
        disabled
          ? "text-[#736c5e]"
          : active
            ? "text-[#fff2c6] [text-shadow:0_1px_0_rgba(0,0,0,0.84)]"
            : "text-[#8f8777]",
      )}
      style={{ top }}
    >
      <CardTooltip className="block h-full w-full min-w-0" eyebrow={eyebrow} title={title} description={description}>
        <span className="grid h-full w-full min-w-0 place-items-center overflow-hidden px-[2.1%] text-center text-[clamp(5px,4.4cqw,11px)] leading-none">
          <span className="battle-card-trait-text block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center font-black uppercase tracking-[0.01em] [text-shadow:0_1px_0_rgba(0,0,0,0.95),0_0_6px_rgba(0,0,0,0.7)]">{title}</span>
        </span>
      </CardTooltip>
    </div>
  );
}
