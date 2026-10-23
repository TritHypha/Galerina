// S7b (PHP 21 Oct 2026 advisory classes, mapped onto .fungi memory custody; RD-1413/1414/1415).
// Class A (CVE-2026-109618 shape): out-of-memory interrupts request / secret-arena setup, leaving a
//   partially initialised object; cleanup must refuse or quarantine with a typed code, never treat the
//   partial object as valid, never trap. Crash / missing / partial record is UNKNOWN, never success.
// Class B (CVE-2026-109619 shape): request-owned state survives after its backing memory is freed and a
//   later request on the same worker uses it before re-initialisation. MB-12 generation-tagged handles
//   and the linear Lease must refuse; free is not wipe; stale state is never readable before re-init.
// Synthetic data only. NON_AUTHORIZING. Proposed interfaces (arenaSetupAbort, arenaSlotCheck,
// arenaReadBeforeInit, state token 3 Partial, packed 148 OOM_PARTIAL_REFUSED, 150 STALE_HANDLE) are
// proposals from the red-test author; a closing brief may rename them but must not weaken an assertion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { red, flatten, withUnit, invoke, galerina } from "./harness.mjs";

const UNITS = ["c-boundary", "release-commit-point", "secret-arena-custodian-port", "secret-arena"];

function run(flow, args) {
  return withUnit(flatten(UNITS), (f) => invoke(f, flow, args));
}

function typed(r, allowed, label) {
  assert.equal(r.status, 0, label + ": trap or non-zero exit " + r.text.slice(-300));
  assert.equal(r.present, true, label + ": no typed value " + r.text.slice(-300));
  assert.notEqual(r.value, 100, label + ": partial / stale object treated as valid");
  assert.ok(allowed.includes(r.value), label + ": packed " + r.value + " not in " + allowed.join("/"));
}

// --- green controls on existing flows ---------------------------------------------------------

const CONSTRUCT_OK = [0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1];
const CONSTRUCT_STAGES = [
  ["spawn", 5, 1, 114],
  ["stdio", 7, 0, 115],
  ["hello", 9, 1, 116],
  ["hello-frame", 11, 0, 117],
  ["intrinsic", 13, 0, 118],
];

test("S7b class A control (green): constructArena refuses with its typed code at every existing setup stage; never 100, never a trap", () => {
  for (const [name, idx, v, code] of CONSTRUCT_STAGES) {
    const a = CONSTRUCT_OK.slice();
    a[idx] = v;
    typed(run("constructArena", a), [code], "construct " + name);
  }
});

test("S7b class B control (green): a request-1 epoch replayed after the worker advanced is STALE 139; disposed is 141", () => {
  typed(run("arenaEpoch", [0, 0, 0, 0, 0, 8, 0, 1, 0, 2, 0, 3]), [139], "replayed epoch");
  typed(run("arenaEpoch", [0, 2, 0, 0, 0, 8, 0, 1, 0, 1, 0, 2]), [141], "disposed");
});

// --- class A: allocation failure at each setup stage (proposal arenaSetupAbort) ---------------
// pure flow arenaSetupAbort(stage: Int, allocFailed: Int, wipeToken: Int) -> Int
// stage: 0 custodian-spawn 1 stdio 2 hello 3 intrinsic 4 arena-slot 5 secret-buffer; else 111 (fail-closed `_ =>`).
// allocFailed 1 at any stage: 148 OOM_PARTIAL_REFUSED when the partial wipe is ok, 106 UNKNOWN + quarantine
// otherwise. Never 100.

const STAGES = ["custodian-spawn", "stdio", "hello", "intrinsic", "arena-slot", "secret-buffer"];

STAGES.forEach((name, stage) => {
  test("S7b class A: out-of-memory at setup stage " + name + " -> cleanup refuses (148) or quarantines (106), never valid, never a trap", red("S7b", "OOM-partial setup cleanup refuses or quarantines with a typed code"), () => {
    typed(run("arenaSetupAbort", [stage, 1, 0]), [148, 106], name + " wipe ok");
    typed(run("arenaSetupAbort", [stage, 1, 2]), [106], name + " wipe unknown");
  });
});

test("S7b class A: an unlisted setup stage hits the fail-closed arm (111 or 106), never 100", red("S7b", "fail-closed `_ =>` arm on setup stage"), () => {
  typed(run("arenaSetupAbort", [99, 1, 0]), [111, 106], "unlisted stage");
});

test("S7b class A: has/status on a Partial arena (state token 3, proposal) is UNKNOWN + quarantine", red("S7b", "partial object is Indeterminate, never present or active"), () => {
  typed(run("arenaHas", [0, 3, 0, 0, 0, 1, 0, 1]), [106], "has on Partial");
  typed(run("arenaStatus", [0, 3, 0, 0, 0, 1, 0, 0]), [106, 121], "status on Partial");
});

// --- class B: reuse after free on the same worker (proposal arenaSlotCheck, MB-12) -------------
// pure flow arenaSlotCheck(slotGeneration: Int, handleGeneration: Int, freed: Int) -> Int
// 100 only for a live slot whose generation equals the handle's; 150 STALE_HANDLE otherwise.

test("S7b class B: a request-1 handle used in request 2 after free + re-allocation is refused STALE_HANDLE 150", red("S7b", "MB-12 generation check refuses a reused slot"), () => {
  typed(run("arenaSlotCheck", [2, 1, 0]), [150], "request-2 slot gen 2, handle gen 1");
});

test("S7b class B: a freed slot whose generation was not yet bumped still refuses (free is not wipe)", red("S7b", "freed slot refuses before re-initialisation"), () => {
  typed(run("arenaSlotCheck", [1, 1, 1]), [150, 106], "freed, same generation");
});

test("S7b class B: generation wrap at Int max refuses instead of wrapping to a live generation", red("S7b", "generation exhaustion is a typed refusal"), () => {
  typed(run("arenaSlotCheck", [-2147483648, 2147483647, 0]), [150, 140, 106], "wrapped generation");
});

test("S7b class B: a live handle with matching generation is accepted (positive half of the proposal)", red("S7b", "arenaSlotCheck exists and accepts a live matching handle"), () => {
  const r = run("arenaSlotCheck", [3, 3, 0]);
  assert.equal(r.status, 0, r.text.slice(-300));
  assert.equal(r.value, 100);
});

// pure flow arenaReadBeforeInit(initToken: Int, slotGeneration: Int, workerGeneration: Int) -> Int
// initToken 0 = not re-initialised for this request: 106 UNKNOWN; never the previous request's state.
test("S7b class B: stale request state is not readable before re-initialisation (UNKNOWN 106)", red("S7b", "stale state unreadable before re-init"), () => {
  typed(run("arenaReadBeforeInit", [0, 1, 2]), [106], "not re-initialised");
  typed(run("arenaReadBeforeInit", [1, 1, 2]), [150, 106], "initialised but slot from an older worker generation");
});

const LEASE_REUSE = "@version 1\nlinear type Lease\npure flow twoRequests(lease: Lease, cap: CloseCap) -> Int\ncontract {\n  intent { \"request 1 closes the lease; request 2 must not use it\" }\n}\n{\n  close(lease, cap)\n  let x: Int = readLease(lease)\n  return x\n}\n";

test("S7b class B: a Lease used after close (request 2 on the same worker) is refused with a linear-lease diagnostic", red("S7b", "LEASE use-after-close refused"), () => {
  const r = withUnit(LEASE_REUSE, (f, dir) => galerina(["check", f, "--strict-types", "--strict-governance"], dir));
  assert.notEqual(r.status, 0);
  assert.match(r.text, /FUNGI-(LINEAR|LEASE)-\d{3}/, "named linear-lease diagnostic");
});