import { expect, test } from "@playwright/test";

test("plays a complete four-round battle", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Бой кланов: 4 хода, 8 карт" })).toBeVisible();
  await expect(page.getByText("Игрок", { exact: true })).toBeVisible();
  await expect(page.getByText("Соперник", { exact: true })).toBeVisible();
  await expect(page.getByText("Выбери карту, вложи энергию и начни первый раунд.")).toBeVisible();

  const playButton = page.getByRole("button", { name: "Сыграть раунд" });
  await expect(playButton).toBeEnabled();

  for (let round = 1; round <= 4; round += 1) {
    if (await playButton.isDisabled()) {
      break;
    }

    await playButton.click();
    await expect(page.getByText(`Раунд ${round}`)).toBeVisible();
  }

  await expect(page.getByText(/Победа|Ничья/)).toBeVisible();
  await expect(playButton).toBeDisabled();

  await page.getByRole("button", { name: "Новый бой" }).click();
  await expect(page.getByText("Выбери карту, вложи энергию и начни первый раунд.")).toBeVisible();
  await expect(playButton).toBeEnabled();
});
