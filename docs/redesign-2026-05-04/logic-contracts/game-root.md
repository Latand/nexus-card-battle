# GameRoot — Logic Contract

Source: `src/features/game/ui/GameRoot.tsx`

Top-level orchestrator for the non-battle experience. Owns player profile, deck state, screen routing (collection vs battle), Telegram WebApp integration, and chooses between the starter onboarding flow and the regular collection screen. Wraps both in a HUD shell.

## Component signature

```ts
export function GameRoot(): JSX.Element
```

No props. Self-contained client component (`"use client"`).

## Local types

```ts
type BattleMode = "ai" | "human";
type ProfileStatus = "loading" | "ready" | "unavailable";
type DeckSource = "profile" | "starter-fallback";
type DeckSaveStatus = "idle" | "saving" | "saved" | "error";

const STARTER_KIT_CARD_COUNT = STARTER_FREE_BOOSTERS * STARTER_BOOSTER_CARD_COUNT; // 2 * 5 = 10
```

## Data dependencies

### Hooks
- `useState` for: `screen`, `battleMode`, `deckIds`, `playerProfile`, `playerIdentity`, `profileStatus`, `deckSaveStatus`, `profileRetryKey`, `starterDeckReadyVisible`, `telegramPlayer`, `telegramLandscapePromptActive`.
- `useRef` for: `deckTouchedRef` (has the local user touched the deck since mount), `deckSaveRequestRef` (stale-response guard for save races), `lastConfirmedDeckIdsRef` (last server-confirmed deck for rollback on save error).
- `useMemo` for: `allCardIds` (from full `cards` catalog), `ownedCardIds` (filtered against catalog), `profileDeckIds` (filtered against owned).
- `useEffect` for: profile fetch (re-runs on `profileRetryKey`), deck initialization, Telegram WebApp setup + landscape prompt sync, persisting Telegram avatar URL.
- `useCallback` for all handler closures.
- Custom hook: `useTelegramAvatar()` — returns live Telegram photo URL or `null`.

### External functions / modules
- `cards` from `@/features/battle/model/cards` — full catalog.
- `getOwnedCardIds(ownedCards)` — collapses `OwnedCardEntry[]` to `string[]`.
- `readTelegramPhotoUrl()` — reads photo URL from Telegram WebApp init data.
- `resolveClientPlayerIdentity()` — derives `PlayerIdentity` from Telegram or guest cookie/storage.
- `fetchPlayerProfile(identity)` — async profile fetch.
- `savePlayerDeck(identity, deckIds)` — async deck persistence; resolves to next `PlayerProfile`.
- `savePlayerAvatar(identity, photoUrl)` — async avatar persistence.
- Constants: `STARTER_FREE_BOOSTERS = 2`, `STARTER_BOOSTER_CARD_COUNT = 5`, `PLAYER_DECK_SIZE` (from `randomDeck`).

### Render-time delegations
- `<BattleGame>` — single-player vs AI.
- `<RealtimeBattleGame>` — PvP via realtime layer.
- `<PlayerHud>` — left sidebar / mobile top bar.
- `<CollectionDeckScreen>` — main collection/deck management UI.
- `<StarterBoosterOnboarding>` — starter flow when not yet completed.

## State machine (top-level screen routing)

`screen ∈ {"collection", "battle"}` × `profileStatus ∈ {"loading", "ready", "unavailable"}`.

Render selection (in order):
1. `screen === "battle"` → render `<BattleGame>` (mode `"ai"`) or `<RealtimeBattleGame>` (mode `"human"`) plus `<TelegramLandscapeOverlay>`.
2. `profileStatus === "loading"` → `<ProfileLoadingScreen>`.
3. `profileStatus === "unavailable"` → `<ProfileUnavailableScreen>` with retry button.
4. `showStarterOnboarding === true` → `<HudShell>` wrapping `<StarterBoosterOnboarding>`.
5. Default → `<HudShell>` wrapping `<CollectionDeckScreen>`.

`showStarterOnboarding` is true when:
- `profileStatus === "ready"` and identity + profile exist,
- AND either `starterDeckReadyVisible` is true (just finished starter flow this session) OR (`starterFreeBoostersRemaining > 0` AND `!profile.onboarding.completed`).

Deck save state machine: `idle → saving → (saved | error)`. On `saved` the saved deck IDs become the source of truth (`lastConfirmedDeckIdsRef`). On `error` the local `deckIds` rolls back to `lastConfirmedDeckIdsRef.current`.

## Side effects

- On mount: schedules `setTelegramPlayer(readTelegramPlayer())` via `setTimeout(0)` (defer to next tick).
- On mount + when `profileRetryKey` changes:
  - `resolveClientPlayerIdentity()` synchronously,
  - `fetchPlayerProfile(identity)` async; updates `playerIdentity`, `playerProfile`, `profileStatus`, resets `deckSaveStatus` to `"idle"`.
- When `ownedCardIds` or `profileDeckIds` change AND deck has not been touched: rebuild local `deckIds` from saved deck (or starter fallback = first `PLAYER_DECK_SIZE` owned cards).
- On mount, Telegram WebApp setup (only if `Telegram.WebApp.initData` present):
  - `webApp.ready()`, `webApp.expand()`, `webApp.disableVerticalSwipes()`,
  - `requestTelegramFullscreen` if version ≥ 8.0 and not already fullscreen,
  - `requestLandscapeOrientation` (only on mobile clients),
  - registers `resize` and `screen.orientation change` listeners that re-evaluate `telegramLandscapePromptActive` (true when on mobile Telegram and viewport is portrait),
  - re-applies `lockOrientation()` on landscape sync if version ≥ 8.0 and not already locked.
- `handleDeckChange`: persists deck via `savePlayerDeck` only if `sanitizedDeckIds.length >= PLAYER_DECK_SIZE`. Uses incrementing `deckSaveRequestRef` so stale responses are dropped.
- Avatar persistence effect: when live Telegram photo differs from `profile.avatarUrl`, calls `savePlayerAvatar`. Failure is non-fatal — logs `console.warn`.

## Business rules / invariants

- **Deck size minimum**: `PLAYER_DECK_SIZE` is the minimum and the autoplay threshold. `sanitizeDeckIds` always returns at least `PLAYER_DECK_SIZE` ids when there are enough owned cards (pads with remaining owned cards in catalog order).
- **Deck source**:
  - `"profile"` if the saved profile has at least one valid deck card from owned cards;
  - `"starter-fallback"` otherwise.
- **`deckReadyToPlay`** (drives Play button): saved owned deck length ≥ `PLAYER_DECK_SIZE`, current `deckIds` exactly equals saved owned deck (order included), AND save status is not `"saving"`.
- **Starter kit ready** (drives "deck ready" overlay after onboarding): `starterFreeBoostersRemaining === 0` AND `openedBoosterIds.length >= STARTER_FREE_BOOSTERS` AND confirmed deck length ≥ `STARTER_KIT_CARD_COUNT` (10).
- **Stale-save protection**: each save call increments `deckSaveRequestRef`; only the latest request can mutate state.
- **Save rollback**: on save error, local `deckIds` reverts to `lastConfirmedDeckIdsRef.current`.
- **Battle re-entry of deck** (`handleSavedDeckPlay`): only allowed when `deckReadyToPlay` and the requested deck IDs equal `profileDeckIds` exactly. Otherwise the call is a no-op.
- **Collection mutations during battle** (`handleBattlePlayerUpdated`): a profile update from battle is accepted only if every card in current `deckIds` is still owned in the new profile. Otherwise the update is dropped (so an inconsistent deck never reaches the player).
- **Telegram avatar persistence**: skipped if `playerProfile.avatarUrl === livePhoto`. One-shot per (identity, photoUrl) tuple to prevent retry storms on transient 4xx.
- **Telegram name resolution priority**: `@username` → first+last name → `localStorage`/`sessionStorage` keys (`nexus:username`, `username`, `userName`, `playerName`) in order.
- **Mobile detection** (`isMobileTelegramClient`): platform `"android"`/`"ios"` is mobile; `"tdesktop"`/`"macos"`/`"weba"`/`"webk"` is not; otherwise heuristic uses `pointer: coarse` + min viewport dimension < 820.
- **Landscape prompt**: only shown when on mobile Telegram client AND viewport is portrait. Visual-only (non-blocking).

## Sub-components used (own + nested)

- `<HudShell>` (local) — wraps children with `<PlayerHud>` sidebar when profile is ready; pass-through otherwise.
- `<ProfileUnavailableScreen>` (local) — shows retry CTA when fetch fails.
- `<ProfileLoadingScreen>` (local) — neutral loading panel.
- `<TelegramLandscapeOverlay>` (local) — small fixed banner; `null` when inactive.
- `<PlayerHud>` — see `player-hud.md`.
- `<CollectionDeckScreen>` — see `collection-deck-screen.md`.
- `<StarterBoosterOnboarding>` — see `starter-booster-onboarding.md`.
- `<BattleGame>` — AI battle screen (separate contract; not in scope here).
- `<RealtimeBattleGame>` — PvP battle screen (separate contract; not in scope here).

## data-testid values

| Test ID | Where | Purpose |
|---|---|---|
| `player-profile-shell` | `<ProfileLoadingScreen>` `<main>` AND `<ProfileUnavailableScreen>` `<main>` (also reused inside child screens) | Root shell marker; carries `data-profile-status`, `data-profile-identity-mode`, `data-profile-owned-card-count`, `data-profile-deck-count`, `data-deck-source`, `data-starter-free-boosters-remaining` for test introspection. |
| `profile-unavailable` | Inner section of `<ProfileUnavailableScreen>` | Identifies the profile-unavailable card. |
| `profile-retry` | Retry button inside `<ProfileUnavailableScreen>` | Clicked by tests to retrigger profile load. |

The same `player-profile-shell` test id is repeated by `CollectionDeckScreen` and `StarterBoosterOnboarding`; tests rely on the data-attributes attached to it for state assertions.

## Callbacks expected from parent

None — `GameRoot` is the root. It only delegates downward.

## Callbacks given to children

- `<CollectionDeckScreen>` props (key callbacks):
  - `onPlayerUpdated: (profile: PlayerProfile) => void` (passed as `setPlayerProfile`)
  - `onDeckChange: (deckIds: string[]) => void` → `handleDeckChange`
  - `onPlay: (deckIds: string[], mode: "ai" | "human") => void` → `handleSavedDeckPlay`
- `<StarterBoosterOnboarding>` props (key callbacks):
  - `onProfileChange: (profile: PlayerProfile) => void` → `handleStarterProfileChange`
  - `onPlayDeck: (deckIds: string[], mode: "ai" | "human") => void` → `handleStarterDeckPlay`
  - `onEditDeck: (deckIds: string[]) => void` → `handleStarterDeckEdit`
- `<PlayerHud>` props:
  - `canPlay: boolean` (= `hudCanPlay`),
  - `onPlay: () => void` → `handlePlayFromHud` (only fires when `deckReadyToPlay && profileDeckIds.length >= PLAYER_DECK_SIZE`).
- `<BattleGame>` / `<RealtimeBattleGame>` callbacks:
  - `onOpenCollection: () => void` → `setScreen("collection")`
  - `onSwitchMode: (mode: BattleMode) => void` → `setBattleMode(mode)`
  - `onPlayerUpdated: (profile: PlayerProfile) => void` → `handleBattlePlayerUpdated`
