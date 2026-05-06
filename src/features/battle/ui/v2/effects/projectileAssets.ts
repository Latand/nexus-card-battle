export type ClanProjectileAsset = {
  clan: string;
  slug: string;
  src: string;
  glow: string;
};

export const clanProjectileAssets: readonly ClanProjectileAsset[] = [
  { clan: "[Da:Hack]", slug: "dahack", src: "/nexus-assets/projectiles/clans/dahack.png", glow: "drop-shadow-[0_0_14px_rgba(61,241,196,0.86)]" },
  { clan: "Aliens", slug: "aliens", src: "/nexus-assets/projectiles/clans/aliens.png", glow: "drop-shadow-[0_0_14px_rgba(98,227,54,0.86)]" },
  { clan: "Alpha", slug: "alpha", src: "/nexus-assets/projectiles/clans/alpha.png", glow: "drop-shadow-[0_0_13px_rgba(154,166,182,0.76)]" },
  { clan: "Chasers", slug: "chasers", src: "/nexus-assets/projectiles/clans/chasers.png", glow: "drop-shadow-[0_0_13px_rgba(255,126,38,0.8)]" },
  { clan: "Circus", slug: "circus", src: "/nexus-assets/projectiles/clans/circus.png", glow: "drop-shadow-[0_0_14px_rgba(233,62,200,0.82)]" },
  { clan: "Damned", slug: "damned", src: "/nexus-assets/projectiles/clans/damned.png", glow: "drop-shadow-[0_0_14px_rgba(162,136,176,0.82)]" },
  { clan: "Deviants", slug: "deviants", src: "/nexus-assets/projectiles/clans/deviants.png", glow: "drop-shadow-[0_0_14px_rgba(223,229,64,0.8)]" },
  { clan: "Enigma", slug: "enigma", src: "/nexus-assets/projectiles/clans/enigma.png", glow: "drop-shadow-[0_0_14px_rgba(155,106,214,0.86)]" },
  { clan: "Fury", slug: "fury", src: "/nexus-assets/projectiles/clans/fury.png", glow: "drop-shadow-[0_0_14px_rgba(231,64,43,0.86)]" },
  { clan: "Gamblers", slug: "gamblers", src: "/nexus-assets/projectiles/clans/gamblers.png", glow: "drop-shadow-[0_0_13px_rgba(61,199,122,0.78)]" },
  { clan: "Kingpin", slug: "kingpin", src: "/nexus-assets/projectiles/clans/kingpin.png", glow: "drop-shadow-[0_0_13px_rgba(242,191,61,0.8)]" },
  { clan: "Mafia", slug: "mafia", src: "/nexus-assets/projectiles/clans/mafia.png", glow: "drop-shadow-[0_0_13px_rgba(194,86,104,0.8)]" },
  { clan: "Metropolis", slug: "metropolis", src: "/nexus-assets/projectiles/clans/metropolis.png", glow: "drop-shadow-[0_0_13px_rgba(58,163,168,0.8)]" },
  { clan: "Micron", slug: "micron", src: "/nexus-assets/projectiles/clans/micron.png", glow: "drop-shadow-[0_0_14px_rgba(58,120,255,0.86)]" },
  { clan: "Nemos", slug: "nemos", src: "/nexus-assets/projectiles/clans/nemos.png", glow: "drop-shadow-[0_0_14px_rgba(95,169,200,0.82)]" },
  { clan: "PSI", slug: "psi", src: "/nexus-assets/projectiles/clans/psi.png", glow: "drop-shadow-[0_0_14px_rgba(122,217,238,0.86)]" },
  { clan: "Saints", slug: "saints", src: "/nexus-assets/projectiles/clans/saints.png", glow: "drop-shadow-[0_0_13px_rgba(255,244,184,0.84)]" },
  { clan: "Street", slug: "street", src: "/nexus-assets/projectiles/clans/street.png", glow: "drop-shadow-[0_0_14px_rgba(255,94,122,0.84)]" },
  { clan: "SymBio", slug: "symbio", src: "/nexus-assets/projectiles/clans/symbio.png", glow: "drop-shadow-[0_0_14px_rgba(57,212,181,0.84)]" },
  { clan: "Toyz", slug: "toyz", src: "/nexus-assets/projectiles/clans/toyz.png", glow: "drop-shadow-[0_0_14px_rgba(255,143,181,0.82)]" },
  { clan: "Workers", slug: "workers", src: "/nexus-assets/projectiles/clans/workers.png", glow: "drop-shadow-[0_0_13px_rgba(240,136,50,0.8)]" },
  { clan: "Халифат", slug: "caliphate", src: "/nexus-assets/projectiles/clans/caliphate.png", glow: "drop-shadow-[0_0_13px_rgba(224,170,84,0.82)]" },
  { clan: "VibeCoders", slug: "vibecoders", src: "/nexus-assets/projectiles/clans/vibecoders.png", glow: "drop-shadow-[0_0_14px_rgba(99,102,241,0.86)]" },
];

const clanProjectilesByName = new Map(clanProjectileAssets.map((asset) => [asset.clan, asset]));

export function getProjectileAssetForClan(clan: string | undefined): ClanProjectileAsset | undefined {
  if (!clan) return undefined;
  return clanProjectilesByName.get(clan);
}
