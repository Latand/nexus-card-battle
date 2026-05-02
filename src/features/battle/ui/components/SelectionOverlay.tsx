import { cn } from "@/shared/lib/cn";
import { isClanBonusActive } from "../../model/clans";
import { BASE_ATTACK_ENERGY } from "../../model/constants";
import { hasApplicableAbilityEffect } from "../../model/game";
import type { Card, Fighter } from "../../model/types";
import { BattleCard } from "./BattleCard";
import { CardTooltip } from "./CardTooltip";

export function SelectionOverlay({
  selected,
  enemy,
  player,
  knownEnemyCard,
  knownEnemyEnergy,
  energy,
  maxEnergy,
  damageBoost,
  boostCost,
  previewAttack,
  previewDamage,
  canBoost,
  onClose,
  onMinus,
  onPlus,
  onToggleBoost,
  onConfirm,
}: {
  selected: Card;
  enemy: Fighter;
  player: Fighter;
  knownEnemyCard?: Card;
  knownEnemyEnergy?: number;
  energy: number;
  maxEnergy: number;
  damageBoost: boolean;
  boostCost: number;
  previewAttack: number;
  previewDamage: number;
  canBoost: boolean;
  onClose: () => void;
  onMinus: () => void;
  onPlus: () => void;
  onToggleBoost: () => void;
  onConfirm: () => void;
}) {
  const selectedBonusVisible = isCopyClanBonusResolved(selected, player.hand);
  const knownEnemyBonusVisible = knownEnemyCard ? isCopyClanBonusResolved(knownEnemyCard, enemy.hand) : false;
  const selectedClanBonusActive = isClanBonusActive(player, selected) && selectedBonusVisible;
  const knownEnemyClanBonusActive = knownEnemyCard ? isClanBonusActive(enemy, knownEnemyCard) && knownEnemyBonusVisible : false;
  const selectedAbilityActive = hasApplicableAbilityEffect(selected, {
    owner: player,
    opponent: enemy,
    opponentCard: knownEnemyCard,
    opponentEnergyBid: knownEnemyEnergy,
  });
  const knownEnemyAbilityActive = knownEnemyCard
    ? hasApplicableAbilityEffect(knownEnemyCard, {
        owner: enemy,
        opponent: player,
        opponentCard: selected,
        opponentEnergyBid: energy,
      })
    : false;
  const effectiveEnergy = energy + BASE_ATTACK_ENERGY;
  const maxEffectiveEnergy = maxEnergy + BASE_ATTACK_ENERGY;

  return (
    <section
      className="fixed inset-0 z-[34] grid place-items-center bg-black/50 p-[min(26px,3vw)] backdrop-blur-[5px] backdrop-saturate-[0.78]"
      data-testid="selection-overlay"
      aria-label="Вибір картки"
    >
      <button className="absolute inset-0 cursor-default border-0 bg-transparent" type="button" aria-label="Закрити вибір" onClick={onClose} />

      <div className="selection-dialog relative z-[1] grid min-h-[360px] w-[min(760px,94vw)] grid-cols-[minmax(170px,238px)_188px_minmax(138px,188px)] items-center gap-[18px] rounded-lg border-2 border-[rgba(225,231,224,0.62)] bg-[linear-gradient(180deg,rgba(31,34,35,0.92),rgba(8,9,10,0.9)),repeating-linear-gradient(135deg,rgba(255,255,255,0.08)_0_1px,transparent_1px_8px)] px-[22px] py-5 shadow-[0_24px_70px_rgba(0,0,0,0.72),inset_0_0_0_2px_rgba(255,255,255,0.08)] max-[960px]:grid-cols-[minmax(160px,210px)_180px_minmax(122px,160px)] max-[960px]:gap-3 max-[760px]:w-[min(520px,94vw)] max-[760px]:grid-cols-[minmax(148px,200px)_minmax(164px,1fr)] max-[620px]:w-[min(360px,94vw)] max-[620px]:grid-cols-1 max-[620px]:gap-2.5 max-[620px]:p-3.5">
        <button
          className="absolute right-2.5 top-2 z-[4] h-7 w-7 cursor-pointer rounded-full border border-white/25 bg-black/45 text-xl leading-none text-[#fff7d8]"
          type="button"
          aria-label="Закрити вибір"
          onClick={onClose}
        >
          ×
        </button>

        <div className="selection-card grid justify-items-center [&_.compact]:min-h-[328px] [&_.compact]:w-[min(236px,31vw)] max-[620px]:[&_.compact]:min-h-[296px] max-[620px]:[&_.compact]:w-[min(220px,68vw)]">
          <BattleCard
            card={selected}
            compact
            clanBonusActive={selectedClanBonusActive}
            abilityActive={selectedAbilityActive}
            bonusVisible={selectedBonusVisible}
          />
        </div>

        <div className="selection-controls relative z-[2] grid gap-2 rounded-[7px] border-2 border-[#1e2527] bg-[linear-gradient(180deg,#6c6b65_0_6%,#2d3032_7%_54%,#151719_55%),repeating-linear-gradient(135deg,rgba(255,255,255,0.1)_0_1px,transparent_1px_7px)] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_16px_30px_rgba(0,0,0,0.44)] max-[620px]:w-[min(260px,100%)] max-[620px]:justify-self-center">
          <div className="grid min-h-[42px] content-center border border-white/20 bg-black/35 px-2.5 py-[5px]">
            <span className="text-[10px] font-black uppercase text-[#d8bd82]">{selected.clan}</span>
            <strong className="text-lg font-black leading-none text-[#fff7d7]">{selected.name}</strong>
          </div>

          <div className="grid grid-cols-[34px_minmax(0,1fr)_34px_34px] items-center gap-[5px]">
            <button className={stepButton("-")} type="button" data-testid="energy-minus" aria-label="Менше енергії" onClick={onMinus} disabled={energy <= 0}>
              -
            </button>
            <strong className="grid min-h-7 place-items-center border border-white/20 bg-black/50 text-center text-[12px] font-black leading-none text-[#f8f8f8]" data-testid="selection-energy">
              {effectiveEnergy}
            </strong>
            <button className={stepButton("+")} type="button" data-testid="energy-plus" aria-label="Більше енергії" onClick={onPlus} disabled={energy >= maxEnergy}>
              +
            </button>
            <b className="grid min-h-7 place-items-center rounded-md bg-[linear-gradient(180deg,#7656f0,#3e2bb1)] text-lg font-black text-white shadow-[0_1px_0_rgba(0,0,0,0.52)]">
              {maxEffectiveEnergy}
            </b>
          </div>

          <div className="flex justify-center gap-[5px]" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <i
                key={index}
                className={cn(
                  "h-5 w-5 rounded-full border-2 border-[#2b1607] bg-[linear-gradient(180deg,#29231c,#0d0b0a)]",
                  index < Math.min(effectiveEnergy, 4) &&
                    "bg-[radial-gradient(circle_at_35%_28%,#fff4ac_0_18%,#ffba2e_20%_58%,#8d4b11_60%)] shadow-[0_0_10px_rgba(255,198,51,0.58)]",
                )}
              />
            ))}
          </div>

          <button
            type="button"
            className={cn(
              "grid min-h-[34px] cursor-pointer grid-cols-[minmax(0,1fr)_34px] items-center gap-1.5 rounded-[5px] border-2 border-black/60 bg-[linear-gradient(180deg,#ec4d40,#9f1f1a)] py-0.5 pl-2.5 pr-1 text-sm font-black uppercase text-[#fff8d8] shadow-[inset_0_-4px_0_rgba(0,0,0,0.2),0_6px_12px_rgba(0,0,0,0.32)] disabled:cursor-not-allowed disabled:opacity-45",
              damageBoost && "outline-2 outline-[#fff0a5] shadow-[inset_0_-4px_0_rgba(0,0,0,0.16),0_0_14px_rgba(255,224,138,0.58)]",
            )}
            data-testid="damage-boost-toggle"
            onClick={onToggleBoost}
            disabled={!damageBoost && !canBoost}
          >
            <span>+2 урону</span>
            <b className="grid min-h-7 place-items-center rounded-md bg-[linear-gradient(180deg,#7656f0,#3e2bb1)] text-lg text-white">{boostCost}</b>
          </button>

          <div className="grid grid-cols-2 gap-[5px]">
            <span className="grid min-h-7 place-items-center border border-white/15 bg-black/35 text-[11px] font-black uppercase text-[#f5e9c8]">Атака {previewAttack}</span>
            <span className="grid min-h-7 place-items-center border border-white/15 bg-black/35 text-[11px] font-black uppercase text-[#f5e9c8]">Урон {previewDamage}</span>
          </div>

          <div className="grid gap-[5px] text-[10px] font-bold leading-tight text-[#d9ceb2]">
            <CardTooltip
              className="block min-w-0"
              eyebrow="Уміння"
              title={selected.ability.name}
              description={selected.ability.description}
            >
              <span className={cn("block truncate rounded px-1 py-0.5", !selectedAbilityActive && "text-[#8c836f]")}>
                {selected.ability.name}
              </span>
            </CardTooltip>
            <CardTooltip
              className="block min-w-0"
              eyebrow="Бонус"
              title={selected.bonus.name}
              description={selected.bonus.description}
            >
              <span className={cn("block truncate rounded px-1 py-0.5", !selectedBonusVisible && "text-[#8c836f]")}>
                {selected.bonus.name}
              </span>
            </CardTooltip>
          </div>

          <button
            className="min-h-[42px] cursor-pointer rounded-md border-2 border-black/60 bg-[linear-gradient(180deg,#fff26d,#e3b51e_54%,#a66d12)] text-xl font-black uppercase text-[#1a1408] shadow-[inset_0_-4px_0_rgba(0,0,0,0.2),0_6px_12px_rgba(0,0,0,0.32)]"
            type="button"
            data-testid="selection-ok"
            onClick={onConfirm}
          >
            OK
          </button>
        </div>

        <strong className="absolute bottom-[82px] right-[168px] z-[3] min-w-[126px] -skew-x-[8deg] -rotate-2 rounded-lg bg-[linear-gradient(135deg,rgba(255,255,255,0.42),transparent_28%),linear-gradient(180deg,#6a6b69,#191a1b)] px-[18px] pb-3 pt-2 text-center text-[54px] italic leading-[0.8] text-white shadow-[0_0_16px_rgba(255,255,255,0.4)] [text-shadow:0_3px_0_rgba(0,0,0,0.65),0_0_16px_rgba(255,255,255,0.4)] max-[960px]:right-[132px] max-[960px]:min-w-[108px] max-[960px]:text-[44px] max-[760px]:bottom-16 max-[760px]:right-7 max-[760px]:min-w-[92px] max-[760px]:text-4xl max-[620px]:hidden">
          VS
        </strong>

        {knownEnemyCard ? (
          <div
            className="selection-enemy grid translate-y-3.5 rotate-1 justify-items-center gap-2 brightness-[1.06] max-[760px]:col-span-full max-[760px]:translate-y-0 max-[760px]:[&_.compact]:min-h-[238px] max-[760px]:[&_.compact]:w-[min(170px,42vw)] [&_.compact]:min-h-[258px] [&_.compact]:w-[min(178px,22vw)]"
            data-testid="known-enemy-card"
          >
            <BattleCard
              card={knownEnemyCard}
              compact
              clanBonusActive={knownEnemyClanBonusActive}
              abilityActive={knownEnemyAbilityActive}
              bonusVisible={knownEnemyBonusVisible}
            />
            {knownEnemyEnergy !== undefined ? (
              <span className="min-w-[112px] rounded border border-[#7656f0]/70 bg-black/70 px-2 py-1 text-center text-xs font-black uppercase text-[#fff8df] shadow-[0_0_12px_rgba(118,86,240,0.38)]">
                енергія {knownEnemyEnergy + BASE_ATTACK_ENERGY}
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className="selection-enemy grid min-h-[258px] translate-y-3.5 rotate-1 place-items-center rounded-md border-2 border-[#6e7782]/70 bg-[linear-gradient(180deg,rgba(34,42,49,0.78),rgba(5,7,10,0.94)),repeating-linear-gradient(135deg,rgba(255,255,255,0.06)_0_1px,transparent_1px_9px)] shadow-[inset_0_0_38px_rgba(72,115,143,0.18),0_18px_34px_rgba(0,0,0,0.5)] max-[760px]:col-span-full max-[760px]:min-h-[188px] max-[760px]:translate-y-0"
            data-testid="enemy-card-hidden"
          >
            <div className="grid h-[78%] w-[72%] place-items-center rounded border border-white/10 bg-[radial-gradient(circle_at_center,rgba(85,212,255,0.16),transparent_44%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0))] text-5xl font-black text-[#d8e8f2]/70 [text-shadow:0_0_18px_rgba(80,207,255,0.4)]">
              ?
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function stepButton(kind: "-" | "+") {
  return cn(
    "h-7 cursor-pointer rounded border-2 border-black/60 text-lg font-black uppercase text-[#fff8d8] shadow-[inset_0_-4px_0_rgba(0,0,0,0.2),0_6px_12px_rgba(0,0,0,0.32)] disabled:cursor-not-allowed disabled:opacity-45",
    kind === "+" ? "bg-[linear-gradient(180deg,#4de06f,#168e36)]" : "bg-[linear-gradient(180deg,#dfb44d,#8b5d18)]",
  );
}

function isCopyClanBonusResolved(card: Card, hand: Card[]) {
  const copyEffects = card.bonus.effects.filter((effect) => effect.key === "copy-clan-bonus");
  if (copyEffects.length === 0) return true;

  return copyEffects.some((effect) => effect.copyClan && hand.some((handCard) => handCard.clan === effect.copyClan));
}
