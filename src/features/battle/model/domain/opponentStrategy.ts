import { BASE_ATTACK_ENERGY, DAMAGE_BOOST_COST, MAX_ROUNDS } from "../constants";
import type { Card, Fighter, FighterAiProfile, Side } from "../types";
import { getEffectiveBonusStates } from "./bonusRules";
import { getAvailableCards } from "./fighters";
import { isAbilityBlocked, score } from "./scoring";

export type EnemyMove = {
  card: Card;
  energy: number;
  damageBoost?: boolean;
};

export type EnemyStrategyOptions = {
  knownPlayerMove?: {
    card: Card;
    energy: number;
    damageBoost?: boolean;
  };
  first?: Side;
};

export function getEnemyPreview(enemy: Fighter, playerHp: number) {
  const available = getAvailableCards(enemy);
  const lethal = available.find((item) => item.damage >= playerHp);

  return (
    lethal ??
    [...available].sort((a, b) => b.power * 2 + b.damage - (a.power * 2 + a.damage))[0]
  );
}

export function chooseEnemyMove(enemy: Fighter, player: Fighter, round: number, options: EnemyStrategyOptions = {}): EnemyMove {
  const available = getAvailableCards(enemy);

  if (available.length === 0) {
    return { card: enemy.hand[0], energy: 0 };
  }

  const profile = normalizeProfile(enemy.aiProfile);
  const candidates = buildMoveCandidates(available, enemy.energy, round, profile);
  const scored = candidates.map((candidate) => ({
    ...candidate,
    utility: scoreMoveCandidate(candidate, enemy, player, round, profile, options),
  }));

  return scored.sort((a, b) => b.utility - a.utility || a.energy + boostCost(a) - (b.energy + boostCost(b)))[0];
}

function buildMoveCandidates(cards: Card[], energy: number, round: number, profile: FighterAiProfile): EnemyMove[] {
  const roundsLeft = Math.max(1, MAX_ROUNDS - round + 1);
  const plannedEnergy = Math.max(0, Math.ceil(energy / roundsLeft));
  const energyLimit = getSearchEnergyLimit(energy, profile.difficulty);
  const energyOptions = Array.from({ length: energyLimit + 1 }, (_, index) => index);

  if (!energyOptions.includes(plannedEnergy) && plannedEnergy <= energy) {
    energyOptions.push(plannedEnergy);
  }

  return cards.flatMap((card) =>
    energyOptions.flatMap((energyBid) => {
      const base = { card, energy: energyBid } satisfies EnemyMove;
      const canConsiderBoost = profile.difficulty !== "rookie" && energyBid + DAMAGE_BOOST_COST <= energy;

      return canConsiderBoost ? [base, { ...base, damageBoost: true }] : [base];
    }),
  );
}

function getSearchEnergyLimit(energy: number, difficulty: FighterAiProfile["difficulty"]) {
  if (difficulty === "rookie") return Math.min(energy, 4);
  if (difficulty === "adept") return Math.min(energy, 6);
  return energy;
}

function scoreMoveCandidate(
  candidate: EnemyMove,
  enemy: Fighter,
  player: Fighter,
  round: number,
  profile: FighterAiProfile,
  options: EnemyStrategyOptions,
) {
  const roundsLeft = Math.max(1, MAX_ROUNDS - round + 1);
  const plannedEnergy = Math.ceil(enemy.energy / roundsLeft);
  const cost = candidate.energy + boostCost(candidate);
  const energyPressure = Math.max(0, cost - plannedEnergy - profile.riskTolerance * 2);
  const spendPenalty = cost * (1.15 - profile.riskTolerance * 0.45) + energyPressure * (7 - profile.riskTolerance * 3);
  const lethalBias = player.hp <= candidate.card.damage + (candidate.damageBoost ? 2 : 0) ? 42 : 0;

  if (options.knownPlayerMove) {
    const clash = evaluateKnownClash(candidate, enemy, player, options.knownPlayerMove, options.first ?? "player");
    const hpSwing = clash.enemyWins ? clash.enemyDamage * 18 : -clash.playerDamage * 18;
    const lethal = clash.enemyWins && clash.enemyDamage >= player.hp ? 1000 : 0;
    const survivalRisk = !clash.enemyWins && clash.playerDamage >= enemy.hp ? -1000 : 0;
    const winValue = clash.enemyWins ? 85 : -85;

    return winValue + hpSwing + lethal + survivalRisk + lethalBias - spendPenalty;
  }

  const expectedPlayerMoves = getExpectedPlayerMoves(player, round, profile);
  const matchupValue =
    expectedPlayerMoves.reduce((total, playerMove) => {
      const clash = evaluateKnownClash(candidate, enemy, player, playerMove, options.first ?? "enemy");
      return total + (clash.enemyWins ? 42 + clash.enemyDamage * 8 : -34 - clash.playerDamage * 8);
    }, 0) / Math.max(1, expectedPlayerMoves.length);

  const cardPressure = candidate.card.power * (candidate.energy + BASE_ATTACK_ENERGY) + candidate.card.damage * (5 + profile.aggression * 4);
  const styleBias = getStyleBias(candidate, profile, enemy, player);

  return matchupValue + cardPressure + styleBias + lethalBias - spendPenalty;
}

function evaluateKnownClash(
  enemyMove: EnemyMove,
  enemy: Fighter,
  player: Fighter,
  playerMove: { card: Card; energy: number; damageBoost?: boolean },
  first: Side,
) {
  const { playerBonus, enemyBonus } = getEffectiveBonusStates(player, playerMove.card, enemy, enemyMove.card);
  const playerAbilityBlocked = isAbilityBlocked(
    playerMove.card,
    enemyBonus.stopsAbility,
    {
      owner: player,
      opponent: enemy,
      opponentCard: enemyMove.card,
      opponentEnergyBid: enemyMove.energy,
      clanBonus: playerBonus,
    },
  );
  const enemyAbilityBlocked = isAbilityBlocked(
    enemyMove.card,
    playerBonus.stopsAbility,
    {
      owner: enemy,
      opponent: player,
      opponentCard: playerMove.card,
      opponentEnergyBid: playerMove.energy,
      clanBonus: enemyBonus,
    },
  );
  const playerScore = score(playerMove.card, playerMove.energy, first === "player", {
    owner: player,
    opponent: enemy,
    opponentCard: enemyMove.card,
    opponentEnergyBid: enemyMove.energy,
    abilityBlocked: playerAbilityBlocked,
    clanBonus: playerBonus,
  });
  const enemyScore = score(enemyMove.card, enemyMove.energy, first === "enemy", {
    owner: enemy,
    opponent: player,
    opponentCard: playerMove.card,
    opponentEnergyBid: playerMove.energy,
    abilityBlocked: enemyAbilityBlocked,
    clanBonus: enemyBonus,
  });
  const winner = resolvePredictedWinner({
    playerAttack: playerScore.attack,
    enemyAttack: enemyScore.attack,
    playerEnergy: playerMove.energy,
    enemyEnergy: enemyMove.energy,
    playerCard: playerMove.card,
    enemyCard: enemyMove.card,
    first,
  });

  return {
    enemyWins: winner === "enemy",
    enemyDamage: enemyScore.damage + (enemyMove.damageBoost ? 2 : 0),
    playerDamage: playerScore.damage + (playerMove.damageBoost ? 2 : 0),
  };
}

function getExpectedPlayerMoves(player: Fighter, round: number, profile: FighterAiProfile) {
  const available = getAvailableCards(player);
  const roundsLeft = Math.max(1, MAX_ROUNDS - round + 1);
  const expectedEnergy = Math.max(0, Math.min(player.energy, Math.ceil(player.energy / roundsLeft) + (profile.difficulty === "champion" ? 1 : 0)));

  return [...available]
    .sort((a, b) => b.power * (expectedEnergy + BASE_ATTACK_ENERGY) + b.damage * 2 - (a.power * (expectedEnergy + BASE_ATTACK_ENERGY) + a.damage * 2))
    .slice(0, Math.min(3, available.length))
    .map((card) => ({ card, energy: expectedEnergy, damageBoost: false }));
}

function getStyleBias(candidate: EnemyMove, profile: FighterAiProfile, enemy: Fighter, player: Fighter) {
  if (profile.style === "aggressive") return candidate.card.damage * 5 + candidate.energy * 2;
  if (profile.style === "control") return candidate.card.ability.effects.length * 8 + candidate.card.bonus.effects.length * 5;
  if (profile.style === "attrition") return enemy.hp <= player.hp ? candidate.card.damage * 7 : candidate.card.damage * 3;
  if (profile.style === "tempo") return Math.max(0, enemy.energy - candidate.energy - boostCost(candidate)) * 2;
  return candidate.card.power * 2 + candidate.card.damage * 3;
}

function resolvePredictedWinner({
  playerAttack,
  enemyAttack,
  playerEnergy,
  enemyEnergy,
  playerCard,
  enemyCard,
  first,
}: {
  playerAttack: number;
  enemyAttack: number;
  playerEnergy: number;
  enemyEnergy: number;
  playerCard: Card;
  enemyCard: Card;
  first: Side;
}): Side {
  if (playerAttack !== enemyAttack) return playerAttack > enemyAttack ? "player" : "enemy";
  if (playerCard.id === "enigma" && enemyCard.id !== "enigma") return "player";
  if (enemyCard.id === "enigma" && playerCard.id !== "enigma") return "enemy";
  if (playerEnergy !== enemyEnergy) return playerEnergy < enemyEnergy ? "player" : "enemy";
  return first;
}

function boostCost(move: Pick<EnemyMove, "damageBoost">) {
  return move.damageBoost ? DAMAGE_BOOST_COST : 0;
}

function normalizeProfile(profile?: FighterAiProfile): FighterAiProfile {
  return {
    opponentId: profile?.opponentId ?? "default-ai",
    level: profile?.level ?? 5,
    difficulty: profile?.difficulty ?? "veteran",
    style: profile?.style ?? "balanced",
    aggression: profile?.aggression ?? 0.55,
    riskTolerance: profile?.riskTolerance ?? 0.45,
  };
}
