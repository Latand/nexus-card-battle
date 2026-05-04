# StarterBoosterOnboarding — Logic Contract

Source: `src/features/game/ui/onboarding/StarterBoosterOnboarding.tsx`

The first-run flow that gives a new player two free starter boosters, reveals the cards inside each, and lands them on a "deck ready" hand-off where they can play, jump to PvP, or open the editor.

## Component signature

```ts
type Props = {
  identity: PlayerIdentity;
  profile: PlayerProfile;
  profileStatus: "loading" | "ready" | "unavailable";
  profileIdentityMode?: "telegram" | "guest";
  deckSource: "profile" | "starter-fallback";
  onProfileChange: (profile: PlayerProfile) => void;
  onPlayDeck: (deckIds: string[], mode: "ai" | "human") => void;
  onEditDeck: (deckIds: string[]) => void;
};

export function StarterBoosterOnboarding(props: Props): JSX.Element
```

## Local types

```ts
type ProfileStatus = "loading" | "ready" | "unavailable";
type Phase = "catalog" | "opening" | "reveal" | "deck-ready";
type CatalogStatus = "loading" | "ready" | "error";

type RevealState = {
  booster: BoosterResponse;
  cards: Card[];
  player: PlayerProfile;
};
```

## Constants

- `STARTER_KIT_CARD_COUNT = STARTER_FREE_BOOSTERS * STARTER_BOOSTER_CARD_COUNT` = `2 * 5 = 10`.
- `rarityLabels: Record<Rarity, string>` — display strings (`COMMON`, `RARE`, `UNIQ`, `LEGEND`).
- `boosterStories: Record<string, string>` — Ukrainian flavor text indexed by booster id (12 entries: `neon-breach`, `factory-shift`, `street-kings`, `carnival-vice`, `faith-and-fury`, `biohazard`, `underworld`, `mind-games`, `toy-factory`, `metro-chase`, `desert-signal`, `street-plague`).
- `revealRarityPriority: Record<Rarity, number>` = `{Legend:0, Unique:1, Rare:2, Common:3}`.

## Data dependencies

### Hooks
- `useState`: `optimisticProfile`, `phase` (default `"catalog"`), `openingBoosterId`, `error`, `reveal`, `revealedCount`, `catalogStatus` (default `"loading"`), `catalogError`, `catalogProfile`, `boosters`, `catalogRefreshKey`. Inside `<StarterReveal>`: `selectedIndex` (defaults via `pickDefaultRevealIndex`).
- `useEffect`: catalog fetch, re-runs when `catalogRefreshKey`, `identity`, or `onProfileChange` change.

### External
- `cards as cardCatalog` from `@/features/battle/model/cards` — for resolving card ids to full `Card` objects.
- `clans` map and `ClanRecord` from `@/features/battle/model/clans`.
- `fetchStarterBoosterCatalog(identity): Promise<{ boosters: BoosterCatalogItem[], player: PlayerProfile }>`.
- `openStarterBooster(identity, boosterId): Promise<{ booster: BoosterResponse, cards: Card[], player: PlayerProfile }>`.
- `STARTER_FREE_BOOSTERS = 2`, `STARTER_BOOSTER_CARD_COUNT = 5`.
- `getOwnedCardIds(ownedCards)`.
- `BattleCard`, `ClanGlyph`, `getClanColor` from battle UI components.

## State machine

`phase ∈ {"catalog", "opening", "reveal", "deck-ready"}`.

```
catalog
  └─ click booster → opening
       └─ openStarterBooster() resolved with cards.length > 0 → reveal
       └─ openStarterBooster() rejected OR empty cards → catalog (with `error` set)
reveal
  └─ click "continue":
       ├─ if isStarterKitReady(reveal.player) → deck-ready
       └─ else → catalog (re-fetches catalog via catalogRefreshKey++)
deck-ready
  └─ play (AI) → onPlayDeck(deckIds, "ai")
  └─ PvP      → onPlayDeck(deckIds, "human")
  └─ edit     → onEditDeck(deckIds)
```

`catalogStatus ∈ {"loading", "ready", "error"}` is independent of `phase` and tracks the catalog fetch lifecycle. `canChoose = phase === "catalog" && catalogStatus === "ready"`.

`profileForDisplay = optimisticProfile ?? catalogProfile ?? profile` — the most recent profile available for header counters.

## Side effects

- On mount + when `catalogRefreshKey` changes: `fetchStarterBoosterCatalog(identity)`. On success, sets `boosters`, `catalogProfile`, `optimisticProfile`, clears `catalogError`, marks status `"ready"`, AND calls `onProfileChange(response.player)`. On failure, stores error message and sets status `"error"`.
- On booster open: `openStarterBooster(identity, boosterId)`. On success, sets `optimisticProfile`, calls `onProfileChange`, stores `reveal`, sets `revealedCount = response.cards.length`, transitions to `"reveal"`. On failure, restores `phase = "catalog"`, clears `openingBoosterId`, sets `error`.
- On `finishReveal`: applies `reveal.player` to `optimisticProfile` and `onProfileChange`. Then either transitions to `"deck-ready"` or kicks off a new catalog refresh (clears boosters, sets catalogStatus to `"loading"`, increments `catalogRefreshKey`).

## Business rules / invariants

- **Starter quota = 2** (`STARTER_FREE_BOOSTERS`). The flow is gated entirely by `profile.starterFreeBoostersRemaining` being controlled server-side; the local catalog fetch surfaces per-booster `starter.canOpen` and `starter.opened`.
- **Booster card count = 5** (`STARTER_BOOSTER_CARD_COUNT`). The reveal stage assumes exactly 5 cards (UI lays out 5 chips with `grid-cols-5`).
- **Starter kit ready** (`isStarterKitReady`):
  - `profile.starterFreeBoostersRemaining === 0`,
  - `profile.openedBoosterIds.length >= STARTER_FREE_BOOSTERS`,
  - `getSavedOwnedDeckIds(profile).length >= STARTER_KIT_CARD_COUNT` (10).
- **Saved owned deck ids** (`getSavedOwnedDeckIds`): unique `profile.deckIds` filtered against the catalog AND against owned cards. This is the source of truth handed to `onPlayDeck` / `onEditDeck`.
- **Open guard**: `handleOpenBooster` is a no-op unless `canChoose && booster.starter.canOpen`.
- **Empty-cards safeguard**: an `openStarterBooster` response with `cards.length === 0` is treated as failure (`throw new Error("Starter booster did not return cards.")`).
- **Optimistic profile precedence**: header metrics use `optimisticProfile` first to give immediate feedback after open.
- **Reveal default selection** (`pickDefaultRevealIndex`): scans `cards`, returns index of first card with the lowest `revealRarityPriority` (Legend < Unique < Rare < Common). I.e. the rarest card in the pack opens preselected.
- **Reveal completion**: continue button only renders when `complete = revealedCount >= reveal.cards.length` (always true today since `revealedCount = cards.length` at transition; left in for incremental reveal animations).
- **Continue label**: `deckReadyAfterReveal ? "До колоди" : "До каталогу"` — depends on `isStarterKitReady(reveal.player)`.
- **Header header text**: `openedCount === 0 ? "Обери перший бустер" : "Другий бустер чекає"`. Same logic for `starter-state-label`: `"Перший вибір"` / `"Другий вибір"`.
- **Progress slots**: always `STARTER_FREE_BOOSTERS` slots; slot N is filled iff `index < openedCount`.
- **Booster button label**: `opening ? "Запис..." : opened ? "Недоступно" : "Відкрити"`.
- **Booster tile disabled** when `busy || !booster.starter.canOpen` (busy = phase `"opening"`).

## Sub-components used (all local)

- `<StarterDeckReady>` — terminal panel with deck preview, AI/PvP/Edit CTAs.
- `<StarterDeckReadyCard>` — single card tile inside the deck-ready preview.
- `<StarterProgress>` — header progress strip with two slot bars.
- `<BoosterTile>` — one booster card in the catalog grid.
- `<ClanZone>` — half-tile inside `<BoosterTile>` showing clan glyph + bonus name.
- `<StarterReveal>` — five-card reveal stage with active-card highlight.
- `<MiniRevealBattleCard>` — scaled-down `<BattleCard>` for chip thumbnails.
- `<RevealDetail>` — label/title/description trio for ability and bonus.
- `<Metric>` — label/value tile.

External: `<BattleCard>`, `<ClanGlyph>`.

## data-testid values

| Test ID | Where | Purpose |
|---|---|---|
| `player-profile-shell` | Root `<main>` | Carries `data-profile-status`, `data-profile-identity-mode`, `data-profile-owned-card-count`, `data-profile-deck-count`, `data-deck-source`, `data-starter-free-boosters-remaining`. |
| `starter-onboarding-shell` | `<section>` wrapping the whole flow | Carries `data-phase`, `data-catalog-status`, `data-opened-booster-count`, `data-progress-count`. |
| `starter-progress` | `<StarterProgress>` `<section>` | Header progress block. |
| `starter-progress-slot-1`, `starter-progress-slot-2` | Each progress bar slot | Carries `data-filled` boolean. |
| `starter-owned-count` | `<Metric>` "Карт" in header | Owned-cards count. |
| `starter-state-wrap` | Right-side state wrap in catalog header | Container. |
| `starter-state-label` | State label inside the wrap | "Перший вибір" / "Другий вибір". |
| `starter-opening-pending` | Pending banner | Renders only while `phase === "opening"`. |
| `starter-catalog-loading` | Catalog loading banner | While `catalogStatus === "loading"`. |
| `starter-catalog-error` | Catalog error banner | While `catalogStatus === "error"`. |
| `starter-booster-error` | Open-booster error banner | When `error !== null`. |
| `starter-booster-catalog` | Grid of booster tiles | Only when `catalogStatus === "ready"`. |
| `starter-booster-card-${booster.id}` | Each `<BoosterTile>` `<article>` | Carries `data-opened`, `data-can-open`. |
| `starter-booster-open-${booster.id}` | Open button inside tile | Triggers `handleOpenBooster`. |
| `starter-reveal-shell` | Reveal stage `<section>` | Carries `data-revealed-count`. |
| `starter-reveal-active-card` | Wrapper around the large active card | Carries `data-card-id`. |
| `starter-reveal-list` | Strip of card chips | Wrapper. |
| `starter-reveal-card-1` ... `starter-reveal-card-5` | Each chip button | Carries `data-card-id`, `data-active`, `aria-pressed`. |
| `starter-reveal-continue` | Continue button | Renders only when `complete`. |
| `starter-deck-ready-shell` | Terminal `<StarterDeckReady>` `<section>` | Carries `data-card-count`, `data-profile-deck-count`, `data-opened-booster-count`. |
| `starter-deck-ready-card-${index+1}` | Each card tile in deck preview | Carries `data-card-id`. |
| `starter-deck-ready-play` | AI Play button | Triggers `onPlayDeck(deckIds, "ai")`. |
| `starter-deck-ready-play-human` | PvP button | Triggers `onPlayDeck(deckIds, "human")`. |
| `starter-deck-ready-edit` | Edit deck button | Triggers `onEditDeck(deckIds)`. |

The header `<Metric>` for "Карт" passes the only non-decorative `testId` prop on `<Metric>` (`starter-owned-count`); other metrics intentionally have no testid.

## Callbacks expected from parent

```ts
onProfileChange: (profile: PlayerProfile) => void;
// Called after every catalog fetch, every successful open, and again on
// finishReveal. Parent persists this as the latest source-of-truth profile.

onPlayDeck: (deckIds: string[], mode: "ai" | "human") => void;
// Fired from <StarterDeckReady> AI/PvP buttons. deckIds is the
// server-confirmed deck (length should be >= STARTER_KIT_CARD_COUNT before
// buttons enable). Parent must navigate to the matching battle screen.

onEditDeck: (deckIds: string[]) => void;
// Fired from "Редагувати колоду". Parent should navigate to the collection
// editor with these ids preselected.
```
