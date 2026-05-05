"use client";

import type { CSSProperties, ReactNode } from "react";

// URL-safe slug per clan — file lives at /nexus-assets/clans/{slug}.webp.
const clanSlugs: Record<string, string> = {
  "[Da:Hack]": "da-hack",
  Aliens: "aliens",
  Workers: "workers",
  Micron: "micron",
  Street: "street",
  Kingpin: "kingpin",
  Circus: "circus",
  Gamblers: "gamblers",
  Saints: "saints",
  Fury: "fury",
  SymBio: "symbio",
  Deviants: "deviants",
  Mafia: "mafia",
  Damned: "damned",
  PSI: "psi",
  Enigma: "enigma",
  Toyz: "toyz",
  Alpha: "alpha",
  Metropolis: "metropolis",
  Chasers: "chasers",
  Халифат: "kalifat",
  Nemos: "nemos",
  VibeCoders: "vibecoders",
};

// Canonical color per clan. Picked so the two clans in every booster pair
// (see boosterCatalog) contrast clearly even at small sizes.
export const clanColors: Record<string, string> = {
  "[Da:Hack]": "#3df1c4",
  Aliens: "#62e336",
  Workers: "#f08832",
  Micron: "#3a78ff",
  Street: "#ff5e7a",
  Kingpin: "#f2bf3d",
  Circus: "#e93ec8",
  Gamblers: "#3dc77a",
  Saints: "#fff4b8",
  Fury: "#e7402b",
  SymBio: "#39d4b5",
  Deviants: "#dfe540",
  Mafia: "#c25668",
  Damned: "#a288b0",
  PSI: "#7ad9ee",
  Enigma: "#9b6ad6",
  Toyz: "#ff8fb5",
  Alpha: "#9aa6b6",
  Metropolis: "#3aa3a8",
  Chasers: "#ff7e26",
  Халифат: "#e0aa54",
  Nemos: "#5fa9c8",
  VibeCoders: "#6366f1",
};

export function getClanColor(clan: string): string {
  return clanColors[clan] ?? "#cbbd99";
}

type ClanGlyphProps = {
  clan: string;
  className?: string;
  size?: number;
  strokeBoost?: boolean;
};

export function ClanGlyph({ clan, className, size }: ClanGlyphProps) {
  const slug = clanSlugs[clan];
  const color = clanColors[clan] ?? "#cbbd99";
  const style: CSSProperties = {
    backgroundColor: color,
    WebkitMaskImage: slug ? `url('/nexus-assets/clans/${slug}.webp')` : undefined,
    maskImage: slug ? `url('/nexus-assets/clans/${slug}.webp')` : undefined,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    ...(size ? { width: size, height: size } : {}),
  };
  return (
    <span
      role="img"
      aria-label={clan}
      data-clan-glyph={clan}
      className={className}
      style={style}
    />
  );
}

function renderGlyph(clan: string): ReactNode {
  switch (clan) {
    case "[Da:Hack]":
      return (
        <>
          {/* terminal prompt: > */}
          <path d="M16 28 L40 48 L16 68" strokeWidth={5} />
          {/* underscore cursor block */}
          <rect x="50" y="60" width="30" height="8" fill="currentColor" stroke="none" />
        </>
      );

    case "Aliens":
      return (
        <>
          {/* bulbous alien head */}
          <path d="M48 10 C26 10 16 28 18 46 C20 60 28 72 36 78 L40 86 L56 86 L60 78 C68 72 76 60 78 46 C80 28 70 10 48 10 Z" />
          {/* large slanted almond eyes */}
          <path
            d="M22 38 Q34 42 42 50 Q34 56 24 52 Q20 46 22 38 Z"
            fill="currentColor"
            stroke="none"
          />
          <path
            d="M74 38 Q62 42 54 50 Q62 56 72 52 Q76 46 74 38 Z"
            fill="currentColor"
            stroke="none"
          />
          {/* tiny mouth slit */}
          <line x1="42" y1="68" x2="54" y2="68" />
        </>
      );

    case "Workers":
      return (
        <>
          {/* claw hammer head silhouette — wide top, claw notch on left */}
          <path
            d="M20 14 L36 14 L40 30 L62 30 L66 14 L82 14 L82 32 L74 38 L28 38 L20 32 Z"
            fill="currentColor"
            stroke="none"
          />
          {/* claw split */}
          <path d="M28 14 L24 24 L28 32" stroke="#0a0c0c" strokeWidth={2.5} fill="none" />
          {/* handle thick vertical */}
          <line x1="48" y1="38" x2="48" y2="86" strokeWidth={8} strokeLinecap="butt" />
          {/* grip wrap */}
          <line x1="42" y1="64" x2="54" y2="64" strokeWidth={2} stroke="#0a0c0c" />
          <line x1="42" y1="74" x2="54" y2="74" strokeWidth={2} stroke="#0a0c0c" />
        </>
      );

    case "Micron":
      return (
        <>
          <rect x="22" y="22" width="52" height="52" rx="3" />
          <rect x="36" y="36" width="24" height="24" fill="currentColor" stroke="none" />
          {/* pins */}
          <line x1="14" y1="32" x2="22" y2="32" />
          <line x1="14" y1="48" x2="22" y2="48" />
          <line x1="14" y1="64" x2="22" y2="64" />
          <line x1="74" y1="32" x2="82" y2="32" />
          <line x1="74" y1="48" x2="82" y2="48" />
          <line x1="74" y1="64" x2="82" y2="64" />
          <line x1="32" y1="14" x2="32" y2="22" />
          <line x1="48" y1="14" x2="48" y2="22" />
          <line x1="64" y1="14" x2="64" y2="22" />
          <line x1="32" y1="74" x2="32" y2="82" />
          <line x1="48" y1="74" x2="48" y2="82" />
          <line x1="64" y1="74" x2="64" y2="82" />
        </>
      );

    case "Street":
      return (
        <>
          {/* spray can body */}
          <rect
            x="24"
            y="34"
            width="28"
            height="46"
            rx="3"
            fill="currentColor"
            stroke="none"
          />
          {/* label bands */}
          <line x1="24" y1="48" x2="52" y2="48" strokeWidth={2} stroke="#0a0c0c" />
          <line x1="24" y1="64" x2="52" y2="64" strokeWidth={2} stroke="#0a0c0c" />
          {/* nozzle cap */}
          <rect
            x="30"
            y="20"
            width="16"
            height="14"
            fill="currentColor"
            stroke="none"
          />
          {/* tiny nozzle nipple */}
          <rect
            x="44"
            y="14"
            width="6"
            height="6"
            fill="currentColor"
            stroke="none"
          />
          {/* spray emerging from nozzle (small lines) */}
          <line x1="56" y1="22" x2="62" y2="20" strokeWidth={2} />
          <line x1="58" y1="28" x2="66" y2="28" strokeWidth={2} />
          <line x1="56" y1="34" x2="62" y2="36" strokeWidth={2} />
          {/* paint cloud (scattered dots, varied sizes) */}
          <circle cx="70" cy="22" r="2.5" fill="currentColor" stroke="none" />
          <circle cx="80" cy="28" r="2" fill="currentColor" stroke="none" />
          <circle cx="76" cy="38" r="2.8" fill="currentColor" stroke="none" />
          <circle cx="84" cy="42" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="72" cy="46" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="82" cy="20" r="1.4" fill="currentColor" stroke="none" />
        </>
      );

    case "Kingpin":
      return (
        <>
          <path d="M14 64 L20 28 L34 50 L48 18 L62 50 L76 28 L82 64 Z" />
          <line x1="16" y1="74" x2="80" y2="74" />
          <circle cx="20" cy="24" r="3" fill="currentColor" stroke="none" />
          <circle cx="48" cy="14" r="3" fill="currentColor" stroke="none" />
          <circle cx="76" cy="24" r="3" fill="currentColor" stroke="none" />
          <circle cx="48" cy="54" r="4" stroke="currentColor" />
        </>
      );

    case "Circus":
      return (
        <>
          {/* flag pole */}
          <line x1="48" y1="10" x2="48" y2="28" />
          <path d="M48 10 L62 14 L48 18" fill="currentColor" stroke="none" />
          {/* tent peak */}
          <path d="M48 22 L14 60 L82 60 Z" />
          {/* vertical stripes */}
          <line x1="48" y1="22" x2="48" y2="60" />
          <path d="M34 38 L40 60" />
          <path d="M62 38 L56 60" />
          {/* base */}
          <path d="M14 60 L14 80 L82 80 L82 60" />
          <line x1="14" y1="80" x2="82" y2="80" />
        </>
      );

    case "Gamblers":
      return (
        <>
          <rect x="20" y="20" width="56" height="56" rx="6" />
          <circle cx="34" cy="34" r="4" fill="currentColor" stroke="none" />
          <circle cx="62" cy="34" r="4" fill="currentColor" stroke="none" />
          <circle cx="48" cy="48" r="4" fill="currentColor" stroke="none" />
          <circle cx="34" cy="62" r="4" fill="currentColor" stroke="none" />
          <circle cx="62" cy="62" r="4" fill="currentColor" stroke="none" />
        </>
      );

    case "Saints":
      return (
        <>
          {/* halo / sun ring */}
          <circle cx="48" cy="48" r="32" />
          {/* radiating rays */}
          <line x1="48" y1="8" x2="48" y2="14" strokeWidth={2.5} />
          <line x1="48" y1="82" x2="48" y2="88" strokeWidth={2.5} />
          <line x1="8" y1="48" x2="14" y2="48" strokeWidth={2.5} />
          <line x1="82" y1="48" x2="88" y2="48" strokeWidth={2.5} />
          <line x1="20" y1="20" x2="24" y2="24" strokeWidth={2.5} />
          <line x1="72" y1="72" x2="76" y2="76" strokeWidth={2.5} />
          <line x1="20" y1="76" x2="24" y2="72" strokeWidth={2.5} />
          <line x1="72" y1="24" x2="76" y2="20" strokeWidth={2.5} />
          {/* cross within halo */}
          <line x1="48" y1="28" x2="48" y2="68" strokeWidth={6} />
          <line x1="32" y1="44" x2="64" y2="44" strokeWidth={6} />
        </>
      );

    case "Fury":
      return (
        <>
          {/* outer flame */}
          <path d="M48 8 C56 22 70 30 72 46 C74 64 64 82 48 82 C32 82 22 66 22 50 C22 38 32 32 36 22 C38 32 46 32 46 22 C44 14 46 10 48 8 Z" />
          {/* inner flame */}
          <path
            d="M48 36 C52 44 60 52 58 62 C56 72 50 76 48 76 C46 76 40 72 38 62 C36 52 44 46 48 36 Z"
            fill="currentColor"
            stroke="none"
          />
        </>
      );

    case "SymBio":
      return (
        <>
          {/* two intertwined strands */}
          <path d="M28 14 C28 30 68 30 68 46 C68 62 28 62 28 78" />
          <path d="M68 14 C68 30 28 30 28 46 C28 62 68 62 68 78" />
          {/* base pairs */}
          <line x1="32" y1="22" x2="64" y2="22" />
          <line x1="32" y1="46" x2="64" y2="46" />
          <line x1="32" y1="70" x2="64" y2="70" />
        </>
      );

    case "Deviants":
      return (
        <>
          {/* asymmetric mutated head */}
          <path d="M30 18 C16 26 14 50 22 68 C28 80 38 86 50 84 C66 82 78 64 76 44 C74 22 50 12 30 18 Z" />
          {/* two regular eyes */}
          <circle cx="36" cy="46" r="3.5" fill="currentColor" stroke="none" />
          <circle cx="58" cy="42" r="3.5" fill="currentColor" stroke="none" />
          {/* third eye on forehead */}
          <circle cx="48" cy="28" r="3" />
          <circle cx="48" cy="28" r="1" fill="currentColor" stroke="none" />
          {/* gritted teeth mouth */}
          <path d="M36 64 L44 62 L48 66 L52 62 L60 64" />
        </>
      );

    case "Mafia":
      return (
        <>
          {/* rose blossom — concentric petals */}
          <circle cx="48" cy="32" r="20" />
          <circle cx="48" cy="32" r="13" />
          <circle cx="48" cy="32" r="6" fill="currentColor" stroke="none" />
          {/* petal lines */}
          <line x1="48" y1="12" x2="48" y2="52" />
          <line x1="28" y1="32" x2="68" y2="32" />
          <line x1="34" y1="18" x2="62" y2="46" />
          <line x1="62" y1="18" x2="34" y2="46" />
          {/* stem */}
          <line x1="48" y1="52" x2="48" y2="86" strokeWidth={4} />
          {/* leaves */}
          <path d="M48 64 Q34 58 28 68 Q34 76 48 70" fill="currentColor" stroke="none" />
          <path d="M48 74 Q62 70 70 80 Q60 84 48 80" fill="currentColor" stroke="none" />
        </>
      );

    case "Damned":
      return (
        <>
          {/* skull dome */}
          <path d="M22 50 C22 28 36 18 48 18 C60 18 74 28 74 50 L74 60 L60 60 L60 70 L36 70 L36 60 L22 60 Z" />
          {/* X eyes */}
          <line x1="30" y1="38" x2="40" y2="48" />
          <line x1="40" y1="38" x2="30" y2="48" />
          <line x1="56" y1="38" x2="66" y2="48" />
          <line x1="66" y1="38" x2="56" y2="48" />
          {/* nose */}
          <path d="M46 52 L50 52 L48 58 Z" fill="currentColor" stroke="none" />
          {/* teeth */}
          <line x1="42" y1="62" x2="42" y2="70" />
          <line x1="48" y1="62" x2="48" y2="70" />
          <line x1="54" y1="62" x2="54" y2="70" />
        </>
      );

    case "PSI":
      return (
        <>
          <circle cx="48" cy="48" r="34" />
          {/* central stem */}
          <line x1="48" y1="20" x2="48" y2="80" strokeWidth={4} />
          {/* prongs */}
          <path d="M28 32 L28 46 Q28 56 48 56 Q68 56 68 46 L68 32" strokeWidth={4} />
        </>
      );

    case "Enigma":
      return (
        <>
          {/* mask shape */}
          <path d="M14 30 Q24 22 48 22 Q72 22 82 30 Q82 56 64 60 Q56 56 48 56 Q40 56 32 60 Q14 56 14 30 Z" />
          {/* eye holes */}
          <ellipse cx="34" cy="38" rx="8" ry="6" />
          <ellipse cx="62" cy="38" rx="8" ry="6" />
          {/* mask ribbons */}
          <path d="M44 56 Q40 70 32 80" />
          <path d="M52 56 Q56 70 64 80" />
        </>
      );

    case "Toyz":
      return (
        <>
          {/* ears */}
          <circle cx="24" cy="28" r="10" />
          <circle cx="72" cy="28" r="10" />
          <circle cx="24" cy="28" r="4" fill="currentColor" stroke="none" />
          <circle cx="72" cy="28" r="4" fill="currentColor" stroke="none" />
          {/* head */}
          <circle cx="48" cy="50" r="26" />
          {/* eyes */}
          <circle cx="38" cy="44" r="3" fill="currentColor" stroke="none" />
          <circle cx="58" cy="44" r="3" fill="currentColor" stroke="none" />
          {/* snout */}
          <ellipse cx="48" cy="60" rx="11" ry="8" />
          {/* nose */}
          <path d="M44 56 L52 56 L48 62 Z" fill="currentColor" stroke="none" />
          {/* mouth */}
          <path d="M48 62 L48 66" />
          <path d="M44 68 Q48 70 52 68" />
        </>
      );

    case "Alpha":
      return (
        <>
          {/* outer chevron */}
          <path d="M14 80 L48 18 L82 80" />
          {/* inner chevron */}
          <path d="M28 80 L48 44 L68 80" />
          {/* dot bottom (rank pip) */}
          <circle cx="48" cy="68" r="3" fill="currentColor" stroke="none" />
          {/* top tick */}
          <line x1="42" y1="22" x2="54" y2="22" />
        </>
      );

    case "Metropolis":
      return (
        <>
          {/* center tower (tallest, art-deco stepped) */}
          <path d="M36 80 L36 38 L40 32 L44 26 L48 18 L52 26 L56 32 L60 38 L60 80 Z" />
          {/* left tower */}
          <path d="M14 80 L14 50 L18 44 L22 38 L26 44 L30 50 L30 80 Z" />
          {/* right tower */}
          <path d="M66 80 L66 50 L70 44 L74 38 L78 44 L82 50 L82 80 Z" />
          {/* deco horizontal bands on center */}
          <line x1="36" y1="50" x2="60" y2="50" />
          <line x1="36" y1="62" x2="60" y2="62" />
          <line x1="36" y1="74" x2="60" y2="74" />
        </>
      );

    case "Chasers":
      return (
        <>
          {/* outer ring with gaps (broken reticle) */}
          <path d="M48 16 A32 32 0 0 1 80 48" />
          <path d="M80 48 A32 32 0 0 1 48 80" />
          <path d="M48 80 A32 32 0 0 1 16 48" />
          <path d="M16 48 A32 32 0 0 1 48 16" />
          {/* inner ring */}
          <circle cx="48" cy="48" r="12" />
          {/* crosshair lines */}
          <line x1="48" y1="10" x2="48" y2="22" />
          <line x1="48" y1="74" x2="48" y2="86" />
          <line x1="10" y1="48" x2="22" y2="48" />
          <line x1="74" y1="48" x2="86" y2="48" />
          {/* center dot */}
          <circle cx="48" cy="48" r="3" fill="currentColor" stroke="none" />
        </>
      );

    case "Халифат":
      return (
        <>
          {/* crescent moon — masked from a full circle by an offset cutout */}
          <defs>
            <mask id="caliphate-crescent">
              <rect x="0" y="0" width="96" height="96" fill="white" />
              <circle cx="56" cy="46" r="26" fill="black" />
            </mask>
          </defs>
          <circle
            cx="44"
            cy="48"
            r="32"
            fill="currentColor"
            stroke="none"
            mask="url(#caliphate-crescent)"
          />
          {/* 5-point star tucked inside the crescent's open cradle */}
          <polygon
            points="64,40 67,49 76,49 69,55 71,64 64,58 57,64 59,55 52,49 61,49"
            fill="currentColor"
            stroke="none"
          />
        </>
      );

    case "Nemos":
      return (
        <>
          {/* shaft */}
          <line x1="48" y1="30" x2="48" y2="82" strokeWidth={4} />
          {/* crossbar */}
          <line x1="28" y1="30" x2="68" y2="30" strokeWidth={4} />
          {/* left prong (curls inward) */}
          <path d="M28 30 L28 14 L36 18" />
          {/* middle prong */}
          <line x1="48" y1="30" x2="48" y2="10" strokeWidth={4} />
          <path d="M40 18 L48 10 L56 18" />
          {/* right prong */}
          <path d="M68 30 L68 14 L60 18" />
          {/* base ring */}
          <line x1="42" y1="82" x2="54" y2="82" strokeWidth={4} />
        </>
      );

    default:
      return (
        <>
          <circle cx="48" cy="48" r="32" />
          <circle cx="48" cy="48" r="6" fill="currentColor" stroke="none" />
        </>
      );
  }
}
