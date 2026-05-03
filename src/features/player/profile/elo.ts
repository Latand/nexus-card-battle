export const DEFAULT_ELO_RATING = 1000;
export const DEFAULT_ELO_K_FACTOR = 32;
export const DEFAULT_ELO_FLOOR = 100;

export type EloMatchResult = "win" | "draw" | "loss";

export type ComputeEloInput = {
  playerRating: number;
  opponentRating: number;
  result: EloMatchResult;
  kFactor?: number;
  floor?: number;
};

export type ComputeEloOutput = {
  newRating: number;
  delta: number;
};

export function computeElo({
  playerRating,
  opponentRating,
  result,
  kFactor = DEFAULT_ELO_K_FACTOR,
  floor = DEFAULT_ELO_FLOOR,
}: ComputeEloInput): ComputeEloOutput {
  const safePlayer = sanitizeRating(playerRating, DEFAULT_ELO_RATING);
  const safeOpponent = sanitizeRating(opponentRating, DEFAULT_ELO_RATING);
  const safeK = Number.isFinite(kFactor) && kFactor > 0 ? kFactor : DEFAULT_ELO_K_FACTOR;
  const safeFloor = Number.isFinite(floor) ? Math.max(0, Math.floor(floor)) : DEFAULT_ELO_FLOOR;

  const expected = 1 / (1 + 10 ** ((safeOpponent - safePlayer) / 400));
  const actual = scoreFor(result);
  const rawNewRating = safePlayer + safeK * (actual - expected);
  const roundedNewRating = Math.round(rawNewRating);
  // Floor caps the new rating, not the raw delta — a floored player can lose
  // to a much stronger opponent and stay at the floor instead of dropping.
  const newRating = Math.max(safeFloor, roundedNewRating);

  return {
    newRating,
    delta: newRating - safePlayer,
  };
}

function scoreFor(result: EloMatchResult) {
  if (result === "win") return 1;
  if (result === "draw") return 0.5;
  return 0;
}

function sanitizeRating(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(value);
}
