#!/usr/bin/env node
// generate-sbom.mjs — deterministic source SBOM for the REAL npm/lockfile graph (RD-0317 §1).
//
// Born from the RD-0317 finding: a well-tested CycloneDX emitter existed for the Stage-1
// `.fungi` package graph nobody uses, while the 95 npm lockfiles that actually build Galerina
// had no SBOM at all. This script covers that graph: the root package, every first-party
// packages-galerina/* package, and every third-party dependency pinned by any package-lock.json
// — emitted as CycloneDX 1.5 JSON that two runs reproduce byte-for-byte.
//
// THE INVARIANTS:
//   (1) DETERMINISTIC OUTPUT — every field is a pure function of the source tree except ONE
//       clearly-marked field, `metadata.timestamp` (which itself honours SOURCE_DATE_EPOCH for
//       fully reproducible runs). All collections are explicitly sorted; no random serial
//       numbers. `metadata.properties[galerina:sbom:content-digest]` is the sha256 of the
//       document with the timestamp neutralised, so consumers can diff SBOMs modulo time.
//   (2) FAIL-CLOSED — a malformed/unreadable package.json or lockfile, a missing name/version,
//       an unsupported lockfile version, a dangling `file:` internal ref, a duplicated
//       `node_modules/*` lockfile key (integrity-ambiguous: JSON.parse keeps the LAST entry,
//       so a hidden first entry could carry a different hash), or the same locked version with
//       CONFLICTING integrity across two lockfiles → NO SBOM is written and the exit code is
//       non-zero. A wrong inventory is worse than no inventory.
//   (3) UNVERIFIED IS VISIBLE, NOT FATAL — per RD-0317: a locked component with no resolvable
//       integrity is marked `galerina:integrity=UNVERIFIED` (code FUNGI-SBOM-001) and forces
//       the top-level `galerina:sbom:complete=false`. Missing evidence is surfaced, never
//       silently dropped.
//   (4) NO PATH LEAKS — all recorded paths are repo-relative POSIX. A writer-side guard (the
//       ZT-17 lesson) scans the serialized document and REFUSES to write if any absolute
//       local path pattern is present.
//   (5) NO DEPENDENCIES, NO NETWORK, NO MONKEYPATCHING — node:* imports only; reads the tree,
//       writes one file. Testability comes from dependency-injection seams (rootDir + clock
//       parameters), never from reassigning globals.
//
// Usage (run from the repo root):
//   node scripts/generate-sbom.mjs                        → write build/sbom/sbom.json
//   node scripts/generate-sbom.mjs --out <file>           → write elsewhere (repo-relative)
//   node scripts/generate-sbom.mjs --root <dir>           → treat <dir> as the repo root
//   node scripts/generate-sbom.mjs --print                → print the SBOM to stdout, write nothing
//   node scripts/generate-sbom.mjs --self-test            → prove the detectors + determinism
//   SOURCE_DATE_EPOCH=<secs> node scripts/generate-sbom.mjs → byte-reproducible output
//
// Exit code: 0 = clean; 1 = fail-closed violation(s) (each printed to stderr);
//            --self-test exits with the number of failed checks.

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT_NAME = "generate-sbom.mjs";
const SCRIPT_VERSION = "1.0.0";
const SPEC_VERSION = "1.5";
const PKG_ROOT = "packages-galerina";
const DEFAULT_OUT = "build/sbom/sbom.json";
// The neutral value substituted for metadata.timestamp when computing the content digest —
// so the digest is identical for two runs that differ only in generation time.
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";
const UNVERIFIED_CODE = "FUNGI-SBOM-001";

// ── pure helpers (exported for --self-test; no I/O) ─────────────────────────────────────────

/** Repo-relative POSIX path — the only path shape allowed inside the SBOM (no leak surface). */
export function toPosix(p) {
  return p.replace(/\\/g, "/");
}

/**
 * npm purl per the package-url spec: scope's "@" percent-encodes to %40, the scope/name "/"
 * stays literal. Version is URI-encoded defensively (npm versions are almost always safe).
 */
export function purlNpm(name, version) {
  let nm;
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    // A scoped name without "/" is malformed — surface it loudly rather than emit a bad purl.
    if (slash < 0) throw new Error(`purlNpm: malformed scoped package name "${name}"`);
    nm = `%40${encodeURIComponent(name.slice(1, slash))}/${encodeURIComponent(name.slice(slash + 1))}`;
  } else {
    nm = encodeURIComponent(name);
  }
  return `pkg:npm/${nm}@${encodeURIComponent(version)}`;
}

const SRI_ALGS = new Map([
  ["sha1", "SHA-1"],
  ["sha256", "SHA-256"],
  ["sha384", "SHA-384"],
  ["sha512", "SHA-512"],
]);

/**
 * SRI ("sha512-<base64>", possibly space-separated multi-hash) → CycloneDX hashes
 * ({alg, content-hex}), sorted by alg for determinism. Unknown algorithm or undecodable
 * base64 → error string pushed (fail-closed at the caller): a hash we cannot interpret is
 * evidence we cannot vouch for.
 */
export function sriToHashes(integrity, where, errors) {
  const out = [];
  for (const token of integrity.trim().split(/\s+/)) {
    const m = /^([a-z0-9]+)-([A-Za-z0-9+/=]+)$/.exec(token);
    if (m === null) {
      errors.push(`${where}: unparseable SRI integrity token "${token}" — fail-closed`);
      continue;
    }
    const alg = SRI_ALGS.get(m[1]);
    if (alg === undefined) {
      errors.push(`${where}: unsupported SRI algorithm "${m[1]}" — fail-closed`);
      continue;
    }
    const buf = Buffer.from(m[2], "base64");
    if (buf.length === 0) {
      errors.push(`${where}: empty/undecodable SRI digest in "${token}" — fail-closed`);
      continue;
    }
    out.push({ alg, content: buf.toString("hex") });
  }
  out.sort((a, b) => (a.alg < b.alg ? -1 : a.alg > b.alg ? 1 : 0));
  return out;
}

/**
 * Scope-aware duplicate-key scan over raw JSON text. JSON.parse silently keeps the LAST of
 * two identical keys in one object — a parser-differential blind spot an attacker (or a
 * confused npm) can hide an entry in. Real occurrences exist in this repo's lockfiles, so
 * the caller classifies: duplicates on records this SBOM consumes are fatal, the rest are
 * hygiene warnings. Keys are compared in raw (still-escaped) form — good enough to catch
 * byte-identical duplicates, which is the attack shape.
 */
export function findDuplicateKeys(text) {
  const dups = [];
  const stack = []; // {kind:"obj", seen:Set, expectKey:bool} | {kind:"arr"}
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < n) {
        const d = text[j];
        if (d === "\\") {
          s += d + (text[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (d === '"') break;
        s += d;
        j += 1;
      }
      const top = stack[stack.length - 1];
      if (top !== undefined && top.kind === "obj" && top.expectKey) {
        if (top.seen.has(s)) dups.push({ key: s, offset: i });
        top.seen.add(s);
        top.expectKey = false;
      }
      i = j + 1;
      continue;
    }
    if (c === "{") {
      stack.push({ kind: "obj", seen: new Set(), expectKey: true });
      i += 1;
      continue;
    }
    if (c === "[") {
      stack.push({ kind: "arr" });
      i += 1;
      continue;
    }
    if (c === "}" || c === "]") {
      stack.pop();
      i += 1;
      continue;
    }
    if (c === ",") {
      const top = stack[stack.length - 1];
      if (top !== undefined && top.kind === "obj") top.expectKey = true;
      i += 1;
      continue;
    }
    i += 1;
  }
  return dups;
}

/**
 * Writer-side path-leak guard (ZT-17 class): refuse to emit a document containing an
 * absolute local path — Windows drive-letter form (raw or JSON-escaped) or a Unix home
 * form. The boundary look-behind keeps URL schemes ("https://") from false-positiving.
 */
export function assertNoPathLeak(text) {
  const drive = /(^|[^A-Za-z0-9+.-])[A-Za-z]:[\\/]/.exec(text);
  if (drive !== null) {
    throw new Error(
      `path-leak guard: output contains an absolute drive path near offset ${drive.index} — refusing to write (fail-closed)`,
    );
  }
  const home = /"\/(?:home|Users)\//.exec(text);
  if (home !== null) {
    throw new Error(
      `path-leak guard: output contains an absolute home path near offset ${home.index} — refusing to write (fail-closed)`,
    );
  }
}

// ── collection (rootDir is the DI seam; all reads live here) ────────────────────────────────

// Duplicate keys on these lockfile record fields would make the consumed evidence ambiguous.
const LOCK_FATAL_DUP_KEYS = new Set(["packages", "lockfileVersion", "integrity", "version", "resolved"]);
// Duplicate keys on these package.json fields would make the consumed manifest ambiguous.
const PKG_FATAL_DUP_KEYS = new Set(["name", "version", "dependencies", "devDependencies", "license"]);

function readJsonChecked(absPath, relPath, kind, errors, warnings) {
  let text;
  try {
    text = readFileSync(absPath, "utf8");
  } catch (e) {
    errors.push(`${relPath}: unreadable (${e.message}) — fail-closed`);
    return null;
  }
  for (const d of findDuplicateKeys(text)) {
    const fatal =
      kind === "lockfile"
        ? d.key.startsWith("node_modules/") || LOCK_FATAL_DUP_KEYS.has(d.key)
        : PKG_FATAL_DUP_KEYS.has(d.key);
    const msg = `${relPath}: duplicate JSON key "${d.key}" (offset ${d.offset}) — JSON.parse keeps the last occurrence`;
    if (fatal) errors.push(`${msg}; a consumed record is ambiguous — fail-closed`);
    else warnings.push(`${msg}; not consumed by this SBOM (lockfile/manifest hygiene)`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    errors.push(`${relPath}: malformed JSON (${e.message}) — fail-closed`);
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${relPath}: not a JSON object — fail-closed`);
    return null;
  }
  return value;
}

function nonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

/**
 * Walk the tree and assemble the SBOM. Pure given (rootDir contents, sourceDateEpoch, now):
 * no environment reads, no network, no writes. Returns {bom, errors, warnings}; bom is null
 * whenever errors is non-empty (fail-closed: never a partial inventory).
 */
export function collectSbom({ rootDir, sourceDateEpoch, now }) {
  const errors = [];
  const warnings = [];
  let complete = true;

  // ── the single non-deterministic field, resolved first and marked loudly ──
  let timestamp;
  if (sourceDateEpoch !== undefined && sourceDateEpoch !== "") {
    if (!/^\d+$/.test(sourceDateEpoch)) {
      errors.push(`SOURCE_DATE_EPOCH must be integer seconds, got "${sourceDateEpoch}" — fail-closed`);
      return { bom: null, errors, warnings };
    }
    timestamp = new Date(Number(sourceDateEpoch) * 1000).toISOString();
  } else {
    timestamp = (now ? now() : new Date()).toISOString();
  }

  // ── root package (required by the deliverable: the SBOM includes the product itself) ──
  const rootPkg = readJsonChecked(join(rootDir, "package.json"), "package.json", "package", errors, warnings);
  if (rootPkg !== null) {
    if (!nonEmptyString(rootPkg.name)) errors.push(`package.json: "name" missing/empty — fail-closed`);
    if (!nonEmptyString(rootPkg.version)) errors.push(`package.json: "version" missing/empty — fail-closed`);
  }

  // ── first-party packages (sorted directory walk → deterministic) ──
  const pkgRootAbs = join(rootDir, PKG_ROOT);
  let dirs = [];
  if (existsSync(pkgRootAbs)) {
    dirs = readdirSync(pkgRootAbs, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } else {
    errors.push(`${PKG_ROOT}/ not found under the given root — run from the repo root or pass --root`);
  }

  const firstPartyByName = new Map(); // name -> {dir, name, version, license, dependencies}
  const firstPartyByDir = new Map(); // dir  -> same record
  for (const dir of dirs) {
    const rel = `${PKG_ROOT}/${dir}/package.json`;
    const abs = join(pkgRootAbs, dir, "package.json");
    if (!existsSync(abs)) {
      warnings.push(`${rel}: missing — directory skipped (not an npm package)`);
      continue;
    }
    const pj = readJsonChecked(abs, rel, "package", errors, warnings);
    if (pj === null) continue;
    if (!nonEmptyString(pj.name)) {
      errors.push(`${rel}: "name" missing/empty — fail-closed`);
      continue;
    }
    if (!nonEmptyString(pj.version)) {
      errors.push(`${rel}: "version" missing/empty — fail-closed`);
      continue;
    }
    if (firstPartyByName.has(pj.name)) {
      errors.push(
        `duplicate first-party package name "${pj.name}" (${PKG_ROOT}/${firstPartyByName.get(pj.name).dir} and ${PKG_ROOT}/${dir}) — fail-closed`,
      );
      continue;
    }
    const rec = {
      dir,
      name: pj.name,
      version: pj.version,
      license: nonEmptyString(pj.license) ? pj.license : null,
      dependencies: pj.dependencies !== null && typeof pj.dependencies === "object" ? pj.dependencies : {},
      unresolved: [],
    };
    firstPartyByName.set(pj.name, rec);
    firstPartyByDir.set(dir, rec);
  }

  // ── lockfiles: root + one per package dir (deterministic order) ──
  const lockfiles = [];
  if (existsSync(join(rootDir, "package-lock.json"))) {
    lockfiles.push({ rel: "package-lock.json", ownerRel: "." });
  }
  for (const dir of dirs) {
    const abs = join(pkgRootAbs, dir, "package-lock.json");
    if (existsSync(abs)) lockfiles.push({ rel: `${PKG_ROOT}/${dir}/package-lock.json`, ownerRel: `${PKG_ROOT}/${dir}` });
  }

  const third = new Map(); // purl -> record
  const lockIndex = new Map(); // ownerRel -> Map(topLevelDepName -> lockedVersion)
  for (const lf of lockfiles) {
    const lock = readJsonChecked(join(rootDir, ...lf.rel.split("/")), lf.rel, "lockfile", errors, warnings);
    if (lock === null) continue;
    if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
      errors.push(
        `${lf.rel}: unsupported lockfileVersion ${JSON.stringify(lock.lockfileVersion)} (need 2 or 3 with a "packages" map) — fail-closed`,
      );
      continue;
    }
    if (lock.packages === null || typeof lock.packages !== "object" || Array.isArray(lock.packages)) {
      errors.push(`${lf.rel}: missing/invalid "packages" map — fail-closed`);
      continue;
    }
    const perDep = new Map();
    lockIndex.set(lf.ownerRel, perDep);
    for (const key of Object.keys(lock.packages).sort()) {
      if (key === "") continue; // the lockfile's own root record
      if (!key.startsWith("node_modules/")) continue; // out-of-tree file: targets = first-party dirs
      const entry = lock.packages[key];
      if (entry === null || typeof entry !== "object") {
        errors.push(`${lf.rel}: entry "${key}" is not an object — fail-closed`);
        continue;
      }
      if (entry.link === true) continue; // symlink to a first-party sibling — inventoried as first-party
      const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
      if (!nonEmptyString(entry.version)) {
        errors.push(`${lf.rel}: locked entry "${key}" has no version — fail-closed`);
        continue;
      }
      // Only TOP-LEVEL entries name a direct-dependency resolution for the owner package.
      if (key === `node_modules/${name}`) perDep.set(name, entry.version);

      const purl = purlNpm(name, entry.version);
      const integrity = nonEmptyString(entry.integrity) ? entry.integrity : null;
      const resolved = nonEmptyString(entry.resolved) && /^https?:\/\//i.test(entry.resolved) ? entry.resolved : null;
      const dev = entry.dev === true;
      const license = nonEmptyString(entry.license) ? entry.license : null;
      const prev = third.get(purl);
      if (prev !== undefined) {
        if (prev.integrity !== null && integrity !== null && prev.integrity !== integrity) {
          errors.push(
            `integrity conflict for ${purl}: ${prev.firstLock} pins ${prev.integrity} but ${lf.rel} pins ${integrity} — same version, different bytes (possible tamper / registry divergence) — fail-closed`,
          );
          continue;
        }
        if (prev.integrity === null && integrity !== null) prev.integrity = integrity;
        if (prev.resolved === null && resolved !== null) prev.resolved = resolved;
        else if (prev.resolved !== null && resolved !== null && prev.resolved !== resolved) {
          warnings.push(`${purl}: multiple resolved URLs (${prev.resolved} vs ${resolved}) with matching integrity — mirror divergence recorded, first kept`);
        }
        if (prev.license === null && license !== null) prev.license = license;
        prev.dev = prev.dev && dev; // dev-only iff EVERY occurrence is dev
        prev.lockfiles.add(lf.rel);
      } else {
        third.set(purl, { name, version: entry.version, integrity, resolved, dev, license, lockfiles: new Set([lf.rel]), firstLock: lf.rel });
      }
    }
  }

  // ── declared-dependency graph (first-party only; resolved against each owner's lockfile) ──
  function resolveDeclared(rec, ownerRel, ownRelLabel) {
    const refs = [];
    for (const depName of Object.keys(rec.dependencies).sort()) {
      const spec = rec.dependencies[depName];
      if (typeof spec !== "string") {
        errors.push(`${ownRelLabel}: dependency "${depName}" has a non-string specifier — fail-closed`);
        continue;
      }
      if (spec.startsWith("file:")) {
        const targetDir = toPosix(spec.slice("file:".length)).replace(/^\.\.\//, "").replace(/\/+$/, "");
        const target = firstPartyByDir.get(targetDir);
        if (target === undefined) {
          errors.push(`${ownRelLabel}: dependency "${depName}" -> "${spec}" does not resolve to a first-party package dir — dangling internal ref — fail-closed`);
          continue;
        }
        if (target.name !== depName) {
          warnings.push(`${ownRelLabel}: dependency "${depName}" resolves to package named "${target.name}" (aliased file: dep)`);
        }
        refs.push(purlNpm(target.name, target.version));
        continue;
      }
      const locked = lockIndex.get(ownerRel)?.get(depName);
      if (locked === undefined) {
        // RD-0317 rule: unresolvable → visible + complete:false, never silently dropped.
        rec.unresolved.push(depName);
        warnings.push(`${UNVERIFIED_CODE}: ${ownRelLabel}: declared dependency "${depName}@${spec}" has no locked resolution — sbom marked complete=false`);
        complete = false;
        continue;
      }
      refs.push(purlNpm(depName, locked));
    }
    refs.sort();
    return refs;
  }

  // ── assemble (fixed key order per object; global sorts for all collections) ──
  const components = [];
  for (const rec of [...firstPartyByName.values()].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const purl = purlNpm(rec.name, rec.version);
    // NOTE: this array is kept live on `rec` — the dependency-resolution pass below appends a
    // galerina:unresolved-dependencies property to it when a declared dep has no locked pin.
    const properties = [
      { name: "galerina:first-party", value: "true" },
      { name: "galerina:package-dir", value: `${PKG_ROOT}/${rec.dir}` },
    ];
    components.push({
      type: "library",
      "bom-ref": purl,
      name: rec.name,
      version: rec.version,
      scope: "required",
      ...(rec.license !== null ? { licenses: [{ expression: rec.license }] } : {}),
      purl,
      properties,
    });
    rec.componentProps = properties;
    rec.purl = purl;
  }
  for (const [purl, t] of [...third.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const properties = [{ name: "galerina:first-party", value: "false" }];
    if (t.dev) properties.push({ name: "galerina:dev-only", value: "true" });
    if (t.integrity === null) {
      properties.push({ name: "galerina:integrity", value: `UNVERIFIED (${UNVERIFIED_CODE})` });
      warnings.push(`${UNVERIFIED_CODE}: ${purl} has no lockfile integrity (${[...t.lockfiles].sort().join(", ")}) — marked UNVERIFIED; sbom complete=false`);
      complete = false;
    }
    if (t.resolved !== null) properties.push({ name: "galerina:resolved", value: t.resolved });
    properties.push({ name: "galerina:locked-by", value: [...t.lockfiles].sort().join(" ") });
    const hashes = t.integrity !== null ? sriToHashes(t.integrity, purl, errors) : [];
    components.push({
      type: "library",
      "bom-ref": purl,
      name: t.name,
      version: t.version,
      scope: t.dev ? "excluded" : "required",
      ...(t.license !== null ? { licenses: [{ expression: t.license }] } : {}),
      purl,
      ...(hashes.length > 0 ? { hashes } : {}),
      properties,
    });
  }
  components.sort((a, b) => (a["bom-ref"] < b["bom-ref"] ? -1 : 1));

  const dependencies = [];
  if (rootPkg !== null && nonEmptyString(rootPkg.name) && nonEmptyString(rootPkg.version)) {
    const rootRec = {
      dependencies: rootPkg.dependencies !== null && typeof rootPkg.dependencies === "object" ? rootPkg.dependencies : {},
      unresolved: [],
    };
    dependencies.push({ ref: purlNpm(rootPkg.name, rootPkg.version), dependsOn: resolveDeclared(rootRec, ".", "package.json") });
  }
  for (const rec of [...firstPartyByName.values()].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const dependsOn = resolveDeclared(rec, `${PKG_ROOT}/${rec.dir}`, `${PKG_ROOT}/${rec.dir}/package.json`);
    if (rec.unresolved.length > 0) {
      rec.componentProps.push({ name: "galerina:unresolved-dependencies", value: rec.unresolved.sort().join(" ") });
    }
    dependencies.push({ ref: rec.purl, dependsOn });
  }
  dependencies.sort((a, b) => (a.ref < b.ref ? -1 : 1));

  if (errors.length > 0) return { bom: null, errors, warnings };

  const rootPurl = purlNpm(rootPkg.name, rootPkg.version);
  const bom = {
    bomFormat: "CycloneDX",
    specVersion: SPEC_VERSION,
    version: 1,
    metadata: {
      // THE single non-deterministic field (see header invariant 1). Everything else in this
      // document is a pure function of the source tree; SOURCE_DATE_EPOCH pins even this.
      timestamp,
      tools: { components: [{ type: "application", name: SCRIPT_NAME, version: SCRIPT_VERSION }] },
      component: {
        type: "application",
        "bom-ref": rootPurl,
        name: rootPkg.name,
        version: rootPkg.version,
        ...(nonEmptyString(rootPkg.license) ? { licenses: [{ expression: rootPkg.license }] } : {}),
        purl: rootPurl,
        properties: [
          { name: "galerina:first-party", value: "true" },
          { name: "galerina:package-dir", value: "." },
        ],
      },
      properties: [
        { name: "galerina:sbom:complete", value: String(complete) },
        { name: "galerina:sbom:content-digest", value: "" },
        {
          name: "galerina:sbom:determinism",
          value: "all fields are a pure function of the source tree except metadata.timestamp; content-digest is sha256 over the document with timestamp neutralised; SOURCE_DATE_EPOCH pins the timestamp",
        },
      ],
    },
    components,
    dependencies,
  };

  // Content digest: computed with the timestamp neutralised + the digest slot blanked, then
  // injected — so two runs over the same tree carry the SAME digest whatever the clock said.
  const clone = JSON.parse(JSON.stringify(bom));
  clone.metadata.timestamp = EPOCH_ISO;
  const digest = "sha256:" + createHash("sha256").update(JSON.stringify(clone), "utf8").digest("hex");
  for (const p of bom.metadata.properties) {
    if (p.name === "galerina:sbom:content-digest") p.value = digest;
  }

  return { bom, errors, warnings };
}

/** Stable serialization: fixed key order (construction order), 2-space indent, trailing \n. */
export function serializeBom(bom) {
  return JSON.stringify(bom, null, 2) + "\n";
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────

function usage() {
  process.stderr.write(
    `usage: node scripts/${SCRIPT_NAME} [--out <file>] [--root <dir>] [--print] [--self-test]\n`,
  );
}

export function runGenerate({ rootDir, outRel, print, sourceDateEpoch, now, log = (m) => process.stderr.write(m + "\n") }) {
  // Guard: refuse to "succeed" against a directory that is not a repo root (fail-closed
  // against silently emitting an empty SBOM from the wrong cwd).
  if (!existsSync(join(rootDir, "package.json")) || !existsSync(join(rootDir, PKG_ROOT))) {
    log(`ERROR: "${toPosix(outRel)}" not generated: root does not look like the repo root (need package.json + ${PKG_ROOT}/) — run from the repo root or pass --root`);
    return 1;
  }
  const { bom, errors, warnings } = collectSbom({ rootDir, sourceDateEpoch, now });
  for (const w of warnings) log(`WARN: ${w}`);
  if (bom === null) {
    for (const e of errors) log(`ERROR: ${e}`);
    log(`${SCRIPT_NAME}: ${errors.length} fail-closed violation(s) — no SBOM written`);
    return 1;
  }
  const text = serializeBom(bom);
  // Writer-side guard: never persist an absolute local path (ZT-17 class).
  assertNoPathLeak(text);
  if (print) {
    process.stdout.write(text);
  } else {
    const outAbs = join(rootDir, ...toPosix(outRel).split("/"));
    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, text, "utf8");
  }
  const complete = bom.metadata.properties.find((p) => p.name === "galerina:sbom:complete").value;
  const digest = bom.metadata.properties.find((p) => p.name === "galerina:sbom:content-digest").value;
  log(
    `${SCRIPT_NAME}: ${bom.components.length} components (+1 root), ${bom.dependencies.length} dependency records, complete=${complete}, ${warnings.length} warning(s)`,
  );
  log(`${SCRIPT_NAME}: content-digest ${digest}`);
  if (!print) log(`${SCRIPT_NAME}: wrote ${toPosix(outRel)}`);
  return 0;
}

// ── self-test (fixtures under the OS tmpdir; proves detectors, determinism, guards) ─────────

function runSelfTest() {
  let failed = 0;
  const check = (name, ok, detail) => {
    if (ok) {
      process.stderr.write(`PASS: ${name}\n`);
    } else {
      failed += 1;
      process.stderr.write(`FAIL: ${name}${detail !== undefined ? ` — ${detail}` : ""}\n`);
    }
  };

  const base = mkdtempSync(join(tmpdir(), "galerina-sbom-selftest-"));
  const write = (rel, content) => {
    const abs = join(base, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  };
  const J = (o) => JSON.stringify(o, null, 2);
  // A fixed, syntactically-valid SRI for fixtures (sha512 of the empty string).
  const SRI_EMPTY =
    "sha512-z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==";
  const SRI_OTHER =
    "sha512-3ZTGbrrIarjNCH5uHvJyGXFYVvoWbfIvvVBxkAKb0aTwUkxwSN0QSPeM/PHZMzyAWSXICyHiCLmCVQ3S0ZuVWw==";

  const happy = () => {
    write("package.json", J({ name: "@fix/root", version: "1.0.0", license: "Apache-2.0" }));
    write(
      "packages-galerina/pkg-a/package.json",
      J({
        name: "@fix/a",
        version: "2.0.0",
        license: "Apache-2.0",
        dependencies: { "@fix/b": "file:../pkg-b", "left-pad": "^1.3.0" },
      }),
    );
    write(
      "packages-galerina/pkg-a/package-lock.json",
      J({
        name: "@fix/a",
        version: "2.0.0",
        lockfileVersion: 3,
        packages: {
          "": { name: "@fix/a", version: "2.0.0" },
          "../pkg-b": { name: "@fix/b", version: "2.0.0" },
          "node_modules/@fix/b": { resolved: "../pkg-b", link: true },
          "node_modules/left-pad": {
            version: "1.3.0",
            resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
            integrity: SRI_EMPTY,
            license: "WTFPL",
          },
        },
      }),
    );
    write("packages-galerina/pkg-b/package.json", J({ name: "@fix/b", version: "2.0.0", license: "Apache-2.0" }));
  };

  // 1) happy path: components, purls, hex hashes, graph edges, complete=true
  happy();
  {
    const { bom, errors } = collectSbom({ rootDir: base, sourceDateEpoch: "0" });
    check("happy: no errors", errors.length === 0, errors.join(" | "));
    const refs = bom === null ? [] : bom.components.map((c) => c["bom-ref"]);
    check(
      "happy: first+third party components present",
      refs.includes("pkg:npm/%40fix/a@2.0.0") && refs.includes("pkg:npm/%40fix/b@2.0.0") && refs.includes("pkg:npm/left-pad@1.3.0"),
      refs.join(","),
    );
    const lp = bom?.components.find((c) => c.name === "left-pad");
    check(
      "happy: SRI converted to SHA-512 hex",
      lp?.hashes?.[0]?.alg === "SHA-512" && /^[0-9a-f]{128}$/.test(lp?.hashes?.[0]?.content ?? ""),
    );
    const edgeA = bom?.dependencies.find((d) => d.ref === "pkg:npm/%40fix/a@2.0.0");
    check(
      "happy: dependency graph resolves file: + semver deps",
      JSON.stringify(edgeA?.dependsOn) === JSON.stringify(["pkg:npm/%40fix/b@2.0.0", "pkg:npm/left-pad@1.3.0"]),
      JSON.stringify(edgeA),
    );
    check(
      "happy: complete=true",
      bom?.metadata.properties.find((p) => p.name === "galerina:sbom:complete")?.value === "true",
    );
    check("happy: root package is metadata.component", bom?.metadata.component.name === "@fix/root");
  }

  // 2) determinism: byte-identical under a pinned epoch; only the timestamp differs otherwise
  {
    const a = serializeBom(collectSbom({ rootDir: base, sourceDateEpoch: "0" }).bom);
    const b = serializeBom(collectSbom({ rootDir: base, sourceDateEpoch: "0" }).bom);
    check("determinism: two pinned-epoch runs are byte-identical", a === b);
    const c = serializeBom(collectSbom({ rootDir: base, now: () => new Date(1e12) }).bom);
    const d = serializeBom(collectSbom({ rootDir: base, now: () => new Date(2e12) }).bom);
    const diff = c.split("\n").filter((line, i) => line !== d.split("\n")[i]);
    check(
      "determinism: differing clocks change ONLY metadata.timestamp",
      diff.length === 1 && diff[0].includes('"timestamp"'),
      JSON.stringify(diff),
    );
    const dg = (t) => /"galerina:sbom:content-digest",\s*\n\s*"value": "(sha256:[0-9a-f]{64})"/.exec(t)?.[1];
    check("determinism: content-digest identical across differing clocks", dg(c) !== undefined && dg(c) === dg(d));
  }

  // 3) malformed package.json → fail-closed
  write("packages-galerina/pkg-a/package.json", "{ this is not json");
  {
    const { bom, errors } = collectSbom({ rootDir: base, sourceDateEpoch: "0" });
    check("malformed package.json: errors + no bom", bom === null && errors.some((e) => e.includes("malformed JSON")));
  }

  // 4) missing version → fail-closed
  write("packages-galerina/pkg-a/package.json", J({ name: "@fix/a" }));
  {
    const { bom, errors } = collectSbom({ rootDir: base, sourceDateEpoch: "0" });
    check("missing version: errors + no bom", bom === null && errors.some((e) => e.includes('"version" missing')));
  }

  // 5) integrity conflict across two lockfiles → fail-closed
  happy();
  write(
    "packages-galerina/pkg-b/package-lock.json",
    J({
      name: "@fix/b",
      version: "2.0.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "@fix/b", version: "2.0.0" },
        "node_modules/left-pad": {
          version: "1.3.0",
          resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
          integrity: SRI_OTHER,
        },
      },
    }),
  );
  {
    const { bom, errors } = collectSbom({ rootDir: base, sourceDateEpoch: "0" });
    check("integrity conflict: errors + no bom", bom === null && errors.some((e) => e.includes("integrity conflict")));
  }
  rmSync(join(base, "packages-galerina/pkg-b/package-lock.json"), { force: true });

  // 6) duplicated node_modules/* lockfile key → fail-closed (hand-built raw JSON text)
  happy();
  write(
    "packages-galerina/pkg-a/package-lock.json",
    `{
  "name": "@fix/a", "version": "2.0.0", "lockfileVersion": 3,
  "packages": {
    "": { "name": "@fix/a", "version": "2.0.0" },
    "node_modules/left-pad": { "version": "1.3.0", "resolved": "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz", "integrity": "${SRI_EMPTY}" },
    "node_modules/left-pad": { "version": "1.3.0", "resolved": "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz", "integrity": "${SRI_OTHER}" }
  }
}`,
  );
  {
    const { bom, errors } = collectSbom({ rootDir: base, sourceDateEpoch: "0" });
    check(
      "duplicate node_modules key: errors + no bom",
      bom === null && errors.some((e) => e.includes('duplicate JSON key "node_modules/left-pad"')),
    );
  }

  // 7) duplicated benign key → warning only (matches real lockfiles observed in this repo)
  happy();
  write(
    "packages-galerina/pkg-a/package-lock.json",
    `{
  "name": "@fix/a", "version": "2.0.0", "lockfileVersion": 3,
  "packages": {
    "": { "name": "@fix/a", "version": "2.0.0" },
    "../pkg-b": { "name": "@fix/b", "version": "2.0.0" },
    "../pkg-b": { "name": "@fix/b", "version": "2.0.0", "extraneous": true },
    "node_modules/left-pad": { "version": "1.3.0", "resolved": "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz", "integrity": "${SRI_EMPTY}" }
  }
}`,
  );
  {
    const { bom, errors, warnings } = collectSbom({ rootDir: base, sourceDateEpoch: "0" });
    check(
      "duplicate benign key: warning, still emits",
      bom !== null && errors.length === 0 && warnings.some((w) => w.includes('duplicate JSON key "../pkg-b"')),
    );
  }

  // 8) missing integrity → UNVERIFIED + complete=false (never silently dropped)
  happy();
  write(
    "packages-galerina/pkg-a/package-lock.json",
    J({
      name: "@fix/a",
      version: "2.0.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "@fix/a", version: "2.0.0" },
        "../pkg-b": { name: "@fix/b", version: "2.0.0" },
        "node_modules/@fix/b": { resolved: "../pkg-b", link: true },
        "node_modules/left-pad": { version: "1.3.0", resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz" },
      },
    }),
  );
  {
    const { bom, warnings } = collectSbom({ rootDir: base, sourceDateEpoch: "0" });
    const lp = bom?.components.find((c) => c.name === "left-pad");
    check(
      "missing integrity: UNVERIFIED + complete=false + FUNGI-SBOM-001",
      bom !== null &&
        lp?.properties.some((p) => p.name === "galerina:integrity" && p.value.startsWith("UNVERIFIED")) &&
        bom.metadata.properties.find((p) => p.name === "galerina:sbom:complete")?.value === "false" &&
        warnings.some((w) => w.startsWith(UNVERIFIED_CODE)),
    );
  }

  // 9) dangling file: internal ref → fail-closed
  happy();
  write(
    "packages-galerina/pkg-a/package.json",
    J({ name: "@fix/a", version: "2.0.0", dependencies: { "@fix/gone": "file:../pkg-gone" } }),
  );
  {
    const { bom, errors } = collectSbom({ rootDir: base, sourceDateEpoch: "0" });
    check("dangling file: dep: errors + no bom", bom === null && errors.some((e) => e.includes("dangling internal ref")));
  }

  // 10) path-leak writer guard: fires on absolute paths, passes on real output
  happy();
  {
    let threw = false;
    try {
      assertNoPathLeak('{"x": "C:\\\\Users\\\\someone\\\\repo"}');
    } catch {
      threw = true;
    }
    check("path-leak guard: rejects drive-letter path", threw);
    let threwHome = false;
    try {
      assertNoPathLeak('{"x": "/home/someone/repo"}');
    } catch {
      threwHome = true;
    }
    check("path-leak guard: rejects unix home path", threwHome);
    let okUrl = true;
    try {
      assertNoPathLeak('{"x": "https://registry.npmjs.org/left-pad"}');
    } catch {
      okUrl = false;
    }
    check("path-leak guard: allows https URLs", okUrl);
    const { bom } = collectSbom({ rootDir: base, sourceDateEpoch: "0" });
    let outOk = true;
    try {
      assertNoPathLeak(serializeBom(bom));
    } catch (e) {
      outOk = false;
    }
    check("path-leak guard: real output carries no absolute path", outOk);
    check("path-leak guard: output does not embed the fixture root", !serializeBom(bom).includes(toPosix(base)));
  }

  // 11) SOURCE_DATE_EPOCH must be integer seconds → fail-closed
  {
    const { bom, errors } = collectSbom({ rootDir: base, sourceDateEpoch: "not-a-number" });
    check("bad SOURCE_DATE_EPOCH: errors + no bom", bom === null && errors.some((e) => e.includes("SOURCE_DATE_EPOCH")));
  }

  rmSync(base, { recursive: true, force: true });
  process.stderr.write(failed === 0 ? "self-test: ALL CHECKS PASSED\n" : `self-test: ${failed} CHECK(S) FAILED\n`);
  return failed;
}

// ── entry ───────────────────────────────────────────────────────────────────────────────────

const isMain = (() => {
  try {
    return process.argv[1] !== undefined && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  const argv = process.argv.slice(2);
  let outRel = DEFAULT_OUT;
  let rootDir = process.cwd();
  let print = false;
  let selfTest = false;
  let bad = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--self-test") selfTest = true;
    else if (a === "--print") print = true;
    else if (a === "--out" && argv[i + 1] !== undefined) outRel = argv[(i += 1)];
    else if (a === "--root" && argv[i + 1] !== undefined) rootDir = argv[(i += 1)];
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else {
      process.stderr.write(`ERROR: unknown/incomplete argument "${a}" — fail-closed\n`);
      bad = true;
    }
  }
  if (bad) {
    usage();
    process.exit(1);
  }
  if (selfTest) {
    process.exit(runSelfTest());
  }
  process.exit(
    runGenerate({
      rootDir,
      outRel,
      print,
      sourceDateEpoch: process.env.SOURCE_DATE_EPOCH,
    }),
  );
}
