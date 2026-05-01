import { expect, test } from "@playwright/test";

test("plays a complete four-round battle", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Соперник", { exact: true })).toBeVisible();
  await expect(page.getByText("Раунд 1/4")).toBeVisible();
  await expect(page.getByText("Выбери бойца, вложи энергию и выпусти его на улицу.")).toBeVisible();
  await expect(page.getByText("+2 урона за 3 энергии")).toBeVisible();

  const playButton = page.getByRole("button", { name: "Сыграть" });
  await playButton.scrollIntoViewIfNeeded();
  await expect(playButton).toBeEnabled();

  for (let round = 1; round <= 4; round += 1) {
    if (await playButton.isDisabled()) {
      break;
    }

    await playButton.scrollIntoViewIfNeeded();
    await playButton.click();
    await expect(page.getByText(`Раунд ${round}`, { exact: true })).toBeVisible();
  }

  await expect(page.getByText(/Победа|Ничья/)).toBeVisible();
  await expect(playButton).toBeDisabled();

  await page.getByRole("button", { name: "Новый бой" }).click();
  await expect(page.getByText("Выбери бойца, вложи энергию и выпусти его на улицу.")).toBeVisible();
  await expect(playButton).toBeEnabled();
});
