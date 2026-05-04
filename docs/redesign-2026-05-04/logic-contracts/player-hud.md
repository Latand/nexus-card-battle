# PlayerHud — Logic Contract

Source: `src/features/player/ui/PlayerHud.tsx`

The persistent player HUD rendered by `<HudShell>` inside `GameRoot`. Surfaces avatar, name, level, crystals, ELO, online presence, lobby chat, the global "Play" CTA, and a guide link. Renders both desktop sidebar and mobile top bar variants from a single component (CSS responsive switch via `min-[1121px]` / `max-[1121px]`).

## Component signature

```ts
type Props = {
  profile: PlayerProfile;
  playerName?: string;
  liveAvatarUrl?: string | null;
  canPlay: boolean;
  onPlay: () => void;
};

export function PlayerHud(props: Props): JSX.Element
```

## Constants

- `NAME_FALLBACK = "Гравець"` — shown when `playerName` is empty/blank.

## Data dependencies

### Hooks
- Top-level: `useTelegramAvatar()` — live photo URL or `null` (independent of `liveAvatarUrl` prop fallback).
- `<LobbyChatPanel>`:
  - `useLobbyChat(userName)` — returns `{ sessionId, chatMessages, sendMessage }`.
  - `useState` for the `draft` text.
  - `useRef<HTMLDivElement>` for the scrollable list.
  - `useEffect` that scrolls list to bottom when `chatMessages.length` changes.
- `<SidebarHud>` and `<MobileHud>`: `useOnlineCount()` — number of online players or `null` while loading.
- `<HudAvatarImage>`: `useState` for `resolvedSrc` so a `<img onError>` can fall back to `DEFAULT_PLAYER_AVATAR_URL` without dragging the parent into transient CDN failures.

### External
- `useLobbyChat`, `useOnlineCount`, `LobbyChatMessage` from `@/features/presence/client`.
- `DEFAULT_PLAYER_AVATAR_URL`, `resolveAvatarUrl({ storedAvatarUrl, liveAvatarUrl })`, `useTelegramAvatar` from avatar module.
- `Link` from `next/link`.
- `cn` utility.

## State machine

No phase state at the HUD level. The HUD renders both `<SidebarHud>` (visible at `min-width: 1121px`) and `<MobileHud>` (visible below 1121px) simultaneously; CSS handles the switch.

`<HudAvatarImage>` has a tiny per-mount fallback FSM: `resolvedSrc = src` initially. On `<img onError>`, if the resolved URL differs from `DEFAULT_PLAYER_AVATAR_URL`, swap to the default. The outer `<HudAvatar>` keys on `src` so a new prop `src` remounts the inner component (resetting the fallback).

`<OnlineBadge>` and the mobile online pill differentiate two states: `onlineCount === null` (loading, dimmed) vs `number` (live). When loading, the mobile pill has `aria-hidden="true"` and the inner dot replaces the label.

## Side effects

- `useEffect` in `<LobbyChatPanel>`: imperatively scrolls list to `scrollHeight` whenever `chatMessages.length` changes.
- `sendMessage(draft)` is called on form submit; on truthy return, the draft is cleared.
- `<img onError>` on the avatar swaps to default. Persistent network state lives in the hooks (`useLobbyChat`, `useOnlineCount`); the component itself does not call APIs.

## Business rules / invariants

- **Display name**: `(playerName?.trim() || "Гравець").slice(0, 32)`. Always trimmed and length-capped.
- **Avatar resolution**: `resolveAvatarUrl({ storedAvatarUrl: profile.avatarUrl, liveAvatarUrl: liveAvatarUrl ?? useTelegramAvatar() })`. The prop wins over the hook only when explicitly provided.
- **Online slot states**:
  - `onlineCount === null` → loading style (dashed border / dimmed colors), no count, no green dot. Mobile variant is `aria-hidden`.
  - `onlineCount` is a number → green dot + numeric badge. The desktop variant carries `data-online-count` either way (empty string while loading, stringified number otherwise).
- **Play button**: disabled when `!canPlay`. Click fires `onPlay()` only when enabled (HTML disable enforces).
- **Lobby chat**:
  - `canSend = draft.trim().length > 0`.
  - Maximum draft length: 240 characters (HTML `maxLength`).
  - Message counter shows `${chatMessages.length}/200` (cap is informational; the input cap is per-message length, not total messages).
  - Empty state: "Повідомлень ще немає." centered placeholder.
  - Each bubble shows `authorName` and `text`; styling differs for `own = message.authorId === sessionId`.
  - Submit clears draft only on successful `sendMessage` (returns truthy).
- **Stat tiles**: `crystals` and `eloRating` always shown as integers; `level` formatted as `"Lv {level}"` in both variants.
- **Guide link**: hard-coded to `/guide` (Next `<Link>`).
- **Sidebar visibility**: `hidden min-[1121px]:flex` — sidebar is rendered only at viewport width ≥ 1121 px.
- **Mobile visibility**: `min-[1121px]:hidden` — mobile bar only visible below 1121 px.

## Sub-components used (all local)

- `<SidebarHud>` — desktop sidebar layout. Title, avatar+name+level, crystal/ELO tiles, online badge, lobby chat panel, Play button, Guide link.
- `<MobileHud>` — sticky top bar with avatar, name, inline stats, Guide link, online pill, plus a compact lobby chat panel beneath.
- `<OnlineBadge>` — desktop online state badge.
- `<LobbyChatPanel>` — chat input + history; `compact` variant for mobile.
- `<LobbyChatBubble>` — single message bubble.
- `<HudAvatar>` / `<HudAvatarImage>` — avatar with error-fallback.
- `<HudStatTile>` — desktop stat tile (crystal | elo tone).

## data-testid values

| Test ID | Where | Purpose |
|---|---|---|
| `player-hud-sidebar` | `<SidebarHud>` `<aside>` | Carries `data-profile-crystals`, `data-profile-level`, `data-profile-elo`. |
| `player-hud-mobile` | `<MobileHud>` `<header>` | Same data attributes. |
| `player-hud-avatar-sidebar` | Sidebar avatar wrapper | Carries `data-avatar-src`. |
| `player-hud-avatar-mobile` | Mobile avatar wrapper | Carries `data-avatar-src`. |
| `player-hud-name` | Sidebar `<strong>` name | Display name. |
| `player-hud-name-mobile` | Mobile `<strong>` name | Display name. |
| `player-hud-level` | Sidebar level pill | "Lv {level}". |
| `player-hud-level-mobile` | Inline level inside mobile stats line | "Lv {level}". |
| `player-hud-stats-mobile` | Outer span around mobile stats line | Wraps the inline stats text. |
| `player-hud-crystals` | Sidebar crystal stat tile | Carries `data-value`. |
| `player-hud-crystals-mobile` | Inline crystal value | Number only. |
| `player-hud-elo` | Sidebar ELO stat tile | Carries `data-value`. |
| `player-hud-elo-mobile` | Inline ELO value | Number only. |
| `player-hud-online-slot` | Sidebar online badge wrapper | Carries `data-online-count` (empty string when null). |
| `player-hud-online-count` | `<b>` inside sidebar badge | Numeric only — present only when count is a number. |
| `player-hud-online-slot-mobile` | Mobile online pill | Carries `data-online-count`, `aria-hidden` when loading. |
| `player-hud-online-count-mobile` | `<b>` inside mobile pill | Numeric only. |
| `player-hud-play` | Sidebar Play button | Disabled when `!canPlay`. |
| `player-hud-guide-link` | Sidebar guide link | `<Link href="/guide">`. |
| `player-hud-guide-link-mobile` | Mobile guide link | `<Link href="/guide">`. |
| `lobby-chat` | `<LobbyChatPanel>` `<section>` (rendered twice — sidebar and mobile) | Chat container. |
| `lobby-chat-list` | Scrollable message list `<div>` | Carries chat history. |
| `lobby-chat-input` | Draft `<input>` | Max 240 chars. |
| `lobby-chat-send` | Submit `<button>` | Disabled while `!canSend`. |

Note: the lobby chat block is rendered twice (once inside the sidebar, once inside the mobile bar) so multiple test selectors will match. Tests using `getByTestId("lobby-chat")` rely on the active variant being the only one displayed (`hidden` class on the inactive layout makes it not visible to Playwright's visibility checks).

## Callbacks expected from parent

```ts
onPlay: () => void;
// Triggered by the global Play CTA. Parent guards eligibility via canPlay.
```

No other callbacks. The lobby chat owns its own `useLobbyChat` hook and does not surface messages to the parent.
