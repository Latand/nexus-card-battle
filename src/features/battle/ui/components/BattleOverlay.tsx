import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import { BASE_ATTACK_ENERGY, DAMAGE_THROWS_CAP, MAX_HEALTH } from "../../model/constants";
import { hasApplicableAbilityEffect, isAbilityBlocked } from "../../model/game";
import type { Clash, Fighter, Outcome, Phase, ResolvedEffect, Side } from "../../model/types";
import { BattleCard } from "./BattleCard";
import { ProjectileSprite } from "./ProjectileSprite";
import { ResourcePills } from "./ResourceCounter";

export function BattleOverlay({
  outcome,
  player,
  enemy,
  phase,
}: {
  outcome: Outcome;
  player: Fighter;
  enemy: Fighter;
  phase: Phase;
}) {
  const { clash } = outcome;
  const isDamage = phase === "damage_apply";
  const playerHp = isDamage ? outcome.nextPlayer.hp : player.hp;
  const enemyHp = isDamage ? outcome.nextEnemy.hp : enemy.hp;
  const attackMax = Math.max(clash.playerAttack, clash.enemyAttack, 1);
  const loser: Side = clash.loser;
  const isFinisher = isDamage && (loser === "player" ? outcome.nextPlayer.hp <= 0 : outcome.nextEnemy.hp <= 0);
  const revealAttack = phase === "damage_apply";
  const playerTakesRealDamage = isDamage && loser === "player";
  const enemyTakesRealDamage = isDamage && loser === "enemy";
  const playerAbilityBlocked = isAbilityBlocked(clash.playerCard, hasControlEffect(clash.effects, "player"), {
    owner: player,
    opponent: enemy,
    opponentCard: clash.enemyCard,
    opponentEnergyBid: clash.enemyEnergy,
  });
  const enemyAbilityBlocked = isAbilityBlocked(clash.enemyCard, hasControlEffect(clash.effects, "enemy"), {
    owner: enemy,
    opponent: player,
    opponentCard: clash.playerCard,
    opponentEnergyBid: clash.playerEnergy,
  });
  const playerAbilityActive = !playerAbilityBlocked && hasApplicableAbilityEffect(clash.playerCard, {
    owner: player,
    opponent: enemy,
    opponentCard: clash.enemyCard,
    opponentEnergyBid: clash.enemyEnergy,
  });
  const enemyAbilityActive = !enemyAbilityBlocked && hasApplicableAbilityEffect(clash.enemyCard, {
    owner: enemy,
    opponent: player,
    opponentCard: clash.playerCard,
    opponentEnergyBid: clash.playerEnergy,
  });
  const playerBonusVisible = isCopyClanBonusResolved(clash.playerCard, player.hand);
  const enemyBonusVisible = isCopyClanBonusResolved(clash.enemyCard, enemy.hand);

  return (
    <section
      className="fixed inset-0 z-40 grid place-items-center bg-[#05080b] p-3 max-[760px]:p-2"
      data-testid="battle-overlay"
      data-phase={phase}
      data-winner={clash.winner}
    >
      <div className="battle-overlay-stage relative min-h-[min(640px,94vh)] w-[min(980px,96vw)] overflow-hidden rounded-md border-2 border-[#d6a03b]/75 bg-[linear-gradient(180deg,rgba(5,8,11,0.1),rgba(5,8,11,0.4)),url('/nexus-assets/backgrounds/arena-bar-1024x576.png')] bg-cover bg-center shadow-[0_0_0_1px_rgba(0,0,0,0.9),0_28px_90px_rgba(0,0,0,0.78),inset_0_0_90px_rgba(0,0,0,0.48)] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_48%,transparent_0_32%,rgba(0,0,0,0.48)_76%),linear-gradient(90deg,rgba(255,55,55,0.12),transparent_28%_72%,rgba(255,212,86,0.12))] before:content-[''] max-[960px]:min-h-[min(580px,94vh)] max-[760px]:min-h-[min(560px,94vh)]">
        <div className="absolute left-[18px] top-[18px] z-[3] w-[min(270px,36%)] max-[960px]:w-[calc(50%_-_34px)] max-[760px]:left-2.5 max-[760px]:top-2.5 max-[620px]:w-[calc(50%_-_18px)]">
          <DuelStatus
            align="left"
            cardEnergy={clash.playerEnergy}
            attack={clash.playerAttack}
            attackMax={attackMax}
            revealAttack={revealAttack}
          />
        </div>
        <div className="absolute right-[18px] top-[18px] z-[3] w-[min(270px,36%)] max-[960px]:w-[calc(50%_-_34px)] max-[760px]:right-2.5 max-[760px]:top-2.5 max-[620px]:w-[calc(50%_-_18px)]">
          <DuelStatus
            align="right"
            cardEnergy={clash.enemyEnergy}
            attack={clash.enemyAttack}
            attackMax={attackMax}
            revealAttack={revealAttack}
          />
        </div>

        {phase === "battle_intro" ? (
          <div className="absolute left-1/2 top-[42%] z-[4] w-[min(260px,52vw)] -translate-x-1/2 -translate-y-1/2">
            <Image src="/nexus-assets/banners/battle.png" alt="Бой" width={240} height={104} className="h-auto w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.7)]" priority />
          </div>
        ) : null}

        {isDamage ? <DuelResult clash={clash} player={player} enemy={enemy} finisher={isFinisher} /> : null}

        <div className="duel-grid absolute inset-[100px_26px_82px] z-[2] grid grid-cols-[minmax(150px,220px)_minmax(220px,1fr)_minmax(150px,220px)] items-end gap-[18px] max-[960px]:inset-[102px_18px_82px] max-[960px]:grid-cols-[minmax(132px,190px)_minmax(180px,1fr)_minmax(132px,190px)] max-[760px]:inset-[112px_10px_78px] max-[760px]:grid-cols-[minmax(96px,140px)_minmax(110px,1fr)_minmax(96px,140px)] max-[760px]:gap-2 max-[620px]:grid-cols-[92px_minmax(86px,1fr)_92px]">
          <div
            className={cn(
              "grid origin-bottom justify-items-center self-end justify-self-start animate-[nexus-duel-enter-left_320ms_ease_both] [&_.compact]:min-h-[292px] [&_.compact]:w-[min(214px,22vw)] max-[960px]:[&_.compact]:min-h-[270px] max-[960px]:[&_.compact]:w-[min(184px,21vw)] max-[760px]:[&_.compact]:min-h-[230px] max-[760px]:[&_.compact]:w-[min(136px,27vw)] max-[620px]:[&_.compact]:min-h-[184px] max-[620px]:[&_.compact]:w-[92px]",
              loser === "player" && isDamage && "animate-[nexus-taking-hit_620ms_ease_both]",
            )}
          >
            <DuelCombatant
              fighter={player}
              health={playerHp}
              card={clash.playerCard}
              showAvatar={playerTakesRealDamage}
              damage={clash.damage}
              side="player"
              dimmed={isDamage && !playerTakesRealDamage}
              abilityActive={playerAbilityActive}
              bonusVisible={playerBonusVisible}
            />
          </div>

          {isDamage ? <DuelProjectiles clash={clash} finisher={isFinisher} /> : <div className="min-h-80" />}

          <div
            className={cn(
              "grid origin-bottom justify-items-center self-end justify-self-end animate-[nexus-duel-enter-right_320ms_ease_both] [&_.compact]:min-h-[292px] [&_.compact]:w-[min(214px,22vw)] max-[960px]:[&_.compact]:min-h-[270px] max-[960px]:[&_.compact]:w-[min(184px,21vw)] max-[760px]:[&_.compact]:min-h-[230px] max-[760px]:[&_.compact]:w-[min(136px,27vw)] max-[620px]:[&_.compact]:min-h-[184px] max-[620px]:[&_.compact]:w-[92px]",
              loser === "enemy" && isDamage && "animate-[nexus-taking-hit_620ms_ease_both]",
            )}
          >
            <DuelCombatant
              fighter={enemy}
              health={enemyHp}
              card={clash.enemyCard}
              showAvatar={enemyTakesRealDamage}
              damage={clash.damage}
              side="enemy"
              dimmed={isDamage && !enemyTakesRealDamage}
              abilityActive={enemyAbilityActive}
              bonusVisible={enemyBonusVisible}
            />
          </div>
        </div>

        <div className="duel-effects-strip pointer-events-none absolute bottom-[18px] left-1/2 z-[5] grid max-w-[min(640px,86vw)] -translate-x-1/2 justify-items-center gap-1 max-[620px]:bottom-3">
          <EffectList effects={clash.effects} />
        </div>
      </div>
    </section>
  );
}

function isCopyClanBonusResolved(card: Clash["playerCard"], hand: Clash["playerCard"][]) {
  const copyEffects = card.bonus.effects.filter((effect) => effect.key === "copy-clan-bonus");
  if (copyEffects.length === 0) return true;

  return copyEffects.some((effect) => effect.copyClan && hand.some((handCard) => handCard.clan === effect.copyClan));
}

function hasControlEffect(effects: ResolvedEffect[], target: Side) {
  return effects.some((effect) => effect.id === "stop-opponent-ability" && effect.target === target);
}

function DuelStatus({
  align,
  cardEnergy,
  attack,
  attackMax,
  revealAttack,
}: {
  align: "left" | "right";
  cardEnergy: number;
  attack: number;
  attackMax: number;
  revealAttack: boolean;
}) {
  const effectiveEnergy = Math.max(BASE_ATTACK_ENERGY, cardEnergy + BASE_ATTACK_ENERGY);

  return (
    <article
      className={cn(
        "grid w-[min(210px,100%)] gap-1 rounded-sm border border-white/12 bg-black/38 px-2 py-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[2px] max-[620px]:gap-0.5 max-[620px]:px-1.5 max-[620px]:py-1",
        align === "right" && "ml-auto",
      )}
    >
      <DuelPillRun label="Енергія" value={effectiveEnergy} max={effectiveEnergy} tone="energy" slots={effectiveEnergy} />
      {revealAttack ? <DuelPillRun label="Сила удару" value={attack} max={attackMax} tone="attack" emphasis={attack === attackMax} /> : null}
    </article>
  );
}

function DuelPillRun({
  label,
  value,
  max,
  slots,
  tone,
  emphasis = false,
}: {
  label: string;
  value: number;
  max: number;
  slots?: number;
  tone: "energy" | "attack";
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid min-h-[14px] grid-cols-[16px_minmax(0,1fr)_24px] items-center gap-1.5 max-[620px]:grid-cols-[12px_minmax(0,1fr)_20px] max-[620px]:gap-1",
        emphasis && "drop-shadow-[0_0_10px_rgba(78,211,244,0.34)]",
      )}
      aria-label={`${label}: ${value}`}
      title={`${label}: ${value}`}
    >
      <DuelToneMark tone={tone} compact />
      <ResourcePills value={value} max={max} tone={tone} dense slots={slots ?? 12} />
      <strong className="text-right text-[11px] font-black leading-none text-[#fff8df] [text-shadow:0_1px_0_#000] max-[620px]:text-[9px]">{Math.max(0, value)}</strong>
    </div>
  );
}

function DuelResult({
  clash,
  player,
  enemy,
  finisher,
}: {
  clash: Clash;
  player: Fighter;
  enemy: Fighter;
  finisher: boolean;
}) {
  const winnerAttack = clash.winner === "player" ? clash.playerAttack : clash.enemyAttack;
  const loserAttack = clash.winner === "player" ? clash.enemyAttack : clash.playerAttack;
  const winnerName = clash.winner === "player" ? player.name : enemy.name;
  const loserName = clash.loser === "player" ? player.name : enemy.name;

  return (
    <div className="pointer-events-none absolute left-1/2 top-[54%] z-[5] grid -translate-x-1/2 -translate-y-1/2 justify-items-center gap-1 text-center max-[760px]:top-[55%] max-[620px]:top-[57%]">
      <div className="flex items-baseline gap-2 px-3 py-1.5 drop-shadow-[0_10px_22px_rgba(0,0,0,0.5)] max-[620px]:gap-1.5 max-[620px]:px-1">
        <strong className="text-[clamp(38px,6vw,62px)] font-black leading-none text-[#f7ffff] [text-shadow:0_2px_0_#062b38,0_0_18px_rgba(73,213,244,0.52),0_0_32px_rgba(0,0,0,0.72)]">
          {winnerAttack}
        </strong>
        <b className="text-[clamp(22px,4vw,38px)] font-black leading-none text-[#ffe08a] [text-shadow:0_1px_0_#000]">&gt;</b>
        <span className="text-[clamp(24px,4.4vw,42px)] font-black leading-none text-[#9cb3b8] [text-shadow:0_1px_0_#000]">{loserAttack}</span>
      </div>
      <span className="rounded-full border border-white/10 bg-black/36 px-2.5 py-1 text-[10px] font-black uppercase leading-none text-[#fff1b9] shadow-[0_6px_14px_rgba(0,0,0,0.3)] max-[620px]:px-2 max-[620px]:text-[8px]">
        {finisher ? "Останній удар" : `${winnerName} -> ${loserName}`}
      </span>
    </div>
  );
}

function DuelCombatant({
  fighter,
  health,
  card,
  showAvatar,
  damage,
  side,
  dimmed,
  abilityActive,
  bonusVisible,
}: {
  fighter: Fighter;
  health: number;
  card: Clash["playerCard"];
  showAvatar: boolean;
  damage: number;
  side: Side;
  dimmed: boolean;
  abilityActive: boolean;
  bonusVisible: boolean;
}) {
  if (showAvatar) return <FighterImpactAvatar fighter={fighter} health={health} damage={damage} side={side} />;

  return (
    <div className={cn("relative transition-[filter,opacity,transform] duration-300", dimmed && "scale-[0.94] opacity-55 brightness-75 saturate-[0.7]")}>
      <BattleCard card={card} compact abilityActive={abilityActive} bonusVisible={bonusVisible} />
    </div>
  );
}

function FighterImpactAvatar({ fighter, health, damage, side }: { fighter: Fighter; health: number; damage: number; side: Side }) {
  return (
    <article
      className="compact duel-avatar relative grid min-h-[292px] w-[min(214px,22vw)] place-items-center overflow-visible rounded-none p-[7%]"
      aria-label={`${fighter.name} отримує урон`}
      data-testid={`duel-avatar-${fighter.id}`}
    >
      <div className="relative aspect-square w-[92%] overflow-hidden rounded-full border-[3px] border-[#ffe08a]/80 bg-black shadow-[0_0_0_6px_rgba(0,0,0,0.36),0_0_38px_rgba(255,224,138,0.34),inset_0_0_0_4px_rgba(0,0,0,0.5)] max-[620px]:w-[96%] max-[620px]:border-2">
        <Image src={fighter.avatarUrl} alt="" fill sizes="220px" className="object-cover" />
        <i className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_0_38%,rgba(255,42,44,0.28)_62%,rgba(255,42,44,0.58)_100%)] mix-blend-screen" aria-hidden="true" />
      </div>
      <b
        className={cn(
          "absolute left-1/2 top-[9%] z-[2] -translate-x-1/2 rounded-sm border border-[#ffd6c9]/55 bg-[linear-gradient(180deg,#ff554d,#941b19)] px-2.5 py-1 text-[clamp(18px,3.3vw,28px)] font-black leading-none text-[#fff5dc] shadow-[0_8px_18px_rgba(0,0,0,0.5),0_0_18px_rgba(255,64,48,0.42)] [text-shadow:0_2px_0_rgba(0,0,0,0.38)] max-[620px]:px-1.5 max-[620px]:text-[15px]",
          side === "player" ? "rotate-[-3deg]" : "rotate-[3deg]",
        )}
      >
        -{damage}
      </b>
      <div className="absolute inset-x-[7%] bottom-[9%] grid grid-cols-[minmax(0,1fr)_24px] items-center gap-1 rounded-sm border border-white/12 bg-black/70 px-1.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] max-[620px]:grid-cols-[minmax(0,1fr)_18px] max-[620px]:px-1">
        <ResourcePills value={health} max={MAX_HEALTH} tone="health" dense />
        <b className="text-center text-[10px] font-black leading-none text-[#dfffce] [text-shadow:0_1px_0_#000] max-[620px]:text-[8px]">{Math.max(0, health)}</b>
      </div>
    </article>
  );
}

function EffectList({ effects }: { effects: ResolvedEffect[] }) {
  const visibleEffects = effects.slice(-5);

  if (visibleEffects.length === 0) return null;

  return (
    <div className="flex max-w-[620px] flex-wrap justify-center gap-1 justify-self-center pt-1" data-testid="battle-effects">
      {visibleEffects.map((effect, index) => (
        <span
          key={`${effect.id ?? effect.label}-${index}`}
          className={cn(
            "max-w-[190px] truncate rounded-sm border px-1.5 py-1 text-[10px] font-black uppercase leading-none",
            effect.stat === "status"
              ? "border-[#ffe08a]/45 bg-[#49370e]/78 text-[#ffe9a8]"
              : "border-white/12 bg-white/8 text-[#f4e7c4]",
          )}
          title={`${effect.source}: ${effect.label}`}
        >
          {effect.target ? `${effect.target === "player" ? "Гравець" : "Суперник"}: ` : ""}
          {effect.label}
          {effect.value !== undefined ? ` ${formatSigned(effect.value)}` : ""}
        </span>
      ))}
    </div>
  );
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function DuelToneMark({ tone, compact = false }: { tone: "health" | "energy" | "attack"; compact?: boolean }) {
  return (
    <span
      className={cn(
        "mx-auto rounded-[2px] border shadow-[0_0_9px_rgba(0,0,0,0.62)]",
        compact ? "h-[10px] w-[14px]" : "h-[9px] w-[22px] max-[760px]:w-[18px] max-[620px]:hidden",
        tone === "attack"
          ? "border-[#91efff]/80 bg-[linear-gradient(180deg,#bdf8ff,#168bad)]"
          : tone === "energy"
            ? "border-[#ffe08a]/70 bg-[linear-gradient(180deg,#fff08a,#c88613)]"
            : "border-[#9dff63]/70 bg-[linear-gradient(180deg,#bbff83,#21a72d)]",
      )}
      aria-hidden="true"
      title={labelForTone(tone)}
    />
  );
}

function labelForTone(tone: "health" | "energy" | "attack") {
  if (tone === "attack") return "Сила удару";
  if (tone === "energy") return "Енергія";
  return "Життя";
}

function DuelProjectiles({ clash, finisher }: { clash: Clash; finisher: boolean }) {
  const throws = Math.min(DAMAGE_THROWS_CAP, clash.damage);

  return (
    <div className="relative min-h-80 self-stretch overflow-visible max-[760px]:min-h-[260px]" aria-hidden="true">
      {Array.from({ length: throws }).map((_, index) => (
        <DuelProjectile key={`${clash.round}-hit-${index}`} from={clash.winner} index={index} kind={(index + 1) % 4} mode="damage" />
      ))}
      {finisher ? <DuelProjectile from={clash.winner} index={throws + 1} kind={4} mode="finish" /> : null}
    </div>
  );
}

function DuelProjectile({
  from,
  index,
  kind,
  mode,
}: {
  from: Side;
  index: number;
  kind: number;
  mode: "damage" | "finish";
}) {
  const size = mode === "finish" ? 104 : 58 + (index % 3) * 12;
  const direction = from === "player" ? 1 : -1;

  return (
    <i
      className={cn(
        "absolute block opacity-0 drop-shadow-[0_7px_6px_rgba(0,0,0,0.55)] [animation-fill-mode:both] [animation-iteration-count:1] [animation-timing-function:cubic-bezier(0.18,0.86,0.26,1)]",
        from === "player" ? "animate-[nexus-duel-throw-player_var(--duration)_var(--delay)_both]" : "animate-[nexus-duel-throw-enemy_var(--duration)_var(--delay)_both]",
        mode === "finish" && "z-[2]",
      )}
      style={
        {
          "--duration": mode === "damage" ? "820ms" : "1120ms",
          "--delay": mode === "damage" ? `${index * 240}ms` : "420ms",
          width: `${size}px`,
          height: `${size}px`,
          top: `calc(34% + ${(index % 5) * 18}px)`,
          left: "calc(50% - 20px)",
        } as CSSProperties
      }
    >
      <ProjectileSprite kind={kind} direction={direction} scale={mode === "finish" ? 1.18 : 1} />
    </i>
  );
}
