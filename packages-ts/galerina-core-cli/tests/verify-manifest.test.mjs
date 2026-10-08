import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  verifyRuntimeManifest,
  verifyRuntimeManifestSet,
  verifyArtefacts,
  createVerificationReport,
  renderVerificationReport,
  RUNTIME_MANIFEST_SCHEMA,
  RUNTIME_MANIFEST_FIELDS,
  RUNTIME_MANIFEST_GOVERNANCE_FLAGS,
  RUNTIME_MANIFEST_QUALIFIERS,
  RUNTIME_MANIFEST_COMPUTE_TARGETS,
  FUNGI_VERIFY_006,
  FUNGI_VERIFY_007,
  FUNGI_VERIFY_008,
  FUNGI_VERIFY_009,
  FUNGI_VERIFY_010,
  FUNGI_VERIFY_011,
} from "../dist/index.js";

const F = RUNTIME_MANIFEST_GOVERNANCE_FLAGS;
const SECRET = "sk_live_DO_NOT_ECHO_51f0";

/** A record shaped like the governance verifier's production-profile output. */
const good = (over = {}) => ({
  schemaVersion: "fungi.runtime.manifest.v1",
  flow: "createOrder",
  qualifier: "secure",
  requiresAudit: true,
  deniesRemote: false,
  allowedEffects: ["audit.write", "database.write"],
  requiredContext: ["actor"],
  computeTarget: "best",
  governanceFlagsMask: F.RequiresAudit | F.RequiresActor | F.ProductionStrict,
  proofObligations: ["audit_required:createOrder", "invariant_static:createOrder:ensure total > 0:statically_verified"],
  policyPurposes: ["billing"],
  verified: true,
  arenaLimitMb: 8,
  ...over,
});
const codes = (r) => r.diagnostics.map((d) => d.code);
const fields = (r) => r.diagnostics.map((d) => `${d.code}:${d.field}`);
const noEcho = (r) => assert.ok(!JSON.stringify(r).includes(SECRET), "diagnostics must not echo refused values");

test("a producer-shaped record verifies, also after a JSON round trip (arenaLimitMb dropped)", () => {
  const r = verifyRuntimeManifest(good());
  assert.deepEqual(codes(r), []);
  assert.equal(r.verified, true);
  assert.equal(r.flow, "createOrder");
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.diagnostics));
  const rt = JSON.parse(JSON.stringify(good({ arenaLimitMb: undefined })));
  assert.equal("arenaLimitMb" in rt, false);
  assert.equal(verifyRuntimeManifest(rt).verified, true);
  assert.equal(verifyRuntimeManifest(good({ arenaLimitMb: undefined })).verified, true);
  const pure = good({ flow: "add", qualifier: "pure", requiresAudit: false, allowedEffects: [], requiredContext: [], governanceFlagsMask: F.ProductionStrict, proofObligations: [], policyPurposes: [] });
  assert.deepEqual(codes(verifyRuntimeManifest(pure)), []);
  assert.deepEqual(codes(verifyRuntimeManifest(Object.assign(Object.create(null), good()))), []);
});

test("closed shape: unknown, missing, symbol and accessor keys and non-plain objects refuse with 006", () => {
  const extra = verifyRuntimeManifest({ ...good(), [SECRET]: 1 });
  assert.deepEqual(fields(extra), [`${FUNGI_VERIFY_006}:record`]);
  noEcho(extra);
  const missing = good();
  delete missing.policyPurposes;
  assert.deepEqual(fields(verifyRuntimeManifest(missing)), [`${FUNGI_VERIFY_006}:policyPurposes`]);
  for (const bad of [null, undefined, 1, "x", [], [good()], new (class M {})(), new Map(), Object.assign(new Date(0), good())]) {
    assert.deepEqual(fields(verifyRuntimeManifest(bad)), [`${FUNGI_VERIFY_006}:record`]);
  }
  assert.deepEqual(codes(verifyRuntimeManifest({ ...good(), [Symbol("s")]: 1 })), [FUNGI_VERIFY_006]);
  let ran = false;
  const getter = good();
  Object.defineProperty(getter, "verified", { enumerable: true, get() { ran = true; return true; } });
  assert.deepEqual(fields(verifyRuntimeManifest(getter)), [`${FUNGI_VERIFY_006}:record`], "an accessor refuses the whole record");
  assert.equal(ran, false, "a getter must never run");
  const listGetter = good();
  Object.defineProperty(listGetter.allowedEffects, "0", { enumerable: true, get() { ran = true; return "audit.write"; } });
  assert.deepEqual(fields(verifyRuntimeManifest(listGetter)), [`${FUNGI_VERIFY_006}:allowedEffects`]);
  assert.equal(ran, false, "a list getter must never run");
});

test("hostile proxies and revoked proxies fail closed without throwing", () => {
  const throwing = new Proxy(good(), { ownKeys() { throw new Error(SECRET); }, getPrototypeOf() { return Object.prototype; } });
  assert.deepEqual(codes(verifyRuntimeManifest(throwing)), [FUNGI_VERIFY_006]);
  const { proxy, revoke } = Proxy.revocable(good(), {});
  revoke();
  assert.deepEqual(codes(verifyRuntimeManifest(proxy)), [FUNGI_VERIFY_006]);
  // A proxy that flips a value on each read is read once through its descriptor.
  let n = 0;
  const flipping = new Proxy(good(), {
    getOwnPropertyDescriptor(t, k) {
      const d = Reflect.getOwnPropertyDescriptor(t, k);
      if (k === "verified" && d) return { ...d, value: (n++ % 2) === 0 };
      return d;
    },
  });
  const r = verifyRuntimeManifest(flipping);
  assert.equal(n, 1, "each field is read exactly once");
  assert.equal(r.verified, true);
  const hostileList = good({ allowedEffects: new Proxy(["audit.write"], { ownKeys() { throw new Error("x"); } }) });
  assert.deepEqual(fields(verifyRuntimeManifest(hostileList)), [`${FUNGI_VERIFY_006}:allowedEffects`]);
});

test("an unknown schemaVersion refuses with 007 and no other field is interpreted", () => {
  for (const v of ["galerina.manifest.v1", "fungi.runtime.manifest.v2", "FUNGI.RUNTIME.MANIFEST.V1", ` ${RUNTIME_MANIFEST_SCHEMA}`]) {
    assert.deepEqual(fields(verifyRuntimeManifest(good({ schemaVersion: v, flow: "../x", verified: false }))), [`${FUNGI_VERIFY_007}:schemaVersion`]);
  }
  assert.deepEqual(fields(verifyRuntimeManifest(good({ schemaVersion: 1 }))), [`${FUNGI_VERIFY_006}:schemaVersion`]);
});

test("wrong types refuse with 006 naming the field", () => {
  const cases = [["flow", 1], ["qualifier", null], ["requiresAudit", "true"], ["deniesRemote", 0], ["verified", "yes"], ["computeTarget", ["best"]], ["governanceFlagsMask", "49"], ["arenaLimitMb", "8"], ["allowedEffects", "audit.write"], ["requiredContext", [1]], ["policyPurposes", {}], ["proofObligations", [null]]];
  for (const [field, value] of cases) {
    assert.deepEqual(fields(verifyRuntimeManifest(good({ [field]: value }))), [`${FUNGI_VERIFY_006}:${field}`], field);
  }
  const holey = ["audit.write", , "database.write"]; // eslint-disable-line no-sparse-arrays
  assert.deepEqual(fields(verifyRuntimeManifest(good({ allowedEffects: holey }))), [`${FUNGI_VERIFY_006}:allowedEffects`]);
  const tagged = Object.assign(["audit.write", "database.write"], { extra: SECRET });
  const r = verifyRuntimeManifest(good({ allowedEffects: tagged }));
  assert.deepEqual(fields(r), [`${FUNGI_VERIFY_006}:allowedEffects`]);
  noEcho(r);
  assert.deepEqual(fields(verifyRuntimeManifest(good({ proofObligations: new Array(1025).fill("audit_required:createOrder") }))), [`${FUNGI_VERIFY_006}:proofObligations`]);
});

test("values outside their closed domain refuse with 008 and are never echoed", () => {
  const cases = [
    ["flow", `../${SECRET}`], ["flow", ""], ["flow", "a".repeat(129)], ["flow", "café"],
    ["qualifier", "privileged"], ["qualifier", SECRET],
    ["computeTarget", "gpu"], ["computeTarget", SECRET],
    ["governanceFlagsMask", 256 | F.RequiresAudit | F.RequiresActor | F.ProductionStrict], ["governanceFlagsMask", -1], ["governanceFlagsMask", 1.5], ["governanceFlagsMask", Number.NaN],
    ["arenaLimitMb", 0], ["arenaLimitMb", -8], ["arenaLimitMb", Number.POSITIVE_INFINITY], ["arenaLimitMb", Number.NaN],
    ["allowedEffects", ["database.write", "audit.write"]], ["allowedEffects", ["audit.write", "audit.write"]], ["allowedEffects", ["audit.write", "network.*"]], ["allowedEffects", ["Audit.write"]], ["allowedEffects", [`${SECRET}.*`]],
    ["requiredContext", ["actor", "actor"]], ["requiredContext", ["actor", "a b"]],
    ["policyPurposes", ["billing", "billing"]], ["policyPurposes", [`x ${SECRET}`]],
    ["proofObligations", ["audit_required:createOrder\nforged"]], ["proofObligations", [""]], ["proofObligations", ["x".repeat(1025)]], ["proofObligations", ["a\u2028b"]],
  ];
  for (const [field, value] of cases) {
    const r = verifyRuntimeManifest(good({ [field]: value }));
    assert.deepEqual(fields(r), [`${FUNGI_VERIFY_008}:${field}`], `${field}=${String(value)}`);
    noEcho(r);
  }
  assert.equal(verifyRuntimeManifest(good({ flow: "../x" })).flow, "", "an invalid flow name is not carried");
});

test("fields that contradict each other refuse with 009", () => {
  const base = F.RequiresAudit | F.RequiresActor | F.ProductionStrict;
  const cases = [
    [{ requiresAudit: false }, "requiresAudit"],
    [{ deniesRemote: true }, "deniesRemote"],
    [{ requiredContext: [] }, "requiredContext"],
    [{ requiredContext: ["user_id"], governanceFlagsMask: F.RequiresAudit | F.ProductionStrict }, "requiredContext"],
    [{ governanceFlagsMask: F.RequiresAudit | F.RequiresActor }, "verified"],
    [{ qualifier: "guarded", governanceFlagsMask: base | F.RequiresIntent }, "qualifier"],
    [{ allowedEffects: [] }, "allowedEffects"],
    [{ proofObligations: ["audit_required:createOrderAll"] }, "proofObligations"],
    [{ proofObligations: ["createOrder"] }, "proofObligations"],
    [{ proofObligations: ["Audit:createOrder"] }, "proofObligations"],
    [{ proofObligations: ["audit_required:other:createOrder"] }, "proofObligations"],
  ];
  for (const [over, field] of cases) {
    assert.deepEqual(fields(verifyRuntimeManifest(good(over))), [`${FUNGI_VERIFY_009}:${field}`], JSON.stringify(over));
  }
  assert.deepEqual(codes(verifyRuntimeManifest(good({ qualifier: "secure", governanceFlagsMask: base | F.RequiresIntent }))), []);
  assert.deepEqual(codes(verifyRuntimeManifest(good({ deniesRemote: true, governanceFlagsMask: base | F.DenyRemote }))), []);
});

test("verified:false never verifies (010), even when consistent", () => {
  const r = verifyRuntimeManifest(good({ verified: false, governanceFlagsMask: F.RequiresAudit | F.RequiresActor }));
  assert.deepEqual(fields(r), [`${FUNGI_VERIFY_010}:verified`]);
  assert.equal(r.verified, false);
  assert.deepEqual(codes(verifyRuntimeManifest(good({ verified: false }))), [FUNGI_VERIFY_009, FUNGI_VERIFY_010]);
});

test("manifest sets need a non-empty dense array with unique flows (011)", () => {
  const ok = verifyRuntimeManifestSet([good(), good({ flow: "listOrders", proofObligations: ["audit_required:listOrders"] })]);
  assert.equal(ok.success, true);
  assert.deepEqual(ok.manifests.map((m) => m.flow), ["createOrder", "listOrders"]);
  assert.ok(Object.isFrozen(ok) && Object.isFrozen(ok.manifests));
  for (const bad of [[], null, {}, "x", new Proxy([], { ownKeys() { throw new Error("x"); } }), [good(), , good()]]) { // eslint-disable-line no-sparse-arrays
    const r = verifyRuntimeManifestSet(bad);
    assert.equal(r.success, false);
    assert.equal(r.diagnostics[0].code, FUNGI_VERIFY_011);
    assert.equal(r.diagnostics[0].field, "set");
  }
  const dup = verifyRuntimeManifestSet([good(), good()]);
  assert.equal(dup.success, false);
  assert.deepEqual(dup.diagnostics.map((d) => `${d.code}:${d.index}`), [`${FUNGI_VERIFY_011}:1`]);
  const mixed = verifyRuntimeManifestSet([good(), good({ verified: "yes" })]);
  assert.equal(mixed.success, false);
  assert.deepEqual(mixed.manifests.map((m) => m.verified), [true, false]);
  const big = verifyRuntimeManifestSet(new Array(4097).fill(good()));
  assert.deepEqual(big.diagnostics.map((d) => d.code), [FUNGI_VERIFY_011]);
});

test("verification report: manifests section recomputes success and copies only safe fields", async () => {
  const result = await verifyArtefacts([{ path: "m.json", kind: "manifest", hash: `sha256:${"0".repeat(64)}`, target: "wasm" }], ".");
  const forgedOk = { ...result, success: true, artefacts: [{ path: "m.json", hash: "h", verified: true, diagnostics: [] }], diagnostics: [] };
  const pass = createVerificationReport(forgedOk, { manifests: verifyRuntimeManifestSet([good()]) });
  assert.equal(pass.success, true);
  assert.deepEqual(pass.manifests, { schema: RUNTIME_MANIFEST_SCHEMA, success: true, summary: { total: 1, verified: 1, failed: 0 }, records: [{ index: 0, flow: "createOrder", verified: true, codes: [] }], setCodes: [] });
  assert.ok(Object.isFrozen(pass.manifests) && Object.isFrozen(pass.manifests.records[0]));
  assert.ok(renderVerificationReport(pass).includes('"manifests"'));
  assert.equal(createVerificationReport(forgedOk).manifests, undefined, "no section unless asked");

  const fail = createVerificationReport(forgedOk, { manifests: verifyRuntimeManifestSet([good({ verified: false })]) });
  assert.equal(fail.success, false);
  assert.deepEqual(fail.manifests.records[0].codes, [FUNGI_VERIFY_009, FUNGI_VERIFY_010]);
  const empty = createVerificationReport(forgedOk, { manifests: verifyRuntimeManifestSet([]) });
  assert.equal(empty.success, false);
  assert.deepEqual(empty.manifests.setCodes, [FUNGI_VERIFY_011]);

  // A forged manifest result: claims success, hides a diagnostic at top level, plants text.
  const forged = {
    success: true,
    manifests: [{ index: 0, flow: `x ${SECRET}`, verified: true, diagnostics: [] }, { index: "1", flow: "ok", verified: true, diagnostics: [{ code: `FUNGI-${SECRET}` }] }],
    diagnostics: [{ code: FUNGI_VERIFY_009, field: "record" }],
  };
  const report = createVerificationReport(forgedOk, { manifests: forged });
  assert.equal(report.success, false);
  assert.equal(report.manifests.success, false);
  assert.equal(report.manifests.records[0].flow, "");
  assert.equal(report.manifests.records[1].index, -1);
  assert.deepEqual(report.manifests.records[1].codes, ["code withheld"]);
  assert.ok(!renderVerificationReport(report).includes(SECRET));
  const hostile = new Proxy({}, { get() { throw new Error(SECRET); } });
  assert.equal(createVerificationReport(forgedOk, { manifests: hostile }).success, false);
});

test("mirror pin: v1 fields, flag bits, qualifiers and computeTarget match the compiler source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const compiler = join(here, "..", "..", "galerina-core-compiler", "src");
  const registry = readFileSync(join(compiler, "type-registry.ts"), "utf8");
  const block = registry.match(/export interface RuntimeManifest \{([\s\S]*?)\n\}/);
  assert.ok(block, "RuntimeManifest interface not found in type-registry.ts");
  const declared = [...block[1].matchAll(/^\s*readonly (\w+)\s*:/gm)].map((m) => m[1]);
  assert.deepEqual(declared, [...RUNTIME_MANIFEST_FIELDS]);
  assert.ok(block[1].includes(`schemaVersion: "${RUNTIME_MANIFEST_SCHEMA}"`));
  const flags = registry.match(/export const GovernanceFlags = \{([\s\S]*?)\} as const;/);
  assert.ok(flags, "GovernanceFlags not found");
  const bits = Object.fromEntries([...flags[1].matchAll(/^\s*(\w+):\s*1 << (\d+)/gm)].map((m) => [m[1], 1 << Number(m[2])]));
  assert.deepEqual(bits, { ...RUNTIME_MANIFEST_GOVERNANCE_FLAGS });
  const parser = readFileSync(join(compiler, "parser.ts"), "utf8");
  const union = parser.match(/readonly qualifier: ((?:"\w+"(?: \| )?)+);/);
  assert.ok(union, "parser qualifier union not found");
  assert.deepEqual([...union[1].matchAll(/"(\w+)"/g)].map((m) => m[1]).sort(), [...RUNTIME_MANIFEST_QUALIFIERS].sort());
  const verifier = readFileSync(join(compiler, "governance-verifier.ts"), "utf8");
  const targets = [...verifier.matchAll(/computeTarget:\s*"(\w+)"/g)].map((m) => m[1]);
  assert.ok(targets.length > 0);
  assert.ok(targets.every((t) => RUNTIME_MANIFEST_COMPUTE_TARGETS.includes(t)));
});
