import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import { DAMAGE_THROWS_CAP, MAX_ENERGY, MAX_HEALTH } from "../../model/constants";
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
  const loserCard = loser === "player" ? clash.playerCard : clash.enemyCard;
  const damageTarget = loser === "player" ? player.name : enemy.name;
  const statusText = getStatusText(phase, clash, isFinisher, loserCard.name, damageTarget);
  const phaseLabel = getPhaseLabel(phase, isFinisher);
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
        <div className="absolute left-[18px] top-[18px] z-[3] w-[min(390px,42%)] max-[960px]:w-[calc(50%_-_28px)] max-[760px]:top-2.5 max-[620px]:w-[calc(50%_-_16px)]">
          <DuelStatus
            cardEnergy={clash.playerEnergy}
            attack={clash.playerAttack}
            attackMax={attackMax}
            revealAttack={revealAttack}
          />
        </div>
        <div className="absolute right-[18px] top-[18px] z-[3] w-[min(390px,42%)] max-[960px]:w-[calc(50%_-_28px)] max-[760px]:top-2.5 max-[620px]:w-[calc(50%_-_16px)]">
          <DuelStatus
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
              abilityActive={enemyAbilityActive}
              bonusVisible={enemyBonusVisible}
            />
          </div>
        </div>

        <div className="duel-caption absolute bottom-[22px] left-1/2 z-[3] grid min-w-[min(460px,78vw)] -translate-x-1/2 gap-1 rounded border-2 border-[#d6a03b]/60 bg-black/78 px-[18px] py-[11px] text-center shadow-[0_8px_24px_rgba(0,0,0,0.58)] max-[620px]:bottom-3.5 max-[620px]:px-2.5 max-[620px]:py-2">
          {phaseLabel ? <strong className="text-sm uppercase text-[#ffe08a]">{phaseLabel}</strong> : null}
          <span className="text-2xl font-black leading-none text-[#fff8df] max-[960px]:text-xl max-[620px]:text-[17px]">{statusText}</span>
          <EffectList effects={clash.effects} />
        </div>
      </div>
    </section>
  );
}

function getStatusText(phase: Phase, clash: Clash, isFinisher: boolean, loserCardName: string, damageTarget: string) {
  if (phase === "battle_intro") return `Енергія: ${clash.playerEnergy} проти ${clash.enemyEnergy}`;

  const winnerCardName = clash.winner === "player" ? clash.playerCard.name : clash.enemyCard.name;
  const winnerAttack = clash.winner === "player" ? clash.playerAttack : clash.enemyAttack;
  const loserAttack = clash.winner === "player" ? clash.enemyAttack : clash.playerAttack;
  const damageText = isFinisher
    ? `${loserCardName} вибуває: ${clash.damage} урону для ${damageTarget}`
    : `${damageTarget} отримує ${clash.damage} урону`;

  return `${winnerCardName} перемагає: ${winnerAttack} проти ${loserAttack}; ${damageText}`;
}

function isCopyClanBonusResolved(card: Clash["playerCard"], hand: Clash["playerCard"][]) {
  const copyEffects = card.bonus.effects.filter((effect) => effect.key === "copy-clan-bonus");
  if (copyEffects.length === 0) return true;

  return copyEffects.some((effect) => effect.copyClan && hand.some((handCard) => handCard.clan === effect.copyClan));
}

function hasControlEffect(effects: ResolvedEffect[], target: Side) {
  return effects.some((effect) => effect.id === "stop-opponent-ability" && effect.target === target);
}

function getPhaseLabel(phase: Phase, isFinisher: boolean) {
  if (phase === "battle_intro") return "";
  if (isFinisher) return "Останній удар";
  return "Урон";
}

function getVirtualCardLife(clash: Clash, phase: Phase, side: Side) {
  const ownAttack = side === "player" ? clash.playerAttack : clash.enemyAttack;
  const rivalAttack = side === "player" ? clash.enemyAttack : clash.playerAttack;

  if (phase !== "damage_apply") return ownAttack;
  if (clash.winner !== side) return 0;

  return Math.max(1, ownAttack - rivalAttack);
}

function DuelStatus({
  fighter,
  cardName,
  cardLife,
  cardLifeMax,
  cardEnergy,
  attack,
  revealAttack,
  humanHp,
  statuses,
}: {
  fighter: Fighter;
  cardName: string;
  cardLife: number;
  cardLifeMax: number;
  cardEnergy: number;
  attack: number;
  revealAttack: boolean;
  humanHp: number;
  statuses: Fighter["statuses"];
}) {
  return (
    <article className="grid gap-[5px] border-2 border-[#c7ccd1] bg-[linear-gradient(180deg,#444c50,#16191c_48%,#08090b),repeating-linear-gradient(135deg,rgba(255,255,255,0.12)_0_1px,transparent_1px_8px)] p-1.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.7),0_8px_22px_rgba(0,0,0,0.52)] max-[760px]:p-[5px]">
      <strong className="grid min-h-[18px] place-items-center text-[13px] font-black uppercase leading-none text-[#f3f3f3] [text-shadow:0_1px_0_#000] max-[760px]:text-[11px]">
        {fighter.name}
      </strong>
      {revealAttack ? <DuelBar label="Карта" value={cardLife} max={cardLifeMax} tone="health" slots={12} /> : null}
      <div className="grid grid-cols-3 gap-1 max-[760px]:grid-cols-2 [&>span:last-child]:max-[760px]:col-span-full">
        <span className={duelNumber()}>{cardName}</span>
        <span className={duelNumber()}>HP {humanHp}</span>
        <span className={duelNumber()}>{revealAttack ? `Атака ${attack}` : "Атака ?"}</span>
      </div>
      <StatusBadges statuses={statuses} compact />
      <DuelBar label="Енергія" value={cardEnergy} max={MAX_ENERGY} tone="energy" />
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

function DuelBar({
  label,
  value,
  max,
  tone,
  slots,
}: {
  label: string;
  value: number;
  max: number;
  tone: "health" | "energy";
  slots?: number;
}) {
  return (
    <div className="relative grid min-h-[18px] grid-cols-[54px_minmax(0,1fr)_28px] items-center gap-1.5 max-[760px]:grid-cols-[38px_minmax(0,1fr)_22px] max-[620px]:grid-cols-[minmax(0,1fr)_20px]">
      <span className="text-[10px] font-black uppercase text-[#fff7d6] [text-shadow:0_1px_0_#000] max-[620px]:hidden">{label}</span>
      <ResourcePills value={value} max={max} tone={tone} dense slots={slots} />
      <b className="text-[10px] font-black uppercase text-[#fff7d6] [text-shadow:0_1px_0_#000]">{value}</b>
    </div>
  );
}

function duelNumber() {
  return "grid min-h-[18px] place-items-center border border-white/15 bg-black/35 text-[10px] font-black uppercase text-[#fff7d6] [text-shadow:0_1px_0_#000] max-[620px]:text-[8px]";
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
