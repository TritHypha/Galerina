// package-standard.ts: the Package Standard v1 section 4 conformance core
// (handover R3, the `pkg-standard-audit` gate).
//
// One pure decision function over the three per-package governance documents:
//   galerina-package.json  (section 4a, schema fungi.package.manifest.v1)
//   build-manifest.json    (section 4b, schema galerina.package.build-manifest.v1)
//   sbom.json              (section 4c, CycloneDX 1.5, first-level dependencies only)
//
// FAIL-CLOSED by construction:
//   * every document is parsed by a strict JSON reader that refuses a BOM,
//     duplicate keys, and any `null` value (null is never a valid state here;
//     unknowns are explicit enums such as UNSIGNED / NO_WASM_ARTIFACT);
//   * every object is exact-key checked: an unknown or missing key is RED;
//   * every path is repo-relative POSIX: absolute, drive, backslash, and `..`
//     segments are RED;
//   * an empty or mismatched package set is RED (a vacuous sweep is not a pass).
//
// No imports: the caller (scripts/audit-pkg-standard.mjs) is the I/O boundary.
// It reads the files, derives the observed source hashes from the git index,
// and injects the RD-0355 licence classifier, so there is one classifier.
//
// Codes: FUNGI-PKGSTD-001..014. Each code is emitted at exactly one kind of
// site and has a positive and a negative test in
// tests/package-standard.test.mjs.

export const PACKAGE_MANIFEST_SCHEMA = "fungi.package.manifest.v1";
export const PACKAGE_BUILD_MANIFEST_SCHEMA = "galerina.package.build-manifest.v1";
export const PACKAGE_STANDARD_GENERATOR = "scripts/gen-package-standard-manifests.mjs";
export const PACKAGE_STANDARD_FILES = ["galerina-package.json", "build-manifest.json", "sbom.json"] as const;

export const FUNGI_PKGSTD_001 = {
  code: "FUNGI-PKGSTD-001",
  name: "PKG_STD_MANIFEST_MISSING",
  severity: "error",
  message: "Package has no galerina-package.json governance manifest (Package Standard v1 section 4a).",
} as const;

export const FUNGI_PKGSTD_002 = {
  code: "FUNGI-PKGSTD-002",
  name: "PKG_STD_MANIFEST_INVALID",
  severity: "error",
  message: "galerina-package.json is not a strict, exact-key fungi.package.manifest.v1 document.",
} as const;

export const FUNGI_PKGSTD_003 = {
  code: "FUNGI-PKGSTD-003",
  name: "PKG_STD_IDENTITY_MISMATCH",
  severity: "error",
  message: "A package-standard document names a different package identity than package.json.",
} as const;

export const FUNGI_PKGSTD_004 = {
  code: "FUNGI-PKGSTD-004",
  name: "PKG_STD_BUILD_MANIFEST_MISSING",
  severity: "error",
  message: "Package has no build-manifest.json (Package Standard v1 section 4b).",
} as const;

export const FUNGI_PKGSTD_005 = {
  code: "FUNGI-PKGSTD-005",
  name: "PKG_STD_BUILD_MANIFEST_INVALID",
  severity: "error",
  message: "build-manifest.json is not a strict, exact-key galerina.package.build-manifest.v1 document.",
} as const;

export const FUNGI_PKGSTD_006 = {
  code: "FUNGI-PKGSTD-006",
  name: "PKG_STD_SOURCE_HASH_STALE",
  severity: "error",
  message: "build-manifest.json source hashes do not match the package sources.",
} as const;

export const FUNGI_PKGSTD_007 = {
  code: "FUNGI-PKGSTD-007",
  name: "PKG_STD_SBOM_MISSING",
  severity: "error",
  message: "Package has no sbom.json (Package Standard v1 section 4c).",
} as const;

export const FUNGI_PKGSTD_008 = {
  code: "FUNGI-PKGSTD-008",
  name: "PKG_STD_SBOM_INVALID",
  severity: "error",
  message: "sbom.json is not a strict, exact-key first-level CycloneDX 1.5 document.",
} as const;

export const FUNGI_PKGSTD_009 = {
  code: "FUNGI-PKGSTD-009",
  name: "PKG_STD_SBOM_DEPENDENCY_UNPINNED",
  severity: "error",
  message: "An sbom.json dependency has no exact pinned version or no content hash.",
} as const;

export const FUNGI_PKGSTD_010 = {
  code: "FUNGI-PKGSTD-010",
  name: "PKG_STD_SBOM_LICENSE_DENIED",
  severity: "error",
  message: "An sbom.json dependency licence is outside the Package Standard allow-list.",
} as const;

export const FUNGI_PKGSTD_011 = {
  code: "FUNGI-PKGSTD-011",
  name: "PKG_STD_UNSIGNED_IN_PRODUCTION",
  severity: "error",
  message: "An unsigned package was audited under the production profile.",
} as const;

export const FUNGI_PKGSTD_012 = {
  code: "FUNGI-PKGSTD-012",
  name: "PKG_STD_NO_WASM_IN_PRODUCTION",
  severity: "error",
  message: "A package with no WASM build artifact was audited under the production profile.",
} as const;

export const FUNGI_PKGSTD_013 = {
  code: "FUNGI-PKGSTD-013",
  name: "PKG_STD_PACKAGE_SET_MISMATCH",
  severity: "error",
  message: "The audited package set is empty or differs from the workspace package list.",
} as const;

export const FUNGI_PKGSTD_014 = {
  code: "FUNGI-PKGSTD-014",
  name: "PKG_STD_ARTIFACT_DRIFT",
  severity: "error",
  message: "A committed package-standard document differs from the generator output.",
} as const;

export interface PackageStandardCode {
  readonly code: string;
  readonly name: string;
  readonly severity: "error";
  readonly message: string;
}

export const PACKAGE_STANDARD_CODES: readonly PackageStandardCode[] = [
  FUNGI_PKGSTD_001, FUNGI_PKGSTD_002, FUNGI_PKGSTD_003, FUNGI_PKGSTD_004,
  FUNGI_PKGSTD_005, FUNGI_PKGSTD_006, FUNGI_PKGSTD_007, FUNGI_PKGSTD_008,
  FUNGI_PKGSTD_009, FUNGI_PKGSTD_010, FUNGI_PKGSTD_011, FUNGI_PKGSTD_012,
  FUNGI_PKGSTD_013, FUNGI_PKGSTD_014,
];

export interface PackageStandardDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error";
  readonly packageDir: string;
  readonly file: string;
  readonly detail: string;
}

function makePackageStandardDiag(
  def: PackageStandardCode,
  packageDir: string,
  file: string,
  detail: string,
): PackageStandardDiagnostic {
  return { code: def.code, name: def.name, severity: def.severity, packageDir, file, detail };
}

export type PackageStandardProfile = "development" | "production";

export type DocumentText = { readonly present: false } | { readonly present: true; readonly text: string };

export interface ObservedSourceFile {
  readonly path: string;
  readonly sha256: string;
}

export interface PackageStandardInput {
  readonly packageDir: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly manifest: DocumentText;
  readonly buildManifest: DocumentText;
  readonly sbom: DocumentText;
  readonly observedSources: readonly ObservedSourceFile[];
  readonly observedAggregateSha256: string;
  readonly profile: PackageStandardProfile;
  /** RD-0355 classifier verdict for an SPDX expression (PERMISSIVE, DUAL-OK, WEAK, COPYLEFT-RED, UNKNOWN-RED). */
  readonly classifyLicense: (expression: string) => string;
  /** Packages that may carry GPL inside their own closure (RD-0355 F1 sanctioned extensions). */
  readonly sanctionedGplPackages: readonly string[];
  /** Evidenced `name@version` licence overrides (governance/license-overrides.json). */
  readonly licenseOverrides: readonly string[];
}

// ---------------------------------------------------------------------------
// Strict JSON reader: refuses BOM, duplicate keys, null, and trailing garbage.
// ---------------------------------------------------------------------------

type Json = string | number | boolean | Json[] | { [key: string]: Json };

class StrictJsonError extends Error {}

function parseStrictJson(text: string): Json {
  if (text.charCodeAt(0) === 0xfeff) throw new StrictJsonError("document starts with a byte-order mark");
  let index = 0;
  const fail = (why: string): never => {
    throw new StrictJsonError(`${why} at offset ${index}`);
  };
  const ws = (): void => {
    while (index < text.length && " \t\n\r".includes(text.charAt(index))) index += 1;
  };
  const parseString = (): string => {
    const start = index;
    index += 1;
    while (index < text.length) {
      const ch = text.charAt(index);
      if (ch === "\\") {
        index += 2;
        continue;
      }
      if (ch === "\"") {
        index += 1;
        return JSON.parse(text.slice(start, index)) as string;
      }
      if (ch.charCodeAt(0) < 0x20) fail("control character in string");
      index += 1;
    }
    return fail("unterminated string");
  };
  const parseValue = (depth: number): Json => {
    if (depth > 32) fail("nesting too deep");
    ws();
    const ch = text.charAt(index);
    if (ch === "{") {
      index += 1;
      const out: { [key: string]: Json } = {};
      const seen = new Set<string>();
      ws();
      if (text.charAt(index) === "}") {
        index += 1;
        return out;
      }
      for (;;) {
        ws();
        if (text.charAt(index) !== "\"") fail("expected object key");
        const key = parseString();
        if (seen.has(key)) fail(`duplicate key "${key}"`);
        seen.add(key);
        ws();
        if (text.charAt(index) !== ":") fail("expected ':'");
        index += 1;
        Object.defineProperty(out, key, { value: parseValue(depth + 1), enumerable: true, writable: false, configurable: false });
        ws();
        if (text.charAt(index) === ",") {
          index += 1;
          continue;
        }
        if (text.charAt(index) === "}") {
          index += 1;
          return out;
        }
        fail("expected ',' or '}'");
      }
    }
    if (ch === "[") {
      index += 1;
      const out: Json[] = [];
      ws();
      if (text.charAt(index) === "]") {
        index += 1;
        return out;
      }
      for (;;) {
        out.push(parseValue(depth + 1));
        ws();
        if (text.charAt(index) === ",") {
          index += 1;
          continue;
        }
        if (text.charAt(index) === "]") {
          index += 1;
          return out;
        }
        fail("expected ',' or ']'");
      }
    }
    if (ch === "\"") return parseString();
    if (text.startsWith("true", index)) {
      index += 4;
      return true;
    }
    if (text.startsWith("false", index)) {
      index += 5;
      return false;
    }
    if (text.startsWith("null", index)) fail("null is not a permitted value");
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(index));
    if (number === null) return fail("unexpected token");
    index += number[0].length;
    const value = Number(number[0]);
    if (!Number.isFinite(value)) fail("non-finite number");
    return value;
  };
  const value = parseValue(0);
  ws();
  if (index !== text.length) fail("trailing content after document");
  return value;
}

// ---------------------------------------------------------------------------
// Shape checking. Every helper pushes a human-readable problem and returns a
// safe placeholder, so one pass reports every problem in a document.
// ---------------------------------------------------------------------------

type Obj = { readonly [key: string]: Json };

class Shape {
  readonly problems: string[] = [];

  object(value: Json | undefined, where: string, keys: readonly string[]): Obj {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      this.problems.push(`${where} must be an object`);
      return {};
    }
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    for (const key of actual) if (!expected.includes(key)) this.problems.push(`${where} has unknown key "${key}"`);
    for (const key of expected) if (!actual.includes(key)) this.problems.push(`${where} is missing key "${key}"`);
    return value;
  }

  string(value: Json | undefined, where: string): string {
    if (typeof value !== "string" || value.length === 0) {
      this.problems.push(`${where} must be a non-empty string`);
      return "";
    }
    return value;
  }

  literal(value: Json | undefined, where: string, allowed: readonly string[]): string {
    const text = this.string(value, where);
    if (text !== "" && !allowed.includes(text)) this.problems.push(`${where} must be one of ${allowed.join("|")}`);
    return text;
  }

  sha256(value: Json | undefined, where: string): string {
    const text = this.string(value, where);
    if (text !== "" && !/^[0-9a-f]{64}$/.test(text)) this.problems.push(`${where} must be 64 lowercase hex`);
    return text;
  }

  path(value: Json | undefined, where: string): string {
    const text = this.string(value, where);
    if (text === "") return text;
    if (text.includes("\\")) this.problems.push(`${where} must use POSIX separators`);
    if (text.startsWith("/") || /^[A-Za-z]:/.test(text)) this.problems.push(`${where} must be relative`);
    if (text.split("/").includes("..")) this.problems.push(`${where} must not contain '..'`);
    return text;
  }

  array(value: Json | undefined, where: string): readonly Json[] {
    if (!Array.isArray(value)) {
      this.problems.push(`${where} must be an array`);
      return [];
    }
    return value;
  }

  sortedStrings(value: Json | undefined, where: string): readonly string[] {
    const items = this.array(value, where).map((item, i) => this.string(item, `${where}[${i}]`));
    for (let i = 1; i < items.length; i += 1) {
      const prev = items[i - 1] ?? "";
      const cur = items[i] ?? "";
      if (!(prev < cur)) this.problems.push(`${where} must be sorted and unique`);
    }
    return items;
  }

  boolean(value: Json | undefined, where: string): boolean {
    if (typeof value !== "boolean") {
      this.problems.push(`${where} must be a boolean`);
      return false;
    }
    return value;
  }
}

function field(obj: Obj, key: string): Json | undefined {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

const SEMVER_EXACT = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

interface ParsedManifest {
  readonly name: string;
  readonly version: string;
  readonly signatureStatus: string;
  readonly buildStatus: string;
}

function checkManifest(doc: Json, shape: Shape): ParsedManifest {
  const m = shape.object(doc, "manifest", [
    "archetype", "boundaries", "build", "capabilities", "dependencies", "effects", "exports",
    "generatedBy", "governance", "name", "sbom", "schemaVersion", "signature", "version",
  ]);
  shape.literal(field(m, "schemaVersion"), "schemaVersion", [PACKAGE_MANIFEST_SCHEMA]);
  shape.literal(field(m, "generatedBy"), "generatedBy", [PACKAGE_STANDARD_GENERATOR]);
  const name = shape.string(field(m, "name"), "name");
  const version = shape.string(field(m, "version"), "version");
  const archetype = shape.object(field(m, "archetype"), "archetype", ["source", "value"]);
  shape.literal(field(archetype, "value"), "archetype.value", ["fungi", "gate", "native-floor"]);
  shape.literal(field(archetype, "source"), "archetype.source", ["inferred-from-name", "package.fungi.json"]);
  shape.sortedStrings(field(m, "boundaries"), "boundaries");
  shape.sortedStrings(field(m, "capabilities"), "capabilities");
  const effects = shape.object(field(m, "effects"), "effects", ["declares", "evidence", "transitive"]);
  shape.sortedStrings(field(effects, "declares"), "effects.declares");
  shape.sortedStrings(field(effects, "transitive"), "effects.transitive");
  shape.literal(field(effects, "evidence"), "effects.evidence", ["DECLARED_IN_PACKAGE_FUNGI", "NOT_OBSERVED"]);
  shape.array(field(m, "dependencies"), "dependencies").forEach((dep, i) => {
    const d = shape.object(dep, `dependencies[${i}]`, ["kind", "name", "specifier"]);
    shape.literal(field(d, "kind"), `dependencies[${i}].kind`, ["internal", "third-party"]);
    shape.string(field(d, "name"), `dependencies[${i}].name`);
    shape.string(field(d, "specifier"), `dependencies[${i}].specifier`);
  });
  shape.array(field(m, "exports"), "exports").forEach((entry, i) => {
    const e = shape.object(entry, `exports[${i}]`, ["condition", "specifier", "target"]);
    shape.string(field(e, "condition"), `exports[${i}].condition`);
    shape.string(field(e, "specifier"), `exports[${i}].specifier`);
    shape.path(field(e, "target"), `exports[${i}].target`);
  });
  const governance = shape.object(field(m, "governance"), "governance", ["allowedProfiles", "requiresAudit"]);
  shape.sortedStrings(field(governance, "allowedProfiles"), "governance.allowedProfiles")
    .forEach((p, i) => shape.literal(p, `governance.allowedProfiles[${i}]`, ["development", "production"]));
  shape.boolean(field(governance, "requiresAudit"), "governance.requiresAudit");
  shape.literal(field(m, "sbom"), "sbom", ["sbom.json"]);
  const build = shape.object(field(m, "build"), "build", ["manifest", "status"]);
  shape.literal(field(build, "manifest"), "build.manifest", ["build-manifest.json"]);
  const buildStatus = shape.literal(field(build, "status"), "build.status", ["NO_WASM_ARTIFACT", "WASM_ARTIFACT_PRESENT"]);
  const rawSignature = field(m, "signature");
  let signatureStatus = "";
  if (typeof rawSignature === "object" && rawSignature !== null && !Array.isArray(rawSignature)
      && field(rawSignature, "status") === "SIGNED") {
    const s = shape.object(rawSignature, "signature", ["hash", "publisher", "status"]);
    signatureStatus = "SIGNED";
    shape.string(field(s, "publisher"), "signature.publisher");
    const hash = shape.string(field(s, "hash"), "signature.hash");
    if (hash !== "" && !/^sha256:[0-9a-f]{64}$/.test(hash)) shape.problems.push("signature.hash must be sha256:<64 hex>");
  } else {
    const s = shape.object(rawSignature, "signature", ["publisher", "status"]);
    signatureStatus = shape.literal(field(s, "status"), "signature.status", ["UNSIGNED"]);
    shape.literal(field(s, "publisher"), "signature.publisher", ["none"]);
  }
  return { name, version, signatureStatus, buildStatus };
}

interface ParsedBuildManifest {
  readonly name: string;
  readonly version: string;
  readonly artifactStatus: string;
  readonly files: readonly ObservedSourceFile[];
  readonly aggregate: string;
}

function checkBuildManifest(doc: Json, shape: Shape): ParsedBuildManifest {
  const b = shape.object(doc, "build-manifest", [
    "artifacts", "compiler", "flags", "generatedBy", "package", "reproducible", "schemaVersion", "sources",
  ]);
  shape.literal(field(b, "schemaVersion"), "schemaVersion", [PACKAGE_BUILD_MANIFEST_SCHEMA]);
  shape.literal(field(b, "generatedBy"), "generatedBy", [PACKAGE_STANDARD_GENERATOR]);
  const pkg = shape.object(field(b, "package"), "package", ["name", "version"]);
  const name = shape.string(field(pkg, "name"), "package.name");
  const version = shape.string(field(pkg, "version"), "package.version");
  const compiler = shape.object(field(b, "compiler"), "compiler", ["name", "version"]);
  shape.string(field(compiler, "name"), "compiler.name");
  shape.string(field(compiler, "version"), "compiler.version");
  shape.sortedStrings(field(b, "flags"), "flags");
  const reproducible = shape.object(field(b, "reproducible"), "reproducible", ["method", "timestamp"]);
  shape.literal(field(reproducible, "method"), "reproducible.method", ["content-addressed-git-index"]);
  shape.literal(field(reproducible, "timestamp"), "reproducible.timestamp", ["NONE"]);
  const artifacts = shape.object(field(b, "artifacts"), "artifacts", ["status", "wasm"]);
  const artifactStatus = shape.literal(field(artifacts, "status"), "artifacts.status", ["NO_WASM_ARTIFACT", "WASM_ARTIFACT_PRESENT"]);
  const wasm = shape.array(field(artifacts, "wasm"), "artifacts.wasm");
  wasm.forEach((entry, i) => {
    const w = shape.object(entry, `artifacts.wasm[${i}]`, ["path", "sha256"]);
    shape.path(field(w, "path"), `artifacts.wasm[${i}].path`);
    shape.sha256(field(w, "sha256"), `artifacts.wasm[${i}].sha256`);
  });
  if (artifactStatus === "NO_WASM_ARTIFACT" && wasm.length !== 0) shape.problems.push("artifacts.wasm must be empty when status is NO_WASM_ARTIFACT");
  if (artifactStatus === "WASM_ARTIFACT_PRESENT" && wasm.length === 0) shape.problems.push("artifacts.wasm must be non-empty when status is WASM_ARTIFACT_PRESENT");
  const sources = shape.object(field(b, "sources"), "sources", ["aggregateSha256", "algorithm", "files"]);
  shape.literal(field(sources, "algorithm"), "sources.algorithm", ["sha256"]);
  const aggregate = shape.sha256(field(sources, "aggregateSha256"), "sources.aggregateSha256");
  const files = shape.array(field(sources, "files"), "sources.files").map((entry, i) => {
    const f = shape.object(entry, `sources.files[${i}]`, ["path", "sha256"]);
    return { path: shape.path(field(f, "path"), `sources.files[${i}].path`), sha256: shape.sha256(field(f, "sha256"), `sources.files[${i}].sha256`) };
  });
  for (let i = 1; i < files.length; i += 1) {
    if (!((files[i - 1]?.path ?? "") < (files[i]?.path ?? ""))) shape.problems.push("sources.files must be sorted by path and unique");
  }
  return { name, version, artifactStatus, files, aggregate };
}

interface SbomComponent {
  readonly where: string;
  readonly name: string;
  readonly version: string;
  readonly hashCount: number;
  readonly license: string;
}

interface ParsedSbom {
  readonly name: string;
  readonly version: string;
  readonly components: readonly SbomComponent[];
}

function checkSbom(doc: Json, shape: Shape): ParsedSbom {
  const s = shape.object(doc, "sbom", ["bomFormat", "components", "dependencies", "metadata", "specVersion", "version"]);
  shape.literal(field(s, "bomFormat"), "bomFormat", ["CycloneDX"]);
  shape.literal(field(s, "specVersion"), "specVersion", ["1.5"]);
  if (field(s, "version") !== 1) shape.problems.push("version must be the integer 1");
  const metadata = shape.object(field(s, "metadata"), "metadata", ["component", "properties"]);
  const root = shape.object(field(metadata, "component"), "metadata.component", ["bom-ref", "name", "type", "version"]);
  const rootRef = shape.string(field(root, "bom-ref"), "metadata.component.bom-ref");
  const name = shape.string(field(root, "name"), "metadata.component.name");
  const version = shape.string(field(root, "version"), "metadata.component.version");
  shape.literal(field(root, "type"), "metadata.component.type", ["library"]);
  const props = shape.array(field(metadata, "properties"), "metadata.properties");
  const propMap = new Map<string, string>();
  props.forEach((p, i) => {
    const o = shape.object(p, `metadata.properties[${i}]`, ["name", "value"]);
    propMap.set(shape.string(field(o, "name"), `metadata.properties[${i}].name`), shape.string(field(o, "value"), `metadata.properties[${i}].value`));
  });
  if (propMap.get("galerina:generated-by") !== PACKAGE_STANDARD_GENERATOR) shape.problems.push("metadata.properties must carry galerina:generated-by");
  if (propMap.get("galerina:depth") !== "1") shape.problems.push("metadata.properties must carry galerina:depth = 1");
  const refs: string[] = [];
  const components = shape.array(field(s, "components"), "components").map((entry, i) => {
    const where = `components[${i}]`;
    const c = shape.object(entry, where, ["bom-ref", "hashes", "licenses", "name", "properties", "purl", "scope", "type", "version"]);
    refs.push(shape.string(field(c, "bom-ref"), `${where}.bom-ref`));
    const cname = shape.string(field(c, "name"), `${where}.name`);
    const cversion = shape.string(field(c, "version"), `${where}.version`);
    shape.string(field(c, "purl"), `${where}.purl`);
    shape.literal(field(c, "scope"), `${where}.scope`, ["required"]);
    shape.literal(field(c, "type"), `${where}.type`, ["library"]);
    const hashes = shape.array(field(c, "hashes"), `${where}.hashes`);
    hashes.forEach((h, j) => {
      const ho = shape.object(h, `${where}.hashes[${j}]`, ["alg", "content"]);
      const alg = shape.literal(field(ho, "alg"), `${where}.hashes[${j}].alg`, ["SHA-256", "SHA-384", "SHA-512"]);
      const content = shape.string(field(ho, "content"), `${where}.hashes[${j}].content`);
      const width = alg === "SHA-256" ? 64 : alg === "SHA-384" ? 96 : 128;
      if (content !== "" && !new RegExp(`^[0-9a-f]{${width}}$`).test(content)) shape.problems.push(`${where}.hashes[${j}].content must be ${width} lowercase hex`);
    });
    const licenses = shape.array(field(c, "licenses"), `${where}.licenses`);
    if (licenses.length !== 1) shape.problems.push(`${where}.licenses must hold exactly one expression`);
    const lic = shape.object(licenses[0] ?? {}, `${where}.licenses[0]`, ["expression"]);
    const license = shape.string(field(lic, "expression"), `${where}.licenses[0].expression`);
    shape.array(field(c, "properties"), `${where}.properties`).forEach((p, j) => {
      const o = shape.object(p, `${where}.properties[${j}]`, ["name", "value"]);
      shape.string(field(o, "name"), `${where}.properties[${j}].name`);
      shape.string(field(o, "value"), `${where}.properties[${j}].value`);
    });
    return { where, name: cname, version: cversion, hashCount: hashes.length, license };
  });
  for (let i = 1; i < components.length; i += 1) {
    if (!((components[i - 1]?.name ?? "") < (components[i]?.name ?? ""))) shape.problems.push("components must be sorted by name and unique");
  }
  const deps = shape.array(field(s, "dependencies"), "dependencies");
  if (deps.length !== 1) shape.problems.push("dependencies must hold exactly the root entry (first-level SBOM)");
  const rootDep = shape.object(deps[0] ?? {}, "dependencies[0]", ["dependsOn", "ref"]);
  if (field(rootDep, "ref") !== rootRef) shape.problems.push("dependencies[0].ref must be the metadata component bom-ref");
  const dependsOn = shape.sortedStrings(field(rootDep, "dependsOn"), "dependencies[0].dependsOn");
  if ([...refs].sort().join("\n") !== [...dependsOn].join("\n")) shape.problems.push("dependencies[0].dependsOn must list exactly the component bom-refs");
  return { name, version, components };
}

function parseDocument(text: string, shape: Shape): Json | undefined {
  try {
    return parseStrictJson(text.replace(/\r\n/g, "\n"));
  } catch (error) {
    shape.problems.push(error instanceof Error ? error.message : "unparseable document");
    return undefined;
  }
}

/** Audit one package's three governance documents. Returns every diagnostic, sorted. */
export function auditPackage(input: PackageStandardInput): PackageStandardDiagnostic[] {
  const out: PackageStandardDiagnostic[] = [];
  const dir = input.packageDir;
  const identityProblems: string[] = [];

  let manifest: ParsedManifest | undefined;
  if (!input.manifest.present) {
    out.push(makePackageStandardDiag(FUNGI_PKGSTD_001, dir, "galerina-package.json", "file is absent"));
  } else {
    const shape = new Shape();
    const doc = parseDocument(input.manifest.text, shape);
    if (doc !== undefined) manifest = checkManifest(doc, shape);
    if (shape.problems.length > 0) {
      out.push(makePackageStandardDiag(FUNGI_PKGSTD_002, dir, "galerina-package.json", shape.problems.join("; ")));
      manifest = undefined;
    }
  }

  let build: ParsedBuildManifest | undefined;
  if (!input.buildManifest.present) {
    out.push(makePackageStandardDiag(FUNGI_PKGSTD_004, dir, "build-manifest.json", "file is absent"));
  } else {
    const shape = new Shape();
    const doc = parseDocument(input.buildManifest.text, shape);
    if (doc !== undefined) build = checkBuildManifest(doc, shape);
    if (shape.problems.length > 0) {
      out.push(makePackageStandardDiag(FUNGI_PKGSTD_005, dir, "build-manifest.json", shape.problems.join("; ")));
      build = undefined;
    }
  }

  let sbom: ParsedSbom | undefined;
  if (!input.sbom.present) {
    out.push(makePackageStandardDiag(FUNGI_PKGSTD_007, dir, "sbom.json", "file is absent"));
  } else {
    const shape = new Shape();
    const doc = parseDocument(input.sbom.text, shape);
    if (doc !== undefined) sbom = checkSbom(doc, shape);
    if (shape.problems.length > 0) {
      out.push(makePackageStandardDiag(FUNGI_PKGSTD_008, dir, "sbom.json", shape.problems.join("; ")));
      sbom = undefined;
    }
  }

  const expectIdentity = (file: string, name: string, version: string): void => {
    if (name !== input.packageName || version !== input.packageVersion) {
      identityProblems.push(`${file} names ${name}@${version}, package.json names ${input.packageName}@${input.packageVersion}`);
    }
  };
  if (manifest !== undefined) expectIdentity("galerina-package.json", manifest.name, manifest.version);
  if (build !== undefined) expectIdentity("build-manifest.json", build.name, build.version);
  if (sbom !== undefined) expectIdentity("sbom.json", sbom.name, sbom.version);
  if (identityProblems.length > 0) {
    out.push(makePackageStandardDiag(FUNGI_PKGSTD_003, dir, "package.json", identityProblems.join("; ")));
  }

  if (build !== undefined) {
    const declared = build.files.map((f) => `${f.path} ${f.sha256}`).join("\n");
    const observed = [...input.observedSources]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => `${f.path} ${f.sha256}`).join("\n");
    if (declared !== observed || build.aggregate !== input.observedAggregateSha256) {
      const declaredSet = new Set(build.files.map((f) => `${f.path} ${f.sha256}`));
      const observedSet = new Set(input.observedSources.map((f) => `${f.path} ${f.sha256}`));
      const changed = [...observedSet].filter((x) => !declaredSet.has(x)).length
        + [...declaredSet].filter((x) => !observedSet.has(x)).length;
      out.push(makePackageStandardDiag(FUNGI_PKGSTD_006, dir, "build-manifest.json", `${changed} source entries differ; aggregate ${build.aggregate === input.observedAggregateSha256 ? "matches" : "differs"}`));
    }
  }

  if (sbom !== undefined) {
    const unpinned = sbom.components
      .filter((c) => !SEMVER_EXACT.test(c.version) || c.hashCount === 0)
      .map((c) => `${c.name}@${c.version}${c.hashCount === 0 ? " (no hash)" : ""}`);
    if (unpinned.length > 0) {
      out.push(makePackageStandardDiag(FUNGI_PKGSTD_009, dir, "sbom.json", unpinned.join(", ")));
    }
    const sanctioned = input.sanctionedGplPackages.includes(input.packageName);
    const denied = sbom.components.filter((c) => {
      const verdict = input.classifyLicense(c.license);
      if (verdict === "PERMISSIVE" || verdict === "DUAL-OK" || verdict === "WEAK") return false;
      if (verdict === "COPYLEFT-RED" && sanctioned) return false;
      if (verdict === "UNKNOWN-RED" && input.licenseOverrides.includes(`${c.name}@${c.version}`)) return false;
      return true;
    }).map((c) => `${c.name}@${c.version} (${c.license}: ${input.classifyLicense(c.license)})`);
    if (denied.length > 0) {
      out.push(makePackageStandardDiag(FUNGI_PKGSTD_010, dir, "sbom.json", denied.join(", ")));
    }
  }

  if (input.profile === "production" && manifest !== undefined) {
    if (manifest.signatureStatus !== "SIGNED") {
      out.push(makePackageStandardDiag(FUNGI_PKGSTD_011, dir, "galerina-package.json", `signature.status is ${manifest.signatureStatus}`));
    }
    if (manifest.buildStatus !== "WASM_ARTIFACT_PRESENT" || (build !== undefined && build.artifactStatus !== "WASM_ARTIFACT_PRESENT")) {
      out.push(makePackageStandardDiag(FUNGI_PKGSTD_012, dir, "build-manifest.json", "no WASM artifact is recorded"));
    }
  }

  return sortDiagnostics(out);
}

/** The package set must be non-empty and identical between the workspace list and the package root. */
export function auditPackageSet(workspaceDirs: readonly string[], diskDirs: readonly string[]): PackageStandardDiagnostic[] {
  const ws = [...new Set(workspaceDirs)].sort();
  const disk = [...new Set(diskDirs)].sort();
  const problems: string[] = [];
  if (ws.length === 0 || disk.length === 0) problems.push("vacuous package set: nothing to audit");
  if (ws.length !== workspaceDirs.length) problems.push("workspace package list has duplicates");
  for (const d of ws) if (!disk.includes(d)) problems.push(`workspace lists ${d} but it is not on disk`);
  for (const d of disk) if (!ws.includes(d)) problems.push(`${d} is on disk but not in the workspace list`);
  if (problems.length === 0) return [];
  return [makePackageStandardDiag(FUNGI_PKGSTD_013, "*", "galerina.workspace.json", problems.join("; "))];
}

/** A committed document must equal the generator output byte-for-byte (line endings normalised). */
export function auditGeneratedDrift(
  packageDir: string,
  file: string,
  expected: string,
  actual: DocumentText,
): PackageStandardDiagnostic[] {
  if (actual.present && actual.text.replace(/\r\n/g, "\n") === expected) return [];
  return [makePackageStandardDiag(FUNGI_PKGSTD_014, packageDir, file, actual.present ? "content differs from generator output" : "file is absent")];
}

export function sortDiagnostics(list: readonly PackageStandardDiagnostic[]): PackageStandardDiagnostic[] {
  const key = (d: PackageStandardDiagnostic): string => `${d.packageDir}\u0000${d.code}\u0000${d.file}\u0000${d.detail}`;
  return [...list].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}
