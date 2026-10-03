#!/usr/bin/env node
// gen-package-standard-manifests.mjs: deterministic generator for the three Package
// Standard v1 section 4 documents of every workspace package (handover R4):
//
//   packages-ts/<dir>/galerina-package.json   fungi.package.manifest.v1
//   packages-ts/<dir>/build-manifest.json     galerina.package.build-manifest.v1
//   packages-ts/<dir>/sbom.json               CycloneDX 1.5, first-level dependencies
//
// THE INVARIANTS
//   (1) DETERMINISTIC. Every byte is a pure function of the git index. There is no
//       timestamp, no random serial, and no wall-clock read. Objects are written with
//       sorted keys; every array is explicitly sorted. Source hashes are sha256 over the
//       git blob content (`git cat-file`), so a Windows CRLF checkout and a Linux checkout
//       produce identical documents.
//   (2) NO null, NaN, undefined, or Infinity. The canonical writer refuses them. An
//       unknown is an explicit enum (signature UNSIGNED, build NO_WASM_ARTIFACT, effects
//       NOT_OBSERVED), never a fabricated value.
//   (3) TRUTHFUL. A dependency the lockfile does not pin is written with its range and no
//       hash, so the audit reports it (FUNGI-PKGSTD-009) instead of hiding it.
//   (4) FAIL-CLOSED. A malformed package.json or lockfile, duplicate JSON keys, a BOM, a
//       gitlink, or a dangling file: dependency stops the run. Every generated document
//       is re-validated by the R3 audit core before anything is printed or written.
//
// MODES (exactly one; default --dry-run)
//   --dry-run          generate everything twice in memory, prove byte-identity, validate;
//                      write nothing
//   --out <dir>        write the documents to <dir>/<package-dir>/ (must be outside
//                      packages-ts/); used to review output without touching packages
//   --check            compare committed documents with generator output
//                      (FUNGI-PKGSTD-014); write nothing
//   --write --accept-lock-drift
//                      write into packages-ts/<dir>/. Adding tracked files changes every
//                      package contentDigest in governance/flat-package-root-lock.json, a
//                      Codex/owner decision, so this mode refuses without the flag.
//   --self-test        prove determinism and hostile-input refusal on a temporary fixture
// Options: --root <dir> (default: cwd), --json.
//
// Requires the audit core to be built:
//   (cd packages-ts/galerina-devtools-package-graph && npm run build)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findDuplicateKeys, purlNpm, sriToHashes } from "./generate-sbom.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const GENERATOR_ID = "scripts/gen-package-standard-manifests.mjs";
export const STANDARD_FILES = ["galerina-package.json", "build-manifest.json", "sbom.json"];
const CORE_DIST = join(SCRIPT_DIR, "..", "packages-ts", "galerina-devtools-package-graph", "dist", "package-standard.js");

export class RefusedError extends Error {}
const refuse = (message) => {
  throw new RefusedError(message);
};

export async function loadCore() {
  if (!existsSync(CORE_DIST)) {
    refuse("audit core is not built: run `npm run build` in packages-ts/galerina-devtools-package-graph");
  }
  const core = await import(pathToFileURL(CORE_DIST).href);
  if (core.PACKAGE_STANDARD_GENERATOR !== GENERATOR_ID) refuse("audit core and generator disagree on the generator id");
  return core;
}

// ── canonical writer ───────────────────────────────────────────────────────────────

/** Sorted-key, 2-space, LF, trailing-newline JSON. Refuses null/undefined/NaN/Infinity/non-plain values. */
export function canonicalJson(value) {
  const walk = (v, where) => {
    if (v === null) refuse(`${where}: null is not permitted`);
    if (v === undefined) refuse(`${where}: undefined is not permitted`);
    if (typeof v === "number") {
      if (!Number.isFinite(v)) refuse(`${where}: non-finite number is not permitted`);
      return v;
    }
    if (typeof v === "string" || typeof v === "boolean") return v;
    if (Array.isArray(v)) return v.map((item, i) => walk(item, `${where}[${i}]`));
    if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      const out = {};
      for (const key of Object.keys(v).sort()) out[key] = walk(v[key], `${where}.${key}`);
      return out;
    }
    return refuse(`${where}: ${typeof v} is not a JSON value`);
  };
  return `${JSON.stringify(walk(value, "$"), null, 2)}\n`;
}

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

// ── strict input reading ────────────────────────────────────────────────────────────

export function parseStrictInput(text, label) {
  if (text.charCodeAt(0) === 0xfeff) refuse(`${label}: byte-order mark is not permitted`);
  const dups = findDuplicateKeys(text);
  if (dups.length > 0) refuse(`${label}: duplicate JSON key(s) ${dups.map((d) => `${d.key}@${d.offset}`).join(", ")}`);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    refuse(`${label}: malformed JSON (${error.message})`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) refuse(`${label}: must be a JSON object`);
  return value;
}

// ── git index ───────────────────────────────────────────────────────────────────────

function git(root, args, input) {
  return execFileSync("git", ["-c", `safe.directory=${root}`, "-C", root, ...args], {
    input,
    maxBuffer: 1 << 30,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Map of repo-relative path → { blob, content(Buffer) } for every tracked file under packages-ts/. */
export function readIndex(root) {
  const listing = git(root, ["ls-files", "-s", "-z", "--", "packages-ts"]).toString("utf8");
  const entries = [];
  for (const record of listing.split("\0")) {
    if (record === "") continue;
    const m = /^([0-7]{6}) ([0-9a-f]{40,64}) ([0-3])\t(.+)$/s.exec(record);
    if (m === null) refuse(`unparseable git index record: ${JSON.stringify(record)}`);
    const [, mode, blob, stage, path] = m;
    if (stage !== "0") refuse(`${path}: unmerged index entry`);
    if (mode === "160000") refuse(`${path}: gitlink inside a package is not permitted`);
    entries.push({ path, blob });
  }
  const index = new Map();
  if (entries.length === 0) return index;
  const out = git(root, ["cat-file", "--batch"], `${entries.map((e) => e.blob).join("\n")}\n`);
  let offset = 0;
  for (const entry of entries) {
    const nl = out.indexOf(0x0a, offset);
    const header = out.subarray(offset, nl).toString("utf8");
    const hm = /^([0-9a-f]+) blob ([0-9]+)$/.exec(header);
    if (hm === null || hm[1] !== entry.blob) refuse(`${entry.path}: unexpected cat-file header ${JSON.stringify(header)}`);
    const size = Number(hm[2]);
    const content = out.subarray(nl + 1, nl + 1 + size);
    offset = nl + 1 + size + 1;
    index.set(entry.path, { blob: entry.blob, content });
  }
  return index;
}

// ── document construction ───────────────────────────────────────────────────────────

function inferArchetype(dir) {
  if (/(^|-)(native|bridge-cpp|wasmtime)(-|$)/.test(dir)) return "native-floor";
  if (/(^|-)gate(-|$)/.test(dir)) return "gate";
  return "fungi";
}

function flattenExports(pkg) {
  const out = [];
  const visit = (specifier, condition, target) => {
    if (target === null) return; // npm "null" = not exported; nothing to record
    if (typeof target === "string") out.push({ condition, specifier, target });
    else if (Array.isArray(target)) target.forEach((t) => visit(specifier, condition, t));
    else if (typeof target === "object") for (const key of Object.keys(target)) visit(specifier, condition === "default" ? key : `${condition}+${key}`, target[key]);
    else refuse(`${pkg.name}: unsupported exports value`);
  };
  const exp = pkg.exports;
  if (exp === undefined) {
    if (typeof pkg.main === "string") out.push({ condition: "default", specifier: ".", target: pkg.main });
  } else if (typeof exp === "string" || Array.isArray(exp)) {
    visit(".", "default", exp);
  } else if (typeof exp === "object" && exp !== null) {
    const keys = Object.keys(exp);
    if (keys.length > 0 && keys.every((k) => !k.startsWith("."))) visit(".", "default", exp);
    else for (const key of keys) visit(key, "default", exp[key]);
  }
  for (const e of out) {
    if (e.target.includes("\\") || isAbsolute(e.target) || /^[A-Za-z]:/.test(e.target)) refuse(`${pkg.name}: export target ${e.target} is not a relative POSIX path`);
  }
  return out.sort((a, b) => byString(`${a.specifier}\0${a.condition}\0${a.target}`, `${b.specifier}\0${b.condition}\0${b.target}`));
}

function sortedUniqueStrings(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.length === 0)) refuse(`${label} must be an array of non-empty strings`);
  return [...new Set(value)].sort(byString);
}

/**
 * Build the three documents for one package directory. Pure over (index, workspace).
 * @returns {{ dir: string, name: string, version: string, docs: Record<string,string>, observedSources: {path:string,sha256:string}[], observedAggregateSha256: string }}
 */
export function buildPackageDocs(index, dir, compilerVersion) {
  const base = `packages-ts/${dir}`;
  const pjEntry = index.get(`${base}/package.json`);
  if (pjEntry === undefined) refuse(`${base}: package.json is not tracked`);
  const pkg = parseStrictInput(pjEntry.content.toString("utf8"), `${base}/package.json`);
  if (typeof pkg.name !== "string" || pkg.name.length === 0) refuse(`${base}: package name is missing`);
  if (typeof pkg.version !== "string" || pkg.version.length === 0) refuse(`${base}: package version is missing`);
  const lockEntry = index.get(`${base}/package-lock.json`);
  const lock = lockEntry === undefined ? undefined : parseStrictInput(lockEntry.content.toString("utf8"), `${base}/package-lock.json`);
  if (lock !== undefined && lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) refuse(`${base}/package-lock.json: unsupported lockfileVersion ${lock.lockfileVersion}`);
  const fungiEntry = index.get(`${base}/package.fungi.json`);
  const fungi = fungiEntry === undefined ? undefined : parseStrictInput(fungiEntry.content.toString("utf8"), `${base}/package.fungi.json`);

  const deps = pkg.dependencies === undefined ? {} : pkg.dependencies;
  if (typeof deps !== "object" || deps === null || Array.isArray(deps)) refuse(`${base}: dependencies must be an object`);
  const depNames = Object.keys(deps).sort(byString);
  const dependencies = [];
  const components = [];
  for (const depName of depNames) {
    const specifier = deps[depName];
    if (typeof specifier !== "string" || specifier.length === 0) refuse(`${base}: dependency ${depName} has no specifier`);
    const internal = specifier.startsWith("file:");
    dependencies.push({ kind: internal ? "internal" : "third-party", name: depName, specifier });
    if (internal) {
      const target = specifier.slice("file:".length).replace(/\/+$/, "");
      const m = /^\.\.\/([A-Za-z0-9._-]+)$/.exec(target);
      if (m === null) refuse(`${base}: internal dependency ${depName} is not a direct sibling (${specifier})`);
      const sib = index.get(`packages-ts/${m[1]}/package.json`);
      if (sib === undefined) refuse(`${base}: dangling internal dependency ${depName} -> ${specifier}`);
      const sibPkg = parseStrictInput(sib.content.toString("utf8"), `packages-ts/${m[1]}/package.json`);
      if (sibPkg.name !== depName) refuse(`${base}: ${specifier} is ${sibPkg.name}, not ${depName}`);
      if (typeof sibPkg.version !== "string" || sibPkg.version.length === 0) refuse(`packages-ts/${m[1]}: version is missing`);
      components.push({
        "bom-ref": purlNpm(depName, sibPkg.version),
        hashes: [{ alg: "SHA-256", content: sha256Hex(sib.content) }],
        licenses: [{ expression: typeof sibPkg.license === "string" && sibPkg.license.trim() !== "" ? sibPkg.license.trim() : "UNKNOWN" }],
        name: depName,
        properties: [
          { name: "galerina:hash-subject", value: "package.json" },
          { name: "galerina:origin", value: "internal" },
          { name: "galerina:specifier", value: specifier },
        ],
        purl: purlNpm(depName, sibPkg.version),
        scope: "required",
        type: "library",
        version: sibPkg.version,
      });
      continue;
    }
    const locked = lock?.packages?.[`node_modules/${depName}`];
    const errors = [];
    if (locked !== undefined && (typeof locked !== "object" || locked === null)) refuse(`${base}: lock entry for ${depName} is malformed`);
    const version = locked !== undefined && typeof locked.version === "string" && locked.version !== "" ? locked.version : specifier;
    const hashes = locked !== undefined && typeof locked.integrity === "string" ? sriToHashes(locked.integrity, `${base} ${depName}`, errors) : [];
    if (errors.length > 0) refuse(errors.join("; "));
    const license = locked !== undefined && typeof locked.license === "string" && locked.license.trim() !== "" ? locked.license.trim() : "UNKNOWN";
    components.push({
      "bom-ref": purlNpm(depName, version),
      hashes: hashes.filter((h) => h.alg !== "SHA-1"),
      licenses: [{ expression: license }],
      name: depName,
      properties: [
        { name: "galerina:hash-subject", value: locked === undefined ? "NONE" : "npm-integrity" },
        { name: "galerina:origin", value: "third-party" },
        { name: "galerina:specifier", value: specifier },
      ],
      purl: purlNpm(depName, version),
      scope: "required",
      type: "library",
      version,
    });
  }

  const own = new Set(STANDARD_FILES.map((f) => `${base}/${f}`));
  const observedSources = [...index.entries()]
    .filter(([path]) => path.startsWith(`${base}/`) && !own.has(path))
    .map(([path, entry]) => ({ path: path.slice(base.length + 1), sha256: sha256Hex(entry.content) }))
    .sort((a, b) => byString(a.path, b.path));
  const observedAggregateSha256 = sha256Hex(observedSources.map((f) => `${f.sha256}  ${f.path}\n`).join(""));

  const capabilities = fungi === undefined ? [] : sortedUniqueStrings(fungi.capabilities, `${base}/package.fungi.json capabilities`);
  const manifest = {
    archetype: { source: "inferred-from-name", value: inferArchetype(dir) },
    boundaries: [],
    build: { manifest: "build-manifest.json", status: "NO_WASM_ARTIFACT" },
    capabilities,
    dependencies,
    effects: { declares: [], evidence: "NOT_OBSERVED", transitive: [] },
    exports: flattenExports(pkg),
    generatedBy: GENERATOR_ID,
    governance: { allowedProfiles: ["development"], requiresAudit: false },
    name: pkg.name,
    sbom: "sbom.json",
    schemaVersion: "fungi.package.manifest.v1",
    signature: { publisher: "none", status: "UNSIGNED" },
    version: pkg.version,
  };
  const buildManifest = {
    artifacts: { status: "NO_WASM_ARTIFACT", wasm: [] },
    compiler: { name: "@galerina/core-compiler", version: compilerVersion },
    flags: [],
    generatedBy: GENERATOR_ID,
    package: { name: pkg.name, version: pkg.version },
    reproducible: { method: "content-addressed-git-index", timestamp: "NONE" },
    schemaVersion: "galerina.package.build-manifest.v1",
    sources: { aggregateSha256: observedAggregateSha256, algorithm: "sha256", files: observedSources },
  };
  const rootRef = purlNpm(pkg.name, pkg.version);
  components.sort((a, b) => byString(a.name, b.name));
  const sbom = {
    bomFormat: "CycloneDX",
    components,
    dependencies: [{ dependsOn: components.map((c) => c["bom-ref"]).sort(byString), ref: rootRef }],
    metadata: {
      component: { "bom-ref": rootRef, name: pkg.name, type: "library", version: pkg.version },
      properties: [
        { name: "galerina:depth", value: "1" },
        { name: "galerina:generated-by", value: GENERATOR_ID },
      ],
    },
    specVersion: "1.5",
    version: 1,
  };
  return {
    dir,
    name: pkg.name,
    version: pkg.version,
    docs: {
      "galerina-package.json": canonicalJson(manifest),
      "build-manifest.json": canonicalJson(buildManifest),
      "sbom.json": canonicalJson(sbom),
    },
    observedSources,
    observedAggregateSha256,
  };
}

export function workspaceDirs(root) {
  const ws = parseStrictInput(readFileSync(join(root, "galerina.workspace.json"), "utf8"), "galerina.workspace.json");
  if (!Array.isArray(ws.packages) || ws.packages.length === 0) refuse("galerina.workspace.json: packages must be a non-empty array");
  return ws.packages.map((p) => {
    const m = typeof p === "string" ? /^packages-ts\/([A-Za-z0-9._-]+)$/.exec(p) : null;
    if (m === null) refuse(`galerina.workspace.json: package entry ${JSON.stringify(p)} is not packages-ts/<dir>`);
    return m[1];
  });
}

/** Generate every package's documents from the git index of `root`. */
export function generateAll(root) {
  const index = readIndex(root);
  const dirs = workspaceDirs(root);
  const compiler = index.get("packages-ts/galerina-core-compiler/package.json");
  if (compiler === undefined) refuse("packages-ts/galerina-core-compiler/package.json is not tracked");
  const compilerVersion = parseStrictInput(compiler.content.toString("utf8"), "core-compiler package.json").version;
  if (typeof compilerVersion !== "string" || compilerVersion === "") refuse("core-compiler version is missing");
  const indexDirs = [...new Set([...index.keys()]
    .map((p) => /^packages-ts\/([^/]+)\/package\.json$/.exec(p)?.[1])
    .filter((d) => d !== undefined))].sort(byString);
  return { dirs, indexDirs, packages: [...dirs].sort(byString).map((dir) => buildPackageDocs(index, dir, compilerVersion)) };
}

/** Licence policy inputs shared with scripts/audit-license-compat.mjs (one classifier). */
export async function licensePolicy(root) {
  const lic = await import(pathToFileURL(join(SCRIPT_DIR, "audit-license-compat.mjs")).href);
  if (typeof lic.classify !== "function" || !Array.isArray(lic.SANCTIONED_GPL_EXTENSION_NAMES)) refuse("audit-license-compat.mjs does not export the classifier policy");
  const overridesPath = join(root, "governance", "license-overrides.json");
  const overrides = existsSync(overridesPath)
    ? parseStrictInput(readFileSync(overridesPath, "utf8"), "governance/license-overrides.json").overrides
    : [];
  if (!Array.isArray(overrides)) refuse("governance/license-overrides.json: overrides must be an array");
  return {
    classifyLicense: lic.classify,
    sanctionedGplPackages: [...lic.SANCTIONED_GPL_EXTENSION_NAMES],
    licenseOverrides: overrides.map((o) => `${o.package}@${o.version}`),
    // Section 7 vetted native-floor TypeScript ledger: none exists yet, so nothing is exempt.
    vettedNativeFloorSources: [],
  };
}

/** Structural self-validation of generated documents through the R3 core. */
export function validateGenerated(core, result, policy) {
  const structural = new Set(["FUNGI-PKGSTD-001", "FUNGI-PKGSTD-002", "FUNGI-PKGSTD-003", "FUNGI-PKGSTD-004", "FUNGI-PKGSTD-005", "FUNGI-PKGSTD-006", "FUNGI-PKGSTD-007", "FUNGI-PKGSTD-008"]);
  const findings = [];
  for (const p of result.packages) {
    const diags = core.auditPackage({
      packageDir: p.dir,
      packageName: p.name,
      packageVersion: p.version,
      manifest: { present: true, text: p.docs["galerina-package.json"] },
      buildManifest: { present: true, text: p.docs["build-manifest.json"] },
      sbom: { present: true, text: p.docs["sbom.json"] },
      observedSources: p.observedSources,
      observedAggregateSha256: p.observedAggregateSha256,
      profile: "development",
      ...policy,
    });
    for (const d of diags) {
      if (structural.has(d.code)) refuse(`generator produced an invalid document: ${d.code} ${d.packageDir}/${d.file}: ${d.detail}`);
      findings.push(d);
    }
  }
  return findings;
}

function outsidePackages(root, out) {
  const abs = resolve(out);
  const rel = relative(resolve(root, "packages-ts"), abs);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

// ── self-test ───────────────────────────────────────────────────────────────────────

export function makeFixtureRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "pkgstd-fixture-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "core.autocrlf", "false"]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  return root;
}

export function fixtureFiles() {
  const pj = (name, extra = {}) => `${JSON.stringify({ name, version: "1.0.0", license: "MIT", main: "./dist/index.js", ...extra }, null, 2)}\n`;
  return {
    "galerina.workspace.json": `${JSON.stringify({ packages: ["packages-ts/galerina-alpha", "packages-ts/galerina-core-compiler"] })}\n`,
    "packages-ts/galerina-core-compiler/package.json": pj("@galerina/core-compiler"),
    "packages-ts/galerina-alpha/package.json": pj("@galerina/alpha", { dependencies: { "@galerina/core-compiler": "file:../galerina-core-compiler", leftpad: "^1.0.0" } }),
    "packages-ts/galerina-alpha/package-lock.json": `${JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/leftpad": { version: "1.0.2", integrity: `sha512-${Buffer.alloc(64, 7).toString("base64")}`, license: "MIT" } } }, null, 2)}\n`,
    "packages-ts/galerina-alpha/src/index.fungi": "flow alpha() {}\r\n",
  };
}

async function selfTest() {
  const core = await loadCore();
  const root = makeFixtureRepo(fixtureFiles());
  try {
    const policy = await licensePolicy(root);
    const a = generateAll(root);
    const b = generateAll(root);
    if (JSON.stringify(a.packages.map((p) => p.docs)) !== JSON.stringify(b.packages.map((p) => p.docs))) refuse("self-test: two runs differ");
    const findings = validateGenerated(core, a, policy);
    if (findings.length !== 0) refuse(`self-test: clean fixture produced findings: ${findings.map((f) => f.code).join(",")}`);
    for (const text of Object.values(a.packages[0].docs)) if (/\bnull\b|NaN|undefined/.test(text)) refuse("self-test: forbidden token in output");
    let refused = false;
    try {
      canonicalJson({ a: null });
    } catch (error) {
      refused = error instanceof RefusedError;
    }
    if (!refused) refuse("self-test: canonical writer accepted null");
    refused = false;
    try {
      parseStrictInput('{"a":1,"a":2}', "dup");
    } catch (error) {
      refused = error instanceof RefusedError;
    }
    if (!refused) refuse("self-test: duplicate key accepted");
    return "self-test PASS: deterministic, validated, null and duplicate-key refused";
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────

export async function main(argv) {
  let root = process.cwd();
  let out;
  const modes = new Set();
  let acceptLockDrift = false;
  let asJson = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root" && argv[i + 1] !== undefined) root = resolve(argv[(i += 1)]);
    else if (a === "--out" && argv[i + 1] !== undefined) {
      out = argv[(i += 1)];
      modes.add("out");
    } else if (a === "--dry-run") modes.add("dry-run");
    else if (a === "--check") modes.add("check");
    else if (a === "--write") modes.add("write");
    else if (a === "--self-test") modes.add("self-test");
    else if (a === "--accept-lock-drift") acceptLockDrift = true;
    else if (a === "--json") asJson = true;
    else refuse(`unknown argument ${a}`);
  }
  if (modes.size > 1) refuse("select exactly one mode");
  const mode = modes.size === 0 ? "dry-run" : [...modes][0];
  if (mode === "self-test") return { code: 0, text: await selfTest() };
  if (mode === "write" && !acceptLockDrift) {
    refuse("--write adds tracked files to every package and changes governance/flat-package-root-lock.json content digests; that is a Codex/owner decision. Re-run with --accept-lock-drift only after it is granted.");
  }

  const core = await loadCore();
  const policy = await licensePolicy(root);
  const result = generateAll(root);
  const setDiags = core.auditPackageSet(result.dirs, result.indexDirs);
  if (setDiags.length > 0) refuse(setDiags.map((d) => `${d.code}: ${d.detail}`).join("; "));
  const again = generateAll(root);
  for (let i = 0; i < result.packages.length; i += 1) {
    for (const file of STANDARD_FILES) {
      if (result.packages[i].docs[file] !== again.packages[i].docs[file]) refuse(`non-deterministic output for ${result.packages[i].dir}/${file}`);
    }
  }
  const findings = validateGenerated(core, result, policy);
  const summary = {
    tool: "gen-package-standard-manifests",
    mode,
    packages: result.packages.length,
    documents: result.packages.length * STANDARD_FILES.length,
    deterministic: true,
    contentFindings: findings.map((f) => `${f.code} ${f.packageDir}: ${f.detail}`),
    drift: [],
  };

  if (mode === "check") {
    for (const p of result.packages) {
      for (const file of STANDARD_FILES) {
        const path = join(root, "packages-ts", p.dir, file);
        const actual = existsSync(path) ? { present: true, text: readFileSync(path, "utf8") } : { present: false };
        for (const d of core.auditGeneratedDrift(p.dir, file, p.docs[file], actual)) summary.drift.push(`${d.code} ${d.packageDir}/${d.file}: ${d.detail}`);
      }
    }
  } else if (mode === "out") {
    if (!outsidePackages(root, out)) refuse("--out must be outside packages-ts/");
    for (const p of result.packages) {
      mkdirSync(join(resolve(out), p.dir), { recursive: true });
      for (const file of STANDARD_FILES) writeFileSync(join(resolve(out), p.dir, file), p.docs[file]);
    }
  } else if (mode === "write") {
    for (const p of result.packages) {
      for (const file of STANDARD_FILES) writeFileSync(join(root, "packages-ts", p.dir, file), p.docs[file]);
    }
  }
  const code = summary.drift.length > 0 ? 1 : 0;
  const text = asJson
    ? `${JSON.stringify(summary, null, 2)}`
    : [
      `gen-package-standard-manifests: ${mode} | ${summary.packages} packages, ${summary.documents} documents, deterministic`,
      `content findings (reported by the audit, not hidden): ${findings.length}`,
      ...summary.contentFindings.map((f) => `  ${f}`),
      ...(mode === "check" ? [`drift: ${summary.drift.length}`] : []),
      ...summary.drift.slice(0, 20).map((d) => `  ${d}`),
      ...(summary.drift.length > 20 ? [`  ... ${summary.drift.length - 20} more`] : []),
    ].join("\n");
  return { code, text };
}

function isMain() {
  try {
    return process.argv[1] !== undefined && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMain()) {
  main(process.argv.slice(2)).then(({ code, text }) => {
    process.stdout.write(`${text}\n`);
    process.exitCode = code;
  }, (error) => {
    process.stderr.write(`REFUSED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
