"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cards } from "@/features/battle/model/cards";
import { BattleGame } from "@/features/battle/ui/BattleGame";
import { RealtimeBattleGame } from "@/features/battle/ui/RealtimeBattleGame";
import { PLAYER_DECK_SIZE } from "../model/randomDeck";
import { CollectionDeckScreen } from "./collection/CollectionDeckScreen";

const DECK_SESSION_STORAGE_KEY = "nexus:deck-session:v1";
type BattleMode = "ai" | "human";

type PersistenceWindow = {
  requestIdleCallback?: Window["requestIdleCallback"];
  cancelIdleCallback?: Window["cancelIdleCallback"];
  setTimeout: Window["setTimeout"];
  clearTimeout: Window["clearTimeout"];
};

export function GameRoot() {
  const [collectionIds] = useState(() => cards.map((card) => card.id));
  const [screen, setScreen] = useState<"collection" | "battle">("collection");
  const [battleMode, setBattleMode] = useState<BattleMode>("ai");
  const [deckIds, setDeckIds] = useState(() => createStarterDeckIds(collectionIds));
  const deckIdsRef = useRef(deckIds);
  const deckTouchedRef = useRef(false);
  const persistenceReadyRef = useRef(false);

  useEffect(() => {
    deckIdsRef.current = deckIds;
  }, [deckIds]);

  useEffect(() => {
    return schedulePersistenceTask(() => {
      const savedDeckIds = readSavedDeckIds(collectionIds);

      persistenceReadyRef.current = true;

      if (savedDeckIds && !deckTouchedRef.current) {
        deckIdsRef.current = savedDeckIds;
        setDeckIds(savedDeckIds);
        return;
      }

      saveDeckIds(deckIdsRef.current);
    });
  }, [collectionIds]);

  useEffect(() => {
    if (!persistenceReadyRef.current) return;
    return schedulePersistenceTask(() => saveDeckIds(deckIds));
  }, [deckIds]);

  const handleDeckChange = useCallback(
    (nextDeckIds: string[]) => {
      const sanitizedDeckIds = sanitizeDeckIds(nextDeckIds, collectionIds);

      deckTouchedRef.current = true;
      deckIdsRef.current = sanitizedDeckIds;
      setDeckIds(sanitizedDeckIds);
    },
    [collectionIds],
  );

  if (screen === "battle") {
    if (battleMode === "human") {
      return (
        <RealtimeBattleGame
          playerCollectionIds={collectionIds}
          playerDeckIds={deckIds}
          onOpenCollection={() => setScreen("collection")}
        />
      );
    }

    return (
      <BattleGame
        playerCollectionIds={collectionIds}
        playerDeckIds={deckIds}
        onOpenCollection={() => setScreen("collection")}
      />
    );
  }

  return (
    <CollectionDeckScreen
      collectionIds={collectionIds}
      deckIds={deckIds}
      onDeckChange={handleDeckChange}
      onPlay={(nextDeckIds, mode) => {
        handleDeckChange(nextDeckIds);
        setBattleMode(mode);
        setScreen("battle");
      }}
    />
  );
}

function readSavedDeckIds(collectionIds: string[]) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(DECK_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isStringArray(parsed)) return null;

    return sanitizeDeckIds(parsed, collectionIds);
  } catch {
    return null;
  }
}

function saveDeckIds(deckIds: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(DECK_SESSION_STORAGE_KEY, JSON.stringify(deckIds));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function schedulePersistenceTask(task: () => void) {
  if (typeof window === "undefined") return () => {};

  const persistenceWindow = window as unknown as PersistenceWindow;

  if (persistenceWindow.requestIdleCallback && persistenceWindow.cancelIdleCallback) {
    const handle = persistenceWindow.requestIdleCallback(task, { timeout: 750 });
    return () => persistenceWindow.cancelIdleCallback?.(handle);
  }

  const handle = persistenceWindow.setTimeout(task, 0);
  return () => persistenceWindow.clearTimeout(handle);
}

function sanitizeDeckIds(deckIds: string[], collectionIds: string[]) {
  const collection = new Set(collectionIds);
  const normalized = unique(deckIds).filter((cardId) => collection.has(cardId));

  if (normalized.length >= PLAYER_DECK_SIZE) return normalized;

  const normalizedSet = new Set(normalized);
  for (const cardId of collectionIds) {
    if (!normalizedSet.has(cardId)) {
      normalized.push(cardId);
      normalizedSet.add(cardId);
    }

    if (normalized.length >= PLAYER_DECK_SIZE) break;
  }

  return normalized;
}

function createStarterDeckIds(collectionIds: string[]) {
  return collectionIds.slice(0, PLAYER_DECK_SIZE);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function unique(values: string[]) {
  return [...new Set(values)];
}
