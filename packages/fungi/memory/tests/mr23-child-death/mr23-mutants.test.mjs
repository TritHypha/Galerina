// MR23 mutants: each must move a pinned value. Exact source string
// replacements on a flattened copy; the tracked unit is sha256-checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMutant, liveness, deathStep, leaseAfter, ST, CUSTODIAN_GONE, RUNNING, SIGKILL_MID, SIGKILL_IDLE } from "./mr23-harness.mjs";

function killed(needle, next, label, run, original) {
  withMutant(needle, next, label, () => {
    const r = run();
    assert.ok(!r.present || r.value !== original, label + " survived: " + r.text);
  });
}

test("D1 in-flight arm dropped (mid-request death read as idle) is killed", () => {
  killed("  if inFlight == 1 {\n    return finish(6, true)\n  }\n  return finish(53, true)",
    "  if inFlight > 9 {\n    return finish(6, true)\n  }\n  return finish(53, true)", "D1",
    () => liveness(SIGKILL_MID), 106);
});

test("D2 idle death admitted as running is killed", () => {
  killed("  return finish(53, true)\n}", "  return finish(0, true)\n}", "D2",
    () => liveness(SIGKILL_IDLE), CUSTODIAN_GONE);
});

test("D3 contradicting running reading admitted is killed", () => {
  killed("    if detail != 0 {\n      return finish(6, true)", "    if detail > 2147483646 {\n      return finish(6, true)", "D3",
    () => liveness({ exitKind: 0, detail: 9 }), 106);
});

test("D4 later lease opened against the stale state is killed", () => {
  killed("  return arenaLeaseOpen(0, nextState, liveClass, liveCount)", "  return arenaLeaseOpen(0, stateToken, liveClass, liveCount)", "D4",
    () => leaseAfter({ ...SIGKILL_IDLE, liveCount: 0 }), 106);
});

test("D5 signal 0 admitted as a death is killed", () => {
  killed("    if detail < 1 {\n      return finish(10, true)", "    if detail < 0 {\n      return finish(10, true)", "D5",
    () => liveness({ exitKind: 2, detail: 0 }), 110);
});

test("D6 153 listed as a benign code in arenaStateAfter is killed", () => {
  killed("  if packedCode == 151 {\n    return 0\n  }", "  if packedCode == 151 {\n    return 0\n  }\n  if packedCode == 153 {\n    return 0\n  }", "D6",
    () => deathStep(1, ST.active, SIGKILL_IDLE), 1531);
});

test("D7 unreadable reading passed through as benign 110 is killed", () => {
  killed("    return 153\n  }\n  return 106\n}", "    return 153\n  }\n  return raw\n}", "D7",
    () => leaseAfter({ exitKind: 2, detail: 0, liveCount: 0 }), 106);
});

test("baseline the mutants move", () => {
  assert.equal(liveness(RUNNING).value, 100);
  assert.equal(deathStep(1, ST.active, SIGKILL_IDLE).value, 1531);
});
