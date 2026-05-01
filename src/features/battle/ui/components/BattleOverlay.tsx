import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import { DAMAGE_THROWS_CAP, EXCHANGE_THROWS, MAX_ENERGY } from "../../model/constants";
import { otherSide } from "../../model/game";
import type { Clash, Fighter, Outcome, Phase, Side } from "../../model/types";
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
  const isDamage = phase === "damage";
  const playerHealth = isDamage ? outcome.nextPlayer.health : player.health;
  const enemyHealth = isDamage ? outcome.nextEnemy.health : enemy.health;
  const virtualLifeMax = Math.max(clash.playerAttack, clash.enemyAttack, 1);
  const playerCardLife = getVirtualCardLife(clash, phase, "player");
  const enemyCardLife = getVirtualCardLife(clash, phase, "enemy");
  const loser: Side = clash.winner === "player" ? "enemy" : "player";
  const isFinisher = isDamage && (loser === "player" ? outcome.nextPlayer.health <= 0 : outcome.nextEnemy.health <= 0);
  const loserCard = loser === "player" ? clash.playerCard : clash.enemyCard;
  const damageTarget = loser === "player" ? player.name : enemy.name;
  const statusText =
    phase === "exchange"
      ? `Жизнь карт: ${clash.playerAttack} против ${clash.enemyAttack}`
      : isFinisher
        ? `${loserCard.name} на нуле. Добивание: ${clash.damage} урона по ${damageTarget}`
        : `${loserCard.name} на нуле. ${clash.damage} урона получает ${damageTarget}`;

  return (
    <section
      className="fixed inset-0 z-40 grid place-items-center bg-black p-[min(28px,3vw)] max-[760px]:p-2.5"
      data-testid="battle-overlay"
      data-phase={phase}
      data-winner={clash.winner}
    >
      <div className="relative min-h-[min(640px,88vh)] w-[min(1100px,96vw)] overflow-hidden rounded border-[3px] border-[#0b0d0f] bg-[linear-gradient(180deg,rgba(23,27,25,0.12),rgba(0,0,0,0.28)),url('/generated/klanz-battle-bg.png')] bg-cover bg-center shadow-[0_0_0_4px_rgba(255,255,255,0.08),0_28px_80px_rgba(0,0,0,0.72),inset_0_0_0_2px_rgba(255,244,201,0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(90deg,rgba(201,232,111,0.2),transparent_20%_80%,rgba(255,225,128,0.18)),radial-gradient(circle_at_50%_56%,transparent_0_34%,rgba(0,0,0,0.34)_66%)] before:content-[''] max-[960px]:min-h-[min(580px,88vh)] max-[760px]:min-h-[min(560px,92vh)]">
        <div className="absolute left-[18px] top-[18px] z-[3] w-[min(390px,42%)] max-[960px]:w-[calc(50%_-_28px)] max-[760px]:top-2.5 max-[620px]:w-[calc(50%_-_16px)]">
          <DuelStatus
            fighter={player}
            cardName={clash.playerCard.name}
            cardLife={playerCardLife}
            cardLifeMax={virtualLifeMax}
            cardEnergy={clash.playerEnergy}
            attack={clash.playerAttack}
            humanHealth={playerHealth}
          />
        </div>
        <div className="absolute right-[18px] top-[18px] z-[3] w-[min(390px,42%)] max-[960px]:w-[calc(50%_-_28px)] max-[760px]:top-2.5 max-[620px]:w-[calc(50%_-_16px)]">
          <DuelStatus
            fighter={enemy}
            cardName={clash.enemyCard.name}
            cardLife={enemyCardLife}
            cardLifeMax={virtualLifeMax}
            cardEnergy={clash.enemyEnergy}
            attack={clash.enemyAttack}
            humanHealth={enemyHealth}
          />
        </div>

        <div className="absolute inset-[94px_26px_82px] z-[2] grid grid-cols-[minmax(150px,220px)_minmax(220px,1fr)_minmax(150px,220px)] items-end gap-[18px] max-[960px]:inset-[102px_18px_82px] max-[960px]:grid-cols-[minmax(132px,190px)_minmax(180px,1fr)_minmax(132px,190px)] max-[760px]:inset-[112px_10px_78px] max-[760px]:grid-cols-[minmax(96px,140px)_minmax(110px,1fr)_minmax(96px,140px)] max-[760px]:gap-2 max-[620px]:grid-cols-[92px_minmax(86px,1fr)_92px]">
          <div
            className={cn(
              "grid origin-bottom justify-items-center self-end justify-self-start animate-[klanz-duel-enter-left_320ms_ease_both] [&_.compact]:min-h-[292px] [&_.compact]:w-[min(214px,22vw)] max-[960px]:[&_.compact]:min-h-[270px] max-[960px]:[&_.compact]:w-[min(184px,21vw)] max-[760px]:[&_.compact]:min-h-[230px] max-[760px]:[&_.compact]:w-[min(136px,27vw)] max-[620px]:[&_.compact]:min-h-[184px] max-[620px]:[&_.compact]:w-[92px]",
              loser === "player" && isDamage && "animate-[klanz-taking-hit_620ms_ease_both]",
            )}
          >
            <BattleCard card={clash.playerCard} compact />
          </div>

          <DuelProjectiles clash={clash} phase={phase} finisher={isFinisher} />

          <div
            className={cn(
              "grid origin-bottom justify-items-center self-end justify-self-end animate-[klanz-duel-enter-right_320ms_ease_both] [&_.compact]:min-h-[292px] [&_.compact]:w-[min(214px,22vw)] max-[960px]:[&_.compact]:min-h-[270px] max-[960px]:[&_.compact]:w-[min(184px,21vw)] max-[760px]:[&_.compact]:min-h-[230px] max-[760px]:[&_.compact]:w-[min(136px,27vw)] max-[620px]:[&_.compact]:min-h-[184px] max-[620px]:[&_.compact]:w-[92px]",
              loser === "enemy" && isDamage && "animate-[klanz-taking-hit_620ms_ease_both]",
            )}
          >
            <BattleCard card={clash.enemyCard} compact />
          </div>
        </div>

        <div className="absolute bottom-[22px] left-1/2 z-[3] grid min-w-[min(460px,78vw)] -translate-x-1/2 gap-1 rounded-lg border-2 border-[rgba(255,224,138,0.56)] bg-black/70 px-[18px] py-[11px] text-center max-[620px]:bottom-3.5 max-[620px]:px-2.5 max-[620px]:py-2">
          <strong className="text-sm uppercase text-[#ffe08a]">{phase === "exchange" ? "Обмен ударами" : isFinisher ? "Последний удар" : "Урон"}</strong>
          <span className="text-2xl font-black leading-none text-[#fff8df] max-[960px]:text-xl max-[620px]:text-[17px]">{statusText}</span>
        </div>
      </div>
    </section>
  );
}

function getVirtualCardLife(clash: Clash, phase: Phase, side: Side) {
  const ownAttack = side === "player" ? clash.playerAttack : clash.enemyAttack;
  const rivalAttack = side === "player" ? clash.enemyAttack : clash.playerAttack;

  if (phase !== "damage") return ownAttack;
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
  humanHealth,
}: {
  fighter: Fighter;
  cardName: string;
  cardLife: number;
  cardLifeMax: number;
  cardEnergy: number;
  attack: number;
  humanHealth: number;
}) {
  return (
    <article className="grid gap-[5px] border-2 border-[#c7ccd1] bg-[linear-gradient(180deg,#444c50,#16191c_48%,#08090b),repeating-linear-gradient(135deg,rgba(255,255,255,0.12)_0_1px,transparent_1px_8px)] p-1.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.7),0_8px_22px_rgba(0,0,0,0.52)] max-[760px]:p-[5px]">
      <strong className="grid min-h-[18px] place-items-center text-[13px] font-black uppercase leading-none text-[#f3f3f3] [text-shadow:0_1px_0_#000] max-[760px]:text-[11px]">
        {fighter.name}
      </strong>
      <DuelBar label="Карта" value={cardLife} max={cardLifeMax} tone="health" slots={12} />
      <div className="grid grid-cols-3 gap-1 max-[760px]:grid-cols-2 [&>span:last-child]:max-[760px]:col-span-full">
        <span className={duelNumber()}>{cardName}</span>
        <span className={duelNumber()}>HP {humanHealth}</span>
        <span className={duelNumber()}>Атака {attack}</span>
      </div>
      <DuelBar label="Энергия" value={cardEnergy} max={MAX_ENERGY} tone="energy" />
    </article>
  );
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

function DuelProjectiles({ clash, phase, finisher }: { clash: Clash; phase: Phase; finisher: boolean }) {
  if (phase === "exchange") {
    return (
      <div className="relative min-h-80 self-stretch overflow-visible max-[760px]:min-h-[260px]" aria-hidden="true">
        {Array.from({ length: EXCHANGE_THROWS + 2 }).map((_, index) => {
          const from = index % 2 === 0 ? clash.first : otherSide(clash.first);
          return <DuelProjectile key={`${clash.round}-duel-${index}`} from={from} index={index} kind={index % 4} mode="exchange" />;
        })}
      </div>
    );
  }

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
  mode: "exchange" | "damage" | "finish";
}) {
  const size = mode === "finish" ? 104 : mode === "damage" ? 58 + (index % 3) * 12 : 52 + (index % 4) * 9;
  const direction = from === "player" ? 1 : -1;

  return (
    <i
      className={cn(
        "absolute block opacity-0 drop-shadow-[0_7px_6px_rgba(0,0,0,0.55)] [animation-fill-mode:both] [animation-iteration-count:1] [animation-timing-function:cubic-bezier(0.18,0.86,0.26,1)]",
        from === "player" ? "animate-[klanz-duel-throw-player_var(--duration)_var(--delay)_both]" : "animate-[klanz-duel-throw-enemy_var(--duration)_var(--delay)_both]",
        mode === "finish" && "z-[2]",
      )}
      style={
        {
          "--duration": mode === "exchange" ? "580ms" : mode === "damage" ? "820ms" : "1120ms",
          "--delay": mode === "exchange" ? `${index * 190}ms` : mode === "damage" ? `${index * 240}ms` : "420ms",
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
