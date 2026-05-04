# data-testid Inventory

Every `data-testid` value found in the five static-page React components in scope. The "Used in tests" column flags ids that Playwright specs in `tests/` reference directly — those MUST be preserved verbatim in any rewrite.

Specs scanned: `tests/collection-deck.spec.ts`, `tests/onboarding-reveal.spec.ts`, `tests/player-hud.spec.ts`, `tests/guide.spec.ts`, `tests/profile-bootstrap.spec.ts`, `tests/sell-flow.spec.ts`, `tests/online-presence.spec.ts`, `tests/mobile-layout.spec.ts`, `tests/match-finished.spec.ts`, `tests/milestone-reward.spec.ts`.

Legend:
- "literal" — a constant string, exact match.
- "templated" — id includes a runtime-injected segment (card id, booster id, index). Tests construct these dynamically.
- "Used in tests" = yes/no whether at least one Playwright spec references the literal id (or the template prefix).

## GameRoot.tsx

| Test ID | Form | Where | Used in tests |
|---|---|---|---|
| `player-profile-shell` | literal | `<ProfileLoadingScreen>` and `<ProfileUnavailableScreen>` `<main>` shells (also reused by collection and onboarding screens) | yes (`profile-bootstrap.spec.ts`, etc.) |
| `profile-unavailable` | literal | Card section inside `<ProfileUnavailableScreen>` | yes |
| `profile-retry` | literal | Retry button inside `<ProfileUnavailableScreen>` | yes |

## CollectionDeckScreen.tsx

| Test ID | Form | Where | Used in tests |
|---|---|---|---|
| `player-profile-shell` | literal | Root `<main>` (re-uses GameRoot's marker) | yes |
| `collection-mode-owned` | literal | Mode segmented item ("Мої") | no (only `collection-mode-base` is asserted) |
| `collection-mode-base` | literal | Mode segmented item ("Уся база") | yes (`collection-deck.spec.ts`) |
| `collection-search` | literal | Search input | yes |
| `deck-save-status` | literal | Save status banner in DeckDock; carries `data-status` | yes |
| `play-selected-deck` | literal | AI Play button in DeckDock | yes |
| `play-human-match` | literal | PvP button in DeckDock | yes |
| `deck-card-${cardId}` | templated | Each `<DeckDockSlot>` `<article>` | yes |
| `deck-remove-${cardId}` | templated | Remove button on dock slot | no (asserted indirectly via slot) |
| `collection-card-${cardId}` | templated | Each catalog tile | yes |
| `collection-locked-${cardId}` | templated | "Closed" badge inside tile when not owned | yes |
| `collection-owned-count-${cardId}` | templated | "You have N" badge inside tile when owned | yes |
| `collection-toggle-${cardId}` | templated | Add/remove toggle inside tile (editable mode) | yes |
| `collection-readonly-${cardId}` | templated | Hover overlay inside tile (non-editable mode) | no |
| `collection-empty` | literal | Placeholder when filter yields zero results | no |
| `collection-load-more` | literal | "Show more" button | yes |
| `selected-card-preview` | literal | Wrapper around large preview in `<CardDetails>` | yes (also used in battle specs as a CSS selector) |
| `selected-card-readonly-${cardId}` | templated | Read-only badge in details (non-editable) | yes |
| `collection-sell-panel` | literal | Sell section root; carries `data-card-id` | no (only sub-elements asserted) |
| `collection-sell-summary` | literal | Sell summary paragraph | yes (`sell-flow.spec.ts`) |
| `collection-sell-disabled-reason` | literal | "Remove from deck" warning | yes |
| `collection-sell-1` | literal | Sell single button | yes |
| `collection-sell-all` | literal | Sell duplicates button | yes |
| `collection-sell-error` | literal | Error message paragraph | no |

## StarterBoosterOnboarding.tsx

| Test ID | Form | Where | Used in tests |
|---|---|---|---|
| `player-profile-shell` | literal | Root `<main>` | yes |
| `starter-onboarding-shell` | literal | Section wrapping the whole flow; carries `data-phase`, `data-catalog-status`, `data-opened-booster-count`, `data-progress-count` | yes (`onboarding-reveal.spec.ts`) |
| `starter-progress` | literal | Progress strip section | no |
| `starter-progress-slot-1`, `starter-progress-slot-2` | templated | Each progress bar slot; carries `data-filled` | no |
| `starter-owned-count` | literal | "Карт" header metric (only `<Metric>` with a testId prop) | no |
| `starter-state-wrap` | literal | Right-side header wrap | no |
| `starter-state-label` | literal | Inside wrap: "Перший вибір" / "Другий вибір" | yes |
| `starter-opening-pending` | literal | Pending banner during `phase === "opening"` | yes |
| `starter-catalog-loading` | literal | Catalog loading banner | no |
| `starter-catalog-error` | literal | Catalog error banner | no |
| `starter-booster-error` | literal | Open-booster error banner | no |
| `starter-booster-catalog` | literal | Grid of booster tiles when `catalogStatus === "ready"` | no |
| `starter-booster-card-${booster.id}` | templated | Each booster `<article>`; carries `data-opened`, `data-can-open` | yes |
| `starter-booster-open-${booster.id}` | templated | Open button in booster tile | yes |
| `starter-reveal-shell` | literal | Reveal stage section; carries `data-revealed-count` | yes |
| `starter-reveal-active-card` | literal | Wrapper around active card; carries `data-card-id` | yes |
| `starter-reveal-list` | literal | Strip of card chips | no |
| `starter-reveal-card-${index+1}` | templated | Each chip button (1..5); carries `data-card-id`, `data-active`, `aria-pressed` | yes |
| `starter-reveal-continue` | literal | Continue button (renders only when complete) | yes |
| `starter-deck-ready-shell` | literal | Terminal `<StarterDeckReady>` section; carries `data-card-count`, `data-profile-deck-count`, `data-opened-booster-count` | yes |
| `starter-deck-ready-card-${index+1}` | templated | Each card tile in deck preview; carries `data-card-id` | no |
| `starter-deck-ready-play` | literal | AI Play button | yes |
| `starter-deck-ready-play-human` | literal | PvP button | yes |
| `starter-deck-ready-edit` | literal | Edit deck button | yes |

## PlayerHud.tsx

| Test ID | Form | Where | Used in tests |
|---|---|---|---|
| `player-hud-sidebar` | literal | Sidebar `<aside>`; carries `data-profile-crystals`, `data-profile-level`, `data-profile-elo` | yes (`player-hud.spec.ts`) |
| `player-hud-mobile` | literal | Mobile `<header>`; same data attrs | yes (`mobile-layout.spec.ts`) |
| `player-hud-avatar-sidebar` | literal | Sidebar avatar wrapper; carries `data-avatar-src` | yes |
| `player-hud-avatar-mobile` | literal | Mobile avatar wrapper; carries `data-avatar-src` | no |
| `player-hud-name` | literal | Sidebar name `<strong>` | no |
| `player-hud-name-mobile` | literal | Mobile name `<strong>` | no |
| `player-hud-level` | literal | Sidebar level pill | yes |
| `player-hud-level-mobile` | literal | Inline mobile level | yes |
| `player-hud-stats-mobile` | literal | Outer span around mobile stats line | no |
| `player-hud-crystals` | literal | Sidebar crystal tile; carries `data-value` | yes |
| `player-hud-crystals-mobile` | literal | Inline mobile crystal value | yes |
| `player-hud-elo` | literal | Sidebar ELO tile; carries `data-value` | yes |
| `player-hud-elo-mobile` | literal | Inline mobile ELO value | yes |
| `player-hud-online-slot` | literal | Sidebar online badge wrapper; carries `data-online-count` | yes (`online-presence.spec.ts`) |
| `player-hud-online-count` | literal | `<b>` inside sidebar online badge (only when number) | yes |
| `player-hud-online-slot-mobile` | literal | Mobile online pill; carries `data-online-count`, `aria-hidden` when null | yes |
| `player-hud-online-count-mobile` | literal | `<b>` inside mobile online pill | yes |
| `player-hud-play` | literal | Sidebar Play button | yes |
| `player-hud-guide-link` | literal | Sidebar guide `<Link>` | yes |
| `player-hud-guide-link-mobile` | literal | Mobile guide `<Link>` | yes |
| `lobby-chat` | literal | `<LobbyChatPanel>` section (rendered twice — sidebar + mobile) | yes |
| `lobby-chat-list` | literal | Scrollable message list `<div>` | yes |
| `lobby-chat-input` | literal | Draft `<input>` (max 240 chars) | yes |
| `lobby-chat-send` | literal | Submit `<button>` (disabled while empty) | yes |

## GuidePage.tsx

| Test ID | Form | Where | Used in tests |
|---|---|---|---|
| `guide-page` | literal | Root `<main>` | no |
| `guide-back-home` | literal | Back-to-home `<Link>` | no |
| `guide-sections` | literal | Articles wrapper | no |
| `guide-section-${id}` | templated | Each `<section>` per content item — `pvp-and-rating` is asserted explicitly | yes (`guide.spec.ts`) |
| `guide-nav-desktop` | literal | Desktop sticky nav | no |
| `guide-nav-${id}` | templated | Each desktop nav `<a>` — `pvp-and-rating` is asserted explicitly | yes |
| `guide-nav-mobile` | literal | Mobile collapsible details | no |
| `guide-nav-mobile-${id}` | templated | Each mobile nav `<a>` | no |

## Cross-cutting notes

- **Critical literals** (must remain identical): `player-profile-shell`, `profile-unavailable`, `profile-retry`, `collection-mode-base`, `collection-search`, `deck-save-status`, `play-selected-deck`, `play-human-match`, `collection-load-more`, `selected-card-preview`, `collection-sell-1`, `collection-sell-all`, `collection-sell-summary`, `collection-sell-disabled-reason`, `starter-onboarding-shell`, `starter-state-label`, `starter-opening-pending`, `starter-reveal-shell`, `starter-reveal-active-card`, `starter-reveal-continue`, `starter-deck-ready-shell`, `starter-deck-ready-play`, `starter-deck-ready-play-human`, `starter-deck-ready-edit`, all `player-hud-*` ids, all `lobby-chat-*` ids, `guide-section-pvp-and-rating`, `guide-nav-pvp-and-rating`.
- **Critical template prefixes** (the templating scheme must be preserved): `collection-card-`, `collection-locked-`, `collection-owned-count-`, `collection-toggle-`, `selected-card-readonly-`, `deck-card-`, `starter-booster-card-`, `starter-booster-open-`, `starter-reveal-card-`, `starter-deck-ready-card-`, `guide-section-`, `guide-nav-`, `starter-progress-slot-`.
- **Data-attribute introspection**: Playwright also reads attributes alongside test ids. Preserve:
  - on `player-profile-shell`: `data-profile-status`, `data-profile-identity-mode`, `data-profile-owned-card-count`, `data-profile-deck-count`, `data-deck-source`, `data-collection-mode` (collection screen only), `data-visible-card-count`, `data-filtered-card-count`, `data-starter-free-boosters-remaining`;
  - on `starter-onboarding-shell`: `data-phase`, `data-catalog-status`, `data-opened-booster-count`, `data-progress-count`;
  - on `starter-deck-ready-shell`: `data-card-count`, `data-profile-deck-count`, `data-opened-booster-count`;
  - on `starter-booster-card-*`: `data-opened`, `data-can-open`;
  - on `starter-reveal-shell`: `data-revealed-count`;
  - on `starter-reveal-card-*`: `data-card-id`, `data-active`, `aria-pressed`;
  - on `starter-reveal-active-card`: `data-card-id`;
  - on `starter-deck-ready-card-*`: `data-card-id`;
  - on `deck-save-status`: `data-status`;
  - on `collection-sell-panel`: `data-card-id`;
  - on `player-hud-sidebar` / `player-hud-mobile`: `data-profile-crystals`, `data-profile-level`, `data-profile-elo`;
  - on `player-hud-online-slot` / `player-hud-online-slot-mobile`: `data-online-count`;
  - on `player-hud-avatar-sidebar` / `player-hud-avatar-mobile`: `data-avatar-src`;
  - on `player-hud-crystals` / `player-hud-elo`: `data-value`.
