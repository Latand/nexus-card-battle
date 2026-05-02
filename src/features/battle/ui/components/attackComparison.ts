import type { Clash } from "../../model/types";

type AttackComparisonInput = Pick<Clash, "playerAttack" | "enemyAttack" | "winner">;

export function getDuelAttackComparison(clash: AttackComparisonInput) {
  return {
    playerAttack: clash.playerAttack,
    enemyAttack: clash.enemyAttack,
    operator: clash.playerAttack === clash.enemyAttack ? "=" : clash.playerAttack > clash.enemyAttack ? ">" : "<",
    playerEmphasis: clash.winner === "player",
    enemyEmphasis: clash.winner === "enemy",
  };
}
