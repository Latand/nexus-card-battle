import { expect, test } from "@playwright/test";

test("plays a complete staged battle", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Соперник", { exact: true })).toBeVisible();
  await expect(page.getByText("75 сек")).toBeVisible();
  await expect(page.getByText("Меню")).toBeVisible();
  await expect(page.getByTestId("round-marker")).toHaveText("Раунд 1");
  await expect(page.getByTestId("round-status")).toContainText(/Твой ход|Ход соперника/);
  await expect(page.getByText("Выбери бойца, вложи энергию и выпусти его на улицу.")).toBeVisible();
  await page.getByTestId("player-card-alpha").click();
  await expect(page.getByTestId("selection-overlay")).toBeVisible();
  await expect(page.getByTestId("selection-energy")).toHaveText("x1");

  await page.getByTestId("energy-plus").click();
  await page.getByTestId("energy-plus").click();
  await expect(page.getByTestId("selection-energy")).toHaveText("x3");
  await page.getByTestId("selection-ok").click();
  await expect(page.getByTestId("battle-overlay")).toBeVisible();
  await expect(page.getByTestId("battle-overlay")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId("round-marker")).toHaveText("Раунд 2");

  const nextCards = ["fury", "micron", "dahack"];
  for (const [index, cardId] of nextCards.entries()) {
    const cardButton = page.getByTestId(`player-card-${cardId}`);
    if (await cardButton.isDisabled()) break;

    await cardButton.scrollIntoViewIfNeeded();
    await cardButton.click();
    await expect(page.getByTestId("selection-overlay")).toBeVisible();
    await page.getByTestId("selection-ok").click();
    await expect(page.getByTestId("battle-overlay")).toBeVisible();
    await expect(page.getByTestId("battle-overlay")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("round-marker")).toHaveText(`Раунд ${Math.min(index + 3, 4)}`);
  }

  await expect(page.getByTestId("round-status")).toContainText(/Победа|Ничья/, { timeout: 10_000 });
  await expect(page.getByTestId("player-card-alpha")).toBeDisabled();

  await page.getByRole("button", { name: "Новый бой" }).click();
  await expect(page.getByText("Выбери бойца, вложи энергию и выпусти его на улицу.")).toBeVisible();
  await expect(page.getByTestId("player-card-alpha")).toBeEnabled();
});
