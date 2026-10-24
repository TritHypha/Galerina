// S7d (round d): pins the gaps the S7 round check (085337e4d) found with 9 surviving mutants.
// Every assertion is an exact packed value, so a removed or widened arm cannot hide behind an
// "allowed set". Synthetic data only. NON_AUTHORIZING. Zero-trust reading: a Partial arena is
// Indeterminate on every operation (not only has/status); an abort with no recorded allocation
// failure is UNKNOWN, never the 148 refusal; generations outside 1..2147483646 are 140 invalid,
// never a 150 mismatch that a later bump could turn live; unlisted tokens hit the `_ =>` arm 111.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, withUnit, invoke } from "./harness.mjs";

const UNITS = ["c-boundary", "release-commit-point", "secret-arena-custodian-port", "secret-arena"];

function exact(flow, args, want, label) {
  const r = withUnit(flatten(UNITS), (f) => invoke(f, flow, args));
  assert.equal(r.status, 0, label + ": trap or non-zero exit " + r.text.slice(-300));
  assert.equal(r.present, true, label + ": no typed value " + r.text.slice(-300));
  assert.equal(r.value, want, label + ": packed " + r.value + " expected " + want);
}

// Suite-37 default (Active, otherwise valid) vectors with the state token set to 3 (Partial).
const EPOCH = [0, 3, 0, 0, 0, 8, 0, 1, 0, 1, 0, 2];
const USE = [0, 3, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1000, 0, 1, 0, 1000, 0, 5000, 0, 1, 0, 1];
const PUT = [0, 3, 0, 1, 0, 1, 0, 64, 0, 0, 0, 0, 0, 0];
const DISPOSE = [0, 3, 0, 0, 0, 0, 0, 106];
const DISPOSE_REC100 = [0, 3, 0, 0, 0, 0, 0, 100];
// Cleanup non-OK on a Partial arena: Active would give Failed 144; Partial must stay UNKNOWN 106,
// because a half-built object has no trustworthy cleanup verdict (zero trust: Indeterminate, not Failed).
const DISPOSE_CLEANUP_BAD = [0, 3, 0, 1, 0, 0, 0, 106];

test("S7d: a Partial arena (state 3) is UNKNOWN 106 on epoch, use, put and dispose, not only has/status", () => {
  exact("arenaEpoch", EPOCH, 106, "epoch on Partial");
  exact("arenaUse", USE, 106, "use on Partial");
  exact("arenaPut", PUT, 106, "put on Partial");
  exact("arenaDispose", DISPOSE, 106, "dispose on Partial");
  exact("arenaDispose", DISPOSE_REC100, 106, "dispose on Partial, recorded 100");
  exact("arenaDispose", DISPOSE_CLEANUP_BAD, 106, "dispose on Partial, cleanup non-OK");
  const act = DISPOSE_CLEANUP_BAD.slice();
  act[1] = 0;
  exact("arenaDispose", act, 144, "control: dispose on Active, cleanup non-OK is Failed 144");
});

test("S7d controls: the same vectors on an Active arena (state 0) are not 106 for epoch, use and put", () => {
  for (const [flow, v] of [["arenaEpoch", EPOCH], ["arenaUse", USE], ["arenaPut", PUT]]) {
    const a = v.slice();
    a[1] = 0;
    const r = withUnit(flatten(UNITS), (f) => invoke(f, flow, a));
    assert.equal(r.status, 0, flow + " active: " + r.text.slice(-300));
    assert.equal(r.present, true, flow + " active: no typed value");
    assert.notEqual(r.value, 106, flow + " active control must differ from the Partial refusal");
  }
});

test("S7d: setup abort with no recorded allocation failure is UNKNOWN 106 even when the wipe is ok (never 148)", () => {
  exact("arenaSetupAbort", [2, 0, 0], 106, "allocFailed 0, wipe ok");
  exact("arenaSetupAbort", [2, 2, 0], 106, "allocFailed 2 (unlisted), wipe ok");
  exact("arenaSetupAbort", [2, -1, 0], 106, "allocFailed -1, wipe ok");
  exact("arenaSetupAbort", [2, 1, 0], 148, "control: allocFailed 1, wipe ok");
});

test("S7d: arenaSlotCheck handle generation outside 1..2147483646 is 140, never a 150 mismatch", () => {
  exact("arenaSlotCheck", [1, 0, 0], 140, "handle gen 0, slot gen 1");
  exact("arenaSlotCheck", [5, -3, 0], 140, "handle gen negative");
  exact("arenaSlotCheck", [2147483646, 2147483647, 0], 140, "handle gen Int max");
  exact("arenaSlotCheck", [2147483647, 2147483646, 0], 140, "slot gen Int max");
  exact("arenaSlotCheck", [2147483646, 2147483646, 0], 100, "control: highest live generation");
});

test("S7d: arenaReadBeforeInit worker generation outside 1..2147483646 is 140", () => {
  exact("arenaReadBeforeInit", [1, 1, 0], 140, "worker gen 0");
  exact("arenaReadBeforeInit", [1, 2147483646, 2147483647], 140, "worker gen Int max");
  exact("arenaReadBeforeInit", [1, 0, 1], 140, "slot gen 0");
  exact("arenaReadBeforeInit", [1, 4, 4], 100, "control: initialised, same generation");
});

test("S7d: unlisted freed and init tokens hit the fail-closed arm 111", () => {
  exact("arenaSlotCheck", [3, 3, 2], 111, "freed 2");
  exact("arenaSlotCheck", [3, 3, -1], 111, "freed -1");
  exact("arenaReadBeforeInit", [2, 3, 3], 111, "init 2");
  exact("arenaReadBeforeInit", [-1, 3, 3], 111, "init -1");
});