import { expect, test } from "@playwright/test";
import { mockDeckReadyProfile } from "./fixtures/playerProfile";

type TelegramCallLog = {
  lockOrientation: number;
  screenLock: number;
  requestFullscreen: number;
  disableVerticalSwipes: number;
  expand: number;
};

declare global {
  interface Window {
    __tgCalls?: TelegramCallLog;
  }
}

test("Telegram WebApp mobile keeps portrait usable and closes lobby chat cleanly", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
    await route.fulfill({ body: "" });
  });
  await page.addInitScript(() => {
    const calls = {
      lockOrientation: 0,
      screenLock: 0,
      requestFullscreen: 0,
      disableVerticalSwipes: 0,
      expand: 0,
    };
    Object.defineProperty(window, "__tgCalls", { value: calls, configurable: true });
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: {
        WebApp: {
          initData: "test-init-data",
          platform: "ios",
          viewportHeight: 700,
          viewportStableHeight: 700,
          isFullscreen: false,
          isVersionAtLeast: () => true,
          ready: () => {},
          expand: () => {
            calls.expand += 1;
          },
          disableVerticalSwipes: () => {
            calls.disableVerticalSwipes += 1;
          },
          requestFullscreen: () => {
            calls.requestFullscreen += 1;
          },
          lockOrientation: () => {
            calls.lockOrientation += 1;
          },
          setHeaderColor: () => {},
          setBackgroundColor: () => {},
          setBottomBarColor: () => {},
          onEvent: () => {},
          offEvent: () => {},
          initDataUnsafe: {},
        },
      },
    });
    Object.defineProperty(window.screen, "orientation", {
      configurable: true,
      value: {
        lock: () => {
          calls.screenLock += 1;
          return Promise.resolve();
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  });

  await mockDeckReadyProfile(page);
  await page.goto("/");

  await expect(page.getByTestId("player-profile-shell")).toBeVisible();
  await expect(page.getByText(/Горизонтально зручніше/)).toHaveCount(0);

  const bootstrap = await page.evaluate(() => ({
    calls: window.__tgCalls,
    appHeight: getComputedStyle(document.documentElement).getPropertyValue("--app-height").trim(),
    telegramWebapp: document.documentElement.dataset.telegramWebapp,
  }));
  expect(bootstrap.calls?.lockOrientation).toBe(0);
  expect(bootstrap.calls?.screenLock).toBe(0);
  expect(bootstrap.calls?.requestFullscreen).toBe(0);
  expect(bootstrap.calls?.disableVerticalSwipes).toBe(1);
  expect(bootstrap.calls?.expand).toBe(1);
  expect(bootstrap.appHeight).toBe("700px");
  expect(bootstrap.telegramWebapp).toBe("true");

  await expect(page.locator(".battle-card-face").first()).toBeVisible();
  await expect(page.locator(".battle-card-face").first()).toHaveCSS("box-shadow", "none");

  await page.getByTestId("lobby-bubble-v2").click();
  await expect(page.getByTestId("lobby-chat")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        htmlOverflow: document.documentElement.style.overflow,
        bodyOverflow: document.body.style.overflow,
      })),
    )
    .toEqual({ htmlOverflow: "hidden", bodyOverflow: "hidden" });

  await page.getByTestId("lobby-chat-close").click();
  await expect(page.getByTestId("lobby-chat")).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        htmlOverflow: document.documentElement.style.overflow,
        bodyOverflow: document.body.style.overflow,
      })),
    )
    .toEqual({ htmlOverflow: "", bodyOverflow: "" });
});
