// S10-R2 generator: composed RD-1413 -> 1414 -> 1415 run receipt and RD-1296 A-E disposition table.
// Usage: node packages/fungi/memory/tests/s10-composed/gen-composed-receipt.mjs
// Writes evidence/closure/S10-composed-run-receipt.json and evidence/closure/S10-rd1296-ae-disposition.json.
// Evidence, not a claim: every value below is produced by invoking the pinned unit now; stage tokens and the
// composed outcome are derived from those values, never typed in. Synthetic data only. NON_AUTHORIZING.
// Replay scope: run --invoke cannot call imported helpers (B5), so the receipt replays the self-contained
// stage units (body-reader, release-commit-point, release-idempotency). Importing units (auth-verify-route,
// query-custody, secret-arena, secret-gate) are covered by their flattened S5-S8 suites, not by this receipt;
// the receipt says so in replayScope rather than claiming them.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { REPO, SRC, EVIDENCE, GALERINA, invoke } from "./harness.mjs";

const REL = "packages/fungi/memory/src/";
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const unit = (name) => ({ path: REL + name, sha256: sha(join(REPO, REL + name)) });

function run(file, flow, args) {
  const r = invoke(join(REPO, REL + file), flow, args);
  if (r.status !== 0 || r.present !== true) {
    return { file: REL + file, flow, args, value: null };
  }
  return { file: REL + file, flow, args, value: r.value };
}

// Missing value (crash, absent record) is MissingRecord 4, never Success.
function anyMissing(inv) {
  return inv.some((v) => v.value === null);
}

// 1413 ingress: one owned 16-byte chunk under the default cap, declared length matches, stream present.
// readChunks packs refusalCode + wipe construct; only refusal 0 (0 or 100) is Success; anything else refuses
// before begin (1). Nothing has begun at ingress.
function ingress() {
  const inv = [run("body-reader.fungi", "readChunks", [0, 1, 1, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 16384, 1, 0, 16, 1, 0, 0])];
  if (anyMissing(inv)) return { inv, token: 4, rule: "missing value is MissingRecord" };
  const v = inv[0].value;
  return { inv, token: v === 0 || v === 100 ? 0 : 1, rule: "refusal 0 (packed 0 or 100) Success; any other listed refusal Refused before begin" };
}

// 1414 custody: the one CAS claims an OPEN capability for release-begin (claim and revoke share one CAS).
// 100 claimed Success; 106 Indeterminate 3; any other value refuses before begin 1.
function custody() {
  const inv = [run("release-commit-point.fungi", "casBegin", [0, 0])];
  if (anyMissing(inv)) return { inv, token: 4, rule: "missing value is MissingRecord" };
  const v = inv[0].value;
  return { inv, token: v === 100 ? 0 : v === 106 ? 3 : 1, rule: "casBegin 100 Success; 106 Indeterminate; else Refused before begin" };
}

// 1415 release: reserve the idempotency key, then commit and reconcile after dispatch. Zero-trust inputs:
// post-dispatch delivery is reported Indeterminate (deliveryOutcome 2) because the spent POST /auth/verify path
// has no consumer acknowledgement (auth-verify-e2e: honest spent happy path is 106), and reconciliation of the
// expired reservation has no durable consumer record (durableRecord 0). Rejected: deliveryOutcome 0 Success
// (would assert a delivery nothing observed). Reserve not 100 -> Refused before begin 1; commit 100 -> Success;
// commit 102 -> Failed after begin 2; 106 after reconcile 106 -> Indeterminate 3; any other value -> 2.
function release() {
  const inv = [
    run("release-idempotency.fungi", "reserveReleaseIdempotency", [1, 0, 0]),
    run("release-idempotency.fungi", "commitReleaseIdempotency", [1, 1, 2]),
    run("release-idempotency.fungi", "reconcileReleaseIdempotency", [1, 1, 0]),
  ];
  if (anyMissing(inv)) return { inv, token: 4, rule: "missing value is MissingRecord" };
  const [r, c, k] = inv.map((v) => v.value);
  let token = 2;
  if (r !== 100) token = 1;
  else if (c === 100) token = 0;
  else if (c === 102) token = 2;
  else if (c === 106 && k === 100) token = 0;
  else if (c === 106) token = 3;
  return { inv, token, rule: "reserve!=100 Refused; commit 100 Success; commit 102 Failed; commit 106 settles only on reconcile 100, else Indeterminate; else Failed" };
}

const OUTCOME = { 100: "Success", 102: "Refused", 106: "Indeterminate" };
const stages = [
  ["1413-ingress", ["body-reader.fungi"], ingress()],
  ["1414-custody", ["release-commit-point.fungi"], custody()],
  ["1415-release", ["release-idempotency.fungi"], release()],
].map(([stage, units, s]) => ({ stage, units: units.map(unit), invocations: s.inv, token: s.token, tokenRule: s.rule }));

for (const s of stages) {
  for (const v of s.invocations) if (v.value === null) throw new Error("gen: " + s.stage + " " + v.flow + " produced no value; refusing to write a receipt");
}

const tokens = stages.map((s) => s.token);
const c = invoke(join(SRC, "composed-route.fungi"), "composeRouteOutcome", tokens);
if (c.status !== 0 || c.present !== true) throw new Error("gen: composeRouteOutcome produced no value");
const receipt = {
  schema: "galerina.s10.composed-run-receipt.v1",
  authorizing: false,
  status: "NON_AUTHORIZING",
  secretsProvider: "synthetic",
  realCredential: "UNKNOWN",
  productionClearance: false,
  toolchain: { galerina: "galerina.mjs", galerinaSha256: sha(GALERINA), node: process.version },
  composedUnit: unit("composed-route.fungi"),
  stageTokens: "0 Success 1 Refused(before begin) 2 Failed(after begin) 3 Indeterminate 4 MissingRecord 5 NotRun",
  stages,
  composed: { flow: "composeRouteOutcome", tokens, outcomeCode: c.value, outcome: OUTCOME[c.value] || "Refused" },
  replayScope: "Replays only self-contained stage units (run --invoke cannot call imported helpers, B5). Importing units auth-verify-route, query-custody, secret-arena and secret-gate are covered by flattened S5-S8 suites, not by this receipt.",
  note: "Indeterminate is the honest composed outcome: post-dispatch delivery has no consumer acknowledgement and no durable consumer record, so the release stage stays DELIVERY_UNKNOWN. Not production clearance.",
};

// RD-1296 A-E. RD-1296:16 routes A,B -> RD-1413, C -> RD-1414, D,E -> RD-1415; WASM-Q1 deferred.
// Every A-E successor route is exercised only with the synthetic SecretsProvider (S5-S8), and the real
// POST /auth/verify credential is the owner's open question, so evidence is synthetic-only (2): UNRESOLVED.
// No owner-signed retirement exists for any row, so nothing is RETIRED. Rejected: SATISFIED from merged S5-S8
// suites (synthetic route; docs/TODO.md: disposition must be against the selected real route).
const NAME = { 100: "SATISFIED", 106: "UNRESOLVED", 108: "RETIRED" };
const EV = {
  "RD-1413": ["packages/fungi/memory/tests/s6-loaded-ingress/s6-loaded-ingress.test.mjs", "packages/fungi/memory/src/auth-verify-route.fungi"],
  "RD-1414": ["packages/fungi/memory/tests/s7-product-custody/s7b-php-oom-reuse.test.mjs", "packages/fungi/memory/src/secret-arena.fungi"],
  "RD-1415": ["packages/fungi/memory/tests/s8-release/s8b-idempotency.test.mjs", "packages/fungi/memory/src/release-idempotency.fungi"],
};
const ROWS = [
  ["A", "RD-1413", 1, 2], ["B", "RD-1413", 1, 2], ["C", "RD-1414", 1, 2],
  ["D", "RD-1415", 1, 2], ["E", "RD-1415", 1, 2], ["WASM-Q1", "DEFERRED", 0, 0],
];
const rows = ROWS.map(([obligation, successor, s, e], i) => {
  const tokens = { letter: i + 1, successorBound: s, evidence: e, ownerRetire: 0 };
  const r = invoke(join(SRC, "composed-route.fungi"), "classifyAeObligation", [tokens.letter, s, e, 0]);
  if (r.status !== 0 || r.present !== true || !(r.value in NAME)) throw new Error("gen: classifyAeObligation " + obligation + " no disposition");
  const wasm = obligation === "WASM-Q1";
  return {
    obligation,
    successor,
    tokens,
    disposition: NAME[r.value],
    evidenceKind: wasm ? "none" : "synthetic-only",
    evidence: wasm ? [] : EV[successor],
    ownerDecision: null,
    reason: wasm
      ? "WebAssembly-specific historical WAT Q1 obligation: a gateway route never satisfies it (RD-1415:74) and no owner-signed retirement exists, so it stays UNRESOLVED (typed UNKNOWN)."
      : "Successor " + successor + " route is exercised only with the synthetic SecretsProvider; the real POST /auth/verify credential is the owner's open question, so synthetic evidence does not satisfy it (RD-1415:62). UNRESOLVED (typed UNKNOWN), not retired.",
  };
});
const table = {
  schema: "galerina.s10.rd1296-ae-disposition.v1",
  authorizing: false,
  status: "NON_AUTHORIZING",
  classifier: { unit: unit("composed-route.fungi"), flow: "classifyAeObligation" },
  rows,
};

mkdirSync(join(EVIDENCE, "closure"), { recursive: true });
writeFileSync(join(EVIDENCE, "closure", "S10-composed-run-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
writeFileSync(join(EVIDENCE, "closure", "S10-rd1296-ae-disposition.json"), JSON.stringify(table, null, 2) + "\n");
console.log("S10 receipt tokens " + tokens.join(",") + " composed " + c.value + " " + receipt.composed.outcome + "; A-E " + rows.map((r) => r.obligation + ":" + r.disposition).join(" "));