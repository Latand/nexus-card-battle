import { expect, test, type Page } from "@playwright/test";
import { mockDeckReadyProfile } from "./fixtures/playerProfile";

const VIEWPORTS = [
  { name: "phone portrait", width: 350, height: 760 },
  { name: "phone landscape", width: 844, height: 390 },
] as const;

const COLLECTION_VIEWPORTS = [
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "phone portrait", width: 390, height: 844 },
  { name: "small phone", width: 320, height: 568 },
  { name: "short landscape", width: 1024, height: 520 },
] as const;

const SELECTION_VIEWPORTS = [
  { name: "phone portrait", width: 390, height: 844 },
  { name: "small phone", width: 320, height: 568 },
  { name: "phone landscape", width: 844, height: 390 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`fits the full battle board on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openBattle(page);

    const metrics = await page.evaluate(() => {
      const board = document.querySelector(".battle-board")?.getBoundingClientRect();
      const top = document.querySelector('[data-testid="turn-timer"]')?.getBoundingClientRect();
      const bottom = document.querySelector('[data-testid="round-marker"]')?.getBoundingClientRect();
      const rect = (value?: DOMRect) =>
        value
          ? {
              top: value.top,
              bottom: value.bottom,
              left: value.left,
              right: value.right,
              width: value.width,
              height: value.height,
            }
          : null;

      return {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerWidth,
        innerHeight,
        board: rect(board),
        top: rect(top),
        bottom: rect(bottom),
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.board?.top ?? -1).toBeGreaterThanOrEqual(0);
    expect(metrics.board?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.top?.top ?? -1).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(metrics.innerHeight + 1);

    const cardLabelFailures = await getCardLabelFailures(page, ".battle-hand .battle-card-face");
    const cardRatios = await page.locator(".battle-hand .battle-card-face").evaluateAll((cards) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return rect.width / rect.height;
      }),
    );

    expect(cardLabelFailures).toEqual([]);
    const cardBounds = await page.locator(".battle-hand .battle-card-face").evaluateAll((cards) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }),
    );

    for (const bounds of cardBounds) {
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(viewport.height + 1);
    }

    if (viewport.name === "phone landscape") {
      for (const ratio of cardRatios) {
        expect(ratio).toBeGreaterThan(0.58);
        expect(ratio).toBeLessThan(0.74);
      }
    }
  });
}

test("disables accidental text selection on mobile battle controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBattle(page);

  const selectionState = await page.evaluate(() => {
    const screen = document.querySelector(".battle-screen");
    const card = document.querySelector('[data-testid^="player-card-"]');
    const button = document.querySelector('[data-testid="round-marker"]');
    const screenStyle = screen ? getComputedStyle(screen) : null;
    const cardStyle = card ? getComputedStyle(card) : null;
    const buttonStyle = button ? getComputedStyle(button) : null;

    return {
      screenUserSelect: screenStyle?.userSelect,
      cardUserSelect: cardStyle?.userSelect,
      buttonUserSelect: buttonStyle?.userSelect,
      cardTapHighlight: cardStyle?.getPropertyValue("-webkit-tap-highlight-color"),
      cardTouchAction: cardStyle?.touchAction,
    };
  });

  expect(selectionState.screenUserSelect).toBe("none");
  expect(selectionState.cardUserSelect).toBe("none");
  expect(selectionState.buttonUserSelect).toBe("none");
  expect(selectionState.cardTapHighlight).toBe("rgba(0, 0, 0, 0)");
  expect(selectionState.cardTouchAction).toBe("manipulation");
});

test("keeps duel cards readable with enough portrait breathing room", async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 760 });
  await openBattle(page);

  await page.locator('[data-testid^="player-card-"]').first().click();
  await expect(page.getByTestId("selection-overlay")).toBeVisible();
  await page.getByTestId("selection-ok").click();
  await expect(page.getByTestId("battle-overlay")).toBeVisible({ timeout: 10_000 });

  const metrics = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="battle-overlay"] .battle-overlay-stage')?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('[data-testid="battle-overlay"] .battle-card-face')].map((card) => card.getBoundingClientRect());

    return {
      stageBottom: stage?.bottom ?? null,
      cardBottoms: cards.map((card) => card.bottom),
    };
  });
  const cardLabelFailures = await getCardLabelFailures(page, '[data-testid="battle-overlay"] .battle-card-face');

  expect(metrics.stageBottom).not.toBeNull();
  for (const cardBottom of metrics.cardBottoms) {
    expect(cardBottom).toBeLessThanOrEqual((metrics.stageBottom ?? 0) - 80);
  }
  expect(cardLabelFailures).toEqual([]);
});

test("keeps the desktop board compact on tall screens", async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 1536 });
  await openBattle(page);

  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const enemyHand = rect(".battle-hand--enemy");
    const arena = rect(".battle-arena-strip");
    const playerHand = rect(".battle-hand--player");
    const cards = [...document.querySelectorAll(".battle-hand .battle-card-face")].map((card) => {
      const bounds = card.getBoundingClientRect();
      return bounds.width / bounds.height;
    });

    return {
      enemyToArenaGap: arena && enemyHand ? arena.top - enemyHand.bottom : null,
      arenaToPlayerGap: playerHand && arena ? playerHand.top - arena.bottom : null,
      cardRatios: cards,
    };
  });

  expect(metrics.enemyToArenaGap).not.toBeNull();
  expect(metrics.arenaToPlayerGap).not.toBeNull();
  expect(metrics.enemyToArenaGap ?? Number.POSITIVE_INFINITY).toBeLessThan(180);
  expect(metrics.arenaToPlayerGap ?? Number.POSITIVE_INFINITY).toBeLessThan(180);
  for (const ratio of metrics.cardRatios) {
    expect(ratio).toBeGreaterThan(0.58);
    expect(ratio).toBeLessThan(0.74);
  }
});

for (const viewport of COLLECTION_VIEWPORTS) {
  test(`keeps the collection deck builder aligned on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockDeckReadyProfile(page);
    await page.goto("/");

    await expect(page.getByTestId("collection-search")).toBeVisible();
    await expect(page.getByTestId("play-selected-deck")).toBeVisible();
    await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(9);
    await expect.poll(async () => page.locator('[data-testid^="collection-card-"]').count()).toBeGreaterThan(9);

    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => {
        const bounds = document.querySelector(selector)?.getBoundingClientRect();
        return bounds
          ? {
              top: bounds.top,
              bottom: bounds.bottom,
              left: bounds.left,
              right: bounds.right,
              width: bounds.width,
              height: bounds.height,
            }
          : null;
      };
      const outsideViewport = [...document.querySelectorAll("body *")]
        .filter((element) => !element.closest(".overflow-x-auto"))
        .map((element) => element.getBoundingClientRect())
        .filter((bounds) => bounds.left < -1 || bounds.right > innerWidth + 1 || bounds.top < -1);
      const collectionPanelBounds = document.querySelector('[data-testid^="collection-card-"]')?.closest("section")?.getBoundingClientRect();
      const collectionCards = [...document.querySelectorAll('[data-testid^="collection-card-"]')]
        .slice(0, 2)
        .map((card) => {
          const bounds = card.getBoundingClientRect();
          return { top: bounds.top, width: bounds.width };
        });

      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        outsideViewport: outsideViewport.length,
        selectedPreview: rect('[data-testid="selected-card-preview"]'),
        collectionPanel: collectionPanelBounds
          ? {
              top: collectionPanelBounds.top,
              bottom: collectionPanelBounds.bottom,
              left: collectionPanelBounds.left,
              right: collectionPanelBounds.right,
              width: collectionPanelBounds.width,
              height: collectionPanelBounds.height,
            }
          : null,
        collectionCards,
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
    expect(metrics.outsideViewport).toBe(0);
    expect(metrics.selectedPreview).not.toBeNull();
    expect(metrics.collectionPanel).not.toBeNull();
    expect(metrics.selectedPreview?.top ?? Number.POSITIVE_INFINITY).toBeLessThan(
      metrics.collectionPanel?.top ?? Number.NEGATIVE_INFINITY,
    );
    expect(metrics.collectionPanel?.width ?? 0).toBeGreaterThanOrEqual(viewport.width - 32);

    if (viewport.width <= 360) {
      expect(metrics.collectionCards).toHaveLength(2);
      expect(Math.abs(metrics.collectionCards[0].top - metrics.collectionCards[1].top)).toBeLessThan(1);
      expect(metrics.collectionCards[0].width).toBeGreaterThanOrEqual(130);
    }
  });
}

for (const viewport of SELECTION_VIEWPORTS) {
  test(`keeps the selection dialog inside the viewport on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openBattle(page);

    await page.locator('[data-testid^="player-card-"]').first().click();
    await expect(page.getByTestId("selection-overlay")).toBeVisible();

    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => {
        const bounds = document.querySelector(selector)?.getBoundingClientRect();
        return bounds
          ? {
              top: bounds.top,
              bottom: bounds.bottom,
              left: bounds.left,
              right: bounds.right,
              width: bounds.width,
              height: bounds.height,
            }
          : null;
      };
      const cards = [...document.querySelectorAll(".selection-dialog .battle-card-face")].map((card) => {
        const bounds = card.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
      });

      return {
        innerWidth,
        innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        dialog: rect(".selection-dialog"),
        ok: rect('[data-testid="selection-ok"]'),
        enemy: rect(".selection-enemy"),
        cards,
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.dialog?.top ?? -1).toBeGreaterThanOrEqual(0);
    expect(metrics.dialog?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.ok?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.enemy?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(metrics.innerHeight + 1);

    for (const card of metrics.cards) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(card.top).toBeGreaterThanOrEqual(0);
      expect(card.bottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
    }
  });
}

async function openBattle(page: Page) {
  await mockDeckReadyProfile(page);
  await page.goto("/");
  await page.getByTestId("play-selected-deck").click();
  await expect(page.getByTestId("phase-overlay")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("round-status")).toBeVisible();
}

async function getCardLabelFailures(page: Page, cardSelector: string) {
  return page.evaluate((selector) => {
    const rect = (value: Element) => value.getBoundingClientRect();

    return [...document.querySelectorAll(selector)].flatMap((card, cardIndex) => {
      const cardRect = rect(card);
      const labels = [...card.querySelectorAll("[data-card-ability], [data-card-bonus]")];

      if (labels.length !== 2) return [`card ${cardIndex}: missing labels`];

      return labels.flatMap((label) => {
        const labelRect = rect(label);
        const kind = label.hasAttribute("data-card-ability") ? "ability" : "bonus";
        const failures = [];

        if (labelRect.top < cardRect.top - 0.5) failures.push(`${kind} top clipped`);
        if (labelRect.bottom > cardRect.bottom + 0.5) failures.push(`${kind} bottom clipped`);
        if (labelRect.left < cardRect.left - 0.5) failures.push(`${kind} left clipped`);
        if (labelRect.right > cardRect.right + 0.5) failures.push(`${kind} right clipped`);
        if (labelRect.width < 20) failures.push(`${kind} too narrow`);
        if (labelRect.height < 10) failures.push(`${kind} too short`);

        return failures.map((failure) => `card ${cardIndex}: ${failure}`);
      });
    });
  }, cardSelector);
}
