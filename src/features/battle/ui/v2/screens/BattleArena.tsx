"use client";

import { cn } from "@/shared/lib/cn";
import type { Card, Fighter, GameState, Phase } from "@/features/battle/model/types";
import { MAX_ENERGY, MAX_HEALTH } from "@/features/battle/model/constants";
import { BattleHud } from "../molecules/BattleHud";
import { BattleHand, type BattleHandCard } from "../molecules/BattleHand";
import { CenterStage, type CenterStageVariant } from "../molecules/CenterStage";
import { CardPickModal } from "../organisms/CardPickModal";
import { ClashOverlay } from "../organisms/ClashOverlay";

export type BattleArenaPvpIdentity = {
  name: string;
  level?: number;
  avatarUrl?: string;
  elo?: number;
  online?: "online" | "reconnecting" | "disconnected";
};

export type BattleArenaSplash =
  | { phase: "match_intro"; opponentName: string; mode: "ai" | "pvp" }
  | { phase: "round_intro"; round: number }
  | { phase: "match_result"; title: string; subtitle?: string };

export type BattleArenaClash = {
  playerCard: Card;
  enemyCard: Card;
  playerAttack: number;
  enemyAttack: number;
  playerDamage: number;
  enemyDamage: number;
  /** Energy spent on each played card. */
  playerEnergy: number;
  enemyEnergy: number;
  winner: "player" | "enemy" | "draw";
};

export type BattleArenaProps = {
  game: GameState;
  player: Fighter;
  enemy: Fighter;
  mode: "ai" | "pvp";
  pvpIdentity?: BattleArenaPvpIdentity;

  /** Center stage variant. If omitted, derives from `game.phase`. */
  centerVariant?: CenterStageVariant;

  /** Hand entries (already shaped by the caller). */
  playerHand: BattleHandCard[];
  enemyHand: BattleHandCard[];

  /** Controlled selection state. */
  selectedCardId?: string;
  energyBid: number;
  damageBoost: boolean;

  /** Card pick modal. */
  cardPickOpen: boolean;
  cardPickPreview: { attack: number; damage: number };
  maxEnergyForCard: number;
  boostCost: number;
  canBoost: boolean;
  knownEnemyCard?: Card;
  knownEnemyEnergy?: number;

  /** Clash overlay payload. Visible when present. */
  clash?: BattleArenaClash;
  /** Optional canonical phase passthrough for clash data attributes. */
  clashPhase?: Phase;

  /** Splash overlay (cover transitions). Replaces legacy PhaseOverlay. */
  splash?: BattleArenaSplash;

  /** Optional turn timer. */
  timer?: { secondsLeft: number; warning?: boolean };

  /** Hand click target — fired only when the card is selectable. */
  onSelectCard: (cardId: string) => void;
  onEnergyMinus: () => void;
  onEnergyPlus: () => void;
  onEnergyChange?: (next: number) => void;
  onToggleBoost: () => void;
  onConfirmPick: () => void;
  onCancelPick: () => void;
  onLeave: () => void;
  onOpenDecks?: () => void;
  onResetAi?: () => void;
  onResetPvp?: () => void;

  /** Active hand ring (player|enemy|null). */
  activeHand?: "player" | "enemy" | null;

  /** HUD damage-flash signals (driven by ClashOverlay impact phase). */
  playerDamageFlash?: boolean;
  enemyDamageFlash?: boolean;
  /** Forwarded to ClashOverlay so the parent can trigger HUD flash on impact. */
  onClashImpact?: (loser: "player" | "enemy") => void;
  /** Fired once per projectile that lands during the barrage super-phase. */
  onClashProjectileImpact?: (
    loser: "player" | "enemy",
    index: number,
    hpRemaining: number,
  ) => void;
  /** Fired when the ClashOverlay finishes (both super-phases done). */
  onClashDone?: () => void;
};

export function BattleArena({
  game,
  player,
  enemy,
  mode,
  pvpIdentity,
  centerVariant,
  playerHand,
  enemyHand,
  selectedCardId,
  energyBid,
  damageBoost,
  cardPickOpen,
  cardPickPreview,
  maxEnergyForCard,
  boostCost,
  canBoost,
  knownEnemyCard,
  knownEnemyEnergy,
  clash,
  clashPhase,
  splash,
  timer,
  onSelectCard,
  onEnergyMinus,
  onEnergyPlus,
  onEnergyChange,
  onToggleBoost,
  onConfirmPick,
  onCancelPick,
  onLeave,
  onOpenDecks,
  onResetAi,
  onResetPvp,
  activeHand,
  playerDamageFlash,
  enemyDamageFlash,
  onClashImpact,
  onClashProjectileImpact,
  onClashDone,
}: BattleArenaProps) {
  const opponentIdentity =
    mode === "pvp" && pvpIdentity
      ? pvpIdentity
      : { name: enemy.name, level: enemy.aiProfile?.level };

  const variant = centerVariant ?? defaultCenterVariant(game, mode, enemy.name);
  const turnWarningActive = Boolean(timer?.warning);
  const selected =
    player.hand.find((card) => card.id === selectedCardId) ?? player.hand[0];

  return (
    <div
      data-testid="battle-arena"
      data-mode={mode}
      data-phase={game.phase}
      className={cn(
        "relative flex flex-col w-full min-h-dvh text-ink overflow-hidden",
        "bg-bg",
        "bg-[url('/nexus-assets/backgrounds/cathedral-mobile-390x844.png')] md:bg-[url('/nexus-assets/backgrounds/cathedral-desktop-1440x900.png')]",
        "bg-cover bg-center",
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-bg/60" aria-hidden />

      <div
        data-testid="battle-arena-warning"
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-300",
          "bg-[radial-gradient(ellipse_at_center,rgba(217,112,86,0.18),transparent_70%)]",
          turnWarningActive ? "opacity-100" : "opacity-0",
        )}
      />

      <div className="relative flex flex-col w-full min-h-dvh">
        <BattleHud
          side="opponent"
          mode={mode}
          timer={timer ? { secondsLeft: timer.secondsLeft, totalSeconds: timer.secondsLeft } : undefined}
          timerWarning={turnWarningActive}
          energy={{ value: enemy.energy, max: MAX_ENERGY }}
          hp={{ value: enemy.hp, max: MAX_HEALTH }}
          identity={opponentIdentity}
          damageFlash={enemyDamageFlash}
          statuses={enemy.statuses}
          onOpenDecks={onOpenDecks ?? onLeave}
        />

        <div className="mx-auto w-full max-w-[1440px] mt-3 sm:mt-5">
          <BattleHand side="opponent" cards={enemyHand} active={activeHand === "enemy"} />
        </div>

        <div className="mx-auto w-full max-w-[1440px] flex-1 grid place-items-center min-h-[120px]">
          <CenterStage variant={variant} />
        </div>

        <div className="mx-auto w-full max-w-[1440px] mb-3 sm:mb-5">
          <BattleHand
            side="player"
            cards={playerHand}
            active={activeHand === "player"}
            onSelect={onSelectCard}
          />
        </div>

        <BattleHud
          side="player"
          mode={mode}
          energy={{ value: player.energy, max: MAX_ENERGY }}
          hp={{ value: player.hp, max: MAX_HEALTH }}
          identity={{ name: player.name }}
          roundNumber={game.round.round}
          damageFlash={playerDamageFlash}
          statuses={player.statuses}
          onResetAi={onResetAi}
          onResetPvp={onResetPvp}
        />
      </div>

      <CardPickModal
        open={cardPickOpen}
        selected={selected}
        enemy={enemy}
        player={player}
        knownEnemyCard={knownEnemyCard}
        knownEnemyEnergy={knownEnemyEnergy}
        energy={energyBid}
        maxEnergy={maxEnergyForCard}
        damageBoost={damageBoost}
        boostCost={boostCost}
        previewAttack={cardPickPreview.attack}
        previewDamage={cardPickPreview.damage}
        canBoost={canBoost}
        onClose={onCancelPick}
        onMinus={onEnergyMinus}
        onPlus={onEnergyPlus}
        onEnergyChange={onEnergyChange}
        onToggleBoost={onToggleBoost}
        onConfirm={onConfirmPick}
      />

      {clash ? (
        <ClashOverlay
          open
          phase={clashPhase}
          playerCard={clash.playerCard}
          enemyCard={clash.enemyCard}
          playerAttack={clash.playerAttack}
          enemyAttack={clash.enemyAttack}
          playerDamage={clash.playerDamage}
          enemyDamage={clash.enemyDamage}
          playerEnergy={clash.playerEnergy}
          enemyEnergy={clash.enemyEnergy}
          winner={clash.winner}
          playerAvatarUrl={player.avatarUrl}
          enemyAvatarUrl={enemy.avatarUrl}
          playerHp={player.hp}
          enemyHp={enemy.hp}
          hpMax={MAX_HEALTH}
          onImpact={onClashImpact}
          onProjectileImpact={onClashProjectileImpact}
          onDone={onClashDone ?? (() => {})}
        />
      ) : null}

      {splash ? <PhaseSplash splash={splash} /> : null}
    </div>
  );
}

function defaultCenterVariant(
  game: GameState,
  mode: "ai" | "pvp",
  opponentName: string,
): CenterStageVariant {
  const phase = game.phase;
  if (phase === "match_intro") return { kind: "match_intro", opponentName, mode };
  if (phase === "round_intro") return { kind: "round_intro", round: game.round.round };
  if (phase === "opponent_turn") return { kind: "opponent_thinking" };
  if ((phase === "round_result" || phase === "match_result" || phase === "reward_summary") && game.lastClash) {
    const winner: "player" | "opponent" | "draw" =
      game.lastClash.winner === "player"
        ? "player"
        : game.lastClash.winner === "enemy"
          ? "opponent"
          : "draw";
    return { kind: "round_result", winner, damage: game.lastClash.damage };
  }
  return { kind: "your_turn" };
}

function PhaseSplash({ splash }: { splash: BattleArenaSplash }) {
  const { title, subtitle } = splashCopy(splash);
  return (
    <section
      data-testid="phase-splash"
      data-phase={splash.phase}
      className="fixed inset-0 z-30 grid place-items-center bg-[#05080b]/80 bg-cover bg-center p-3 backdrop-blur-sm"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(4,7,10,0.55),rgba(4,7,10,0.78)),url('/nexus-assets/backgrounds/cathedral-desktop-1440x900.png')",
      }}
    >
      <div className="grid justify-items-center gap-4 text-center">
        <strong
          data-testid="phase-splash-title"
          className="text-[clamp(40px,7vw,88px)] font-semibold uppercase leading-[0.95] tracking-[0.12em] text-[#f1ebd9]"
        >
          {title}
        </strong>
        {subtitle ? (
          <span
            data-testid="phase-splash-subtitle"
            className="max-w-[620px] px-4 text-sm font-medium uppercase tracking-[0.18em] text-[#f1ebd9]/80"
          >
            {subtitle}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function splashCopy(splash: BattleArenaSplash) {
  if (splash.phase === "match_intro") {
    return {
      title: "БІЙ",
      subtitle: `Суперник: ${splash.opponentName}`,
    };
  }
  if (splash.phase === "round_intro") {
    return { title: `РАУНД ${splash.round}`, subtitle: "Картки готові. Обери бійця." };
  }
  return { title: splash.title, subtitle: splash.subtitle };
}

export default BattleArena;
