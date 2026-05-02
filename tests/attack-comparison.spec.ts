import { expect, test } from "@playwright/test";
import { getDuelAttackComparison } from "../src/features/battle/ui/components/attackComparison";

test("keeps attack comparison anchored to player and enemy sides", () => {
  expect(getDuelAttackComparison({ playerAttack: 18, enemyAttack: 36, winner: "enemy" })).toEqual({
    playerAttack: 18,
    enemyAttack: 36,
    operator: "<",
    playerEmphasis: false,
    enemyEmphasis: true,
  });

  expect(getDuelAttackComparison({ playerAttack: 36, enemyAttack: 18, winner: "player" })).toEqual({
    playerAttack: 36,
    enemyAttack: 18,
    operator: ">",
    playerEmphasis: true,
    enemyEmphasis: false,
  });
});
