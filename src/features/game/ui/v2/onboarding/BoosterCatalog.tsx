"use client";

import { ClanGlyph, getClanColor } from "@/features/battle/ui/components/ClanGlyph";
import type { BoosterCatalogItem } from "@/features/boosters/types";
import { cn } from "@/shared/lib/cn";

type BoosterCatalogProps = {
  boosters: BoosterCatalogItem[];
  selectedId: string | null;
  busy: boolean;
  onSelect: (booster: BoosterCatalogItem) => void;
};

// Two-line abbreviated names for the tile heading. Long names get the same
// "FACT. SHIFT" / "CARNI. VICE" treatment shown in the mobile mockup; on
// desktop the same lines look fine because each tile has only ~9 chars width
// for text. A single source of truth keeps desktop + mobile consistent.
const TILE_NAME_LINES: Record<string, [string, string]> = {
  "neon-breach": ["NEON", "BREACH"],
  "factory-shift": ["FACT.", "SHIFT"],
  "street-kings": ["STREET", "KINGS"],
  "carnival-vice": ["CARNI.", "VICE"],
  "faith-and-fury": ["FAITH &", "FURY"],
  biohazard: ["BIO-", "HAZARD"],
  underworld: ["UNDER-", "WORLD"],
  "mind-games": ["MIND", "GAMES"],
  "toy-factory": ["TOY", "FACT."],
  "metro-chase": ["METRO", "CHASE"],
  "desert-signal": ["DESERT", "SIGNAL"],
  "street-plague": ["STREET", "PLAGUE"],
};

function tileNameLines(booster: BoosterCatalogItem): [string, string] {
  const preset = TILE_NAME_LINES[booster.id];
  if (preset) return preset;
  const parts = booster.name.toUpperCase().split(/\s+/);
  if (parts.length >= 2) return [parts[0]!, parts.slice(1).join(" ")];
  return [booster.name.toUpperCase(), ""];
}

export function BoosterCatalog({ boosters, selectedId, busy, onSelect }: BoosterCatalogProps) {
  return (
    <div
      data-testid="starter-booster-catalog"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 lg:gap-4"
    >
      {boosters.map((booster) => (
        <BoosterTile
          key={booster.id}
          booster={booster}
          selected={selectedId === booster.id}
          busy={busy}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

type BoosterTileProps = {
  booster: BoosterCatalogItem;
  selected: boolean;
  busy: boolean;
  onSelect: (booster: BoosterCatalogItem) => void;
};

function BoosterTile({ booster, selected, busy, onSelect }: BoosterTileProps) {
  const [primary, secondary] = booster.clans;
  const accentColor = getClanColor(primary);
  const opened = booster.starter.opened;
  const canOpen = booster.starter.canOpen;
  const disabled = busy || !canOpen;
  const [line1, line2] = tileNameLines(booster);

  return (
    <article
      data-testid={`starter-booster-card-${booster.id}`}
      data-opened={opened}
      data-can-open={canOpen}
      className={cn(
        "relative flex h-[124px] sm:h-[132px] lg:h-[140px] overflow-hidden rounded-md bg-surface",
        "border transition-colors",
        selected ? "border-accent" : "border-[color:var(--color-accent-quiet)]/40",
        opened && "opacity-50",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[2px] rounded-r"
        style={{ backgroundColor: accentColor }}
      />
      <button
        type="button"
        data-testid={`starter-booster-select-${booster.id}`}
        onClick={() => {
          if (disabled) return;
          onSelect(booster);
        }}
        disabled={disabled}
        aria-label={`Деталі бустера ${booster.name}`}
        className={cn(
          "relative flex h-full w-full flex-col px-3 pl-4 pt-3 pb-2 text-left",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-accent",
          !disabled && "hover:bg-surface-raised",
          disabled && "cursor-not-allowed",
        )}
      >
        <span className="text-[13px] sm:text-sm font-medium uppercase tracking-[0.08em] leading-tight text-ink">
          {line1}
        </span>
        {line2 && (
          <span className="text-[13px] sm:text-sm font-medium uppercase tracking-[0.08em] leading-tight text-ink">
            {line2}
          </span>
        )}

        <span className="mt-auto flex items-end gap-2 text-ink-mute">
          <ClanGlyph clan={primary} className="h-5 w-5 opacity-70" />
          {secondary && <ClanGlyph clan={secondary} className="h-5 w-5 opacity-70" />}
        </span>
      </button>
    </article>
  );
}

export default BoosterCatalog;
