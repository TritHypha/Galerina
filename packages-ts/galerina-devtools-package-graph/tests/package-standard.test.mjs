// Package Standard v1 section 4 audit core: one positive and one negative test per
// FUNGI-PKGSTD code, plus strict-reader and output-hygiene properties.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PACKAGE_STANDARD_CODES,
  auditGeneratedDrift,
  auditPackage,
  auditPackageSet,
} from "../dist/index.js";

const GEN = "scripts/gen-package-standard-manifests.mjs";
const HEX64 = "a".repeat(64);
const HEX128 = "b".repeat(128);

const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v !== null && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const text = (v) => `${JSON.stringify(sortKeys(v), null, 2)}\n`;

function manifest(over = {}) {
  return {
    archetype: { source: "inferred-from-name", value: "fungi" },
    boundaries: [],
    build: { manifest: "build-manifest.json", status: "NO_WASM_ARTIFACT" },
    capabilities: [],
    dependencies: [{ kind: "third-party", name: "dep", specifier: "^1.0.0" }],
    effects: { declares: [], evidence: "NOT_OBSERVED", transitive: [] },
    exports: [{ condition: "default", specifier: ".", target: "./dist/index.js" }],
    generatedBy: GEN,
    governance: { allowedProfiles: ["development"], requiresAudit: false },
    name: "@galerina/alpha",
    sbom: "sbom.json",
    schemaVersion: "fungi.package.manifest.v1",
    signature: { publisher: "none", status: "UNSIGNED" },
    version: "1.0.0",
    ...over,
  };
}

const SOURCES = [{ path: "package.json", sha256: HEX64 }, { path: "src/index.ts", sha256: "c".repeat(64) }];
const AGG = "d".repeat(64);

function buildManifest(over = {}) {
  return {
    artifacts: { status: "NO_WASM_ARTIFACT", wasm: [] },
    compiler: { name: "@galerina/core-compiler", version: "1.0.0-beta.2" },
    flags: [],
    generatedBy: GEN,
    package: { name: "@galerina/alpha", version: "1.0.0" },
    reproducible: { method: "content-addressed-git-index", timestamp: "NONE" },
    schemaVersion: "galerina.package.build-manifest.v1",
    sources: { aggregateSha256: AGG, algorithm: "sha256", files: SOURCES },
    ...over,
  };
}

function component(over = {}) {
  return {
    "bom-ref": "pkg:npm/dep@1.0.2",
    hashes: [{ alg: "SHA-512", content: HEX128 }],
    licenses: [{ expression: "MIT" }],
    name: "dep",
    properties: [{ name: "galerina:origin", value: "third-party" }],
    purl: "pkg:npm/dep@1.0.2",
    scope: "required",
    type: "library",
    version: "1.0.2",
    ...over,
  };
}

function sbom(components = [component()], over = {}) {
  return {
    bomFormat: "CycloneDX",
    components,
    dependencies: [{ dependsOn: components.map((c) => c["bom-ref"]).sort(), ref: "pkg:npm/%40galerina/alpha@1.0.0" }],
    metadata: {
      component: { "bom-ref": "pkg:npm/%40galerina/alpha@1.0.0", name: "@galerina/alpha", type: "library", version: "1.0.0" },
      properties: [{ name: "galerina:depth", value: "1" }, { name: "galerina:generated-by", value: GEN }],
    },
    specVersion: "1.5",
    version: 1,
    ...over,
  };
}

const classifyLicense = (e) => (e === "MIT" ? "PERMISSIVE" : /GPL/.test(e) ? "COPYLEFT-RED" : "UNKNOWN-RED");

function input(over = {}) {
  return {
    packageDir: "galerina-alpha",
    packageName: "@galerina/alpha",
    packageVersion: "1.0.0",
    manifest: { present: true, text: text(manifest()) },
    buildManifest: { present: true, text: text(buildManifest()) },
    sbom: { present: true, text: text(sbom()) },
    observedSources: SOURCES,
    observedAggregateSha256: AGG,
    profile: "development",
    classifyLicense,
    sanctionedGplPackages: [],
    licenseOverrides: [],
    ...over,
  };
}

const codes = (diags) => diags.map((d) => d.code);
const fires = (code, diags) => assert.ok(codes(diags).includes(code), `${code} expected, got ${codes(diags).join(",") || "none"}`);
const silent = (code, diags) => assert.ok(!codes(diags).includes(code), `${code} unexpected: ${JSON.stringify(diags)}`);

test("baseline: a conforming package produces no diagnostics", () => {
  assert.deepEqual(auditPackage(input()), []);
});

test("FUNGI-PKGSTD-001 positive: missing galerina-package.json", () => fires("FUNGI-PKGSTD-001", auditPackage(input({ manifest: { present: false } }))));
test("FUNGI-PKGSTD-001 negative: manifest present", () => silent("FUNGI-PKGSTD-001", auditPackage(input())));

test("FUNGI-PKGSTD-002 positive: null, unknown key, duplicate key, BOM, absolute path, unsorted, bad enum", () => {
  const bad = [
    text(manifest()).replace('"boundaries": []', '"boundaries": null'),
    text(manifest({ extra: "x" })),
    text(manifest()).replace('"sbom": "sbom.json",', '"sbom": "sbom.json",\n  "sbom": "sbom.json",'),
    `\ufeff${text(manifest())}`,
    text(manifest({ exports: [{ condition: "default", specifier: ".", target: "/abs/index.js" }] })),
    text(manifest({ exports: [{ condition: "default", specifier: ".", target: "..\\x.js" }] })),
    text(manifest({ capabilities: ["b", "a"] })),
    text(manifest({ signature: { publisher: "none", status: "MAYBE" } })),
    text(manifest({ signature: { hash: "sha256:xyz", publisher: "p", status: "SIGNED" } })),
    "{ not json",
    `${text(manifest())}trailing`,
  ];
  for (const t of bad) fires("FUNGI-PKGSTD-002", auditPackage(input({ manifest: { present: true, text: t } })));
});
test("FUNGI-PKGSTD-002 negative: valid manifest (LF and CRLF)", () => {
  silent("FUNGI-PKGSTD-002", auditPackage(input()));
  silent("FUNGI-PKGSTD-002", auditPackage(input({ manifest: { present: true, text: text(manifest()).replace(/\n/g, "\r\n") } })));
});

test("FUNGI-PKGSTD-003 positive: identity differs from package.json", () => {
  fires("FUNGI-PKGSTD-003", auditPackage(input({ manifest: { present: true, text: text(manifest({ version: "9.9.9" })) } })));
  fires("FUNGI-PKGSTD-003", auditPackage(input({ packageName: "@galerina/other" })));
});
test("FUNGI-PKGSTD-003 negative: identities agree", () => silent("FUNGI-PKGSTD-003", auditPackage(input())));

test("FUNGI-PKGSTD-004 positive: missing build-manifest.json", () => fires("FUNGI-PKGSTD-004", auditPackage(input({ buildManifest: { present: false } }))));
test("FUNGI-PKGSTD-004 negative: build manifest present", () => silent("FUNGI-PKGSTD-004", auditPackage(input())));

test("FUNGI-PKGSTD-005 positive: invalid build manifest", () => {
  const bad = [
    buildManifest({ reproducible: { method: "content-addressed-git-index", timestamp: "2026-10-03T00:00:00Z" } }),
    buildManifest({ artifacts: { status: "NO_WASM_ARTIFACT", wasm: [{ path: "a.wasm", sha256: HEX64 }] } }),
    buildManifest({ artifacts: { status: "WASM_ARTIFACT_PRESENT", wasm: [] } }),
    buildManifest({ sources: { aggregateSha256: AGG, algorithm: "sha256", files: [...SOURCES].reverse() } }),
    buildManifest({ schemaVersion: "v0" }),
  ];
  for (const b of bad) fires("FUNGI-PKGSTD-005", auditPackage(input({ buildManifest: { present: true, text: text(b) } })));
});
test("FUNGI-PKGSTD-005 negative: valid build manifest", () => silent("FUNGI-PKGSTD-005", auditPackage(input())));

test("FUNGI-PKGSTD-006 positive: source hash or file set changed", () => {
  fires("FUNGI-PKGSTD-006", auditPackage(input({ observedSources: [SOURCES[0], { path: "src/index.ts", sha256: "e".repeat(64) }] })));
  fires("FUNGI-PKGSTD-006", auditPackage(input({ observedSources: [...SOURCES, { path: "src/new.ts", sha256: HEX64 }] })));
  fires("FUNGI-PKGSTD-006", auditPackage(input({ observedAggregateSha256: "f".repeat(64) })));
});
test("FUNGI-PKGSTD-006 negative: sources match (order-insensitive input)", () => {
  silent("FUNGI-PKGSTD-006", auditPackage(input({ observedSources: [...SOURCES].reverse() })));
});

test("FUNGI-PKGSTD-007 positive: missing sbom.json", () => fires("FUNGI-PKGSTD-007", auditPackage(input({ sbom: { present: false } }))));
test("FUNGI-PKGSTD-007 negative: sbom present", () => silent("FUNGI-PKGSTD-007", auditPackage(input())));

test("FUNGI-PKGSTD-008 positive: invalid sbom", () => {
  const bad = [
    sbom([component()], { specVersion: "1.4" }),
    sbom([component()], { dependencies: [{ dependsOn: [], ref: "pkg:npm/%40galerina/alpha@1.0.0" }] }),
    sbom([component({ hashes: [{ alg: "MD5", content: HEX64 }] })]),
    sbom([component({ licenses: [] })]),
    sbom([component({ name: "b", "bom-ref": "b" }), component({ name: "a", "bom-ref": "a" })]),
    sbom([component()], { version: 1.5 }),
  ];
  for (const s of bad) fires("FUNGI-PKGSTD-008", auditPackage(input({ sbom: { present: true, text: text(s) } })));
});
test("FUNGI-PKGSTD-008 negative: valid sbom, including an empty component list", () => {
  silent("FUNGI-PKGSTD-008", auditPackage(input()));
  silent("FUNGI-PKGSTD-008", auditPackage(input({ sbom: { present: true, text: text(sbom([])) } })));
});

test("FUNGI-PKGSTD-009 positive: range version or missing hash", () => {
  fires("FUNGI-PKGSTD-009", auditPackage(input({ sbom: { present: true, text: text(sbom([component({ version: "^1.0.0" })])) } })));
  fires("FUNGI-PKGSTD-009", auditPackage(input({ sbom: { present: true, text: text(sbom([component({ hashes: [] })])) } })));
});
test("FUNGI-PKGSTD-009 negative: exact version with hash", () => silent("FUNGI-PKGSTD-009", auditPackage(input())));

test("FUNGI-PKGSTD-010 positive: GPL outside a sanctioned extension, unknown without override", () => {
  fires("FUNGI-PKGSTD-010", auditPackage(input({ sbom: { present: true, text: text(sbom([component({ licenses: [{ expression: "GPL-3.0" }] })])) } })));
  fires("FUNGI-PKGSTD-010", auditPackage(input({ sbom: { present: true, text: text(sbom([component({ licenses: [{ expression: "UNKNOWN" }] })])) } })));
});
test("FUNGI-PKGSTD-010 negative: permissive, sanctioned GPL extension, evidenced override", () => {
  silent("FUNGI-PKGSTD-010", auditPackage(input()));
  silent("FUNGI-PKGSTD-010", auditPackage(input({ sanctionedGplPackages: ["@galerina/alpha"], sbom: { present: true, text: text(sbom([component({ licenses: [{ expression: "GPL-3.0" }] })])) } })));
  silent("FUNGI-PKGSTD-010", auditPackage(input({ licenseOverrides: ["dep@1.0.2"], sbom: { present: true, text: text(sbom([component({ licenses: [{ expression: "UNKNOWN" }] })])) } })));
});

const signed = { hash: `sha256:${HEX64}`, publisher: "galerina-certified", status: "SIGNED" };
const wasmManifest = { build: { manifest: "build-manifest.json", status: "WASM_ARTIFACT_PRESENT" }, signature: signed };
const wasmBuild = buildManifest({ artifacts: { status: "WASM_ARTIFACT_PRESENT", wasm: [{ path: "dist/alpha.wasm", sha256: HEX64 }] } });

test("FUNGI-PKGSTD-011 positive: unsigned under production", () => fires("FUNGI-PKGSTD-011", auditPackage(input({ profile: "production" }))));
test("FUNGI-PKGSTD-011 negative: signed under production; unsigned under development", () => {
  silent("FUNGI-PKGSTD-011", auditPackage(input({ profile: "production", manifest: { present: true, text: text(manifest({ signature: signed })) } })));
  silent("FUNGI-PKGSTD-011", auditPackage(input({ profile: "development" })));
});

test("FUNGI-PKGSTD-012 positive: no WASM under production", () => fires("FUNGI-PKGSTD-012", auditPackage(input({ profile: "production" }))));
test("FUNGI-PKGSTD-012 negative: WASM present under production; none under development", () => {
  const diags = auditPackage(input({
    profile: "production",
    manifest: { present: true, text: text(manifest(wasmManifest)) },
    buildManifest: { present: true, text: text(wasmBuild) },
  }));
  assert.deepEqual(diags, []);
  silent("FUNGI-PKGSTD-012", auditPackage(input()));
});

test("FUNGI-PKGSTD-013 positive: empty, missing, extra, or duplicated package set", () => {
  fires("FUNGI-PKGSTD-013", auditPackageSet([], []));
  fires("FUNGI-PKGSTD-013", auditPackageSet(["a", "b"], ["a"]));
  fires("FUNGI-PKGSTD-013", auditPackageSet(["a"], ["a", "b"]));
  fires("FUNGI-PKGSTD-013", auditPackageSet(["a", "a"], ["a"]));
});
test("FUNGI-PKGSTD-013 negative: identical sets in any order", () => assert.deepEqual(auditPackageSet(["b", "a"], ["a", "b"]), []));

test("FUNGI-PKGSTD-014 positive: committed document differs or is absent", () => {
  fires("FUNGI-PKGSTD-014", auditGeneratedDrift("d", "sbom.json", "{}\n", { present: true, text: "{ }\n" }));
  fires("FUNGI-PKGSTD-014", auditGeneratedDrift("d", "sbom.json", "{}\n", { present: false }));
});
test("FUNGI-PKGSTD-014 negative: identical document (CRLF checkout tolerated)", () => {
  assert.deepEqual(auditGeneratedDrift("d", "sbom.json", "{\n}\n", { present: true, text: "{\r\n}\r\n" }), []);
});

test("every code is registered once with a unique UPPER_SNAKE name and error severity", () => {
  assert.equal(PACKAGE_STANDARD_CODES.length, 14);
  assert.equal(new Set(PACKAGE_STANDARD_CODES.map((c) => c.code)).size, 14);
  assert.equal(new Set(PACKAGE_STANDARD_CODES.map((c) => c.name)).size, 14);
  PACKAGE_STANDARD_CODES.forEach((c, i) => {
    assert.equal(c.code, `FUNGI-PKGSTD-${String(i + 1).padStart(3, "0")}`);
    assert.match(c.name, /^PKG_STD_[A-Z0-9_]+$/);
    assert.equal(c.severity, "error");
  });
});

test("diagnostics carry no null, undefined, or NaN and are sorted", () => {
  const diags = auditPackage(input({ profile: "production", manifest: { present: false }, sbom: { present: true, text: "null" } }));
  assert.ok(diags.length >= 2);
  for (const d of diags) for (const v of Object.values(d)) assert.equal(typeof v, "string");
  const keys = diags.map((d) => `${d.packageDir}\0${d.code}\0${d.file}\0${d.detail}`);
  assert.deepEqual(keys, [...keys].sort());
});
