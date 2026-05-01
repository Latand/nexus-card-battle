import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import { DAMAGE_THROWS_CAP, EXCHANGE_THROWS, MAX_ENERGY, MAX_HEALTH } from "../../model/constants";
import { otherSide } from "../../model/game";
import type { Clash, Fighter, Outcome, Phase, Side } from "../../model/types";
import { BattleCard } from "./BattleCard";

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
  const playerEnergy = isDamage ? outcome.nextPlayer.energy : player.energy;
  const enemyEnergy = isDamage ? outcome.nextEnemy.energy : enemy.energy;
  const loser: Side = clash.winner === "player" ? "enemy" : "player";
  const isFinisher = isDamage && (loser === "player" ? outcome.nextPlayer.health <= 0 : outcome.nextEnemy.health <= 0);
  const statusText =
    phase === "exchange"
      ? `${clash.playerAttack} против ${clash.enemyAttack}`
      : isFinisher
        ? `Добивание: ${clash.damage} урона`
        : `${clash.damage} урона нанесено`;

  return (
    <section
      className="fixed inset-0 z-40 grid place-items-center bg-black p-[min(28px,3vw)] max-[760px]:p-2.5"
      data-testid="battle-overlay"
      data-phase={phase}
      data-winner={clash.winner}
    >
      <div className="relative min-h-[min(640px,88vh)] w-[min(1100px,96vw)] overflow-hidden rounded border-[3px] border-[#0b0d0f] bg-[linear-gradient(180deg,rgba(23,27,25,0.12),rgba(0,0,0,0.28)),url('/generated/klanz-battle-bg.png')] bg-cover bg-center shadow-[0_0_0_4px_rgba(255,255,255,0.08),0_28px_80px_rgba(0,0,0,0.72),inset_0_0_0_2px_rgba(255,244,201,0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(90deg,rgba(201,232,111,0.2),transparent_20%_80%,rgba(255,225,128,0.18)),radial-gradient(circle_at_50%_56%,transparent_0_34%,rgba(0,0,0,0.34)_66%)] before:content-[''] max-[960px]:min-h-[min(580px,88vh)] max-[760px]:min-h-[min(560px,92vh)]">
        <div className="absolute left-[18px] top-[18px] z-[3] w-[min(390px,42%)] max-[960px]:w-[calc(50%_-_28px)] max-[760px]:top-2.5 max-[620px]:w-[calc(50%_-_16px)]">
          <DuelStatus fighter={player} health={playerHealth} energy={playerEnergy} usedEnergy={clash.playerEnergy} attack={clash.playerAttack} />
        </div>
        <div className="absolute right-[18px] top-[18px] z-[3] w-[min(390px,42%)] max-[960px]:w-[calc(50%_-_28px)] max-[760px]:top-2.5 max-[620px]:w-[calc(50%_-_16px)]">
          <DuelStatus fighter={enemy} health={enemyHealth} energy={enemyEnergy} usedEnergy={clash.enemyEnergy} attack={clash.enemyAttack} />
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

function DuelStatus({
  fighter,
  health,
  energy,
  usedEnergy,
  attack,
}: {
  fighter: Fighter;
  health: number;
  energy: number;
  usedEnergy: number;
  attack: number;
}) {
  return (
    <article className="grid gap-[5px] border-2 border-[#c7ccd1] bg-[linear-gradient(180deg,#444c50,#16191c_48%,#08090b),repeating-linear-gradient(135deg,rgba(255,255,255,0.12)_0_1px,transparent_1px_8px)] p-1.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.7),0_8px_22px_rgba(0,0,0,0.52)] max-[760px]:p-[5px]">
      <strong className="grid min-h-[18px] place-items-center text-[13px] font-black uppercase leading-none text-[#f3f3f3] [text-shadow:0_1px_0_#000] max-[760px]:text-[11px]">
        {fighter.name}
      </strong>
      <DuelBar label="Жизнь" value={health} max={MAX_HEALTH} tone="health" />
      <div className="grid grid-cols-3 gap-1 max-[760px]:grid-cols-2 [&>span:last-child]:max-[760px]:col-span-full">
        <span className={duelNumber()}>Энергия {energy}</span>
        <span className={duelNumber()}>Вложено {usedEnergy}</span>
        <span className={duelNumber()}>Атака {attack}</span>
      </div>
      <DuelBar label="Энергия" value={energy} max={MAX_ENERGY} tone="energy" />
    </article>
  );
}

function DuelBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "health" | "energy" }) {
  return (
    <div className="relative grid min-h-[18px] grid-cols-[54px_minmax(0,1fr)_28px] items-center gap-1.5 max-[760px]:grid-cols-[38px_minmax(0,1fr)_22px] max-[620px]:grid-cols-[minmax(0,1fr)_20px]">
      <span className="text-[10px] font-black uppercase text-[#fff7d6] [text-shadow:0_1px_0_#000] max-[620px]:hidden">{label}</span>
      <i className="relative h-3 overflow-hidden rounded-full border-2 border-[#0d1411] bg-black/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.55)] before:absolute before:inset-y-0 before:left-0 before:w-[var(--value)] before:rounded-full before:transition-[width] before:duration-500 before:content-[''] data-[tone=energy]:before:bg-[linear-gradient(180deg,#fff1a2,#e7ae2d_48%,#a96318)] data-[tone=energy]:before:shadow-[0_0_10px_rgba(255,215,83,0.62)] data-[tone=health]:before:bg-[linear-gradient(180deg,#cffd93,#53ca5a_45%,#24823c)] data-[tone=health]:before:shadow-[0_0_10px_rgba(99,230,85,0.68)]" data-tone={tone} style={{ "--value": `${Math.max(0, Math.min(100, (value / max) * 100))}%` } as CSSProperties} />
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
  return (
    <i
      className={cn(
        "absolute block opacity-0 drop-shadow-[0_7px_6px_rgba(0,0,0,0.55)] [animation-fill-mode:both] [animation-iteration-count:1] [animation-timing-function:cubic-bezier(0.18,0.86,0.26,1)]",
        from === "player" ? "animate-[klanz-duel-throw-player_var(--duration)_var(--delay)_both]" : "animate-[klanz-duel-throw-enemy_var(--duration)_var(--delay)_both]",
        mode === "finish" && "z-[2]",
        kindClass(kind),
      )}
      style={
        {
          "--duration": mode === "exchange" ? "580ms" : mode === "damage" ? "820ms" : "1120ms",
          "--delay": mode === "exchange" ? `${index * 190}ms` : mode === "damage" ? `${index * 240}ms` : "420ms",
          top: `calc(34% + ${(index % 5) * 18}px)`,
          left: "calc(50% - 20px)",
        } as CSSProperties
      }
    />
  );
}

function kindClass(kind: number) {
  if (kind === 0) {
    return "h-[18px] w-[46px] rounded-[6px_999px_999px_6px] border-2 border-[#30201a] bg-[radial-gradient(circle_at_78%_50%,#ffef80_0_16%,transparent_18%),linear-gradient(90deg,#70756e_0_18%,#e73e35_19%_48%,#f1c536_49%_70%,#4fae6a_71%)]";
  }
  if (kind === 1) {
    return "h-[34px] w-[34px] rounded-full border-[3px] border-[#25302b] bg-[radial-gradient(circle_at_center,#262b2b_0_20%,transparent_22%),conic-gradient(from_20deg,#ffdd68,#d24f3e,#45bb78,#ffdd68)]";
  }
  if (kind === 2) {
    return "h-[30px] w-[42px] bg-[linear-gradient(135deg,#fff8bb,#eac240_42%,#de563e)] [clip-path:polygon(0_55%,44%_0,34%_39%,100%_28%,48%_100%,58%_58%)]";
  }
  if (kind === 3) {
    return "h-3 w-14 rounded-full bg-[linear-gradient(90deg,#6d7679_0_18%,#fff8d4_19%_58%,#61d4ea_59%_100%)] shadow-[inset_0_-3px_0_rgba(0,0,0,0.22),0_0_12px_rgba(97,212,234,0.58)]";
  }
  return "h-[86px] w-[86px] rounded-full bg-[radial-gradient(circle,#fff8c5_0_16%,#ffd24d_17%_32%,#ed5a3f_33%_52%,transparent_54%),conic-gradient(from_0deg,transparent_0_10%,rgba(255,232,94,0.9)_11%_16%,transparent_17%_27%,rgba(255,95,64,0.92)_28%_35%,transparent_36%)]";
}
