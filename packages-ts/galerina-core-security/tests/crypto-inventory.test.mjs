import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_SEC_CIV_001,
  FUNGI_SEC_CIV_002,
  FUNGI_SEC_CIV_003,
  FUNGI_SEC_CIV_004,
  FUNGI_SEC_CIV_005,
  CRYPTO_INVENTORY_SCHEMA,
  CRYPTO_INVENTORY_ALGORITHMS,
  CRYPTO_ALGORITHM_BASELINE_LABELS,
  DEFAULT_CRYPTOGRAPHIC_POLICY,
  readCryptoInventory,
  lookupCryptoAlgorithmLabel,
} from "../dist/index.js";

const use = (o = {}) => ({
  purpose: "manifest_signature",
  algorithm: "ed25519",
  status: "quantum_vulnerable",
  policyDecision: "approved",
  hardCoded: false,
  migrationPath: "hybrid_planned",
  ...o,
});

const report = (uses, o = {}) => ({
  schema: CRYPTO_INVENTORY_SCHEMA,
  uses,
  postQuantumReadiness: "not_ready",
  complete: true,
  diagnostics: [],
  ...o,
});

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);

test("algorithm vocabulary pins to the in-package crypto policy plus ml-dsa-65, every algorithm labelled", () => {
  const policy = [...DEFAULT_CRYPTOGRAPHIC_POLICY.allowedAlgorithms, ...DEFAULT_CRYPTOGRAPHIC_POLICY.deniedAlgorithms, "ml-dsa-65"].sort();
  assert.deepEqual([...CRYPTO_INVENTORY_ALGORITHMS], policy);
  assert.deepEqual(Object.keys(CRYPTO_ALGORITHM_BASELINE_LABELS).sort(), policy);
  for (const weak of DEFAULT_CRYPTOGRAPHIC_POLICY.deniedAlgorithms) {
    assert.equal(CRYPTO_ALGORITHM_BASELINE_LABELS[weak], "legacy_weak");
  }
  assert.equal(Object.isFrozen(CRYPTO_ALGORITHM_BASELINE_LABELS), true);
  const r = lookupCryptoAlgorithmLabel("ml-dsa-65");
  assert.equal(r.ok && r.value, "post_quantum");
  for (const bad of ["RSA-2048-secret-XYZ", Number.NaN, null, undefined, 7, {}]) {
    const m = lookupCryptoAlgorithmLabel(bad);
    assert.equal(codeOf(m), FUNGI_SEC_CIV_005);
    assert.equal(JSON.stringify(m).includes("XYZ"), false);
  }
});

test("valid inventory round-trips frozen; not_ready and not_assessed always admissible", () => {
  const uses = [
    use({ purpose: "data_encryption", algorithm: "aes-256-gcm", status: "symmetric_or_hash", migrationPath: "none" }),
    use(),
    use({ purpose: "manifest_signature", algorithm: "ml-dsa-65", status: "post_quantum", migrationPath: "not_applicable" }),
    use({ purpose: "transport", algorithm: "rsa-pkcs1-v1_5", status: "legacy_weak", policyDecision: "denied", hardCoded: true, migrationPath: "post_quantum_planned" }),
    use({ purpose: "transport", algorithm: "x25519", status: "unassessed", policyDecision: "review", migrationPath: "none" }),
  ];
  for (const readiness of ["not_ready", "not_assessed"]) {
    const r = readCryptoInventory(report(uses, { postQuantumReadiness: readiness }));
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    assert.equal(r.value.uses.length, 5);
    assert.equal(r.value.postQuantumReadiness, readiness);
    assert.equal(Object.isFrozen(r.value), true);
    assert.equal(Object.isFrozen(r.value.uses[0]), true);
  }
});

test("ready is refused unless complete, non-empty and every use is post_quantum or symmetric_or_hash", () => {
  const pq = use({ algorithm: "ml-dsa-65", status: "post_quantum", migrationPath: "not_applicable" });
  const sym = use({ purpose: "integrity_digest", algorithm: "sha-256", status: "symmetric_or_hash", migrationPath: "none" });
  assert.equal(codeOf(readCryptoInventory(report([sym, pq], { postQuantumReadiness: "ready" }))), "ok");
  assert.equal(codeOf(readCryptoInventory(report([], { postQuantumReadiness: "ready" }))), FUNGI_SEC_CIV_005);
  assert.equal(codeOf(readCryptoInventory(report([sym, pq], { postQuantumReadiness: "ready", complete: false }))), FUNGI_SEC_CIV_005);
  assert.equal(codeOf(readCryptoInventory(report([use()], { postQuantumReadiness: "ready" }))), FUNGI_SEC_CIV_005);
  const unassessedPq = use({ algorithm: "ml-dsa-65", status: "unassessed", policyDecision: "review", migrationPath: "not_applicable" });
  assert.equal(codeOf(readCryptoInventory(report([unassessedPq], { postQuantumReadiness: "ready" }))), FUNGI_SEC_CIV_005);
  assert.equal(codeOf(readCryptoInventory(report([pq], { postQuantumReadiness: true }))), FUNGI_SEC_CIV_002);
  assert.equal(codeOf(readCryptoInventory(report([pq], { postQuantumReadiness: "maybe" }))), FUNGI_SEC_CIV_002);
});

test("use consistency: labels, weak deny, unassessed / hard-coded never approved, migration states", () => {
  const cases = [
    [use({ status: "post_quantum", migrationPath: "not_applicable" }), FUNGI_SEC_CIV_003],
    [use({ algorithm: "md5", status: "unassessed", policyDecision: "denied" }), FUNGI_SEC_CIV_003],
    [use({ algorithm: "md5", status: "legacy_weak", policyDecision: "review" }), FUNGI_SEC_CIV_003],
    [use({ status: "unassessed", policyDecision: "approved" }), FUNGI_SEC_CIV_003],
    [use({ hardCoded: true }), FUNGI_SEC_CIV_003],
    [use({ migrationPath: "not_applicable" }), FUNGI_SEC_CIV_003],
    [use({ algorithm: "ml-dsa-65", status: "post_quantum", migrationPath: "hybrid_planned" }), FUNGI_SEC_CIV_003],
    [use({ algorithm: "rsa-2048" }), FUNGI_SEC_CIV_002],
    [use({ purpose: "legacy_tls" }), FUNGI_SEC_CIV_002],
    [use({ policyDecision: "allow" }), FUNGI_SEC_CIV_002],
    [use({ hardCoded: "no" }), FUNGI_SEC_CIV_002],
    [use({ migrationPath: Number.NaN }), FUNGI_SEC_CIV_002],
  ];
  for (const [u, code] of cases) assert.equal(codeOf(readCryptoInventory(report([u]))), code);
  assert.equal(codeOf(readCryptoInventory(report([use(), use()]))), FUNGI_SEC_CIV_003);
  const a = use({ purpose: "transport", algorithm: "x25519", status: "quantum_vulnerable", migrationPath: "none" });
  assert.equal(codeOf(readCryptoInventory(report([a, use()]))), FUNGI_SEC_CIV_003);
});

test("closed shapes refuse unknown keys, missing fields, null, NaN, undefined and wrong schema without echo", () => {
  const extra = readCryptoInventory({ ...report([use()]), secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_SEC_CIV_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  const { complete: _c, ...missing } = report([use()]);
  assert.equal(codeOf(readCryptoInventory(missing)), FUNGI_SEC_CIV_001);
  for (const bad of [null, undefined, Number.NaN, "x", [], 1]) {
    assert.equal(codeOf(readCryptoInventory(bad)), FUNGI_SEC_CIV_001);
  }
  assert.equal(codeOf(readCryptoInventory(report([use()], { schema: "galerina.crypto.inventory" }))), FUNGI_SEC_CIV_002);
  assert.equal(codeOf(readCryptoInventory(report([use({ keyXYZ: 1 })]))), FUNGI_SEC_CIV_001);
  assert.equal(codeOf(readCryptoInventory(report([null]))), FUNGI_SEC_CIV_004);
  assert.equal(codeOf(readCryptoInventory(report({ 0: use(), length: 1 }))), FUNGI_SEC_CIV_004);
  assert.equal(codeOf(readCryptoInventory(report([use()], { complete: undefined }))), FUNGI_SEC_CIV_002);
  const d = { code: "X", severity: "error", message: "m", field: "uses" };
  assert.equal(codeOf(readCryptoInventory(report([use()], { diagnostics: [d] }))), FUNGI_SEC_CIV_005);
});

test("hostile getters, proxies and sparse arrays refuse without running getters or throwing", () => {
  let ran = false;
  const getterUse = use();
  Object.defineProperty(getterUse, "algorithm", { get() { ran = true; return "ed25519"; }, enumerable: true });
  assert.equal(codeOf(readCryptoInventory(report([getterUse]))), FUNGI_SEC_CIV_004);
  const proxy = new Proxy(report([use()]), {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => readCryptoInventory(proxy));
  assert.equal(codeOf(readCryptoInventory(proxy)), FUNGI_SEC_CIV_001);
  const sparse = [use()];
  sparse.length = 2;
  assert.equal(codeOf(readCryptoInventory(report(sparse))), FUNGI_SEC_CIV_004);
  const sym = report([use()]);
  sym[Symbol("s")] = 1;
  assert.equal(codeOf(readCryptoInventory(sym)), FUNGI_SEC_CIV_001);
  class Box { constructor() { Object.assign(this, report([use()])); } }
  assert.equal(codeOf(readCryptoInventory(new Box())), FUNGI_SEC_CIV_001);
  assert.equal(ran, false);
});
