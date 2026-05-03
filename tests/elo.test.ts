import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ELO_FLOOR,
  DEFAULT_ELO_K_FACTOR,
  DEFAULT_ELO_RATING,
  computeElo,
} from "../src/features/player/profile/elo";

describe("computeElo", () => {
  test("equal opponents: a win awards exactly +K/2 = +16 and a loss exactly -16", () => {
    const win = computeElo({ playerRating: 1000, opponentRating: 1000, result: "win" });
    expect(win.delta).toBe(16);
    expect(win.newRating).toBe(1016);

    const loss = computeElo({ playerRating: 1000, opponentRating: 1000, result: "loss" });
    expect(loss.delta).toBe(-16);
    expect(loss.newRating).toBe(984);
  });

  test("equal opponents: a draw is neutral (delta 0)", () => {
    const draw = computeElo({ playerRating: 1500, opponentRating: 1500, result: "draw" });
    expect(draw.delta).toBe(0);
    expect(draw.newRating).toBe(1500);
  });

  test("beating a 200-ELO-stronger opponent rewards more than a flat win, losing punishes less than a flat loss", () => {
    const win = computeElo({ playerRating: 1000, opponentRating: 1200, result: "win" });
    expect(win.delta).toBeGreaterThan(16);
    expect(win.delta).toBeLessThanOrEqual(DEFAULT_ELO_K_FACTOR);

    const loss = computeElo({ playerRating: 1000, opponentRating: 1200, result: "loss" });
    expect(loss.delta).toBeGreaterThan(-16);
    expect(loss.delta).toBeLessThan(0);
  });

  test("beating a 200-ELO-weaker opponent rewards less than a flat win, losing punishes more than a flat loss", () => {
    const win = computeElo({ playerRating: 1200, opponentRating: 1000, result: "win" });
    expect(win.delta).toBeLessThan(16);
    expect(win.delta).toBeGreaterThan(0);

    const loss = computeElo({ playerRating: 1200, opponentRating: 1000, result: "loss" });
    expect(loss.delta).toBeLessThan(-16);
    expect(loss.delta).toBeGreaterThanOrEqual(-DEFAULT_ELO_K_FACTOR);
  });

  test("draws against a stronger opponent net positive deltas; against a weaker opponent net negative", () => {
    const drawUp = computeElo({ playerRating: 1000, opponentRating: 1200, result: "draw" });
    expect(drawUp.delta).toBeGreaterThan(0);

    const drawDown = computeElo({ playerRating: 1200, opponentRating: 1000, result: "draw" });
    expect(drawDown.delta).toBeLessThan(0);
  });

  test("a player at floor 100 stays at 100 after losing to a 2000-ELO opponent (delta is the floor diff, not -32)", () => {
    const result = computeElo({ playerRating: 100, opponentRating: 2000, result: "loss" });
    expect(result.newRating).toBe(DEFAULT_ELO_FLOOR);
    expect(result.newRating).toBe(100);
    expect(result.delta).toBe(0);
  });

  test("the floor caps the new rating, not the raw delta — a near-floor player losing to an equal opponent is clamped to the floor", () => {
    // 110 vs 110: expected 0.5, raw delta = 32 * (0 - 0.5) = -16, raw new = 94 → clamped to 100.
    const start = 110;
    const result = computeElo({ playerRating: start, opponentRating: start, result: "loss" });
    expect(result.newRating).toBe(DEFAULT_ELO_FLOOR);
    expect(result.newRating).toBe(100);
    expect(result.delta).toBe(100 - start);
    expect(result.delta).toBe(-10);
  });

  test("custom kFactor scales deltas linearly", () => {
    const win = computeElo({ playerRating: 1000, opponentRating: 1000, result: "win", kFactor: 64 });
    expect(win.delta).toBe(32);

    const loss = computeElo({ playerRating: 1000, opponentRating: 1000, result: "loss", kFactor: 16 });
    expect(loss.delta).toBe(-8);
  });

  test("custom floor is honoured (e.g. 0)", () => {
    // 5 vs 5: expected 0.5, raw new = -11 → clamped to floor 0 (not the default 100).
    const result = computeElo({ playerRating: 5, opponentRating: 5, result: "loss", floor: 0 });
    expect(result.newRating).toBe(0);
    expect(result.delta).toBe(-5);
  });

  test("non-numeric ratings fall back to the default 1000", () => {
    const result = computeElo({
      playerRating: Number.NaN,
      opponentRating: Number.POSITIVE_INFINITY,
      result: "win",
    });
    expect(result.newRating).toBe(DEFAULT_ELO_RATING + 16);
    expect(result.delta).toBe(16);
  });

  test("a win + loss pair against equal-rating opponents is symmetric (+16 / -16) so total ELO is conserved", () => {
    const winnerOutcome = computeElo({ playerRating: 1500, opponentRating: 1500, result: "win" });
    const loserOutcome = computeElo({ playerRating: 1500, opponentRating: 1500, result: "loss" });
    expect(winnerOutcome.delta + loserOutcome.delta).toBe(0);
  });
});
