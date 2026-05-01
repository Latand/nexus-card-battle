import { expect, test } from "@playwright/test";

test("plays a complete staged battle", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Соперник", { exact: true })).toBeVisible();
  await expect(page.getByText("75 сек")).toBeVisible();
  await expect(page.getByText("Меню")).toBeVisible();
  await expect(page.getByTestId("round-marker")).toHaveText("Раунд 1");
  await expect(page.getByTestId("round-status")).toContainText(/Твой ход|Ход соперника/);
  await expect(page.getByText("Выбери бойца, вложи энергию и выпусти его на улицу.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Выбор" })).toBeEnabled();

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

  const chooseButton = page.getByRole("button", { name: "Выбор" });
  for (let round = 2; round <= 4; round += 1) {
    if (await chooseButton.isDisabled()) break;

    await chooseButton.scrollIntoViewIfNeeded();
    await chooseButton.click();
    await expect(page.getByTestId("selection-overlay")).toBeVisible();
    await page.getByTestId("selection-ok").click();
    await expect(page.getByTestId("battle-overlay")).toBeVisible();
    await expect(page.getByTestId("battle-overlay")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("round-marker")).toHaveText(`Раунд ${Math.min(round + 1, 4)}`);
  }

  await expect(page.getByTestId("round-status")).toContainText(/Победа|Ничья/, { timeout: 10_000 });
  await expect(chooseButton).toBeDisabled();

  await page.getByRole("button", { name: "Новый бой" }).click();
  await expect(page.getByText("Выбери бойца, вложи энергию и выпусти его на улицу.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Выбор" })).toBeEnabled();
});
