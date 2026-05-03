import { expect, test } from "@playwright/test";
import { cards } from "../src/features/battle/model/cards";
import { SELL_PRICES_BY_RARITY } from "../src/features/economy/sellPricing";
import { computeLevelFromXp, type PlayerIdentity } from "../src/features/player/profile/types";
import { mockDeckReadyProfile, PROFILE_DECK_IDS, PROFILE_OWNED_CARD_IDS } from "./fixtures/playerProfile";

// Pick a Common card outside the saved deck so the sell button is enabled.
const sellableExtraCardId = "dahack-363";
// First deck card is locked (it's in the saved deck).
const inDeckCardId = PROFILE_DECK_IDS[0];

test("Collection card detail sells a duplicate Common, decrements badge, and credits the HUD crystals", async ({ page }) => {
  if (!PROFILE_OWNED_CARD_IDS.includes(sellableExtraCardId)) {
    throw new Error(`Sellable extra ${sellableExtraCardId} must be in fixture ownedCardIds.`);
  }

  const sellableCard = cards.find((card) => card.id === sellableExtraCardId);
  if (!sellableCard) throw new Error(`Card ${sellableExtraCardId} must exist in card pool.`);
  if (sellableCard.rarity !== "Common") {
    throw new Error(`Sell-flow fixture expects ${sellableExtraCardId} to be Common (got ${sellableCard.rarity}).`);
  }

  const sellIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-sell-flow-e2e" };

  await mockDeckReadyProfile(page, {
    identity: sellIdentity,
    ownedCardIds: PROFILE_OWNED_CARD_IDS,
    // Same set as ownedCardIds, except the extra card has count 2 — so one
    // copy is sellable and one stays in the inventory after the sell.
    ownedCards: PROFILE_OWNED_CARD_IDS.map((cardId) => ({
      cardId,
      count: cardId === sellableExtraCardId ? 2 : 1,
    })),
    crystals: 0,
  });

  // Mock POST /api/player/sell so the spec runs offline-friendly: returns the
  // expected post-sell profile without depending on the Mongo store.
  await page.route("**/api/player/sell", async (route) => {
    const body = route.request().postDataJSON() as { identity: PlayerIdentity; cardId: string; count: number };
    const sellPrice = SELL_PRICES_BY_RARITY[sellableCard.rarity];
    const ownedCards = PROFILE_OWNED_CARD_IDS.map((cardId) => ({
      cardId,
      count: cardId === sellableExtraCardId ? 2 - body.count : 1,
    })).filter((entry) => entry.count > 0);
    const totalXp = 0;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        player: {
          id: "player-sell-flow-e2e",
          identity: body.identity,
          ownedCardIds: ownedCards.map((entry) => entry.cardId),
          ownedCards,
          deckIds: PROFILE_DECK_IDS,
          starterFreeBoostersRemaining: 0,
          openedBoosterIds: ["neon-breach", "factory-shift"],
          crystals: body.count * sellPrice,
          totalXp,
          level: computeLevelFromXp(totalXp).level,
          wins: 0,
          losses: 0,
          draws: 0,
          eloRating: 1000,
          onboarding: {
            starterBoostersAvailable: false,
            collectionReady: true,
            deckReady: true,
            completed: true,
          },
        },
      }),
    });
  });

  await page.goto("/");

  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-collection-mode", "owned");

  // Open the card detail by selecting the tile.
  await page.getByLabel(`Обрати ${sellableCard.name}`).click();

  // Sell summary line appears with the expected breakdown.
  await expect(page.getByTestId("collection-sell-summary")).toContainText("Ви маєте: 2 (0 у колоді, 2 запасних)");

  // Sell 1 duplicate (no confirm needed — not last copy, not Legend).
  await page.getByTestId("collection-sell-1").click();

  // Owned-count badge decrements from 2 to 1.
  await expect(page.getByTestId(`collection-owned-count-${sellableCard.id}`)).toHaveText("Ви маєте: 1");

  // HUD crystals incremented by Common sell price (5).
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-profile-crystals", "5");
});

test("Collection card detail disables sell when the card is in any saved deck", async ({ page }) => {
  if (!inDeckCardId) throw new Error("Fixture must include at least one deck card.");

  const sellIdentity: PlayerIdentity = { mode: "guest", guestId: "guest-sell-disabled-e2e" };

  await mockDeckReadyProfile(page, {
    identity: sellIdentity,
    crystals: 0,
  });

  await page.goto("/");

  const inDeckCard = cards.find((card) => card.id === inDeckCardId);
  if (!inDeckCard) throw new Error(`Card ${inDeckCardId} must exist in card pool.`);

  await page.getByLabel(`Обрати ${inDeckCard.name}`).click();

  // Helper text uses the exact uk-UA phrase.
  await expect(page.getByTestId("collection-sell-disabled-reason")).toHaveText("Видали з колоди, щоб продати");

  // Both sell buttons are present but disabled.
  await expect(page.getByTestId("collection-sell-1")).toBeDisabled();
  await expect(page.getByTestId("collection-sell-all")).toBeDisabled();
});
