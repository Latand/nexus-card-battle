"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import type { Card, Phase } from "@/features/battle/model/types";
import { MAX_ENERGY, MAX_HEALTH } from "@/features/battle/model/constants";
import { BattleCard } from "@/features/battle/ui/components/BattleCard";
import { ProjectileSprite } from "../effects/ProjectileSprite";
import { playSound } from "../effects/sound";

export type ClashOverlayProps = {
  open: boolean;
  /** Optional canonical phase passthrough, exposed as `data-phase`. */
  phase?: Phase;
  playerCard: Card;
  enemyCard: Card;
  playerAttack: number;
  enemyAttack: number;
  playerDamage: number;
  enemyDamage: number;
  /** Energy spent on each played card (shown as a gold chip). */
  playerEnergy: number;
  enemyEnergy: number;
  winner: "player" | "enemy" | "draw";
  /** Avatar URLs used to swap the loser's card during the impact frame. */
  playerAvatarUrl?: string;
  enemyAvatarUrl?: string;
  /**
   * Current player/enemy HP at the start of the clash (pre-damage). Used to
   * render the avatar plate's green HP pill row and to drive per-projectile
   * HUD HP decrement via `onProjectileImpact`.
   */
  playerHp?: number;
  enemyHp?: number;
  hpMax?: number;
  /** Fired when the projectile lands on the loser's avatar (drives HUD flash). */
  onImpact?: (loser: "player" | "enemy") => void;
  /**
   * Fired once for each projectile that lands during the barrage super-phase.
   * `index` is 1-based, `hpRemaining` is the HUD HP value the parent should
   * snap the loser HUD to (smooth HpBar transition takes it the rest of the
   * way). When all projectiles have landed the parent has the final HP.
   */
  onProjectileImpact?: (
    loser: "player" | "enemy",
    index: number,
    hpRemaining: number,
  ) => void;
  onDone: () => void;
};

type LocalPhase = "intro" | "fight" | "death" | "barrage" | "resolve";
type ProjectileSpec = {
  id: number;
  side: "player" | "enemy"; // which side fired (defender = the other)
  durationMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

const T_INTRO = 700; // both cards slide in
const T_EXCHANGE_MIN = 850; // single lunge cycle (slower so each blow lands)
const T_EXCHANGE_MAX = 1350;
const T_DEATH = 800; // shatter animation
const T_AVATAR_SWAP = 260; // crossfade card -> avatar plate
const T_PROJECTILE_FLIGHT_MIN = 380; // per-projectile flight time low end
const T_PROJECTILE_FLIGHT_MAX = 880; // per-projectile flight time high end
const T_PROJECTILE_INTERVAL_MIN = 110; // delay between consecutive launches low
const T_PROJECTILE_INTERVAL_MAX = 260; // delay between consecutive launches high
const T_RESOLVE = 520; // fade out tail

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Conservative upper bound used by callers that just want a "did the overlay
// finish?" timer fallback. The actual duration is data-driven and signalled
// via `onDone`.
export const CLASH_TOTAL_MS = 5000;

type Exchange = {
  /** Side that swings on this exchange. Defender = the other side. */
  attackerSide: "player" | "enemy";
  /** Damage dealt to defender's card-HP (0..100). */
  damage: number;
  /** Lunge duration in ms. */
  durationMs: number;
};

function buildExchanges(
  winnerSide: "player" | "enemy" | "draw",
): Exchange[] {
  const turns = randInt(5, 7); // alternating attacker → more turns than the old 3-5
  const list: Exchange[] = [];

  function dur() {
    return randInt(T_EXCHANGE_MIN, T_EXCHANGE_MAX);
  }

  if (winnerSide === "draw") {
    // Both cards survive ~70%. Alternate attacker each turn.
    let pTaken = 0;
    let eTaken = 0;
    const cap = 70;
    for (let i = 0; i < turns; i += 1) {
      const attacker: "player" | "enemy" = i % 2 === 0 ? "player" : "enemy";
      const defender = attacker === "player" ? "enemy" : "player";
      const remaining = defender === "player" ? cap - pTaken : cap - eTaken;
      if (remaining <= 0) continue;
      const dmg = Math.min(remaining, randInt(10, 22));
      if (defender === "player") pTaken += dmg;
      else eTaken += dmg;
      list.push({ attackerSide: attacker, damage: dmg, durationMs: dur() });
    }
    return list;
  }

  // Decisive winner: winner attacks ~60% of turns and totals 100 damage on the
  // loser; loser attacks the rest and totals 50..75 on the winner. Final blow
  // (attackerSide = winner) is reserved for the LAST exchange so the death
  // frame fires correctly.
  const loserSide: "player" | "enemy" = winnerSide === "player" ? "enemy" : "player";
  const winnerHits = Math.max(2, Math.ceil(turns * 0.6));
  const loserHits = Math.max(1, turns - winnerHits);
  const totalTurns = winnerHits + loserHits;

  // Build a roughly-alternating sequence of attacker roles, then bias so the
  // last entry is the winner.
  const roles: ("winner" | "loser")[] = [];
  let winnerRemaining = winnerHits;
  let loserRemaining = loserHits;
  for (let i = 0; i < totalTurns; i += 1) {
    if (winnerRemaining === 0) {
      roles.push("loser");
      loserRemaining -= 1;
    } else if (loserRemaining === 0) {
      roles.push("winner");
      winnerRemaining -= 1;
    } else if (Math.random() < winnerRemaining / (winnerRemaining + loserRemaining)) {
      roles.push("winner");
      winnerRemaining -= 1;
    } else {
      roles.push("loser");
      loserRemaining -= 1;
    }
  }
  // Ensure last entry is winner so loser dies on the final tick.
  if (roles[roles.length - 1] !== "winner") {
    for (let i = roles.length - 2; i >= 0; i -= 1) {
      if (roles[i] === "winner") {
        [roles[i], roles[roles.length - 1]] = [roles[roles.length - 1], roles[i]];
        break;
      }
    }
  }

  const loserDamageRolls = randomRolls(winnerHits, 100); // sums to 100
  const winnerDamageRolls = randomRolls(loserHits, randInt(50, 75)); // sums to 50..75
  let wIdx = 0;
  let lIdx = 0;
  for (const role of roles) {
    if (role === "winner") {
      list.push({
        attackerSide: winnerSide,
        damage: loserDamageRolls[wIdx],
        durationMs: dur(),
      });
      wIdx += 1;
    } else {
      list.push({
        attackerSide: loserSide,
        damage: winnerDamageRolls[lIdx],
        durationMs: dur(),
      });
      lIdx += 1;
    }
  }
  return list;
}

function randomRolls(count: number, total: number): number[] {
  // Generate `count` positive numbers summing to `total`, each between
  // ~15% and ~45% of the total to keep the pacing feeling chunky.
  const raw: number[] = [];
  for (let i = 0; i < count; i += 1) {
    raw.push(0.6 + Math.random()); // 0.6..1.6
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((v) => Math.round((v / sum) * total));
  // Fix rounding drift on the last entry.
  const drift = total - scaled.reduce((a, b) => a + b, 0);
  scaled[scaled.length - 1] = Math.max(0, scaled[scaled.length - 1] + drift);
  return scaled;
}

export function ClashOverlay({
  open,
  phase,
  playerCard,
  enemyCard,
  playerAttack,
  enemyAttack,
  playerDamage,
  enemyDamage,
  playerEnergy,
  enemyEnergy,
  winner,
  playerAvatarUrl,
  enemyAvatarUrl,
  playerHp = MAX_HEALTH,
  enemyHp = MAX_HEALTH,
  hpMax = MAX_HEALTH,
  onImpact,
  onProjectileImpact,
  onDone,
}: ClashOverlayProps) {
  const [localPhase, setLocalPhase] = useState<LocalPhase>("intro");
  const [exchangeIndex, setExchangeIndex] = useState(0);
  const [cardHp, setCardHp] = useState({ player: 100, enemy: 100 });
  const [playerJolt, setPlayerJolt] = useState(0);
  const [enemyJolt, setEnemyJolt] = useState(0);
  const [projectiles, setProjectiles] = useState<ProjectileSpec[]>([]);
  const [projectileImpacts, setProjectileImpacts] = useState(0);
  const projectileIdRef = useRef(0);
  const playerSlotRef = useRef<HTMLDivElement | null>(null);
  const enemySlotRef = useRef<HTMLDivElement | null>(null);

  function pushProjectile(side: "player" | "enemy", durationMs: number) {
    const fromEl = side === "player" ? playerSlotRef.current : enemySlotRef.current;
    const toEl = side === "player" ? enemySlotRef.current : playerSlotRef.current;
    if (!fromEl || !toEl) return;
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    // Center of source/target in viewport coords; projectile centered there.
    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height / 2;
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height / 2;
    const id = (projectileIdRef.current += 1);
    setProjectiles((list) => [...list, { id, side, durationMs, fromX, fromY, toX, toY }]);
  }

  const exchangesRef = useRef<Exchange[]>([]);
  // Snapshot the loser's HP at the moment the overlay opens so the avatar
  // pill count is stable even though the parent decrements its HUD HP via
  // `onProjectileImpact` mid-barrage.
  const initialPlayerHpRef = useRef(playerHp);
  const initialEnemyHpRef = useRef(enemyHp);
  const onDoneRef = useRef(onDone);
  const onImpactRef = useRef(onImpact);
  const onProjectileImpactRef = useRef(onProjectileImpact);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    onImpactRef.current = onImpact;
  }, [onImpact]);
  useEffect(() => {
    onProjectileImpactRef.current = onProjectileImpact;
  }, [onProjectileImpact]);

  const loserSide: "player" | "enemy" | null =
    winner === "player" ? "enemy" : winner === "enemy" ? "player" : null;
  const dmg = winner === "player" ? playerDamage : winner === "enemy" ? enemyDamage : 0;

  // Master timeline. Re-runs whenever the overlay opens or the clash payload
  // changes (a new round). All timeouts are tracked and cleared on cleanup.
  useEffect(() => {
    if (!open) {
      setLocalPhase("intro");
      setExchangeIndex(0);
      setCardHp({ player: 100, enemy: 100 });
      setPlayerJolt(0);
      setEnemyJolt(0);
      setProjectiles([]);
      setProjectileImpacts(0);
      projectileIdRef.current = 0;
      return;
    }

    initialPlayerHpRef.current = playerHp;
    initialEnemyHpRef.current = enemyHp;
    const exchanges = buildExchanges(winner);
    exchangesRef.current = exchanges;
    setExchangeIndex(0);
    setCardHp({ player: 100, enemy: 100 });
    setPlayerJolt(0);
    setEnemyJolt(0);
    setProjectiles([]);
    setProjectileImpacts(0);
    projectileIdRef.current = 0;
    setLocalPhase("intro");

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Phase 1: intro → fight loop.
    timeouts.push(
      setTimeout(() => {
        setLocalPhase("fight");
        runExchange(0);
      }, T_INTRO),
    );

    let runningCardHp = { player: 100, enemy: 100 };

    function runExchange(idx: number) {
      if (idx >= exchanges.length) {
        // Fight loop done. If there's a loser, kick off death; otherwise
        // skip directly to resolve (draw — no barrage either).
        if (loserSide === null) {
          timeouts.push(
            setTimeout(() => {
              setLocalPhase("resolve");
              timeouts.push(setTimeout(() => onDoneRef.current(), T_RESOLVE));
            }, 200),
          );
          return;
        }
        // Force the loser's card-HP to 0 on the final tick (for the visual
        // contract: shatter happens on the death frame).
        const finalHp =
          loserSide === "player"
            ? { player: 0, enemy: runningCardHp.enemy }
            : { player: runningCardHp.player, enemy: 0 };
        runningCardHp = finalHp;
        setCardHp(finalHp);
        timeouts.push(
          setTimeout(() => {
            setLocalPhase("death");
            playSound("death");
            timeouts.push(setTimeout(() => beginBarrage(), T_DEATH));
          }, 220),
        );
        return;
      }

      const ex = exchanges[idx];
      setExchangeIndex(idx);

      // ONE attacker per exchange. Defender takes ALL the damage on this turn,
      // jolts on impact, hears the hit sound. Other side does nothing this
      // tick — they'll get their turn on a future exchange.
      const attackerSide = ex.attackerSide;
      const defenderSide: "player" | "enemy" = attackerSide === "player" ? "enemy" : "player";
      const flight = randInt(T_PROJECTILE_FLIGHT_MIN, T_PROJECTILE_FLIGHT_MAX);
      const launchOffset = Math.round(ex.durationMs * 0.15);

      timeouts.push(
        setTimeout(() => {
          pushProjectile(attackerSide, flight);
        }, launchOffset),
      );

      // Apply card-HP delta + jolt + sound on PROJECTILE IMPACT (not on swing).
      timeouts.push(
        setTimeout(() => {
          const isLast = idx === exchanges.length - 1;
          if (defenderSide === "player") {
            let nextP = Math.max(0, runningCardHp.player - ex.damage);
            if (!isLast && nextP <= 0) nextP = Math.max(8, runningCardHp.player - 8);
            runningCardHp = { ...runningCardHp, player: nextP };
            setPlayerJolt((n) => n + 1);
          } else {
            let nextE = Math.max(0, runningCardHp.enemy - ex.damage);
            if (!isLast && nextE <= 0) nextE = Math.max(8, runningCardHp.enemy - 8);
            runningCardHp = { ...runningCardHp, enemy: nextE };
            setEnemyJolt((n) => n + 1);
          }
          setCardHp(runningCardHp);
          playSound("hit");
        }, launchOffset + flight),
      );

      timeouts.push(setTimeout(() => runExchange(idx + 1), ex.durationMs));
    }

    function beginBarrage() {
      if (loserSide === null) {
        setLocalPhase("resolve");
        timeouts.push(setTimeout(() => onDoneRef.current(), T_RESOLVE));
        return;
      }
      // Crossfade loser slot into avatar plate.
      timeouts.push(
        setTimeout(() => {
          setLocalPhase("barrage");
          onImpactRef.current?.(loserSide);
          // Fire N projectiles staggered.
          const startHp =
            loserSide === "player"
              ? initialPlayerHpRef.current
              : initialEnemyHpRef.current;
          const total = Math.max(0, dmg);
          const winnerSide: "player" | "enemy" = loserSide === "player" ? "enemy" : "player";
          let cursor = 0;
          let lastImpactAt = 0;
          for (let i = 0; i < total; i += 1) {
            const flight = randInt(T_PROJECTILE_FLIGHT_MIN, T_PROJECTILE_FLIGHT_MAX);
            const interval =
              i === 0 ? 0 : randInt(T_PROJECTILE_INTERVAL_MIN, T_PROJECTILE_INTERVAL_MAX);
            cursor += interval;
            const launchAt = cursor;
            const impactAt = launchAt + flight;
            if (impactAt > lastImpactAt) lastImpactAt = impactAt;
            timeouts.push(
              setTimeout(() => {
                pushProjectile(winnerSide, flight);
                playSound("projectileLaunch", 0.45);
              }, launchAt),
            );
            timeouts.push(
              setTimeout(() => {
                setProjectileImpacts((n) => n + 1);
                playSound("projectileImpact", 0.5);
                const remaining = Math.max(0, startHp - (i + 1));
                onProjectileImpactRef.current?.(loserSide, i + 1, remaining);
              }, impactAt),
            );
          }
          timeouts.push(
            setTimeout(
              () => {
                setLocalPhase("resolve");
                playSound("roundEnd", 0.4);
                timeouts.push(setTimeout(() => onDoneRef.current(), T_RESOLVE));
              },
              lastImpactAt + 380,
            ),
          );
        }, T_AVATAR_SWAP),
      );
    }

    return () => timeouts.forEach(clearTimeout);
    // We intentionally key the master timeline on the clash payload identity
    // (cards + winner) rather than every prop — re-running on hp prop change
    // would restart the animation mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playerCard.id, enemyCard.id, winner, dmg]);

  if (!open) return null;

  const op = playerAttack > enemyAttack ? ">" : playerAttack < enemyAttack ? "<" : "=";
  const winnerName =
    winner === "player" ? playerCard.name : winner === "enemy" ? enemyCard.name : "Нічия";
  const showNumbers = localPhase === "barrage" || localPhase === "resolve";
  const showAvatarSwap =
    loserSide !== null && (localPhase === "barrage" || localPhase === "resolve");
  const loserShattering = loserSide !== null && localPhase === "death";

  // Avatar plate HP pill count — drops as projectiles land. Use the snapshot
  // captured at overlay-open so the parent's HUD HP override (which the
  // overlay itself drives via `onProjectileImpact`) doesn't double-decrement.
  const loserStartHp =
    loserSide === "player"
      ? initialPlayerHpRef.current
      : loserSide === "enemy"
        ? initialEnemyHpRef.current
        : 0;
  const loserPillsRemaining = Math.max(0, loserStartHp - projectileImpacts);

  return (
    <div
      data-testid="clash-overlay"
      data-phase={phase ?? "battle_intro"}
      data-local-phase={localPhase}
      data-winner={winner}
      role="dialog"
      aria-modal="true"
      aria-label="Бій"
      className={cn(
        "fixed inset-0 z-50 grid place-items-center bg-black/72 backdrop-blur-sm",
        localPhase === "resolve"
          ? "animate-[fadeOut_400ms_ease-in_forwards]"
          : "animate-[fadeIn_220ms_ease-out]",
      )}
      style={{ animationFillMode: "both" }}
    >
      <div className="relative w-full max-w-[1080px] px-3 sm:px-10 flex flex-col items-center gap-4 sm:gap-5">
        {/* Headline */}
        <h1
          data-testid="clash-headline"
          className="font-bold uppercase tracking-[0.18em] text-[24px] sm:text-[32px] leading-none drop-shadow-[0_2px_24px_rgba(240,198,104,0.35)]"
          style={{ color: "#f0c668" }}
        >
          БІЙ
        </h1>

        {/* Cards row with sigil between */}
        <div
          data-testid="clash-stage"
          className="relative flex w-full items-center justify-center gap-4 md:gap-20"
        >
          <ClashSlot
            card={playerCard}
            energy={playerEnergy}
            side="player"
            cardHp={cardHp.player}
            showFightHp={localPhase === "fight" || localPhase === "death"}
            showAvatar={showAvatarSwap && loserSide === "player"}
            avatarUrl={playerAvatarUrl}
            avatarHpRemaining={loserSide === "player" ? loserPillsRemaining : undefined}
            avatarHpMax={hpMax}
            shattering={loserShattering && loserSide === "player"}
            lungeKey={playerJolt}
            slotRef={playerSlotRef}
            data-testid="clash-player-card"
          />

          <div className="relative flex flex-col items-center gap-2 min-w-[60px]">
            <span
              aria-hidden
              className={cn(
                "text-accent text-[22px] leading-none",
                localPhase === "fight" &&
                  "animate-[nexus-caption-pop_320ms_ease-out_both]",
              )}
              key={`sigil-${exchangeIndex}-${playerJolt + enemyJolt}`}
            >
              ✦
            </span>
            {showNumbers ? (
              <div
                data-testid="clash-attack-comparison"
                className="flex items-center gap-2 sm:gap-3 font-mono tabular-nums animate-[fadeIn_220ms_ease-out]"
              >
                <span
                  data-testid="clash-player-attack"
                  className={cn(
                    "inline-grid place-items-center min-w-[44px] h-9 px-2 rounded-md border bg-bg/60 text-[18px] sm:text-[20px]",
                    winner === "player"
                      ? "border-accent text-accent"
                      : "border-accent-quiet/60 text-ink-mute",
                  )}
                >
                  {playerAttack}
                </span>
                <span aria-hidden className="text-accent text-[18px] leading-none">
                  {op}
                </span>
                <span
                  data-testid="clash-enemy-attack"
                  className={cn(
                    "inline-grid place-items-center min-w-[44px] h-9 px-2 rounded-md border bg-bg/60 text-[18px] sm:text-[20px]",
                    winner === "enemy"
                      ? "border-accent text-accent"
                      : "border-accent-quiet/60 text-ink-mute",
                  )}
                >
                  {enemyAttack}
                </span>
              </div>
            ) : null}
          </div>

          <ClashSlot
            card={enemyCard}
            energy={enemyEnergy}
            side="enemy"
            cardHp={cardHp.enemy}
            showFightHp={localPhase === "fight" || localPhase === "death"}
            showAvatar={showAvatarSwap && loserSide === "enemy"}
            avatarUrl={enemyAvatarUrl}
            avatarHpRemaining={loserSide === "enemy" ? loserPillsRemaining : undefined}
            avatarHpMax={hpMax}
            shattering={loserShattering && loserSide === "enemy"}
            lungeKey={enemyJolt}
            slotRef={enemySlotRef}
            data-testid="clash-enemy-card"
          />

          {/* Projectile layer — fight-phase strikes + barrage. Sits above the
              card slots so projectiles pierce the card frame on impact. */}
          {projectiles.length > 0 ? <ProjectileLayer projectiles={projectiles} /> : null}
        </div>

        {/* Damage outcome banner — gated to barrage/resolve phases */}
        {showNumbers ? (
          <div
            className="mt-2 flex flex-col items-center gap-1 animate-[fadeIn_220ms_ease-out]"
            data-testid="clash-outcome"
          >
            {winner === "draw" ? (
              <span className="text-[13px] uppercase tracking-[0.18em] text-ink-mute">
                Нічия — обидва тримають удар
              </span>
            ) : (
              <>
                <span className="text-[12px] uppercase tracking-[0.18em] text-ink-mute">
                  Перемога раунду
                </span>
                <span className="text-[18px] sm:text-[22px] uppercase tracking-[0.08em] text-ink">
                  {winnerName}{" "}
                  <span className="text-danger font-mono tabular-nums ml-2">−{dmg}</span>
                </span>
              </>
            )}
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes clashIn { from { transform: translateX(-40px) scale(0.9); opacity: 0 } to { transform: translateX(0) scale(1); opacity: 1 } }
        @keyframes clashInRight { from { transform: translateX(40px) scale(0.9); opacity: 0 } to { transform: translateX(0) scale(1); opacity: 1 } }
      `}</style>
    </div>
  );
}

function ClashSlot({
  card,
  energy,
  side,
  cardHp,
  showFightHp,
  showAvatar,
  avatarUrl,
  avatarHpRemaining,
  avatarHpMax,
  shattering,
  lungeKey,
  slotRef,
  ...rest
}: {
  card: Card;
  energy: number;
  side: "player" | "enemy";
  cardHp: number;
  showFightHp: boolean;
  showAvatar: boolean;
  avatarUrl?: string;
  avatarHpRemaining?: number;
  avatarHpMax?: number;
  shattering: boolean;
  lungeKey: number;
  slotRef?: React.MutableRefObject<HTMLDivElement | null>;
  "data-testid"?: string;
}) {
  const lungeAnim =
    side === "player"
      ? "animate-[nexus-card-lunge-right_360ms_cubic-bezier(0.22,1,0.36,1)_both]"
      : "animate-[nexus-card-lunge-left_360ms_cubic-bezier(0.22,1,0.36,1)_both]";
  return (
    <div
      ref={slotRef}
      data-testid={rest["data-testid"]}
      data-card-hp={Math.round(cardHp)}
      data-shattering={shattering ? "true" : "false"}
      className={cn(
        "relative w-[120px] md:w-[180px] shrink-0",
        side === "player"
          ? "animate-[clashIn_420ms_cubic-bezier(0.22,1,0.36,1)]"
          : "animate-[clashInRight_420ms_cubic-bezier(0.22,1,0.36,1)]",
      )}
    >
      <div className="relative aspect-[2/3] w-full">
        {/* Card layer — lunges during fight, shatters on death. */}
        <div
          key={`lunge-${lungeKey}`}
          className={cn(
            "absolute inset-0 transition-opacity duration-200",
            showAvatar ? "opacity-0" : "opacity-100",
            !showAvatar && lungeKey > 0 && lungeAnim,
            shattering &&
              "animate-[nexus-card-shatter_460ms_cubic-bezier(0.5,0,0.75,0)_forwards]",
          )}
        >
          <BattleCard card={card} compact className="!w-full" />
        </div>

        {/* Avatar plate layer — replaces the (now shattered) card during the
            barrage so projectiles land on the loser's face. */}
        <div
          aria-hidden={!showAvatar}
          className={cn(
            "absolute inset-0 transition-opacity duration-200 grid place-items-center",
            showAvatar ? "opacity-100" : "opacity-0",
          )}
        >
          <AvatarPlate
            avatarUrl={avatarUrl}
            flash={showAvatar}
            hpRemaining={avatarHpRemaining}
            hpMax={avatarHpMax}
          />
        </div>

        {/* Card-HP pill row — shown during the fight super-phase only. */}
        {showFightHp ? <CardHpPillRow value={cardHp} side={side} /> : null}
      </div>

      <EnergyPillRow energy={energy} side={side} />
    </div>
  );
}

function AvatarPlate({
  avatarUrl,
  flash,
  hpRemaining,
  hpMax,
}: {
  avatarUrl?: string;
  flash?: boolean;
  hpRemaining?: number;
  hpMax?: number;
}) {
  return (
    <div
      data-testid="clash-avatar-plate"
      className={cn(
        "relative w-full h-full rounded-[10px] overflow-hidden",
        "bg-surface-raised border border-accent-quiet",
        flash && "shadow-[0_0_24px_rgba(217,112,86,0.55)]",
      )}
      style={
        avatarUrl
          ? {
              backgroundImage: `url(${avatarUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {!avatarUrl ? (
        <div className="grid place-items-center w-full h-full text-accent/60 text-[64px]">★</div>
      ) : null}
      {flash ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle,rgba(217,112,86,0.45),transparent_70%)] animate-[fadeIn_180ms_ease-out]"
        />
      ) : null}
      {typeof hpRemaining === "number" && typeof hpMax === "number" ? (
        <AvatarHpPillRow value={hpRemaining} max={hpMax} />
      ) : null}
    </div>
  );
}

/**
 * Card-HP row used during super-phase 1 (cards fighting). Renders 10 pill
 * segments and fills the prefix proportional to the 0..100 card-HP value.
 */
function CardHpPillRow({ value, side }: { value: number; side: "player" | "enemy" }) {
  const segments = 10;
  const filledExact = (Math.max(0, Math.min(100, value)) / 100) * segments;
  return (
    <div
      data-testid={
        side === "player" ? "clash-player-card-hp" : "clash-enemy-card-hp"
      }
      data-value={Math.round(value)}
      className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-[2px] rounded-md px-1 py-[2px] shadow-[0_4px_10px_rgba(0,0,0,0.55)] backdrop-blur-sm"
      style={{
        backgroundColor: "rgba(20,22,26,0.88)",
        border: "1px solid #5b3a2a",
      }}
      aria-hidden
    >
      {Array.from({ length: segments }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, filledExact - i));
        return (
          <span
            key={i}
            aria-hidden
            className="block h-[5px] w-[8px] rounded-[2px] transition-[background-color,opacity] duration-200"
            style={
              fill > 0
                ? {
                    backgroundColor: "#d97056",
                    opacity: 0.4 + fill * 0.6,
                    boxShadow:
                      "inset 0 1px 0 rgba(255,200,170,0.55), 0 0 4px rgba(217,112,86,0.55)",
                  }
                : {
                    backgroundColor: "transparent",
                    border: "1px solid #5b3a2a",
                  }
            }
          />
        );
      })}
    </div>
  );
}

/**
 * Real-HP pill row rendered on the avatar plate during super-phase 2.
 * Mirrors the gold energy-pill style but uses the same green as `HpBar`
 * so it visually parallels the persistent HUD HP strip.
 */
function AvatarHpPillRow({ value, max }: { value: number; max: number }) {
  const total = Math.max(1, max);
  const filled = Math.max(0, Math.min(total, value));
  return (
    <div
      data-testid="clash-avatar-hp"
      data-value={filled}
      className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 flex items-center gap-[2px] rounded-md px-1 py-[2px] shadow-[0_4px_10px_rgba(0,0,0,0.55)] backdrop-blur-sm"
      style={{
        backgroundColor: "rgba(20,22,26,0.88)",
        border: "1px solid #2c4427",
      }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isFilled = i < filled;
        return (
          <span
            key={i}
            aria-hidden
            className="block h-[4px] w-[10px] rounded-[2px] transition-colors duration-200"
            style={
              isFilled
                ? {
                    backgroundColor: "#6ba35f",
                    boxShadow:
                      "inset 0 1px 0 rgba(220,255,200,0.55), 0 0 4px rgba(107,163,95,0.55)",
                  }
                : {
                    backgroundColor: "transparent",
                    border: "1px solid #2c4427",
                  }
            }
          />
        );
      })}
    </div>
  );
}

function ProjectileLayer({ projectiles }: { projectiles: ProjectileSpec[] }) {
  // Fixed-positioned overlay so children use viewport coords from
  // getBoundingClientRect (the source of fromX/fromY/toX/toY in ProjectileSpec).
  return (
    <div
      data-testid="clash-projectiles"
      className="pointer-events-none fixed inset-0 z-[60] overflow-visible"
    >
      {projectiles.map((p, index) => (
        <ProjectileFlight key={p.id} spec={p} kind={(index % 6) + 1} />
      ))}
    </div>
  );
}

function ProjectileFlight({ spec, kind }: { spec: ProjectileSpec; kind: number }) {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    // Flip on the next frame so the browser commits the from-position first
    // and animates the transform smoothly to the to-position.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setArrived(true)),
    );
    return () => cancelAnimationFrame(id);
  }, []);
  const dx = spec.toX - spec.fromX;
  const dy = spec.toY - spec.fromY;
  const direction: 1 | -1 = spec.side === "player" ? -1 : 1;
  const size = 30 + (spec.id % 4) * 6;
  // Slight vertical arc via small midpoint offset (simulates throwing arc).
  // We achieve it with two CSS variables, but a single straight transition is
  // visually fine for the speed range. Keep it simple.
  return (
    <i
      data-testid="attack-projectile"
      data-projectile-side={spec.side}
      className="absolute opacity-100"
      style={{
        left: `${spec.fromX - size / 2}px`,
        top: `${spec.fromY - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        transform: arrived ? `translate(${dx}px, ${dy}px) rotate(${direction * 540}deg)` : "translate(0, 0) rotate(0deg)",
        opacity: arrived ? 0.05 : 1,
        transition: `transform ${spec.durationMs}ms cubic-bezier(0.22, 0.65, 0.35, 1), opacity ${spec.durationMs}ms ease-in`,
        willChange: "transform, opacity",
      }}
    >
      <ProjectileSprite kind={kind} direction={direction} scale={1.05} />
    </i>
  );
}

function EnergyPillRow({ energy, side }: { energy: number; side: "player" | "enemy" }) {
  const total = MAX_ENERGY;
  const filled = Math.max(0, Math.min(total, Math.round(energy)));
  return (
    <div
      data-testid={side === "player" ? "clash-player-energy" : "clash-enemy-energy"}
      data-energy={filled}
      className="absolute -bottom-7 left-1/2 -translate-x-1/2 z-10 flex items-center gap-[2px] rounded-md px-1 py-[2px] shadow-[0_4px_10px_rgba(0,0,0,0.55)] backdrop-blur-sm"
      style={{
        backgroundColor: "rgba(20,22,26,0.85)",
        border: "1px solid #6b5a31",
      }}
      aria-label={`Енергія витрачено: ${filled} з ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isFilled = i < filled;
        return (
          <span
            key={i}
            aria-hidden
            className="block h-[4px] w-[8px] rounded-[2px]"
            style={
              isFilled
                ? {
                    backgroundColor: "#f0c668",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,240,180,0.55), 0 0 4px rgba(240,198,104,0.55)",
                  }
                : {
                    backgroundColor: "transparent",
                    border: "1px solid #6b5a31",
                  }
            }
          />
        );
      })}
    </div>
  );
}

export default ClashOverlay;
