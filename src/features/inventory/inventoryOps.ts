export type OwnedCardEntry = {
  cardId: string;
  count: number;
};

export function addToInventory(
  inventory: readonly OwnedCardEntry[],
  cardId: string,
  count = 1,
): OwnedCardEntry[] {
  assertCount(count, "count");
  if (count === 0) return [...inventory];

  const next: OwnedCardEntry[] = [];
  let found = false;
  for (const entry of inventory) {
    if (entry.cardId === cardId) {
      next.push({ cardId: entry.cardId, count: entry.count + count });
      found = true;
    } else {
      next.push({ ...entry });
    }
  }

  if (!found) next.push({ cardId, count });
  return next;
}

export function removeFromInventory(
  inventory: readonly OwnedCardEntry[],
  cardId: string,
  count = 1,
): OwnedCardEntry[] {
  assertCount(count, "count");
  if (count === 0) return [...inventory];

  const owned = getOwnedCount(inventory, cardId);
  if (count > owned) {
    throw new Error(`Cannot remove ${count} of ${cardId}: only ${owned} owned.`);
  }

  const next: OwnedCardEntry[] = [];
  for (const entry of inventory) {
    if (entry.cardId !== cardId) {
      next.push({ ...entry });
      continue;
    }

    const remaining = entry.count - count;
    if (remaining > 0) next.push({ cardId: entry.cardId, count: remaining });
  }

  return next;
}

export function getOwnedCount(inventory: readonly OwnedCardEntry[], cardId: string): number {
  for (const entry of inventory) {
    if (entry.cardId === cardId) return entry.count;
  }
  return 0;
}

// Spare copies ignoring in-deck protection — the server enforces stricter
// `card_in_deck` rejection (any sell of an in-deck cardId is refused), so UI
// callers must gate the sell action on `deckIds.includes(cardId)` separately
// rather than relying on the N-1 returned here.
export function getSellableCount(
  inventory: readonly OwnedCardEntry[],
  deckIds: readonly string[],
  cardId: string,
): number {
  const owned = getOwnedCount(inventory, cardId);
  const protectedByDeck = deckIds.includes(cardId) ? 1 : 0;
  return Math.max(0, owned - protectedByDeck);
}

export function getOwnedCardIds(inventory: readonly OwnedCardEntry[]): string[] {
  return inventory.filter((entry) => entry.count > 0).map((entry) => entry.cardId);
}

function assertCount(value: number, name: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
}
