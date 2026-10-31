// MR23 child reading wired through arenaStep: one-way state, never undone.
import { test } from "node:test";
import { deathStep, expectPacked, ST, RUNNING, SIGKILL_MID, SIGKILL_IDLE } from "./mr23-harness.mjs";

test("running child keeps Active (1000) and keeps Quarantined/Partial quarantined", () => {
  expectPacked(deathStep(3, ST.active, RUNNING), 1000, "use, Active");
  expectPacked(deathStep(3, ST.quarantined, RUNNING), 1001, "use, Quarantined stays");
  expectPacked(deathStep(1, ST.partial, RUNNING), 1001, "status, Partial never Active");
});

test("SIGKILL mid-request quarantines the arena in the same value", () => {
  expectPacked(deathStep(3, ST.active, SIGKILL_MID), 1061, "use in flight");
  expectPacked(deathStep(4, ST.active, SIGKILL_MID), 1061, "put in flight");
  expectPacked(deathStep(7, ST.active, SIGKILL_MID), 1061, "release in flight");
});

test("death while idle is 1531: 153 is unlisted in arenaStateAfter, so it quarantines", () => {
  expectPacked(deathStep(1, ST.active, SIGKILL_IDLE), 1531, "status idle");
  expectPacked(deathStep(6, ST.active, SIGKILL_IDLE), 1531, "lease idle");
});

test("Disposed stays Disposed and an in-flight dispose ends Disposed with 106", () => {
  expectPacked(deathStep(1, ST.disposed, SIGKILL_IDLE), 1532, "disposed idle");
  expectPacked(deathStep(5, ST.active, SIGKILL_MID), 1062, "dispose in flight");
});

test("unlisted op or state is 11", () => {
  expectPacked(deathStep(9, ST.active, SIGKILL_MID), 11, "op 9");
  expectPacked(deathStep(-1, ST.active, RUNNING), 11, "op -1");
  expectPacked(deathStep(3, 4, SIGKILL_MID), 11, "state 4");
});

test("an unreadable child reading quarantines instead of keeping Active", () => {
  expectPacked(deathStep(3, ST.active, { exitKind: 2, detail: 0, inFlight: 1 }), 1061, "signal 0, use");
  expectPacked(deathStep(1, ST.active, { exitKind: 0, detail: 0, exitClass: 99 }), 1061, "exit class 99, status");
});
