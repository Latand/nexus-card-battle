"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Module-level batch buffer: when multiple setValue calls fire in the same
// microtask (e.g. handler resets several keys at once), they all read from
// and write to the same shared params snapshot, then a single router.push is
// scheduled. Without this, each setter would compute params from a stale
// React snapshot and clobber its sibling's update.
type PendingNav = {
  params: URLSearchParams;
  pathname: string;
  mode: UpdateMode;
};
let pendingNav: PendingNav | null = null;
let scheduled = false;

function ensurePendingNav(pathname: string): URLSearchParams {
  if (!pendingNav) {
    const initial =
      typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
    pendingNav = { params: new URLSearchParams(initial), pathname, mode: "replace" };
  }
  return pendingNav.params;
}

function flushPendingNav(router: ReturnType<typeof useRouter>) {
  if (!pendingNav) return;
  const { params, pathname, mode } = pendingNav;
  pendingNav = null;
  scheduled = false;
  const query = params.toString();
  const url = query ? `${pathname}?${query}` : pathname;
  if (mode === "push") router.push(url);
  else router.replace(url);
}

type UpdateMode = "push" | "replace";

type Options<T> = {
  parse?: (raw: string | null) => T;
  serialize?: (value: T) => string | null;
  mode?: UpdateMode;
  debounceMs?: number;
};

function defaultParse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  return raw as unknown as T;
}

function defaultSerialize(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function useUrlState<T>(key: string, fallback: T, options: Options<T> = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parse = options.parse ?? ((raw: string | null) => defaultParse(raw, fallback));
  const serialize = options.serialize ?? defaultSerialize;
  const mode = options.mode ?? "replace";
  const debounceMs = options.debounceMs ?? 0;

  const raw = searchParams.get(key);
  const value = useMemo(() => parse(raw), [parse, raw]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setValue = useCallback(
    (next: T, overrideMode?: UpdateMode) => {
      const apply = () => {
        const params = ensurePendingNav(pathname);
        const serialized = serialize(next);
        if (serialized === null) params.delete(key);
        else params.set(key, serialized);
        // "push" wins over "replace" when batched together so navigation
        // history isn't accidentally swallowed by a sibling debounced setter.
        const action = overrideMode ?? mode;
        if (action === "push" && pendingNav) pendingNav.mode = "push";
        if (!scheduled) {
          scheduled = true;
          queueMicrotask(() => flushPendingNav(router));
        }
      };

      if (debounceMs > 0) {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(apply, debounceMs);
      } else {
        apply();
      }
    },
    [debounceMs, key, mode, pathname, router, serialize],
  );

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  return [value, setValue] as const;
}

// Helper for enum-like string params with a fixed set of allowed values.
export function useUrlEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
  mode: UpdateMode = "push",
) {
  const parse = useCallback(
    (raw: string | null): T => {
      if (raw && (allowed as readonly string[]).includes(raw)) return raw as T;
      return fallback;
    },
    [allowed, fallback],
  );
  const serialize = useCallback(
    (v: T) => (v === fallback ? null : v),
    [fallback],
  );
  return useUrlState<T>(key, fallback, { parse, serialize, mode });
}

// Debounced free-text param (search box). Local state for immediate UI feedback,
// URL update debounced.
export function useUrlText(key: string, fallback = "", debounceMs = 300) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(key) ?? fallback;
  const [localValue, setLocalValue] = useState(urlValue);
  const lastUrlValue = useRef(urlValue);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // External URL change (e.g. back/forward) → sync into local state.
  useEffect(() => {
    if (urlValue !== lastUrlValue.current) {
      lastUrlValue.current = urlValue;
      setLocalValue(urlValue);
    }
  }, [urlValue]);

  const setValue = useCallback(
    (next: string) => {
      setLocalValue(next);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const params = ensurePendingNav(pathname);
        if (!next || next === fallback) params.delete(key);
        else params.set(key, next);
        if (!scheduled) {
          scheduled = true;
          queueMicrotask(() => flushPendingNav(router));
        }
        lastUrlValue.current = next;
      }, debounceMs);
    },
    [debounceMs, fallback, key, pathname, router],
  );

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  return [localValue, setValue] as const;
}
