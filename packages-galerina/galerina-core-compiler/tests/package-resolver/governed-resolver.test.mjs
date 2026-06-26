// =============================================================================
// Package Resolver — Governed Resolver Tests (Phase 18B)
//
// Tests for:
//   - PackageManifest extended schema (hash, signature, registry, installScript,
//     targets, compute)
//   - checkPackageCapabilityExpansion() -> SPORE-PKG-001
//   - checkInstallScript() -> SPORE-PKG-004
//   - checkPackageProvenance() -> SPORE-PKG-003, SPORE-PKG-005, SPORE-PKG-006
//   - checkRegistryTrust() -> SPORE-PKG-002 (dependency-confusion control)
//   - getResolverReport() -> ResolverReport
//   - SPORE-PKG-001..006 constant shapes
//
// Fail-closed hardening (R&D 0099):
//   - Placeholder/invalid hash (e.g. "sha256:pending") -> SPORE-PKG-003 (no longer
//     suppressed by a bare "sha256:" prefix).
//   - requireCertified promotes SPORE-PKG-003/005 from warning -> error.
//   - checkRegistryTrust enforces a trusted-registry allow-list (SPORE-PKG-002).
//
// R3: Package type injection tests
//   - resolveImportedTypes() returns correct types per package
//   - KNOWN_PACKAGE_TYPES has the expected number of packages
//   - parseProgram + import + type usage -> 0 SPORE-TYPE-001 for Email
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkPackageCapabilityExpansion,
  checkInstallScript,
  checkPackageProvenance,
  checkRegistryTrust,
  getResolverReport,
  SPORE_PKG_001,
  SPORE_PKG_002,
  SPORE_PKG_003,
  SPORE_PKG_004,
  SPORE_PKG_005,
  SPORE_PKG_006,
  KNOWN_PACKAGE_TYPES,
  resolveImportedTypes,
  parseProgram,
  checkTypes,
} from "../../dist/index.js";

// A real, well-formed sha256 content hash (64 hex chars). Fixtures use this so the
// tightened SHA256_RE accepts them; tests that need an INVALID hash use placeholders.
const GOOD_HASH = "sha256:" + "a".repeat(64);
const GOOD_HASH_2 = "sha256:" + "b".repeat(64);

// ---------------------------------------------------------------------------
// SPORE-PKG constant shapes
// ---------------------------------------------------------------------------

describe("SPORE-PKG constants: shape conformance", () => {
  it("SPORE_PKG_001 (CapabilityExpanded) has correct shape", () => {
    assert.equal(SPORE_PKG_001.code, "SPORE-PKG-001");
    assert.equal(SPORE_PKG_001.name, "CapabilityExpanded");
    assert.equal(SPORE_PKG_001.severity, "error");
    assert.ok(typeof SPORE_PKG_001.message === "string");
    assert.ok(typeof SPORE_PKG_001.why === "string");
    assert.ok(typeof SPORE_PKG_001.suggestedFix === "string");
  });

  it("SPORE_PKG_002 (UntrustedRegistry) has correct shape", () => {
    assert.equal(SPORE_PKG_002.code, "SPORE-PKG-002");
    assert.equal(SPORE_PKG_002.severity, "error");
  });

  it("SPORE_PKG_003 (MissingHash) has correct shape", () => {
    assert.equal(SPORE_PKG_003.code, "SPORE-PKG-003");
    assert.equal(SPORE_PKG_003.severity, "warning");
    assert.ok(typeof SPORE_PKG_003.why === "string");
  });

  it("SPORE_PKG_004 (InstallScriptDenied) has correct shape", () => {
    assert.equal(SPORE_PKG_004.code, "SPORE-PKG-004");
    assert.equal(SPORE_PKG_004.severity, "error");
    assert.ok(typeof SPORE_PKG_004.why === "string");
  });

  it("SPORE_PKG_005 (MissingSignature) has correct shape", () => {
    assert.equal(SPORE_PKG_005.code, "SPORE-PKG-005");
    assert.equal(SPORE_PKG_005.severity, "warning");
  });
});

// ---------------------------------------------------------------------------
// checkPackageCapabilityExpansion — SPORE-PKG-001
// ---------------------------------------------------------------------------

describe("checkPackageCapabilityExpansion: SPORE-PKG-001", () => {
  const BASE_MANIFEST = {
    name: "@galerina/auth",
    version: "1.3.0",
    exports: { types: [], flows: [], events: [] },
    capabilities: ["crypto.password.verify"],
    hash: GOOD_HASH,
    signature: "sig:ed25519:xyz",
  };

  it("no new capabilities -> no expansion, no diagnostics", () => {
    const result = checkPackageCapabilityExpansion(
      BASE_MANIFEST,
      ["crypto.password.verify"],
    );
    assert.equal(result.expanded, false);
    assert.equal(result.addedCapabilities.length, 0);
    assert.equal(result.diagnostics.length, 0);
  });

  it("additional capability added -> SPORE-PKG-001 fired", () => {
    const result = checkPackageCapabilityExpansion(
      { ...BASE_MANIFEST, capabilities: ["crypto.password.verify", "network.outbound"] },
      ["crypto.password.verify"],
    );
    assert.equal(result.expanded, true);
    assert.deepEqual(result.addedCapabilities, ["network.outbound"]);
    assert.ok(result.diagnostics.length > 0, "Must emit at least one diagnostic");
    assert.equal(result.diagnostics[0].code, "SPORE-PKG-001");
    assert.equal(result.diagnostics[0].severity, "error");
    assert.ok(result.diagnostics[0].message.includes("network.outbound"));
  });

  it("capabilities that ARE in lockfile -> not flagged", () => {
    const result = checkPackageCapabilityExpansion(
      { ...BASE_MANIFEST, capabilities: ["crypto.password.verify", "audit.write"] },
      ["crypto.password.verify", "audit.write"],
    );
    assert.equal(result.expanded, false);
    assert.equal(result.diagnostics.length, 0);
  });

  it("empty lockfile + any capability -> all are 'added'", () => {
    const result = checkPackageCapabilityExpansion(
      BASE_MANIFEST,
      [],
    );
    assert.equal(result.expanded, true);
    assert.ok(result.addedCapabilities.includes("crypto.password.verify"));
    assert.equal(result.diagnostics[0].code, "SPORE-PKG-001");
  });
});

// ---------------------------------------------------------------------------
// checkInstallScript — SPORE-PKG-004
// ---------------------------------------------------------------------------

describe("checkInstallScript: SPORE-PKG-004", () => {
  const BASE = {
    name: "@bad/pkg",
    version: "1.0.0",
    exports: { types: [], flows: [], events: [] },
  };

  it("no installScript field -> no diagnostic (default deny = safe)", () => {
    const result = checkInstallScript(BASE);
    assert.equal(result.length, 0, "No diagnostic when installScript is absent");
  });

  it("installScript: 'deny' -> no diagnostic", () => {
    const result = checkInstallScript({ ...BASE, installScript: "deny" });
    assert.equal(result.length, 0, "No diagnostic when installScript is explicitly deny");
  });

  it("installScript: 'allow' -> SPORE-PKG-004 fired", () => {
    const result = checkInstallScript({ ...BASE, installScript: "allow" });
    assert.ok(result.length > 0, "Must emit SPORE-PKG-004");
    assert.equal(result[0].code, "SPORE-PKG-004");
    assert.equal(result[0].severity, "error");
    assert.ok(result[0].message.includes("install script"));
  });
});

// ---------------------------------------------------------------------------
// checkPackageProvenance — SPORE-PKG-003 + SPORE-PKG-005
// ---------------------------------------------------------------------------

describe("checkPackageProvenance: SPORE-PKG-003 and SPORE-PKG-005", () => {
  const FULL_MANIFEST = {
    name: "@galerina/auth",
    version: "1.2.0",
    exports: { types: [], flows: [], events: [] },
    hash: GOOD_HASH,
    signature: "sig:ed25519:abc123",
  };

  it("manifest with valid hash + signature -> no provenance warnings", () => {
    const result = checkPackageProvenance(FULL_MANIFEST);
    assert.equal(result.length, 0, "No diagnostics when a valid hash and signature are present");
  });

  it("missing hash -> SPORE-PKG-003 warning", () => {
    const { hash: _, ...noHash } = FULL_MANIFEST;
    const result = checkPackageProvenance(noHash);
    assert.ok(result.some((d) => d.code === "SPORE-PKG-003"), "SPORE-PKG-003 must fire");
    assert.equal(result.find((d) => d.code === "SPORE-PKG-003").severity, "warning");
  });

  it("wrong hash format (no sha256: prefix) -> SPORE-PKG-003 warning", () => {
    const result = checkPackageProvenance({ ...FULL_MANIFEST, hash: "abc123noprefix" });
    assert.ok(result.some((d) => d.code === "SPORE-PKG-003"), "SPORE-PKG-003 must fire for non-prefixed hash");
  });

  // Finding 0099-pending-hash: a bare "sha256:" prefix with non-64-hex content
  // (the placeholder "sha256:pending") MUST be treated as a missing/invalid hash.
  it("placeholder 'sha256:pending' -> SPORE-PKG-003 (no longer suppressed)", () => {
    const result = checkPackageProvenance({ ...FULL_MANIFEST, hash: "sha256:pending" });
    assert.ok(
      result.some((d) => d.code === "SPORE-PKG-003"),
      "SPORE-PKG-003 must fire for the placeholder 'sha256:pending' hash",
    );
  });

  it("short sha256 (not 64 hex) -> SPORE-PKG-003", () => {
    const result = checkPackageProvenance({ ...FULL_MANIFEST, hash: "sha256:abc123" });
    assert.ok(result.some((d) => d.code === "SPORE-PKG-003"), "SPORE-PKG-003 must fire for a too-short sha256 digest");
  });

  it("non-hex sha256 of length 64 -> SPORE-PKG-003", () => {
    const result = checkPackageProvenance({ ...FULL_MANIFEST, hash: "sha256:" + "z".repeat(64) });
    assert.ok(result.some((d) => d.code === "SPORE-PKG-003"), "SPORE-PKG-003 must fire for non-hex digest chars");
  });

  it("valid 64-hex sha256 -> no SPORE-PKG-003 (no false positive)", () => {
    const result = checkPackageProvenance({ ...FULL_MANIFEST, hash: GOOD_HASH });
    assert.ok(!result.some((d) => d.code === "SPORE-PKG-003"), "a well-formed sha256:<64 hex> must NOT fire SPORE-PKG-003");
  });

  it("missing signature -> SPORE-PKG-005 warning", () => {
    const { signature: _, ...noSig } = FULL_MANIFEST;
    const result = checkPackageProvenance(noSig);
    assert.ok(result.some((d) => d.code === "SPORE-PKG-005"), "SPORE-PKG-005 must fire");
    assert.equal(result.find((d) => d.code === "SPORE-PKG-005").severity, "warning");
  });

  it("missing both hash and signature -> both SPORE-PKG-003 and SPORE-PKG-005", () => {
    const { hash: _h, signature: _s, ...bare } = FULL_MANIFEST;
    const result = checkPackageProvenance(bare);
    assert.ok(result.some((d) => d.code === "SPORE-PKG-003"), "SPORE-PKG-003 must fire");
    assert.ok(result.some((d) => d.code === "SPORE-PKG-005"), "SPORE-PKG-005 must fire");
  });
});

// ---------------------------------------------------------------------------
// Finding 0099-prov-warn: requireCertified promotes provenance warnings -> errors
// ---------------------------------------------------------------------------

describe("checkPackageProvenance: requireCertified promotes SPORE-PKG-003/005 to error", () => {
  const BARE = {
    name: "@galerina/stub",
    version: "0.1.0",
    exports: { types: [], flows: [], events: [] },
    hash: "sha256:pending", // placeholder => invalid hash
    signature: undefined,
  };

  it("default (lenient) -> SPORE-PKG-003/005 are warnings", () => {
    const result = checkPackageProvenance(BARE);
    assert.equal(result.find((d) => d.code === "SPORE-PKG-003").severity, "warning");
    assert.equal(result.find((d) => d.code === "SPORE-PKG-005").severity, "warning");
  });

  it("requireCertified:true -> SPORE-PKG-003 is an error (fail-closed)", () => {
    const result = checkPackageProvenance(BARE, { requireCertified: true });
    const d003 = result.find((d) => d.code === "SPORE-PKG-003");
    assert.ok(d003, "SPORE-PKG-003 must fire");
    assert.equal(d003.severity, "error", "certified mode must escalate missing/invalid hash to error");
  });

  it("requireCertified:true -> SPORE-PKG-005 is an error (fail-closed)", () => {
    const result = checkPackageProvenance(BARE, { requireCertified: true });
    const d005 = result.find((d) => d.code === "SPORE-PKG-005");
    assert.ok(d005, "SPORE-PKG-005 must fire");
    assert.equal(d005.severity, "error", "certified mode must escalate missing signature to error");
  });

  it("requireCertified:true with a fully valid package -> no provenance diagnostics", () => {
    const good = {
      name: "@galerina/good", version: "1.0.0",
      exports: { types: [], flows: [], events: [] },
      hash: GOOD_HASH, signature: "sig:ed25519:abc",
    };
    const result = checkPackageProvenance(good, { requireCertified: true });
    assert.ok(!result.some((d) => d.code === "SPORE-PKG-003"), "valid hash -> no SPORE-PKG-003 even in certified mode");
    assert.ok(!result.some((d) => d.code === "SPORE-PKG-005"), "present signature -> no SPORE-PKG-005 even in certified mode");
  });
});

// ---------------------------------------------------------------------------
// Finding 0099-pkg002: checkRegistryTrust -> SPORE-PKG-002 (dependency confusion)
// ---------------------------------------------------------------------------

describe("checkRegistryTrust: SPORE-PKG-002 untrusted-registry enforcement", () => {
  const mk = (overrides) => ({
    name: "@galerina/pkg", version: "1.0.0",
    exports: { types: [], flows: [], events: [] },
    hash: GOOD_HASH, signature: "sig:ed25519:abc", ...overrides,
  });

  it("no options -> no registry check (back-compat)", () => {
    const result = checkRegistryTrust(mk({ registry: "https://evil.example/registry" }));
    assert.equal(result.length, 0, "without opts the registry control stays off (back-compat)");
  });

  it("declared registry NOT on the allow-list -> SPORE-PKG-002 error", () => {
    const result = checkRegistryTrust(
      mk({ registry: "https://evil.example/registry" }),
      { trustedRegistries: ["https://registry.galerina.dev"] },
    );
    const d = result.find((x) => x.code === "SPORE-PKG-002");
    assert.ok(d, "SPORE-PKG-002 must fire for an untrusted registry");
    assert.equal(d.severity, "error");
    assert.ok(d.message.includes("evil.example"), "message should name the offending registry");
  });

  it("declared registry ON the allow-list -> no diagnostic (no false positive)", () => {
    const result = checkRegistryTrust(
      mk({ registry: "https://registry.galerina.dev" }),
      { trustedRegistries: ["https://registry.galerina.dev"] },
    );
    assert.equal(result.length, 0, "a trusted registry must resolve clean");
  });

  it("empty allow-list under requireCertified -> rejects ALL registries (fail-closed)", () => {
    const result = checkRegistryTrust(
      mk({ registry: "https://registry.galerina.dev" }),
      { requireCertified: true, trustedRegistries: [] },
    );
    assert.ok(result.some((x) => x.code === "SPORE-PKG-002"), "an empty allow-list in certified mode rejects every registry");
  });

  it("absent registry under requireCertified -> SPORE-PKG-002 (deny-by-default origin)", () => {
    const noReg = mk({});
    delete noReg.registry;
    const result = checkRegistryTrust(noReg, { requireCertified: true });
    assert.ok(result.some((x) => x.code === "SPORE-PKG-002"), "no declared registry must be rejected under certified policy");
  });

  it("absent registry WITHOUT requireCertified (but with allow-list) -> no diagnostic", () => {
    const noReg = mk({});
    delete noReg.registry;
    const result = checkRegistryTrust(noReg, { trustedRegistries: ["https://registry.galerina.dev"] });
    assert.equal(result.length, 0, "an absent registry is only an error under certified mode");
  });

  it("getResolverReport threads the trusted-registry allow-list (SPORE-PKG-002 appears)", () => {
    const report = getResolverReport(
      [mk({ registry: "https://evil.example/registry" })],
      "2026-06-23T00:00:00Z",
      { trustedRegistries: ["https://registry.galerina.dev"] },
    );
    assert.ok(report.diagnostics.some((x) => x.code === "SPORE-PKG-002"), "report must surface SPORE-PKG-002");
  });
});

describe("checkPackageProvenance: SPORE-PKG-006 signing-key revocation (defense-in-depth)", () => {
  const REVOKED = "8eecf4187ebc9341";
  const signed = (overrides) => ({
    name: "@galerina/pkg", version: "1.0.0", exports: { types: [], flows: [], events: [] },
    hash: GOOD_HASH, signature: "sig:ed25519:abc", ...overrides,
  });

  it("a package signed by a REVOKED key -> SPORE-PKG-006 error", () => {
    const result = checkPackageProvenance(signed({ signerKeyId: REVOKED }), { isRevoked: (k) => k === REVOKED });
    const d = result.find((x) => x.code === "SPORE-PKG-006");
    assert.ok(d, "SPORE-PKG-006 must fire for a revoked signer");
    assert.equal(d.severity, "error");
  });

  it("a non-revoked signer -> no revocation diagnostic", () => {
    const result = checkPackageProvenance(signed({ signerKeyId: "ab46f4c7e2797b9b" }), { isRevoked: (k) => k === REVOKED });
    assert.ok(!result.some((x) => x.code === "SPORE-PKG-006"));
  });

  it("a THROWING revocation check is fail-closed (treated as revoked -> SPORE-PKG-006)", () => {
    const result = checkPackageProvenance(signed({ signerKeyId: "x" }), { isRevoked: () => { throw new Error("untrusted"); } });
    assert.ok(result.some((x) => x.code === "SPORE-PKG-006"), "a throwing check must fail closed");
  });

  it("no revocation predicate -> no revocation diagnostic (backward-compatible)", () => {
    const result = checkPackageProvenance(signed({ signerKeyId: REVOKED }));
    assert.ok(!result.some((x) => x.code === "SPORE-PKG-006"));
  });

  it("getResolverReport threads the revocation predicate", () => {
    const report = getResolverReport([signed({ signerKeyId: REVOKED })], "2026-06-21T00:00:00Z", { isRevoked: () => true });
    assert.ok(report.diagnostics.some((x) => x.code === "SPORE-PKG-006"));
  });

  it("SPORE_PKG_006 constant has the correct shape", () => {
    assert.equal(SPORE_PKG_006.code, "SPORE-PKG-006");
    assert.equal(SPORE_PKG_006.name, "RevokedSigner");
    assert.equal(SPORE_PKG_006.severity, "error");
    assert.ok(typeof SPORE_PKG_006.why === "string");
    assert.ok(typeof SPORE_PKG_006.suggestedFix === "string");
  });
});

// ---------------------------------------------------------------------------
// getResolverReport — ResolverReport structure
// ---------------------------------------------------------------------------

describe("getResolverReport: resolver output report", () => {
  const AUTH_MANIFEST = {
    name: "@galerina/auth",
    version: "1.2.0",
    exports: { types: ["UserId"], flows: ["verifyPassword"], events: [] },
    effects: ["audit.write"],
    capabilities: ["crypto.password.verify"],
    hash: GOOD_HASH,
    signature: "sig:ed25519:xyz",
    targets: { cpu: "dist/cpu.galerina", wasm: "dist/wasm.galerina" },
    compute: { supports: ["cpu", "wasm-simd"], photonic_compatible: false },
  };

  const AI_MANIFEST = {
    name: "@galerina/ai",
    version: "0.5.0",
    exports: { types: ["EmbeddingVector"], flows: ["embed"], events: [] },
    effects: [],
    capabilities: ["model.inference"],
    hash: GOOD_HASH_2,
    signature: "sig:ed25519:uvw",
    targets: { cpu: "dist/cpu.galerina", npu: "dist/npu.galerina", gpu: "dist/gpu.galerina" },
    compute: { tensor_shapes: ["Tensor<Float32, [768]>"], supports: ["npu", "gpu", "cpu"], photonic_compatible: false },
  };

  it("report has correct schemaVersion", () => {
    const report = getResolverReport([AUTH_MANIFEST], "2026-05-31T00:00:00.000Z");
    assert.equal(report.schemaVersion, "spore.resolver.report.v1");
  });

  it("report lists all resolved packages", () => {
    const report = getResolverReport([AUTH_MANIFEST, AI_MANIFEST], "2026-05-31T00:00:00.000Z");
    assert.equal(report.packages.length, 2);
    const names = report.packages.map((p) => p.name);
    assert.ok(names.includes("@galerina/auth"), "auth must be in report");
    assert.ok(names.includes("@galerina/ai"), "ai must be in report");
  });

  it("trusted package (valid hash + signature) -> trusted=true", () => {
    const report = getResolverReport([AUTH_MANIFEST], "2026-05-31T00:00:00.000Z");
    const pkg = report.packages[0];
    assert.equal(pkg.trusted, true, "Package with valid hash+signature must be trusted");
  });

  it("package without hash -> trusted=false", () => {
    const { hash: _, ...noHash } = AUTH_MANIFEST;
    const report = getResolverReport([noHash], "2026-05-31T00:00:00.000Z");
    const pkg = report.packages[0];
    assert.equal(pkg.trusted, false, "Package without hash must not be trusted");
  });

  it("package with placeholder 'sha256:pending' hash -> trusted=false (fail-closed)", () => {
    const report = getResolverReport([{ ...AUTH_MANIFEST, hash: "sha256:pending" }], "2026-05-31T00:00:00.000Z");
    const pkg = report.packages[0];
    assert.equal(pkg.trusted, false, "a placeholder hash must NOT count as a real content hash");
  });

  it("aggregates all capabilities across packages", () => {
    const report = getResolverReport([AUTH_MANIFEST, AI_MANIFEST], "2026-05-31T00:00:00.000Z");
    assert.ok(report.capabilities.includes("crypto.password.verify"), "auth capability must be in report");
    assert.ok(report.capabilities.includes("model.inference"), "ai capability must be in report");
    assert.ok([...report.capabilities].every((c, i) => i === 0 || c >= report.capabilities[i - 1]), "Capabilities must be sorted");
  });

  it("aggregates all compute targets", () => {
    const report = getResolverReport([AUTH_MANIFEST, AI_MANIFEST], "2026-05-31T00:00:00.000Z");
    assert.ok(report.targets.includes("cpu"), "cpu must be in targets");
    assert.ok(report.targets.includes("npu"), "npu must be in targets");
    assert.ok(report.targets.includes("gpu"), "gpu must be in targets");
    assert.ok(report.targets.includes("wasm"), "wasm must be in targets");
  });

  it("report includes provenance diagnostics for unsigned packages", () => {
    const { hash: _, signature: __, ...bare } = AUTH_MANIFEST;
    const report = getResolverReport([bare], "2026-05-31T00:00:00.000Z");
    const codes = report.diagnostics.map((d) => d.code);
    assert.ok(codes.includes("SPORE-PKG-003"), "SPORE-PKG-003 must appear in report diagnostics");
    assert.ok(codes.includes("SPORE-PKG-005"), "SPORE-PKG-005 must appear in report diagnostics");
  });

  it("report includes SPORE-PKG-004 for package with install script", () => {
    const withInstall = { ...AUTH_MANIFEST, installScript: /** @type {"allow"} */ ("allow") };
    const report = getResolverReport([withInstall], "2026-05-31T00:00:00.000Z");
    assert.ok(report.diagnostics.some((d) => d.code === "SPORE-PKG-004"), "SPORE-PKG-004 must appear for install-script package");
  });

  it("requireCertified report -> provenance diagnostics are errors, not warnings", () => {
    const { hash: _, signature: __, ...bare } = AUTH_MANIFEST;
    const report = getResolverReport([bare], "2026-05-31T00:00:00.000Z", { requireCertified: true });
    const d003 = report.diagnostics.find((d) => d.code === "SPORE-PKG-003");
    const d005 = report.diagnostics.find((d) => d.code === "SPORE-PKG-005");
    assert.ok(d003 && d003.severity === "error", "SPORE-PKG-003 must be an error under requireCertified");
    assert.ok(d005 && d005.severity === "error", "SPORE-PKG-005 must be an error under requireCertified");
  });
});

// ---------------------------------------------------------------------------
// R3: Package type injection
// ---------------------------------------------------------------------------

describe("R3: Package type injection", () => {
  it("resolveImportedTypes('@galerina/healthcare-types') includes 'Email'", () => {
    const types = resolveImportedTypes("@galerina/healthcare-types");
    assert.ok(
      types.includes("Email"),
      `Expected 'Email' in @galerina/healthcare-types exports, got: ${types.join(", ")}`,
    );
  });

  it("KNOWN_PACKAGE_TYPES has >= 5 packages", () => {
    assert.ok(
      KNOWN_PACKAGE_TYPES.size >= 5,
      `Expected at least 5 packages in KNOWN_PACKAGE_TYPES, got: ${KNOWN_PACKAGE_TYPES.size}`,
    );
  });

  it("parseProgram with import Email from '@galerina/healthcare-types' + type usage -> 0 SPORE-TYPE-001 for Email", () => {
    const source = `import Email from "@galerina/healthcare-types"

flow sendWelcome(address: Email) -> String {
  return "ok"
}
`;
    const { ast } = parseProgram(source, "test.spore");
    // Inject the types exported by the package into the type checker
    const injectedTypes = resolveImportedTypes("@galerina/healthcare-types");
    const result = checkTypes(ast, injectedTypes);
    const type001Diags = result.diagnostics.filter((d) => d.code === "SPORE-TYPE-001" && d.message.includes("Email"));
    assert.equal(
      type001Diags.length,
      0,
      `Expected 0 SPORE-TYPE-001 for Email, got: ${type001Diags.map((d) => d.message).join("; ")}`,
    );
  });
});
