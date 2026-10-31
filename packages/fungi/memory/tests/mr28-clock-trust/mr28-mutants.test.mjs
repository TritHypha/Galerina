// MR28 mutants: each guard in applyArenaClock is load-bearing.
import test from "node:test";
import { clockGate, expectPacked, withMutant, R } from "./mr28-harness.mjs";

function mutant(needle, next, label, probe, admitted) {
  withMutant(needle, next, label, () => {
    expectPacked(clockGate(probe), admitted, label + " mutant changes the verdict");
  });
}

test("armed time <= 0 guard is load-bearing", () => {
  mutant("  if armedAt <= 0 {\n", "  if armedAt < 0 {\n", "armed <= 0 to < 0", { clock: 0, armedAt: 0 }, R.admit);
  expectPacked(clockGate({ clock: 0, armedAt: 0 }), R.untrusted, "restored");
});

test("backwards guard is load-bearing for clock 0", () => {
  mutant("  if clock < armedAt {\n    return finish(22, true)\n  }\n", "", "drop backwards", { clock: 0, armedAt: 1000 }, R.admit);
});

test("negative clock guard is load-bearing", () => {
  mutant("  if clock < 0 {\n    return finish(11, true)\n  }\n", "", "drop negative clock", { clock: -1, armedAt: 1000 }, R.backwards);
});

test("presence guard is load-bearing", () => {
  mutant("  if clockPresent == 0 {\n    return finish(21, true)\n  }\n", "", "drop missing clock", { clockPresent: 0 }, R.untrusted);
});

test("epoch guard is load-bearing", () => {
  mutant("  if clockEpoch != armedEpoch {\n    return finish(23, true)\n  }\n", "", "drop epoch", { clockEpoch: 2, armedEpoch: 1 }, R.admit);
});

test("deadline guard is load-bearing", () => {
  mutant("  if clock > armedAt + budget - 1 {\n    return finish(47, true)\n  }\n", "", "drop deadline", { clock: 6000 }, R.admit);
});

test("budget guard is load-bearing", () => {
  mutant("  if budget < 1 {\n    return finish(11, true)\n  }\n", "", "drop budget", { budget: 0, clock: 999, armedAt: 1000 }, R.backwards);
});