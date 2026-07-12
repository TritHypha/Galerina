// rd0361-packages-execution-cutover.test.mjs — RD-0361 (Packages tranche): the registry-index `.fungi`
// twin EXECUTES, and its lookup verdict is proven EQUAL to the real registry-index.ts decider.
//
// Formalises the packages boundary's execution-cutover into a keep-green gate, the same shape as the
// sentinel-time T1 syncgate proof — but for a STRING-returning governed-decision twin:
//   R0  registry-index.fungi `galerina build`s to a real, signable WASM (buildable now — no P9, no DSS.wasm).
//   R1  that WASM is signed + admitted through the attestation-first #105 gate (requireSigned) + instantiated.
//   R3  FAIL-CLOSED DIFFERENTIAL: the WASM `lookupVerdict` string EQUALS the REAL `lookupCertifiedPackage`
//       verdict over a boundary corpus (host-computed evidence → twin fold ≡ the .ts decision). NOT an inlined
//       mirror: each case constructs a real RegistryIndex + query and calls the shipped `.ts`.
//
// Nothing here is authoritative: the `.ts` still decides at runtime. The R4 authority flip is owner-gated (#143).
// The compiler is built earlier in the suite (core-compiler < framework-app-kernel) so it is imported by its
// freshly-built dist; the real `.ts` decider is this package's own dist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import * as K from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "registry-index.fungi");

// A minimal, well-typed registry entry (only name/version/sourceHash/keyId matter to lookupCertifiedPackage).
const entry = (name, version, sourceHash, keyId) => ({
  name, version, sourceHash, keyId, publisher: "acme", certificationLevel: "certified",
  riskRating: "low", capabilities: [], effects: [],
});

// The REAL .ts verdict for a scenario: call the shipped lookupCertifiedPackage and normalise to the twin's
// token vocabulary ("ok" on success, else the structured ERR_REGISTRY_* code).
function tsLookupVerdict(entries, q) {
  const r = K.lookupCertifiedPackage({ entries }, q);
  return r.ok ? "ok" : r.code;
}

// The host-computed EVIDENCE the twin folds — derived from the SAME scenario, mirroring the .ts's
// early-return structure (hash/keyId only defined once exactly one entry matches).
function evidence(entries, q) {
  const named = entries.filter((e) => e.name === q.name);
  const matches = named.filter((e) => e.version === q.version);
  const one = matches.length === 1 ? matches[0] : null;
  return {
    nameCount: named.length,
    versionCount: matches.length,
    hashMatches: one ? one.sourceHash === q.sourceHash : true,
    keyIdProvided: q.keyId !== undefined,
    keyIdMatches: one && q.keyId !== undefined ? one.keyId === q.keyId : true,
  };
}

test("RD-0361 packages · registry-index: R0 build → R1 #105-admit → R3 WASM ≡ real .ts lookup", async () => {
  assert.ok(existsSync(COMPILER),
    "galerina-core-compiler dist not built — run the full suite (or build the compiler) before this execution-cutover gate");
  assert.equal(typeof K.lookupCertifiedPackage, "function",
    "real registry-index.ts decider (lookupCertifiedPackage) must be exported for the differential");
  const L = await import(pathToFileURL(COMPILER).href);

  // ── R0 · the twin builds to a WASM that wabt-assembles ──
  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "registry-index.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "registry-index", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles to WASM (R0): ${JSON.stringify(asm.diagnostics)}`);

  // ── R1 · sign + admit through the attestation-first #105 gate, then instantiate ──
  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value); // string-return handles resolve
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  assert.equal(typeof instance.exports.lookupVerdict, "function", "lookupVerdict admitted + exported (R1)");
  const B = (b) => (b ? 1 : 0);
  const wasmLookup = (ev) => host.readString(instance.exports.lookupVerdict(ev.nameCount, ev.versionCount, B(ev.hashMatches), B(ev.keyIdProvided), B(ev.keyIdMatches)));

  // ── R3 · fail-closed differential: WASM verdict EQUALS the real lookupCertifiedPackage verdict ──
  const H = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const H2 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
  const scenarios = [
    { name: "unknown package", entries: [entry("other", "1.0.0", H, "k1")], q: { name: "pkg", version: "1.0.0", sourceHash: H } },
    { name: "unknown version", entries: [entry("pkg", "2.0.0", H, "k1")], q: { name: "pkg", version: "1.0.0", sourceHash: H } },
    { name: "duplicate", entries: [entry("pkg", "1.0.0", H, "k1"), entry("pkg", "1.0.0", H2, "k2")], q: { name: "pkg", version: "1.0.0", sourceHash: H } },
    { name: "hash mismatch", entries: [entry("pkg", "1.0.0", H, "k1")], q: { name: "pkg", version: "1.0.0", sourceHash: H2 } },
    { name: "keyId mismatch", entries: [entry("pkg", "1.0.0", H, "k1")], q: { name: "pkg", version: "1.0.0", sourceHash: H, keyId: "k2" } },
    { name: "admitted (no keyId cross-check)", entries: [entry("pkg", "1.0.0", H, "k1")], q: { name: "pkg", version: "1.0.0", sourceHash: H } },
    { name: "admitted (keyId matches)", entries: [entry("pkg", "1.0.0", H, "k1")], q: { name: "pkg", version: "1.0.0", sourceHash: H, keyId: "k1" } },
  ];
  let agree = 0;
  for (const s of scenarios) {
    const w = wasmLookup(evidence(s.entries, s.q));
    const r = tsLookupVerdict(s.entries, s.q);
    assert.equal(w, r, `${s.name}: WASM lookupVerdict='${w}' must equal real lookupCertifiedPackage verdict='${r}'`);
    agree++;
  }
  assert.equal(agree, scenarios.length, "every differential case checked");

  // The two admission boundaries, called out explicitly on BOTH sides:
  assert.equal(wasmLookup(evidence([entry("pkg", "1.0.0", H, "k1")], { name: "pkg", version: "1.0.0", sourceHash: H })), "ok", "WASM: a pinned match admits");
  assert.equal(tsLookupVerdict([entry("pkg", "1.0.0", H, "k1")], { name: "pkg", version: "1.0.0", sourceHash: H }), "ok", "real .ts: a pinned match admits");
});

test("RD-0361 packages · package-admission: R0 build → R1 #105-admit → R3 WASM ≡ real package-resolver.ts", async () => {
  const L = await import(pathToFileURL(COMPILER).href);
  const P = await import(pathToFileURL(join(HERE, "..", "..", "galerina-core-compiler", "dist", "package-resolver.js")).href);
  assert.equal(typeof P.checkPackageCapabilityExpansion, "function", "real package-resolver.ts checks must be exported for the differential");
  const TWIN2 = join(HERE, "..", "src", "self-hosted", "package-admission.fungi");

  // ── R0 · build ──
  let src = readFileSync(TWIN2, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "package-admission.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "package-admission", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);

  // ── R1 · sign + #105 admit ──
  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  assert.equal(typeof instance.exports.admitVerdict, "function", "admitVerdict admitted + exported (R1)");
  const B = (b) => (b ? 1 : 0);
  const rd = (h) => host.readString(h);

  // ── R3 · differential vs the REAL package-resolver.ts checks (constructs real manifests, NOT a mirror) ──
  const VH = "sha256:" + "a".repeat(64);
  const base = (over) => ({ name: "pkg", version: "1.0.0", exports: {}, hash: VH, signature: "c2ln", ...over });
  const codeFor = (diags, code) => { const d = diags.find((x) => x.code === code); return !d ? "ok" : d.severity === "warning" ? "WARN:" + code : code; };
  let checks = 0;

  // capabilityVerdict ≡ checkPackageCapabilityExpansion (FUNGI-PKG-001)
  for (const n of [0, 1, 3]) {
    const ts = P.checkPackageCapabilityExpansion(base({ capabilities: Array.from({ length: n }, (_, i) => "cap" + i) }), []).diagnostics[0]?.code ?? "ok";
    assert.equal(rd(instance.exports.capabilityVerdict(n)), ts, `capability addedCount=${n}`); checks++;
  }
  // installScriptVerdict ≡ checkInstallScript (FUNGI-PKG-004)
  for (const [declared, isDeny] of [[false, false], [true, true], [true, false]]) {
    const ts = P.checkInstallScript(base({ installScript: declared ? (isDeny ? "deny" : "allow") : undefined }))[0]?.code ?? "ok";
    assert.equal(rd(instance.exports.installScriptVerdict(B(declared), B(isDeny))), ts, `install declared=${declared} isDeny=${isDeny}`); checks++;
  }
  // registryTrustVerdict ≡ checkRegistryTrust (FUNGI-PKG-002)
  for (const [enforce, rc, hasReg, allowed] of [[false, false, false, false], [true, true, false, false], [true, false, false, false], [true, true, true, false], [true, true, true, true], [true, false, true, true]]) {
    const registry = hasReg ? (allowed ? "https://trusted" : "https://untrusted") : undefined;
    const opts = !enforce ? {} : (rc ? { requireCertified: true, trustedRegistries: allowed ? ["https://trusted"] : [] } : { trustedRegistries: allowed ? ["https://trusted"] : [] });
    const ts = P.checkRegistryTrust(base({ registry }), opts)[0]?.code ?? "ok";
    assert.equal(rd(instance.exports.registryTrustVerdict(B(enforce), B(rc), B(hasReg), B(allowed))), ts, `registry e=${enforce} rc=${rc} hr=${hasReg} ok=${allowed}`); checks++;
  }
  // hashVerdict ≡ checkPackageProvenance PKG-003 (valid sig isolates the hash finding)
  for (const [hv, rc] of [[true, false], [false, false], [false, true], [true, true]]) {
    const ts = codeFor(P.checkPackageProvenance(base({ hash: hv ? VH : undefined }), rc ? { requireCertified: true } : {}), "FUNGI-PKG-003");
    assert.equal(rd(instance.exports.hashVerdict(B(hv), B(rc))), ts, `hash valid=${hv} certified=${rc}`); checks++;
  }
  // signatureVerdict ≡ checkPackageProvenance PKG-005 (valid hash isolates the signature finding)
  for (const [hs, rc] of [[true, false], [false, false], [false, true], [true, true]]) {
    const ts = codeFor(P.checkPackageProvenance(base({ signature: hs ? "c2ln" : undefined }), rc ? { requireCertified: true } : {}), "FUNGI-PKG-005");
    assert.equal(rd(instance.exports.signatureVerdict(B(hs), B(rc))), ts, `sig present=${hs} certified=${rc}`); checks++;
  }
  // revocationVerdict ≡ checkPackageProvenance PKG-006 (valid hash+sig isolates the revocation finding)
  for (const [hk, ca, rv] of [[false, false, false], [true, false, false], [true, true, false], [true, true, true]]) {
    const ts = codeFor(P.checkPackageProvenance(base({ signerKeyId: hk ? "key-1" : undefined }), ca ? { isRevoked: () => rv } : {}), "FUNGI-PKG-006");
    assert.equal(rd(instance.exports.revocationVerdict(B(hk), B(ca), B(rv))), ts, `revoke keyId=${hk} check=${ca} revoked=${rv}`); checks++;
  }
  assert.ok(checks >= 24, `every per-check differential ran (${checks})`);
});
