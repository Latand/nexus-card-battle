import { clans } from "@/features/battle/model/clans";
import { PAID_BOOSTER_CRYSTAL_COST, type Booster, type BoosterCatalogItem, type BoosterResponse, type PlayerBoosterCatalogProfile } from "./types";

export const boosterCatalog = [
  { id: "neon-breach", name: "Neon Breach", clans: ["[Da:Hack]", "Aliens"] },
  { id: "factory-shift", name: "Factory Shift", clans: ["Workers", "Micron"] },
  { id: "street-kings", name: "Street Kings", clans: ["Street", "Kingpin"] },
  { id: "carnival-vice", name: "Carnival Vice", clans: ["Circus", "Gamblers"] },
  { id: "faith-and-fury", name: "Faith & Fury", clans: ["Saints", "Fury"] },
  { id: "biohazard", name: "Biohazard", clans: ["SymBio", "Deviants"] },
  { id: "underworld", name: "Underworld", clans: ["Mafia", "Damned"] },
  { id: "mind-games", name: "Mind Games", clans: ["PSI", "Enigma"] },
  { id: "toy-factory", name: "Toy Factory", clans: ["Toyz", "Alpha"] },
  { id: "metro-chase", name: "Metro Chase", clans: ["Metropolis", "Chasers"] },
  { id: "desert-signal", name: "Desert Signal", clans: ["Халифат", "Nemos"] },
  { id: "street-plague", name: "Street Plague", clans: ["Street", "Damned"] },
  // Solo-clan VibeCoders pack: 4 random Legends from the new fan clan.
  { id: "vibe-drop", name: "Vibe Drop", clans: ["VibeCoders"], cardCount: 4, requiredRarities: ["Legend"] },
] as const satisfies readonly Booster[];

export function getBoosterById(boosterId: string): Booster | undefined {
  return boosterCatalog.find((booster) => booster.id === boosterId);
}

export function serializeBooster(booster: Booster): BoosterResponse {
  return {
    id: booster.id,
    name: booster.name,
    clans: [...booster.clans],
    cardCount: booster.cardCount,
  };
}

export function getBoosterCatalogResponse() {
  return boosterCatalog.map(serializeBooster);
}

export function getBoosterCatalogForPlayer(profile: PlayerBoosterCatalogProfile): BoosterCatalogItem[] {
  const openedBoosterIds = new Set(profile.openedBoosterIds);

  return boosterCatalog.map((booster) => {
    const opened = openedBoosterIds.has(booster.id);
    const canOpen = profile.starterFreeBoostersRemaining > 0 && !opened;
    const canOpenPaid = profile.crystals >= PAID_BOOSTER_CRYSTAL_COST;

    return {
      ...serializeBooster(booster),
      starter: {
        opened,
        canOpen,
        disabledReason: canOpen ? undefined : opened ? "already_opened" : "no_starter_boosters_remaining",
      },
      paid: {
        crystalCost: PAID_BOOSTER_CRYSTAL_COST,
        canOpen: canOpenPaid,
        disabledReason: canOpenPaid ? undefined : "insufficient_crystals",
      },
    };
  });
}

export function validateBoosterCatalog() {
  for (const booster of boosterCatalog) {
    if (booster.clans.length < 1 || booster.clans.length > 2) {
      throw new Error(`Booster ${booster.id} must have one or two clans.`);
    }

    const boosterClans: readonly string[] = booster.clans;
    if (boosterClans.includes("C.O.R.R.")) {
      throw new Error(`Booster ${booster.id} must not include C.O.R.R.`);
    }

    for (const clan of booster.clans) {
      if (!clans[clan]) {
        throw new Error(`Booster ${booster.id} includes unknown clan ${clan}.`);
      }
    }
  }
}
