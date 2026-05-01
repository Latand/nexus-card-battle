import { expect, test } from "@playwright/test";

test("plays a complete staged battle", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Соперник", { exact: true })).toBeVisible();
  await expect(page.getByText("75 сек")).toBeVisible();
  await expect(page.getByText("Меню")).toBeVisible();
  await expect(page.getByText("Раунд 1")).toBeVisible();
  await expect(page.getByTestId("round-status")).toContainText(/Твой ход|Ход соперника/);
  await expect(page.getByText("Выбери бойца, вложи энергию и выпусти его на улицу.")).toBeVisible();
  await expect(page.getByText("Энергия в карту:")).toBeVisible();
  const threeEnergy = page.getByRole("button", { exact: true, name: "3 энергии" });
  await expect(threeEnergy).toBeEnabled();

  await threeEnergy.click();
  await expect(page.getByText("Энергия в карту: 3")).toBeVisible();

  const playButton = page.getByRole("button", { name: "Сыграть" });
  await playButton.scrollIntoViewIfNeeded();
  await expect(playButton).toBeEnabled();

  for (let round = 1; round <= 4; round += 1) {
    if (await playButton.isDisabled()) break;

    await playButton.scrollIntoViewIfNeeded();
    await playButton.click();
    await expect(page.getByRole("button", { name: "Бой..." })).toBeVisible();
    await expect(page.getByText(`Раунд ${round}`, { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  await expect(page.getByTestId("round-status")).toContainText(/Победа|Ничья/, { timeout: 10_000 });
  await expect(playButton).toBeDisabled();

  await page.getByRole("button", { name: "Новый бой" }).click();
  await expect(page.getByText("Выбери бойца, вложи энергию и выпусти его на улицу.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сыграть" })).toBeEnabled();
});
