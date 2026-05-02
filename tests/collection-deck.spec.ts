import { expect, test } from "@playwright/test";
import { cards } from "../src/features/battle/model/cards";
import { mockDeckReadyProfile, PROFILE_DECK_IDS, PROFILE_OWNED_CARD_IDS } from "./fixtures/playerProfile";

const extraOwnedCardId = PROFILE_OWNED_CARD_IDS.find((cardId) => !PROFILE_DECK_IDS.includes(cardId));
const nonOwnedCard = cards.find((card) => !PROFILE_OWNED_CARD_IDS.includes(card.id));

test("edits and persists decks from owned cards only", async ({ page }) => {
  if (!extraOwnedCardId) throw new Error("Fixture must include an owned card outside the deck.");

  await mockDeckReadyProfile(page);
  await page.goto("/");

  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-collection-mode", "owned");
  await expect(page.locator('[data-testid^="collection-card-"]')).toHaveCount(PROFILE_OWNED_CARD_IDS.length);
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);

  await page.getByTestId(`collection-toggle-${extraOwnedCardId}`).click({ force: true });

  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(10);
  await expect(page.getByTestId("deck-save-status")).toHaveAttribute("data-status", "saved");

  await page.reload();

  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-collection-mode", "owned");
  await expect(page.getByTestId(`deck-card-${extraOwnedCardId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(10);
});

test("shows full base as read-only reference for non-owned cards", async ({ page }) => {
  if (!nonOwnedCard) throw new Error("Fixture must leave at least one active card unowned.");

  await mockDeckReadyProfile(page);
  await page.goto("/");

  await page.getByTestId("collection-mode-base").click();
  await expect(page.getByTestId("player-profile-shell")).toHaveAttribute("data-collection-mode", "base");

  await page.getByTestId("collection-search").fill(nonOwnedCard.name);

  await expect(page.getByTestId(`collection-card-${nonOwnedCard.id}`)).toBeVisible();
  await expect(page.getByTestId(`collection-locked-${nonOwnedCard.id}`)).toBeVisible();
  await expect(page.getByTestId(`collection-toggle-${nonOwnedCard.id}`)).toHaveCount(0);

  await page.getByLabel(`Обрати ${nonOwnedCard.name}`).click();
  await expect(page.getByTestId(`selected-card-readonly-${nonOwnedCard.id}`)).toHaveText("Закрито");
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);
});
