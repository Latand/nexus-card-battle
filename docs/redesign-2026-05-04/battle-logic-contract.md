# Battle Logic Contract

> Audience: the UI-builder agent rebuilding battle screens (Phase 5). **Do NOT read existing files in `src/features/battle/ui/`** — this document is authoritative for behavior, state, props, callbacks, and test IDs. Pair it only with the locked mockup spec in `docs/redesign-2026-05-04/README.md` (sections B1–B9) and the mockup PNGs.
>
> Source files inlined / summarized below (read-only references):
> - `src/features/battle/model/types.ts`, `constants.ts`, `clans.ts`, `cards.ts`, `loadouts.ts`, `game.ts`
> - `src/features/battle/model/domain/{scoring,bonusRules,roundResolver,match,opponentStrategy,effectRules,decks,fighters}.ts`
> - `src/features/battle/ui/BattleGame.tsx` (extract: state, handlers, lifecycle — visuals discarded)
> - `src/features/battle/ui/RealtimeBattleGame.tsx`
> - `src/features/battle/ui/components/{SelectionOverlay,Hand,BattleCard,BattleOverlay,SceneBackground,CardTooltip,ResourceCounter}.tsx`
> - `src/features/presence/client.ts` (lobby chat hook, reused by B9)

---

## 1. Domain types

All exported from `src/features/battle/model/types.ts` (verbatim — preserve names in props, do not redefine):

```ts
export type Side = "player" | "enemy";

export type Phase =
  | "match_intro"      // 1.5s curtain before round 1
  | "round_intro"      // 1.6s "Раунд N" splash; new hand revealed
  | "player_turn"      // waiting for player card pick
  | "card_preview"     // CardPickModal open (player chose a card, modal up)
  | "opponent_turn"    // AI/human opponent thinking; thinking-dots indicator
  | "battle_intro"     // 2.6s "БІЙ" reveal — both played cards center stage
  | "damage_apply"     // ~1.2s + 220ms/damage projectile / impact
  | "round_result"     // 2.3s round summary; winner card gets star badge
  | "match_result"     // 2.4s final headline (Перемога/Поразка/Нічия)
  | "reward_summary";  // MatchEndOverlay (B6/B7) until user clicks AI/PvP

export type Rarity = "Common" | "Rare" | "Unique" | "Legend";
export type AiDifficulty = "rookie" | "adept" | "veteran" | "elite" | "champion";
export type AiStyle = "balanced" | "aggressive" | "control" | "attrition" | "tempo";

export type FighterAiProfile = {
  opponentId: string; level: number; difficulty: AiDifficulty;
  style: AiStyle; aggression: number; riskTolerance: number;
};

export type EffectTiming = "control" | "before_attack" | "attack" | "damage" | "after_damage";
export type EffectStat   = "ability" | "bonus" | "power" | "attack" | "damage" | "hp" | "energy" | "status";
export type EffectTarget = "self" | "opponent";
export type EffectCondition = "always" | "owner_hp_below_opponent" | "on_win" | "on_loss";
export type EffectOutcomeCondition = "always" | "on_win" | "on_loss";
export type EffectMode = "add" | "reduce_with_min"
  | "mirror_opponent_card_damage" | "mirror_opponent_card_power"
  | "per_damage" | "per_owner_energy" | "per_opponent_energy"
  | "per_owner_hp" | "per_opponent_hp";
export type StatusKind = "poison" | "blessing";

export type EffectSpec = {
  key: string; id?: string; label?: string; amount?: number; min?: number;
  condition?: EffectCondition; outcome?: EffectOutcomeCondition; mode?: EffectMode;
  target?: EffectTarget; statusKind?: StatusKind; unblockable?: boolean;
};
export type Ability = { id: string; name: string; description: string; effects: EffectSpec[] };
export type Bonus   = { id: string; name: string; description: string; effects: EffectSpec[] };

export type CardSource = {
  sourceId: number; sourceUrl: string; sourceArtUrl?: string;
  cost?: number; collectible: boolean;
  abilityText: string; abilityDescription: string;
  bonusText: string;   bonusDescription: string;
};

export type Card = {
  id: string; name: string; clan: string; level: number;
  power: number; damage: number;
  ability: Ability; bonus: Bonus;
  artUrl: string; frameUrl: string; used: boolean; rarity: Rarity;
  portrait: string;  // CSS background string used in art slot
  accent: string;    // CSS color used for frame tint + glow
  source: CardSource;
};

export type CardCollection = { ownerId: string; cardIds: string[] };
export type Deck = { ownerId: string; cardIds: string[] };

export type FighterStatus = {
  id: string; kind: StatusKind; amount: number; min?: number;
  source: string; stacks: number;
};
export type Fighter = {
  id: string; name: string; title: string; avatarUrl: string;
  aiProfile?: FighterAiProfile;
  hp: number; energy: number;        // capped at MAX_HEALTH / MAX_ENERGY
  statuses: FighterStatus[];
  collection: CardCollection;
  deck: Deck;
  hand: Card[];                       // always BATTLE_HAND_SIZE = 4 entries
  usedCardIds: string[];              // grows each round
};

export type ResolvedEffect = {
  id?: string; source: string; label: string;
  value?: number; amount?: number; min?: number;
  timing?: EffectTiming; stat?: EffectStat; target?: Side;
};

export type ClashResult = {
  playerAttack: number; enemyAttack: number;
  winner: Side; loser: Side; damage: number;
  effects: ResolvedEffect[];
  tieBreaker?: "lower_energy" | "initiative" | "enigma";
};
export type Clash = ClashResult & {
  round: number; first: Side;
  playerCard: Card; enemyCard: Card;
  playerEnergy: number; enemyEnergy: number;
  boostedDamage: boolean;
  text: string;          // human-readable summary line
};

export type RoundState = {
  round: number;
  playerCardId?: string; enemyCardId?: string;
  playerEnergyBid: number; enemyEnergyBid: number;
  clash?: Clash;
};

export type MatchResult = "player" | "enemy" | "draw";

export type CardReward         = { cardId: string; cardName: string; xp: number; levelProgress: number };
export type MilestoneCardReward = { cardId: string; cardName: string; rarity: Rarity };
export type RewardSummaryTotals = { crystals: number; totalXp: number; level: number; eloRating?: number };
export type RewardSummary = {
  matchXp: number; levelProgress: number;
  cardRewards: CardReward[];
  milestoneCardRewards: MilestoneCardReward[];
  deltaXp: number; deltaCrystals: number; deltaElo?: number;
  leveledUp: boolean; levelUpBonusCrystals: number;
  newTotals: RewardSummaryTotals;
};

export type GameState = {
  phase: Phase;
  player: Fighter; enemy: Fighter;
  round: RoundState;
  first: Side;                         // who plays first this round
  lastClash?: Clash;
  matchResult?: MatchResult;
  rewards?: RewardSummary;
};

export type Outcome = {
  clash: Clash;
  nextPlayer: Fighter; nextEnemy: Fighter;
  matchResult?: MatchResult;
  rewards?: RewardSummary;
};
```

Notes:
- `Card.used` flips true after the card is played; the card object stays in `Fighter.hand` so the UI can render it dimmed in place.
- `Fighter.usedCardIds` is the source of truth for "which round are we on" (`usedCardIds.length + 1`, capped at MAX_ROUNDS).
- `Fighter.statuses` are persistent (poison ticks each end-of-round, blessing heals each end-of-round).
- `accent` and `portrait` are CSS strings; pass them through to `BattleCard`.

---

## 2. Constants (`src/features/battle/model/constants.ts`)

| Const | Value | Meaning |
|---|---|---|
| `MAX_HEALTH` | 12 | HP cap per fighter; HP bar shows `current/12` |
| `MAX_ENERGY` | 12 | Energy cap per fighter |
| `BASE_ATTACK_ENERGY` | 1 | Free attack-energy added to every play (so "0 spent" still attacks at 1× power) |
| `MAX_ROUNDS` | 4 | Match length; matches up with `BATTLE_HAND_SIZE` |
| `MIN_DECK_SIZE` | 9 | Deck-building rule, surfaced elsewhere |
| `BATTLE_HAND_SIZE` | 4 | Hand row size; ALL 4 must be visible always |
| `EXCHANGE_THROWS_MAX` / `MIN` | 4 / 2 | Number of pre-clash projectile exchanges in `battle_intro` |
| `DAMAGE_THROWS_CAP` | 12 | Cap on number of damage projectiles in `damage_apply` |
| `DAMAGE_BOOST_COST` | 3 | Extra energy cost of "+2 урону" boost |
| `TURN_SECONDS` | 75 | Per-turn timer; warning red glow at ≤10s |
| `PHASE_TIMING_MS` | match_intro=1500, round_intro=1600, opponent_turn=1500, battle_intro=2600, round_result=2300, match_result=2400 | Auto-advance timers used by `setTimeout` in the lifecycle effect |

`damage_apply` duration is computed: `1200 + clash.damage * 220` ms.

---

## 3. Game lifecycle / phase machine

**Owner of `GameState`:** `BattleArena` root (the new top-level battle component). All transitions below happen in a single `useEffect` keyed off `[game, humanStatus, isHumanMatch, pending]`.

Transitions (each `→` is a `setTimeout` whose duration is in §2):

```
match_intro ──1500ms──▶ round_intro
round_intro ──1600ms──▶ (if first==="player") player_turn
                       (if first==="enemy" && AI) opponent_turn (after locking enemy move)
                       (if first==="enemy" && PvP && remote first_move buffered) player_turn
                       (if first==="enemy" && PvP && remote not yet) opponent_turn (waiting)
player_turn ──user picks card──▶ card_preview (modal opens)
card_preview ──modal close──▶ player_turn   (no submit)
card_preview ──confirm──▶
   AI:    if first==="enemy" with locked enemy move → battle_intro
          else                                        → opponent_turn (1500ms, then battle_intro)
   PvP:   → opponent_turn (waiting for round_resolved)
opponent_turn (AI) ──1500ms──▶ player_turn (if no pending) or battle_intro (if pending)
opponent_turn (PvP) ──round_resolved msg──▶ battle_intro
battle_intro ──2600ms──▶ damage_apply
damage_apply ──(1200 + dmg*220)ms──▶ applyOutcome → round_result OR match_result
round_result ──2300ms──▶ startNextRound → round_intro
match_result ──2400ms──▶ reward_summary
reward_summary ──user clicks AI / PvP button──▶ reset() (AI) or restartHumanQueue() (PvP)
```

Auto-submit: a `TURN_SECONDS * 1000` timer in `player_turn`/`card_preview` calls `autoSubmitRef.current()`:
- AI mode: picks a random unused card with energy=0, boost=false, calls `submitSelection`.
- PvP mode: sends `{type:"turn_timeout", matchId, round}` over the socket, closes modal, sets `turnSeconds=0`.

---

## 4. Scoring formula

All produced by `score(card, energySpent, isFirst, options)` in `domain/scoring.ts` and combined in `domain/roundResolver.resolveRound(...)`.

**Per-card score (high-level):**
```
spentEnergy      = max(0, energy)
effectiveEnergy  = spentEnergy + BASE_ATTACK_ENERGY        // = energy + 1
power'           = card.power, then mutated by ability/bonus effects
                   (mode "mirror_opponent_card_power" copies opponent's power)
attack           = power' * effectiveEnergy
attack'          = attack mutated by self timing="attack" effects
damage'          = card.damage mutated by self timing="damage" effects
                   (mode "mirror_opponent_card_damage" deferred until winner known)
```

**Effect ordering in `score`:**
1. Allowed ability effects = `card.ability.effects` filtered by `abilityBlocked` (a blocked ability still keeps `unblockable` effects).
2. Active rule groups = `[clan-bonus rules if active] ∪ [hand-support effects from same-clan unused hand mates] ∪ [ability rules]`.
3. Apply `before_attack target=self`, then compute `attack = power * effectiveEnergy`, then `attack target=self`, then `damage target=self`.
4. Queue `target=opponent` and `after_damage` rules for the resolver.

**Clash resolution (`resolveRound`):**
1. Derive `playerBonus`/`enemyBonus` via `getEffectiveBonusStates` — handles "stop-opponent-bonus" cancellation and "copy-opponent-bonus" (Enigma). Bonus is **active** when `fighter.hand` contains ≥2 cards of that clan (`isClanBonusActive`).
2. Derive `playerAbilityBlocked` / `enemyAbilityBlocked` via opponent bonus id `"stop-opponent-ability"` (some effects with `unblockable` survive).
3. Build base ResolvedEffect log: bonus-control effects, ability-block effects, then both `score().effects`.
4. Apply queued opponent attack effects (e.g. `-X attack with min`).
5. **Tie-break order** (`resolveTie`):
   1. `playerAttack !== enemyAttack` → higher attack wins.
   2. one card has `id === "enigma"` and the other doesn't → enigma wins (`tieBreaker: "enigma"`).
   3. lower spent energy wins (`tieBreaker: "lower_energy"`).
   4. `first` wins (`tieBreaker: "initiative"`).
6. Damage = winner's `damage'` adjusted by:
   - `+2` if winner used the boost (`damageBoost`/`enemyDamageBoost`).
   - Loser's queued opponent-damage effects.
   - Mirror-damage effects (`mirror_opponent_card_damage` copies loser's card.damage).
7. `spendAndUse(fighter, cardId, energy + (boosted ? DAMAGE_BOOST_COST : 0))` for both sides — marks card used, deducts energy.
8. Loser's HP = `max(0, hp - damage)`.
9. Apply `after_damage` effects (winner first, then loser) — these may grant HP/energy/statuses to either side (with `outcome: on_win | on_loss | always`, `min`, `mode: per_damage`).
10. End-of-round status ticks: poison subtracts `amount` (min-floored), blessing adds `amount`. Each tick logged in `clash.effects` with `timing:"after_damage"`, `stat:"hp"`.
11. Build `Clash`, then `getMatchResult(nextPlayer, nextEnemy, round)`:
    - both ≤0 HP → `"draw"`; one side ≤0 → other side wins; round ≥ MAX_ROUNDS → higher HP wins, equal → draw.
12. If match ended, `buildRewards(player, result)` produces a `RewardSummary` (placeholder local rewards; the real persisted `RewardSummary` arrives from the server via `postMatchFinished` in AI mode, or via `reward_summary` socket message in PvP).

**Live preview in CardPickModal (no clash yet):** call `score(selected, energy, first==="player", { owner: player, opponent: enemy, clanBonus: { active: isClanBonusActive(player, selected), bonus: selected.bonus, card: selected } })` and display `preview.attack` and `preview.damage + (damageBoost ? 2 : 0)`.

`hasApplicableAbilityEffect(card, options)` and `isAbilityBlocked(card, blocked, options)` — exported helpers used by both Hand cards and the modal to decide whether to render the ability plate as "active" (bright) vs "inert" (muted).

---

## 5. Component contracts (rebuild list)

For each component, ALL listed `data-testid` values are MUST-PRESERVE — Playwright tests target them. Where a string contains `${id}` it is a dynamic per-card testid.

### 5.1 `BattleArena` (root, replaces `BattleGame.tsx`)

**Mockups:** B1 (`mockups/21-battle-b1-desktop-final.png`), mobile B1m. Hosts B2 modal, B3/B4 overlay, B6/B7 end overlay, B9 matchmaking pre-overlay (PvP only).

```ts
type BattleArenaProps = {
  playerCollectionIds?: string[];
  playerDeckIds?: string[];
  playerIdentity?: PlayerIdentity;        // from "@/features/player/profile/types"
  playerName?: string;
  playerEloRating?: number;
  telegramPlayer?: TelegramPlayer;        // from "@/shared/lib/telegram"
  mode?: "ai" | "human";                  // default "ai"
  avatarUrl?: string;
  onOpenCollection?: () => void;
  onSwitchMode?: (mode: "ai" | "human") => void;
  onPlayerUpdated?: (profile: PlayerProfile) => void;
};
```

**State it owns** (preserve, not necessarily as `useState` each):
- `game: GameState` — initialized via `createInitialGame({playerCollectionIds, playerDeckIds, playerName, playerEloRating})`.
- `selectedId: string | undefined` — currently highlighted player card; default `getAvailableCards(game.player)[0]?.id`.
- `energy: number` — energy slider value (0..maxEnergyForCard); reset to 0 each round.
- `damageBoost: boolean` — boost toggle; reset false each round.
- `pending: Outcome | null` — set when AI clash computed locally, awaited by `damage_apply`.
- `enemyLockedMove: { card: Card; energy?: number } | null` — when opponent moved first.
- `selectionOpen: boolean` — CardPickModal visibility (ties to `phase==="card_preview"`).
- `turnSeconds: number` — countdown; reset to TURN_SECONDS on each round / decision phase.
- `roundWinnerCardIds: ReadonlySet<string>` — append-only set of card IDs that won their round (drives ★ medal).
- PvP-only: `humanStatus: "idle"|"connecting"|"queued"|"matched"|"opponent_left"|"forfeit"|"error"|"closed"`, `humanMessage`, `humanSessionId`, `humanSessionName`, `humanOnlineCount: number|null`, `humanChatMessages: HumanChatMessage[]`, `humanChatDraft`, `matchInfo: HumanMatchInfo | null`.
- `persistedRewards: RewardSummary | null`, `persistedRewardsError: string | null`.

**Refs (do not turn into state):** `socketRef`, `gameRef`, `matchInfoRef`, `activeRewardMatchIdRef`, `remoteFirstMoveRef`, `pendingFirstMovesRef`, `pendingRoundResolvedRef`, `resolvingHumanRoundRef`, `humanMessageHandlerRef`, `autoSubmitRef`, `persistedMatchSignatureRef`.

**Derived values (compute every render):**
- `selected = getSelectedCard(game.player, selectedId) ?? game.player.hand[0]`
- `boostCost = damageBoost ? DAMAGE_BOOST_COST : 0`
- `maxEnergyForCard = max(0, game.player.energy - boostCost)`
- `selectedEnergy = min(energy, maxEnergyForCard)`
- `canBoost = !damageBoost ? game.player.energy >= selectedEnergy + DAMAGE_BOOST_COST : true`
- `locked = pending !== null || phase ∉ {"player_turn","card_preview"}`
- `activeClash = pending?.clash ?? (phase ∈ {round_result, match_result, reward_summary} ? game.lastClash : null)`
- `preview = score(selected, selectedEnergy, game.first==="player", { owner: game.player, opponent: game.enemy, clanBonus: { active: isClanBonusActive(game.player, selected), bonus: selected.bonus, card: selected }})`
- `previewDamage = preview.damage + (damageBoost ? 2 : 0)`
- `verdict = getVerdict(game.matchResult)` → `"" | "Перемога" | "Програш" | "Нічия"`
- `playerDecisionActive = pending===null && phase ∈ {"player_turn","card_preview"}`
- `turnWarningActive = playerDecisionActive && turnSeconds <= 10` (drives the red flash overlay)
- `boardHidden = phase ∉ {"player_turn","card_preview","opponent_turn"}` — when true, hide the whole board (an overlay covers it).
- `humanBlockingOverlay = isHumanMatch && humanStatus !== "matched"` — when true, render `MatchmakingScreen` instead of board.

**Handlers (preserve these names/signatures internally; wire to UI):**
- `submitSelection(card, energyBid, boosted)` — clamps energy, branches AI vs PvP, computes outcome locally for AI via `resolveRound(...)`, updates state, sets phase to `"battle_intro"` (or `"opponent_turn"` if AI hadn't decided yet).
- `confirmSelection()` → `submitSelection(selected, selectedEnergy, damageBoost)`.
- `submitHumanSelection(card, legalEnergy, boosted)` — sends `{type:"submit_move", matchId, round, move:{cardId, energy, boosted}}`; sets phase to `"opponent_turn"`.
- `toggleBoost()` — toggles boost; when enabling, clamps `energy` so `energy + DAMAGE_BOOST_COST ≤ player.energy`.
- `closeSelection()` — sets `selectionOpen=false`; if `phase==="card_preview"` reverts to `"player_turn"`.
- `reset()` — restarts AI match; in PvP delegates to `restartHumanQueue()`.
- `restartHumanQueue()` — re-issues `leave_match` + `join_human` over the socket.
- `sendHumanChatMessage()` — trims draft, sends `{type:"chat_message", text}`.
- `handleHumanSocketMessage`, `handleHumanFirstMove`, `handleHumanRoundResolved`, `handleHumanForfeit`, `handleHumanRewardSummary`, `flushBufferedHumanMessages`, `clearHumanMessageBuffers` — see §7.

**Side effects:**
- One PvP WebSocket lifetime per `BattleArena` mount (when `mode==="human"`). On open send `{type:"join_human", deckIds, collectionIds, identity, user}`. On unmount send `{type:"leave_match"}` then close.
- Lifecycle `setTimeout`s as in §3.
- AI mode only: when `phase ∈ {"match_result","reward_summary"}` and `playerIdentity` set, call `postMatchFinished({identity, mode:"pve", result})` (from `@/features/player/profile/client`); on success, push to `setPersistedRewards` and call `onPlayerUpdated(response.player)`. Dedupe via `persistedMatchSignatureRef` keyed by `${matchResult}:${bucket}`.
- Turn timer: `setInterval(250ms)` + `setTimeout(TURN_SECONDS*1000)` while `playerDecisionActive`.

**Sub-components it must render** (see sections below):
- `BattleHud variant="opponent"` (top strip, AI/PvP variants)
- `BattleHand owner="enemy"`
- `CenterStage`
- `BattleHand owner="player"` (interactive)
- `BattleHud variant="player"` (bottom strip, with mode toggle)
- `CardPickModal` (when `selectionOpen && phase==="card_preview"`)
- `ClashOverlay` (when `pending && phase ∈ {"battle_intro","damage_apply"}`)
- `PhaseSplash` (full-screen splash for `match_intro`/`round_intro`/`opponent_turn`/`round_result`/`match_result` — cover-style with title + subtitle; not currently extracted; may inline or extract)
- `MatchEndOverlay` (when `phase==="reward_summary"`)
- `MatchmakingScreen` (PvP, when `humanBlockingOverlay`)
- A turn-warning overlay div with `data-testid="turn-warning-overlay"` that fades in when `turnWarningActive`.

**Test IDs owned at root level:**
- `turn-warning-overlay` — full-screen red flash; opacity 0/1.

---

### 5.2 `BattleHud` (top + bottom HUD strips)

**Mockup:** chrome of B1 / B1m. PvP variant adds online-indicator/ELO badge but is the same component.

```ts
type BattleHudProps = {
  variant: "opponent" | "player";          // top vs bottom strip
  fighter: Fighter;                        // for name/title/hp/energy/statuses
  // Opponent strip:
  turnSeconds?: number;                    // when variant==="opponent"
  turnWarningActive?: boolean;             // true ≤10s
  onOpenCollection?: () => void;           // "КОЛОДИ" button (top right)
  // Player strip:
  round?: number;                          // current round
  mode?: "ai" | "human";                   // for the AI/PvP toggle
  onResetAi?: () => void;                  // bottom "БІЙ · AI" button
  onResetPvp?: () => void;                 // bottom "БІЙ · PvP" button
  // PvP additive chrome (variant prop, NOT a separate component):
  pvp?: {
    isOpponent: boolean;                   // adds avatar+ELO+live dot when opponent strip
    eloRating?: number;
    online?: boolean;
  };
};
```

**Test IDs:**
- `turn-timer` — opponent strip timer pill (always present in opponent variant); shows `⌛ {turnSeconds} сек`.
- `round-marker` — player strip round badge; text `Раунд {round}`.
- `reset-ai` — player strip "БІЙ · AI" button; carries `aria-label="Бій з AI"`.
- `reset-pvp` — player strip "БІЙ · PvP" button; carries `aria-label="Бій з гравцем"`.
- `fighter-statuses` — appears inside the nameplate when `fighter.statuses.length > 0` (poison/blessing badges).

HP and energy bars MUST honor §6 locked rules: green HP, gold energy, same baseline. The bars cap at MAX_HEALTH/MAX_ENERGY=12; values ≥0 only.

Status chips use `FighterStatus`:
- poison → `"Отрута {amount}/{min?}{ x{stacks}? }"` (green border).
- blessing → `"Благословення +{amount}{ x{stacks}? }"` (gold border).

---

### 5.3 `BattleHand` (4-card row)

**Mockup:** rows in B1/B1m/B4. Same component for player + enemy; styling differs via `owner`.

```ts
type BattleHandProps = {
  cards: Card[];                       // length=4 always (BATTLE_HAND_SIZE)
  fighter?: Fighter;                   // for ability-active calc
  opponent?: Fighter;                  // for ability-active calc
  owner: Side;                         // "player" | "enemy"
  active?: boolean;                    // glow when it's this side's turn
  selectedId?: string;                 // raises that card
  playedCardId?: string;               // pushes that card forward (enemy variant only)
  winnerCardIds?: ReadonlySet<string>; // ★ medal on used winners
  onPick?: (card: Card) => void;       // player only
  disabled?: boolean;                  // player only — when locked
};
```

**Card render rules:**
- `card.used` → 35% opacity, grayscale, cursor-not-allowed.
- selected (`selectedId === card.id`) on player side → -8px Y translate + gold glow.
- selected on enemy side → red glow (no translate).
- played enemy card → translate-y-6, scale 1.045, drop-shadow.
- ★ medal when `card.used && winnerCardIds?.has(card.id)`.
- per-card `clanBonusActive = isClanBonusActive({hand: cards}, card)` and `abilityActive = fighter && opponent ? hasApplicableAbilityEffect(card, {owner: fighter, opponent}) : true` are passed to `<BattleCard>`.

**Test IDs:**
- `player-card-${card.id}` — one per player card. **MUST PRESERVE** — Playwright counts these and clicks them.
- `enemy-card-${card.id}` — one per enemy card. **MUST PRESERVE**.
- Each card carries `data-played="true"|"false"` attribute when it's the played card this round.
- Container has `data-active="true|false"` and `data-owner="player|enemy"`.

Click semantics on player side: `onClick={() => !disabled && !card.used && onPick(card)}`. Keyboard: Enter/Space repeats. The parent `BattleArena` must, in `onPick`:
```
setSelectedId(card.id);
setSelectionOpen(true);
setGame(g => ({...g, phase: "card_preview", round: {...g.round, playerCardId: card.id}}));
```

---

### 5.4 `BattleCard` (preserve as-is — visual contract only)

```ts
type BattleCardProps = {
  card: Card;
  compact?: boolean;                   // smaller render for modals/clash
  clanBonusActive?: boolean;           // dim the bonus plate when false
  abilityActive?: boolean;             // dim the ability plate when false
  bonusVisible?: boolean;              // default true; false = render as disabled
  className?: string;
};
```

The `BattleCard` component is locked (existing visual). UI builder: import and reuse it; do NOT re-implement.

Internal data attributes used elsewhere: `data-card-ability="true"` and `data-card-bonus="true"` mark the two trait slots.

---

### 5.5 `CenterStage`

**Mockup:** middle action band of B1, B4 (opponent thinking).

```ts
type CenterStageProps = {
  phase: Phase;
  first: Side;
  game: GameState;
  activeClash: Clash | null;
  verdict: string;                     // "" if no match result yet
};
```

**Behavior:**
- Renders a phase title via `getPhaseTitle(phase, first, verdict)`:
  - `match_result`/`reward_summary` → `verdict`
  - `round_intro` → `"Раунд"`
  - `opponent_turn` → `"Хід суперника"`
  - `battle_intro` → `"Бой"`
  - `damage_apply` → `"Урон"`
  - `round_result` → `"Підсумок раунду"`
  - default → `"Твій хід"`
- Renders a thinking-dots indicator (3 bouncing dots + pulsing red dot) when `phase==="opponent_turn"`. **Test ID `opponent-thinking`**.
- Renders an arena-text line via `getArenaText(game, activeClash, verdict)`:
  - no clash, `match_intro` → `"Матч завантажується: бійці виходять на арену."`
  - no clash, `round_intro` → `"Раунд {n}. Арена вільна, картки чекають на вибір."`
  - no clash, otherwise → `"Обери бійця, вклади енергію й випусти його на арену."`
  - `opponent_turn` → `"Картку обрано. Суперник відповідає своїм ходом."`
  - `damage_apply` → `"{winnerCardName} перемагає. Завдано {damage} урону."`
  - `match_result`/`reward_summary` → `"{verdict}. Завдано {damage} урону."`
  - `round_result` → `"{Раунд за тобою!|Раунд за суперником.} Завдано {damage} урону."`
  - default → `"Обирай наступну картку."`

**Test IDs:**
- `round-status` — the headline element.
- `opponent-thinking` — the thinking-dots widget (only rendered when `phase==="opponent_turn"`).

---

### 5.6 `CardPickModal` (B2)

Replaces `SelectionOverlay.tsx`. Mockup `mockups/26-battle-b2-card-pick-final.png`. **Locked rule from owner:** opponent card preview must be EQUAL SIZE to player card; energy/boost/abilities row sits BELOW both cards in a single horizontal row, modal grows wider; show "СУМАРНА АТАКА" total breakdown.

```ts
type CardPickModalProps = {
  selected: Card;
  enemy: Fighter;
  player: Fighter;
  knownEnemyCard?: Card;        // shown face-up if opponent moved first; else "?" placeholder
  knownEnemyEnergy?: number;
  energy: number;               // current spent (0..maxEnergy)
  maxEnergy: number;            // = max(0, player.energy - boostCost)
  damageBoost: boolean;
  boostCost: number;            // DAMAGE_BOOST_COST=3
  previewAttack: number;        // from score()
  previewDamage: number;        // from score(), already includes +2 if boost on
  canBoost: boolean;
  onClose: () => void;
  onMinus: () => void;          // energy--
  onPlus: () => void;           // energy++
  onToggleBoost: () => void;
  onConfirm: () => void;
};
```

**Internally compute** (do not pass these in, but render them):
- `selectedClanBonusActive = isClanBonusActive(player, selected)`
- `knownEnemyClanBonusActive = knownEnemyCard ? isClanBonusActive(enemy, knownEnemyCard) : false`
- `selectedAbilityActive = hasApplicableAbilityEffect(selected, {owner: player, opponent: enemy, opponentCard: knownEnemyCard, opponentEnergyBid: knownEnemyEnergy})`
- `knownEnemyAbilityActive` analogous (swap sides).
- `effectiveEnergy = energy + BASE_ATTACK_ENERGY` — this is the number the user sees as their "energy slot" count (so 1 minimum).
- `maxEffectiveEnergy = maxEnergy + BASE_ATTACK_ENERGY`.

**Keyboard / close behavior:** clicking the backdrop closes (`onClose`); a "×" button closes; `onConfirm` submits.

**Test IDs (MUST PRESERVE):**
- `selection-overlay` — root section.
- `selection-energy` — the live `effectiveEnergy` value display.
- `energy-minus`, `energy-plus` — the steppers (disabled at bounds).
- `damage-boost-toggle` — boost button (disabled when `!damageBoost && !canBoost`).
- `selection-ok` — primary confirm.
- `known-enemy-card` — wrapper around the opponent's revealed card (when `knownEnemyCard` provided).
- `enemy-card-hidden` — placeholder card with "?" sigil (when `knownEnemyCard` undefined).

Total-attack block ("СУМАРНА АТАКА") is required by the locked B2 spec (mockup) — render: big number = `previewAttack`, sub-line = `"{power} база + {energy} енергія"`. Use `selected.power` + `energy` for the breakdown.

---

### 5.7 `ClashOverlay` (B3 — БІЙ moment + damage_apply)

**Mockup:** `mockups/27-battle-b3-clash-final.png`.

```ts
type ClashOverlayProps = {
  outcome: Outcome;
  player: Fighter;
  enemy: Fighter;
  phase: Phase;       // expected "battle_intro" | "damage_apply"
};
```

**Behavior:**
- Shows both played cards (full `BattleCard compact`) at left/right.
- During `battle_intro`: centered "БІЙ" headline + 2–4 exchange projectiles (kind/direction stable-hashed off `clash` ids; cap = `EXCHANGE_THROWS_MAX`, min = `EXCHANGE_THROWS_MIN`).
- During `damage_apply`:
  - Loser side renders avatar (face hit, with `-{damage}` chip and HP pills) instead of card.
  - Winner card stays.
  - Renders `min(DAMAGE_THROWS_CAP, clash.damage)` damage projectiles, plus a finisher projectile if loser HP→0.
  - Centered "duel attack comparison" block shows `playerAttack [op] enemyAttack` where op = `>`, `<`, or `=` derived from `getDuelAttackComparison(clash)` (existing helper in `attackComparison.ts`).
  - Effect chips strip below shows the last 5 `clash.effects` (poison/blessing styled distinctly).
- Top corners show duel status panels (energy pills + revealed attack pills); attack pills appear only in `damage_apply`.

**Computed:**
- `playerHp`/`enemyHp` = if `damage_apply` then `outcome.nextPlayer.hp`/`outcome.nextEnemy.hp`, else current.
- `isFinisher = isDamage && (loser==="player" ? outcome.nextPlayer.hp <= 0 : outcome.nextEnemy.hp <= 0)`.
- `playerAbilityActive` / `enemyAbilityActive` recomputed from `clash` + control effects (use `hasControlEffect(effects, target)` to detect if ability blocked).

**Test IDs:**
- `battle-overlay` — root section, with `data-phase={phase}` and `data-winner={clash.winner}`.
- `duel-attack-comparison`, `duel-player-attack`, `duel-enemy-attack` — central comparison block.
- `duel-exchange-projectile` (per projectile, exchange phase only).
- `duel-exchange-projectiles` — projectile lane wrapper.
- `duel-avatar-${fighter.id}` — the avatar shown when a fighter takes damage.
- `battle-effects` — effect chips strip wrapper.

---

### 5.8 `MatchEndOverlay` (B6 victory + B7 defeat — single component, variant prop)

**Mockups:** `mockups/30-battle-b6-victory-final.png`, `mockups/31-battle-b7-defeat-final.png`. Renders during `phase==="reward_summary"`.

```ts
type MatchEndOverlayProps = {
  result?: MatchResult;                 // "player" | "enemy" | "draw"
  rewards?: RewardSummary;              // persisted preferred; falls back to game.rewards
  mode: "ai" | "human";
  playerName?: string;
  avatarUrl?: string;
  onReplayAi: () => void;               // bottom-left "AI" button
  onReplayHuman: () => void;            // bottom-right "PvP" button
  persistedRewardsError: string | null;
  showPersistedDetails: boolean;        // true once server response arrived
};
```

Use the existing `rewardOverlayPresenter` helpers (don't re-implement):
```ts
import {
  DEFAULT_REWARD_AVATAR_URL,
  computeXpProgress,
  resolveRewardAvatarUrl,
  resolveRewardTitle,         // returns { text, tone: "victory"|"draw"|"defeat" }
  selectVisibleTiles,         // returns { showCrystals, showElo, showLevelUp, showMilestone }
  type RewardTitle,
} from "../rewardOverlayPresenter";
```

Layout:
1. Title block — text from `resolveRewardTitle(result)`, color by `tone`.
2. Avatar block — 96px gold ring, name, level pill (`Lv {level}` from `rewards.newTotals.level`), XP bar with optional gold delta highlight.
3. Stat tiles grid (3 columns desktop, 1 col on mobile) — crystals (cyan), ELO (gold or red on loss), level-up (gold), and one tile per `milestoneCardRewards`.
4. Optional persisted-rewards error banner.
5. Two replay buttons: AI (gold) and PvP (cyan).

**Test IDs (MUST PRESERVE — heavy Playwright coverage):**
- `reward-summary` — root section.
- `reward-title-block` (with `data-tone`), `reward-title`.
- `reward-avatar-block`, `reward-avatar-image` (with `data-avatar-src`), `reward-player-name`, `reward-player-level`.
- `reward-xp-bar`, `reward-xp-bar-delta` (only when `showXpDelta`), `reward-xp-label`.
- `reward-stat-tiles` (grid wrapper).
- `reward-crystals-tile`, `reward-crystals-line` (with `data-delta-crystals`, `data-new-crystals`).
- `reward-elo-tile`, `reward-elo-line` (with `data-delta-elo`, `data-new-elo`).
- `reward-level-up-tile`, `reward-level-up-headline` (with `data-new-level`, `data-level-up-bonus`).
- `reward-milestone-tile` (one per milestone, with `data-card-id`, `data-rarity`), `reward-milestone-detail`.
- `reward-persisted-error`.
- `reward-replay-ai`, `reward-replay-human` (each carries `data-mode`).

Match-end variant rules per mockup spec: B6 variant = victory tone; B7 = defeat tone (red glow, danger ring on avatar). Single component, the `result` prop drives variant.

---

### 5.9 `MatchmakingScreen` (B9 — pre-match PvP overlay with lobby chat)

**Mockup:** `mockups/...-b9-matchmaking-with-lobby-chat-...`. Rendered when `humanBlockingOverlay` is true.

```ts
type MatchmakingScreenProps = {
  status: HumanMatchStatus;                 // "connecting" | "queued" | "matched" | "opponent_left" | "forfeit" | "error" | "closed" | "idle"
  message: string;                          // server-supplied error message
  playerName: string;                       // shown in "Ім'я сесії" tile
  onlineCount: number | null;               // null = "..."; show count when known
  sessionId: string;                        // used by isOwnHumanChatMessage()
  chatMessages: HumanChatMessage[];
  chatDraft: string;
  onChatDraftChange: (value: string) => void;
  onSendChatMessage: () => void;
  onOpenCollection?: () => void;            // "До колоди" link (optional)
  onRetryMatch?: () => void;                // re-queue (only relevant for "opponent_left"|"forfeit"|"error"|"closed")
};

type HumanChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
};
```

**Title/subtitle helpers (verbatim strings):**
- `connecting` → "Підключення" / "Підключаємося до живого матчу."
- `queued` → "Пошук суперника" / "Чекаємо іншого гравця."
- `opponent_left` → "Суперник вийшов" / "Матч зупинено, бо другий гравець залишив арену."
- `forfeit` → "Матч завершено" / "Час ходу вийшов, результат зафіксовано для обох гравців."
- `error` → "PvP помилка" / "Спробуй повернутися до колоди й запустити PvP ще раз."
- `closed` → "З'єднання закрите" / "Сервер закрив з'єднання з матчем."

**Pulse spinner** when `status ∈ {"connecting","queued"}`.

**Lobby chat panel** — if implemented as a shared `<LobbyChatDrawer>`, prefer wiring it via `useLobbyChat(playerName)` from `@/features/presence/client`. The README mockup says B9 should embed the lobby chat. The current code uses match-scoped chat (per-WebSocket) instead. The contract: the chat panel shows last 200 messages, max 240 chars per message, "own" message detection via `isOwnHumanChatMessage(authorId, authorName, sessionId, playerName)` (matches by `authorId === sessionId` OR normalized name match).

**Test IDs (MUST PRESERVE):**
- `human-match-overlay` — root.
- `human-match-session-name` — left tile.
- `human-match-online` (always present) with `data-online-count` attribute; `human-match-online-count` (only when count is known).
- `human-match-chat`, `human-match-chat-list`, `human-match-chat-input`, `human-match-chat-send`.
- `human-match-retry` — visible only when `onRetryMatch && status ∈ {"opponent_left","forfeit","error","closed"}`.

If you reuse the global lobby drawer from `presence/client.ts` you ALSO need to keep its existing IDs intact: `lobby-chat`, `lobby-chat-input`, `lobby-chat-list`, `lobby-chat-send`, `lobby-bubble-v2` (these belong to the shell, not the overlay — see `_test-ids-inventory.md`).

---

## 6. Locked design rules (quote from owner README)

From `docs/redesign-2026-05-04/README.md`, "NOTES FOR IMPLEMENTATION AGENTS (locked feedback from owner, 2026-05-04)":

1. **HP bar must be GREEN** (muted green `#6ba35f` fill, dark-green rail `#1d2a1c`) — NOT gold.
2. **Energy bar stays GOLD** (`#f0c668` fill, dark-gold rail `#3a2f15`).
3. **HP and energy bars must be perfectly aligned on the SAME horizontal baseline** in each HUD strip — no two-line offset, no different vertical positions. Same height, same length, same y-center. Numerals beside each bar use tabular monospace and are vertically centered on the bars.
4. Cards on the field render with the existing `BattleCard` component — visuals unchanged. Only the surrounding chrome is new.
5. **Card-pick modal (B2) MUST show the opponent card preview** alongside player card with **EQUAL SIZE** (no shrinking). A subtle "VS" tag sits between them. Below or beside both cards, a "СУМАРНА АТАКА" block shows live total = base attack + spent energy (e.g. "8 = 7 база + 1 енергія"). The right-side info panel (energy stepper, boost, abilities, OK) sits BELOW both cards in a single horizontal row, NOT a third column. Modal grows wider rather than cramping.

Architecture decisions locked:
- One unified frame for AI vs PvP. PvP gets additive chrome (real opponent avatar, ELO badge, connection indicator, chat icon), not a parallel UI.
- Cards on the field render with the existing `BattleCard` component, sized for hand-row display. We redesign chrome, HUD strips, modals, animations, overlays.
- Atmospheric background ramps from 14% (static screens) to ~22% opacity in battle.
- Particles intensify during clash moment.
- Round counter lives in player HUD strip, NOT floating in field.
- Card hand: 4 cards in flat row (no fan), generous gap, hover lifts active card 6px, selected has 2px gold ring.
- Used card state: same position, 50% opacity, slight desaturation, ✓/✕ badge.
- Clash animation: both played cards slide from hand positions to center, "БІЙ" headline appears, brief pause, return to hand positions with win/loss state. HP/energy bars update with delta animation.
- Background asset replacement: use `public/nexus-assets/backgrounds/cathedral-desktop-1440x900.png` (desktop) and `cathedral-mobile-390x844.png` (mobile). The current `SceneBackground.tsx` references the old `arena-bar-1024x576.png` — UI builder must swap.

Mechanics that the redesign MUST honour:
- `BATTLE_HAND_SIZE = 4` — all 4 cards visible simultaneously each round.
- `MAX_ROUNDS = 4` — match length.
- `MAX_HEALTH = 12`, `MAX_ENERGY = 12` — bar caps.
- `TURN_SECONDS = 75` — per-turn timer.
- Cards play in their hand position — no separate play slot. After playing, card stays where it was and gets a "used" overlay.
- Card-pick is a dedicated modal with energy/damage spending UI + opponent face-down "VS" placeholder.
- Clash resolution slides both played cards to center for the "БІЙ" reveal, then returns them to hand positions with win/loss indicators.

---

## 7. Realtime / sockets (PvP)

**Single WebSocket** opened on `BattleArena` mount when `mode==="human"`. URL: `${ws|wss}://${host}/ws`.

**Outgoing messages from client:**
| Type | Payload | Sent when |
|---|---|---|
| `join_human` | `{deckIds, collectionIds, identity, user}` (`user` = telegramPlayer if has id/name/username, else `{name: stableName}`) | on socket open + on `restartHumanQueue()` |
| `leave_match` | `{}` | on unmount + before re-queuing |
| `submit_move` | `{matchId, round, move:{cardId, energy, boosted}}` | on `submitHumanSelection` |
| `turn_timeout` | `{matchId, round}` | when player turn timer hits 0 in PvP |
| `chat_message` | `{text}` (≤240 chars, whitespace-collapsed) | on chat send |

**Incoming messages handled (`handleHumanSocketMessage`):**
| Type | Side effects |
|---|---|
| `session` | Set `humanSessionId = clientId`. Sanitize `playerName` (trim, slice 48), persist via `rememberStableSessionName`, set `humanSessionName`. |
| `chat_history` | Replace `humanChatMessages` (normalized, last 200). |
| `chat_message` | Append (dedupe by id, slice last 200). |
| `online_count` | Update `humanOnlineCount` if integer ≥0. |
| `queued` | `humanStatus = "queued"`. |
| `match_ready` | Validate `HumanMatchInfo` (`matchId`, `playerId`, `opponentId`, `firstPlayerId`, `players` map of `{id, name?, telegramId?, deckIds, collectionIds, handIds?, usedCardIds?}`). Build new `GameState` via `createInitialGame`+overrides. Reset all per-match state. `humanStatus="matched"`, `activeRewardMatchIdRef = matchId`. |
| `first_move` | `{matchId, round, playerId, move:{cardId, energy?, boosted?}}` — buffer if round > current; ignore if from self. If `phase==="opponent_turn"` and `first==="enemy"` and round matches, lock the enemy move and switch to `player_turn`. |
| `round_resolved` | `{matchId, round, firstPlayerId, nextFirstPlayerId, moves: Record<playerId, {cardId, energy, boosted}>}` — buffer if round > current; otherwise match cards in hands, run `resolveRound(...)` locally with the known enemy move, set `pending`, switch to `battle_intro`. Dedupe via `resolvingHumanRoundRef`. |
| `match_forfeit` | `{matchId, round, loserId, winnerId, reason?}` — set matchResult based on `winnerId === playerId`, jump straight to `reward_summary`. |
| `reward_summary` | `{matchId?, payload: RewardSummary}` — accept only if matchId matches `activeRewardMatchIdRef`; set `persistedRewards = payload`. |
| `opponent_left` | `humanStatus="opponent_left"`, clear `matchInfo`. |
| `error` | `humanStatus="error"`, `humanMessage = message.message ?? default`. |

**Buffering:** `pendingFirstMovesRef` and `pendingRoundResolvedRef` are `Map<round, message>` — populated when a server message arrives for a future round (e.g. while damage is still animating); flushed by `flushBufferedHumanMessages()` after round_intro completes.

**Lobby chat hook (B9 reusable):** `useLobbyChat(userName?: string)` from `src/features/presence/client.ts` returns `{ onlineCount: number|null, sessionId: string, playerName: string, chatMessages: LobbyChatMessage[], sendMessage: (text)=>boolean }`. Internally maintains a single shared lobby WebSocket. Distinct from the per-match chat used inside `MatchmakingScreen` — but mockup B9 calls for the global lobby chat to be present, so prefer wiring `useLobbyChat` into the matchmaking screen if you need lobby-wide presence.

`useOnlineCount(): number | null` — same client, count-only.

---

## 8. Test IDs index

Grouped per component. Every entry is **MUST PRESERVE** unless explicitly noted — Playwright tests in `/tests/*.spec.ts` rely on them. Search for usages with `grep -r "data-testid=\\\"X\\\"" tests/`.

**BattleArena root**
- `turn-warning-overlay` — full-screen red flash; opacity toggled via `turnWarningActive`.

**BattleHud (opponent)**
- `turn-timer`

**BattleHud (player)**
- `round-marker`
- `reset-ai`
- `reset-pvp`

**Both HUDs (when fighter has statuses)**
- `fighter-statuses`

**BattleHand**
- `player-card-${card.id}` (one per card; tests use `[data-testid^="player-card-"]` with toHaveCount(4))
- `enemy-card-${card.id}` (one per card; tests use `[data-testid^="enemy-card-"]` with toHaveCount(4))
- (no testid on the row itself; `data-active` and `data-owner` data attrs are allowed and used by debug)

**BattleCard internal**
- `data-card-ability="true"` and `data-card-bonus="true"` on the two trait slots (data attrs, not testids; preserve so deck-builder tests still match).

**CenterStage**
- `round-status`
- `opponent-thinking` (only when `phase==="opponent_turn"`)

**CardPickModal (replaces SelectionOverlay)**
- `selection-overlay`
- `selection-energy`
- `energy-minus`
- `energy-plus`
- `damage-boost-toggle`
- `selection-ok`
- `known-enemy-card` (when known enemy card)
- `enemy-card-hidden` (when not yet known)

**ClashOverlay (BattleOverlay)**
- `battle-overlay`
- `duel-attack-comparison`
- `duel-player-attack`
- `duel-enemy-attack`
- `duel-exchange-projectile` (per projectile, exchange only)
- `duel-exchange-projectiles` (lane wrapper, exchange only)
- `duel-avatar-${fighter.id}` (during damage_apply, hit side)
- `battle-effects`

**MatchEndOverlay (RewardOverlay)**
- `reward-summary`
- `reward-title-block` (`data-tone`)
- `reward-title`
- `reward-avatar-block`
- `reward-avatar-image` (`data-avatar-src`)
- `reward-player-name`
- `reward-player-level`
- `reward-xp-bar`
- `reward-xp-bar-delta`
- `reward-xp-label`
- `reward-stat-tiles`
- `reward-crystals-tile`, `reward-crystals-line`
- `reward-elo-tile`, `reward-elo-line`
- `reward-level-up-tile`, `reward-level-up-headline`
- `reward-milestone-tile` (one per milestone), `reward-milestone-detail`
- `reward-persisted-error`
- `reward-replay-ai`, `reward-replay-human`

**PhaseSplash (intermediate splashes for round_intro / opponent_turn / round_result / match_result)**
- `phase-overlay` with `data-phase={phase}` attribute.

**MatchmakingScreen**
- `human-match-overlay`
- `human-match-session-name`
- `human-match-online` (`data-online-count`)
- `human-match-online-count` (only when count known)
- `human-match-chat`
- `human-match-chat-list`
- `human-match-chat-input`
- `human-match-chat-send`
- `human-match-retry` (only when retry available)

**Lobby chat (shared, used by MatchmakingScreen if you wire `useLobbyChat`)**
- `lobby-chat`, `lobby-chat-list`, `lobby-chat-input`, `lobby-chat-send`, `lobby-bubble-v2` (owned by app shell; do not duplicate, just don't break if you reuse).

**NOT in battle scope but related (don't recreate, just don't break the parent shell):**
- `player-hud-*` (top-level player HUD outside battle), `player-profile-shell`, `collection-*`, `starter-*`, `paid-booster-*`, `play-*`, `guide-*`, `card-details-*` — owned by other features.

---

## Appendix A — Helper exports the UI builder will import

From `../model/game`:
- `createInitialGame(options)`, `createRound(round)`, `applyOutcome(state, outcome)`, `startNextRound(state)`, `getMatchResult(player, enemy, round)`, `buildRewards(player, result)`, `otherSide(side)`
- `getAvailableCards(fighter)`, `getSelectedCard(fighter, id)`, `getUsedIds(fighter)`, `makeFighter(...)`, `refreshBattleHand(fighter)`
- `score(card, energy, isFirst, options)`, `hasApplicableAbilityEffect(card, options)`, `isAbilityBlocked(card, blocked, options)`
- `chooseEnemyMove(enemy, player, round, hint?)`, `getEnemyPreview(...)`, type `EnemyMove`
- `resolveRound(player, enemy, playerCard, energy, boost, first, round, enemyMove?)`
- `aiOpponents`, `selectAiOpponent({opponentId?, playerEloRating?})`, type `AiOpponent`

From `../model/clans`: `clanList`, `clans`, `getClanBonus(clan)`, `isClanBonusActive(fighterLikeWithHand, card)`, `rarityAccents` (Record<Rarity,string>).

From `../model/constants`: every constant in §2 + `PHASE_TIMING_MS`.

From `../rewardOverlayPresenter`: see §5.8.

From `@/features/presence/client`: `useLobbyChat(userName?)`, `useOnlineCount()`, `parseOnlineCountMessage(raw)`.

From `@/features/player/profile/client`: `postMatchFinished({identity, mode, result})` returns `{player: PlayerProfile, rewards: RewardSummary}`.

From `@/features/presence/sessionName`: `readStableSessionName()`, `rememberStableSessionName(name)`, `resolveStableUserName(name?)`.

---

## Appendix B — `getVerdict` / replay helpers (verbatim)

```ts
function getVerdict(result?: MatchResult): string {
  if (!result) return "";
  if (result === "draw") return "Нічия";
  return result === "player" ? "Перемога" : "Програш";
}

function matchResultToBucket(result: MatchResult): "win" | "draw" | "loss" {
  if (result === "player") return "win";
  if (result === "draw") return "draw";
  return "loss";
}

function getActiveHand(phase: Phase): Side | null {
  if (phase === "player_turn" || phase === "card_preview") return "player";
  if (phase === "opponent_turn") return "enemy";
  return null;
}
```

---

End of contract. If a behavior is not explicitly listed here, default to "preserve current behavior of `BattleGame.tsx`" — but you should not need to read that file; the lifecycle, state, and handlers above are the complete behavioral spec.
