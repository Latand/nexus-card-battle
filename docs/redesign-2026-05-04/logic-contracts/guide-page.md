# GuidePage — Logic Contract

Source: `src/features/guide/ui/GuidePage.tsx`

A static, content-driven help page reachable via `/guide`. Lists pre-built sections (loaded once at module init) and provides anchor navigation in two responsive variants: desktop sticky sidebar and mobile collapsible details element.

## Component signature

```ts
export function GuidePage(): JSX.Element
```

No props. Self-contained client component (`"use client"`).

## Module-level data

```ts
const sections = loadGuideSections("uk");
// Resolved once when the module is imported. Each item:
// { id: string; title: string; body: ReactNode }
```

`loadGuideSections` is imported from `@/features/guide/content/sections.uk` and is the only data source for the page. The page itself stores no state.

## Data dependencies

### Hooks
None.

### External
- `Link` from `next/link` (used for the back-home link only).
- `loadGuideSections(locale)` from the guide content module.

## State machine

None. Pure render. Internal `<details>` element on mobile holds open/closed state via the browser; no React state mirrors it.

## Side effects

None. Anchor links use plain `href="#section-id"` — browser handles smooth scrolling. Sections have `scroll-mt-24` so the sticky context offset doesn't cover them.

## Business rules / invariants

- **Section identity**: `section.id` is used as the DOM `id`, the anchor target, and the basis of all per-section test ids (`guide-section-${id}`, `guide-nav-${id}`, `guide-nav-mobile-${id}`).
- **Locale**: hard-coded to `"uk"`. Localization, if added later, would replace this constant.
- **Navigation parity**: both desktop and mobile variants iterate the same `sections` array; their order is identical and stable per render.
- **Back-home link**: `Link` to `/` with arrow glyph; only one such link in the page.
- **Responsive switch**: desktop nav is `hidden md:block`, mobile nav `<details>` is `md:hidden`. Both render simultaneously in the DOM; CSS toggles visibility.

## Sub-components used

- `<GuideAnchorNav>` (local) — renders both the desktop sticky nav and the mobile collapsible details element.

No other sub-components.

## data-testid values

| Test ID | Where | Purpose |
|---|---|---|
| `guide-page` | Root `<main>` | Page container marker. |
| `guide-back-home` | Back-to-home `<Link>` | Returns to `/`. |
| `guide-sections` | Articles wrapper | Wraps all rendered sections. |
| `guide-section-${id}` | Each `<section>` rendered per item | One per content section; id matches `section.id`. |
| `guide-nav-desktop` | Desktop `<nav>` | Sticky nav container (visible at `md:`). |
| `guide-nav-${id}` | Each desktop nav `<a>` | One link per section. |
| `guide-nav-mobile` | Mobile `<details>` | Collapsible nav container (visible below `md:`). |
| `guide-nav-mobile-${id}` | Each mobile nav `<a>` | One link per section inside the details. |

Tests reference `guide-nav-pvp-and-rating` and `guide-section-pvp-and-rating` — confirming the `pvp-and-rating` section id must exist in the guide content. Any rewrite must keep that id intact.

## Callbacks expected from parent

None. The page is mounted directly by a Next.js route; it has no props or callbacks.
