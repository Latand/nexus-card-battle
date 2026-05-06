import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import { FALLBACK_PORTRAIT_URL } from "../../model/cardAssets";
import { hasCardArt } from "../../model/cardArtIndex";
import type { Card, Rarity } from "../../model/types";
import { CardTooltip } from "./CardTooltip";
import { ClanGlyph, getClanColor } from "./ClanGlyph";

const rarityLabels: Record<Rarity, string> = {
  Common: "COMMON",
  Rare: "RARE",
  Unique: "UNIQ",
  Legend: "LEGEND",
};

const rarityTint: Record<Rarity, string> = {
  Common: "#9ca67b",
  Rare: "#c04fd6",
  Unique: "#5bd7f0",
  Legend: "#f0c668",
};
// Frame is now an RGBA PNG with the art region punched as a transparent
// rectangle, so the character image rendered UNDER it shows through cleanly.
const FRAME_URL = "/nexus-assets/cards/nexus-card-frame-alpha.png";

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
  // Article surface holds only the rarity-tinted backdrop. The card frame is
  // now a separate overlay layer (z-2) with an alpha-cut hole in the art
  // region — the character image (z-1) shows through that hole cleanly.
  const style = {
    containerType: "inline-size",
    "--accent": card.accent,
    "--rarity-tint": rarityTint[card.rarity],
    backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${card.accent}, transparent 82%), transparent 30%, color-mix(in srgb, ${card.accent}, transparent 88%))`,
    backgroundPosition: "center",
    backgroundSize: "100% 100%",
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
        // size the card via width (or container width) only. Default cap of
        // 220px keeps cards from stretching across wide viewports.
        "relative aspect-[2/3] w-full max-w-[240px] mx-auto overflow-hidden rounded-[10px] text-left",
        compact && "compact battle-card-face--compact max-w-[224px]",
        className,
      )}
      style={style}
    >
      <div className="battle-card-meta absolute left-[14.7%] top-[4.4%] z-[3] grid h-[5.6%] w-[70.6%] place-items-center px-[3%]">
        <span className="min-w-0 truncate text-center text-[clamp(5px,4.25cqw,11px)] font-black uppercase tracking-[0.08em] text-[#f0d68f]">
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
        <ClanGlyph clan={card.clan} className="h-[78%] w-[78%]" strokeBoost />
      </span>

      <div className="battle-card-art absolute left-[9.5%] top-[9.8%] z-[1] h-[42.5%] w-[81%] overflow-hidden bg-bg">
        <CardArtImage cardId={card.id} src={card.artUrl} fallbackBg={card.portrait} />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(circle_at_50%_32%,color-mix(in_srgb,var(--rarity-tint),transparent_78%),transparent_46%),linear-gradient(180deg,color-mix(in_srgb,var(--rarity-tint),transparent_86%),transparent_58%,color-mix(in_srgb,var(--rarity-tint),transparent_88%))] mix-blend-soft-light"
      />

      {/* Frame overlay — sits above the character image so its alpha cutout
          masks the image into the art region. Below all chrome (z-3+). */}
      <div
        aria-hidden
        className="absolute inset-0 z-[2] pointer-events-none bg-no-repeat bg-center bg-[length:100%_100%]"
        style={{ backgroundImage: `url('${FRAME_URL}')` }}
      />

      <div className="battle-card-name absolute left-[8.5%] top-[54.6%] z-[3] grid h-[6.4%] w-[83%] place-items-center overflow-hidden px-[4%] text-[clamp(6px,5.9cqw,17px)] font-black leading-none text-[#fff6d0] [text-shadow:0_2px_0_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.72)]">
        <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-center">{card.name}</span>
      </div>

      <StatSocket centerX="20%" centerY="67%" tone="power" value={card.power} />
      <StatSocket centerX="80%" centerY="67%" tone="damage" value={card.damage} />

      {/* Painted ability/bonus bars in the frame artwork are centered around
          y=79.88% and y=88.45% with ~7.7% interior height. Slot height of 6.8%
          + slot top so that slot center == painted center → top=76.5/85.0%. */}
      <TraitSlot
        active={abilityActive !== false}
        description={abilityDescription}
        eyebrow="Уміння"
        title={abilityName}
        top="76.5%"
      />
      <TraitSlot
        active={bonusVisible && clanBonusActive !== false}
        description={bonusDescription}
        disabled={!bonusVisible}
        eyebrow="Бонус"
        title={bonusName}
        top="85%"
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
        "battle-card-stat absolute z-[3] grid aspect-square w-[14.2%] -translate-x-1/2 -translate-y-1/2 place-items-center text-center text-[clamp(8px,10.8cqw,32px)] font-black leading-none",
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
        "battle-card-trait absolute left-[8.5%] z-[3] h-[6.8%] w-[83%]",
        disabled
          ? "text-[#736c5e]"
          : active
            ? "text-[#fff2c6] [text-shadow:0_1px_0_rgba(0,0,0,0.84)]"
            : "text-[#8f8777]",
      )}
      style={{ top }}
    >
      <CardTooltip className="block h-full w-full min-w-0" eyebrow={eyebrow} title={title} description={description}>
        <span className="grid h-full w-full min-w-0 place-items-center overflow-hidden px-[2.1%] text-center text-[clamp(6px,5.4cqw,13px)] leading-none">
          <span className="battle-card-trait-text block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center font-black uppercase tracking-[0.01em] [text-shadow:0_1px_0_rgba(0,0,0,0.95),0_0_6px_rgba(0,0,0,0.7)]">{title}</span>
        </span>
      </CardTooltip>
    </div>
  );
}

// Falls back to the legacy portrait + gradient backdrop when a per-card image
// hasn't been generated yet (rollout is progressive). Real portraits render
// clean — no tint, no white-spot placeholder.
function CardArtImage({ cardId, src, fallbackBg }: { cardId: string; src: string; fallbackBg: string }) {
  // Skip the <Image> request entirely when we know there's no portrait yet.
  // Avoids noisy 400s from the Next image optimizer for cards without art.
  const knownMissing = !hasCardArt(cardId);
  const [errored, setErrored] = useState(knownMissing);
  const resolved = errored ? FALLBACK_PORTRAIT_URL : src;
  return (
    <div className="absolute inset-0" style={errored ? { background: fallbackBg } : undefined}>
      <Image
        key={resolved}
        src={resolved}
        alt=""
        fill
        sizes="220px"
        className={cn(
          "object-cover object-top",
          errored ? "opacity-82 mix-blend-screen" : "opacity-100",
        )}
        onError={() => setErrored(true)}
      />
    </div>
  );
}
