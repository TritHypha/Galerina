#!/usr/bin/env node
// audit-fungi-corpus-check.mjs — fail-CLOSED gate: every positive `.fungi` in
// the repo must pass `galerina check`; every intentional negative must declare
// and continue to emit one exact diagnostic set.
//
// WHY THIS EXISTS (2026-07-15): the flagship `examples/auth-service/sovereignTransaction.fungi` had
// rotted to a HARD ERROR — `authority { }` nested inside `contract { }`, rejected deny-by-default
// (FUNGI-SYNTAX-011) — and NOTHING noticed. phase-close checks `tests/patterns/*.fungi` (9 files) and
// the twin audit covers the self-hosted twins, but the 447-file tracked `.fungi` corpus had no compile
// gate. An example that does not compile teaches broken syntax to everyone who copies it. The instance
// was fixed; THIS is the detector, so the class cannot recur.
//
// DESIGN
//  - FIND via myco (the graph-indexed finder — house rule: no glob/grep discovery), token query
//    `-f fungi` then an `.fungi`-extension filter (the dotted query `.fungi` under-matched: 283 of 447 —
//    caught by the git cross-check below). UNION with `git ls-files "*.fungi"` (git's index IS the
//    tracked-corpus source of truth); any tracked file myco missed is reported as FINDER DRIFT so a
//    finder hole can never silently shrink the gate.
//  - ADJUDICATE via the REAL `galerina check` (spawned per file — the CLI refuses directories), never a
//    re-implementation: a private copy of the pipeline would drift from the CLI and the gate would lie.
//  - CACHE by (size, mtimeMs) under build/fungi-corpus-check/ so only CHANGED files re-check: the first
//    sweep costs minutes, every later run seconds — cheap enough for the phase-close cadence.
//  - DELEGATE only docs/examples/** (audit-example-diagnostics.mjs owns that
//    corpus). Elsewhere, `/// expected_diagnostics: CODE` or an exact adjacent
//    `<file>.fungi.expected.diagnostics.txt` sidecar is validated, never skipped.
//  - RATCHET: the implicit baseline may only SHRINK. The update command refuses
//    growth; new failure, new code, stale ownership, or a fixed baseline row is RED.
//
// Usage:
//   node scripts/audit-fungi-corpus-check.mjs --self-test          # prove the detector fires (CI first)
//   node scripts/audit-fungi-corpus-check.mjs                      # enforce: exit 1 on NEW breakage
//   node scripts/audit-fungi-corpus-check.mjs --update-baseline    # re-record (deliberate; diff-reviewed)
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { types as utilTypes } from "node:util";
import { compilerContentFingerprint } from "./lib/compiler-content-fingerprint.mjs";
import ownedProcessTree from "./lib/owned-process-tree.cjs";
import {
  aggregateCorpusReceipts,
  validateCorpusRequest,
  validateShardReceipt,
} from "./lib/fungi-corpus-receipt.mjs";
import { deriveCorpusShards } from "./lib/fungi-corpus-shards.mjs";

const { runOwnedProcess } = ownedProcessTree;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "baselines", "fungi-corpus-check.json");
const CACHE_DIR = join(ROOT, "build", "fungi-corpus-check");
const CACHE = join(CACHE_DIR, "cache.json");
const MYCO = resolve(ROOT, "packages-ts", "galerina-tools-myco", "dist", "cli.js");
// node/git are real executables — spawn them directly. `shell:true` would be needed only for .cmd
// shims (npm) and triggers Node's DEP0190 arg-concatenation warning; no shell = no concat hazard.
const SPAWN = { encoding: "utf8", shell: false };
const MODULE_PATH = fileURLToPath(import.meta.url);
const IS_MAIN = process.argv[1] !== undefined && resolve(process.argv[1]) === MODULE_PATH;

// ── FIND ─────────────────────────────────────────────────────────────────────────────────────
function mycoFungi() {
  if (!existsSync(MYCO)) return { list: null, note: "myco dist not built (packages-ts/galerina-tools-myco — run `npm run build` there)" };
  const r = spawnSync("node", [MYCO, "-f", "fungi", ROOT, "--json", "--no-color", "-n", "9000"],
    { ...SPAWN, timeout: 180000 });
  const stdout = r.stdout ?? "";
  const jsonStart = stdout.indexOf("{"); // an index-refresh banner may precede the JSON — skip to it
  if (jsonStart < 0) return { list: null, note: `myco returned no JSON (exit ${r.status})` };
  try {
    const parsed = JSON.parse(stdout.slice(jsonStart));
    if (parsed.summary?.truncated) return { list: null, note: "myco result truncated — raise -n" };
    const list = [...new Set((parsed.matches ?? [])
      .map((m) => String(m.path ?? "").replace(/\\/g, "/"))
      .filter((p) => p.endsWith(".fungi")))];
    return { list, note: null };
  } catch (e) { return { list: null, note: `myco JSON parse failed: ${String(e).slice(0, 80)}` }; }
}
function gitFungi() {
  const r = spawnSync("git", ["ls-files", "*.fungi"], { ...SPAWN, cwd: ROOT, timeout: 60000 });
  return (r.stdout ?? "").split(/\r?\n/).map((s) => s.trim().replace(/\\/g, "/")).filter((s) => s.endsWith(".fungi"));
}
function findFungi() {
  const tracked = gitFungi();
  const { list: viaMyco, note } = mycoFungi();
  if (viaMyco === null) {
    // Degraded (myco unavailable): git's index still gives the full TRACKED corpus — the gate holds.
    return { files: tracked, finder: `git ls-files only (myco degraded: ${note})`, finderDrift: [] };
  }
  const union = [...new Set([...viaMyco, ...tracked])].sort();
  const finderDrift = tracked.filter((f) => !viaMyco.includes(f)); // tracked but missed by the graph finder
  return { files: union, finder: `myco graph finder (${viaMyco.length}) ∪ git index (${tracked.length})`, finderDrift };
}

// ── scope and explicit diagnostic ownership ────────────────────────────────────────────────
const ownedElsewhere = (rel) =>
  rel.startsWith("docs/examples/") // audit-example-diagnostics.mjs owns that corpus
  || rel.startsWith("build/");     // generated tree — no authored .fungi belongs there (incl. the self-test plants)
const DIAGNOSTIC_CODE = /^FUNGI-[A-Z][A-Z0-9]*-\d+[A-Za-z]?$/;
const EXACT_SIDECAR_SUFFIX = ".fungi.expected.diagnostics.txt";

function parseExpectedCodes(text, label) {
  const values = String(text)
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 1 && values[0].toLowerCase() === "none") {
    return { codes: [], error: null };
  }
  if (
    values.length === 0
    || values.some((value) => !DIAGNOSTIC_CODE.test(value))
    || new Set(values).size !== values.length
  ) {
    return {
      codes: [],
      error:
        `${label} must contain a non-empty, duplicate-free list of exact `
        + "FUNGI-*-NNN codes (or the single word none)",
    };
  }
  return { codes: values.sort(), error: null };
}

function diagnosticExpectation(rel) {
  let source;
  try {
    source = readFileSync(join(ROOT, rel), "utf8");
  } catch (error) {
    return { codes: [], error: `cannot read ${rel}: ${error.message}` };
  }
  const headers = [
    ...source.matchAll(/^\/\/\/\s*expected_diagnostics:\s*(.+)$/gim),
  ];
  const sidecar = `${join(ROOT, rel)}.expected.diagnostics.txt`;
  const hasSidecar = existsSync(sidecar);
  if (headers.length > 1 || (headers.length === 1 && hasSidecar)) {
    return {
      codes: [],
      error: `${rel} has ambiguous diagnostic ownership`,
    };
  }
  if (headers.length === 1) {
    return parseExpectedCodes(headers[0][1], `${rel} expected_diagnostics`);
  }
  if (hasSidecar) {
    return parseExpectedCodes(
      readFileSync(sidecar, "utf8"),
      relative(ROOT, sidecar).replace(/\\/g, "/"),
    );
  }
  return { codes: [], error: null };
}

function diagnosticOwnershipViolation(expectation, verdict) {
  if (expectation.error) return expectation.error;
  if (expectation.codes.length === 0) {
    return verdict.ok
      ? null
      : `positive source emitted ${verdict.codes.join(", ") || "an unclassified error"}`;
  }
  if (verdict.ok) {
    return `expected ${expectation.codes.join(", ")} but the fixture passed`;
  }
  const actual = [...verdict.codes].sort();
  return actual.join("\0") === expectation.codes.join("\0")
    ? null
    : `expected ${expectation.codes.join(", ")}; got ${actual.join(", ") || "no diagnostic code"}`;
}

function implicitBaselineGrowth(base, failing) {
  return Object.keys(failing).filter((rel) => !(rel in base));
}

function diagnosticSidecars() {
  const result = spawnSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      `*${EXACT_SIDECAR_SUFFIX}`,
    ],
    { ...SPAWN, cwd: ROOT, timeout: 60000 },
  );
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

function orphanSidecars(sidecars, fungiFiles) {
  const corpus = new Set(fungiFiles);
  return sidecars.filter((sidecar) => {
    const owner = sidecar.slice(0, -".expected.diagnostics.txt".length);
    return !owner.endsWith(".fungi") || !corpus.has(owner);
  });
}

// ── ADJUDICATE (real CLI) + cache by (size, mtime) ───────────────────────────────────────────
function checkFile(rel, strictTypes = false) {
  const args = [join(ROOT, "galerina.mjs"), "check", rel];
  if (strictTypes) args.push("--strict-types");
  const r = spawnSync("node", args,
    { ...SPAWN, cwd: ROOT, timeout: 60000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // A real code ends in a numeric segment (FUNGI-SYNTAX-011); the CLI's "+N FUNGI-TYPE-* advisory"
  // footer must not pollute the baseline's code lists.
  return { ok: r.status === 0, codes: [...new Set([...out.matchAll(/(FUNGI-[A-Z][A-Z0-9]*-\d+[A-Za-z]?)/g)].map((m) => m[1]))].sort() };
}
const loadJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; } };

// ── Corpus Audit v2: closed, content-bound shard execution ──────────────────────────────────
const CORPUS_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CORPUS_HASH = /^[0-9a-f]{40}$/u;
const CORPUS_CLEAN_MARKER = /(?:0 errors, 0 governance warnings|parsed OK, but found NO flows or declarations)/u;
const CORPUS_EXECUTION_KEYS = Object.freeze(["repositoryRoot"]);
const CORPUS_AGGREGATE_EXECUTION_KEYS = Object.freeze(["repositoryRoot", "concurrency", "priorReceipts"]);

function corpusDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function rawDigest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function freezeCorpus(value) {
  if (Array.isArray(value)) {
    for (const entry of value) freezeCorpus(entry);
  } else if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) freezeCorpus(entry);
  }
  return Object.freeze(value);
}

function corpusAccepted(value) {
  return Object.freeze({ kind: "accepted", value: freezeCorpus(value) });
}

function corpusRefused(code) {
  return Object.freeze({ kind: "refused", code });
}

function exactCorpusRecord(value, keys) {
  try {
    if (
      value === null
      || typeof value !== "object"
      || Array.isArray(value)
      || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(descriptors).length !== keys.length
      || Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")
      || !keys.every((key) => Object.hasOwn(descriptors, key))
    ) return null;
    const output = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value")
        || descriptor.get !== undefined
        || descriptor.set !== undefined
      ) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function exactCorpusArray(value) {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const output = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value")
        || descriptor.get !== undefined
        || descriptor.set !== undefined
      ) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function closedCorpusEquivalent(value, expected) {
  try {
    if (expected === null || typeof expected !== "object") return Object.is(value, expected);
    if (Array.isArray(expected)) {
      const candidate = exactCorpusArray(value);
      return candidate !== null
        && candidate.length === expected.length
        && expected.every((entry, index) => closedCorpusEquivalent(candidate[index], entry));
    }
    const candidate = exactCorpusRecord(value, Object.keys(expected));
    return candidate !== null
      && Object.keys(expected).every((key) => closedCorpusEquivalent(candidate[key], expected[key]));
  } catch {
    return false;
  }
}

function validAbortSignal(value) {
  return value === undefined
    || (typeof AbortSignal === "function" && !utilTypes.isProxy(value) && value instanceof AbortSignal);
}

function canonicalRepositoryRoot(value) {
  try {
    if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !isAbsolute(value)) return null;
    const resolved = resolve(value);
    const canonical = realpathSync(value);
    const stats = lstatSync(canonical);
    if (resolved !== value || canonical !== value || stats.isSymbolicLink() || !stats.isDirectory()) return null;
    return canonical;
  } catch {
    return null;
  }
}

function confinedCorpusPath(root, rel) {
  const absolute = resolve(root, ...rel.split("/"));
  const back = relative(root, absolute);
  if (back === "" || back === ".." || back.startsWith(`..${sep}`) || isAbsolute(back)) return null;
  return absolute;
}

function gitCorpus(root, args, maxBuffer = 64 * 1024) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: null,
    shell: false,
    windowsHide: true,
    timeout: 10_000,
    maxBuffer,
  });
}

function repositoryIdentity(root) {
  const head = gitCorpus(root, ["rev-parse", "HEAD"]);
  const tree = gitCorpus(root, ["rev-parse", "HEAD^{tree}"]);
  const repositoryHead = head.status === 0 ? head.stdout.toString("utf8").trim() : "";
  const repositoryTree = tree.status === 0 ? tree.stdout.toString("utf8").trim() : "";
  return CORPUS_HASH.test(repositoryHead) && CORPUS_HASH.test(repositoryTree)
    ? { ok: true, repositoryHead, repositoryTree }
    : { ok: false };
}

function sameRepositoryIdentity(identity, request) {
  return identity.ok
    && identity.repositoryHead === request.repositoryHead
    && identity.repositoryTree === request.repositoryTree;
}

function trackedCorpusFile(root, rel) {
  const result = gitCorpus(root, ["ls-files", "-z", "--error-unmatch", "--", rel]);
  return result.status === 0 && result.stdout.equals(Buffer.from(`${rel}\0`, "utf8"));
}

function sameHeldStat(left, right) {
  return left.isFile()
    && right.isFile()
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readHeldFile(absolute, maxBytes = null) {
  let fd;
  try {
    const pathBefore = lstatSync(absolute, { bigint: true });
    if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) return { ok: false, reason: "NOT_DIRECT_REGULAR" };
    fd = openSync(absolute, fsConstants.O_RDONLY);
    const descriptorBefore = fstatSync(fd, { bigint: true });
    if (!sameHeldStat(pathBefore, descriptorBefore)) {
      closeSync(fd);
      return { ok: false, reason: "IDENTITY_CHANGED" };
    }
    const chunks = [];
    let position = 0;
    while (true) {
      const remaining = maxBytes === null ? 64 * 1024 : Math.max(0, maxBytes + 1 - position);
      if (maxBytes !== null && remaining === 0) break;
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
      const count = readSync(fd, buffer, 0, buffer.length, position);
      if (count === 0) break;
      chunks.push(buffer.subarray(0, count));
      position += count;
      if (maxBytes !== null && position > maxBytes) break;
    }
    const bytes = Buffer.concat(chunks);
    const descriptorAfter = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(absolute, { bigint: true });
    if (!sameHeldStat(descriptorBefore, descriptorAfter) || !sameHeldStat(descriptorBefore, pathAfter)) {
      closeSync(fd);
      return { ok: false, reason: "IDENTITY_CHANGED" };
    }
    return {
      ok: true,
      fd,
      absolute,
      stat: descriptorBefore,
      bytes,
      overflow: maxBytes !== null && bytes.length > maxBytes,
    };
  } catch {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* descriptor cleanup is best effort */ }
    }
    return { ok: false, reason: "UNREADABLE" };
  }
}

function closeHeldFile(held) {
  if (held?.ok && held.fd !== undefined) {
    try { closeSync(held.fd); } catch { /* descriptor is already unusable */ }
    held.fd = undefined;
  }
}

function verifyHeldFile(held, expectedDigest) {
  try {
    const descriptor = fstatSync(held.fd, { bigint: true });
    const pathState = lstatSync(held.absolute, { bigint: true });
    if (!sameHeldStat(held.stat, descriptor) || !sameHeldStat(held.stat, pathState)) return false;
    const hash = createHash("sha256");
    let position = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(64 * 1024);
      const count = readSync(held.fd, buffer, 0, buffer.length, position);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      position += count;
    }
    const descriptorAfter = fstatSync(held.fd, { bigint: true });
    const pathAfter = lstatSync(held.absolute, { bigint: true });
    return sameHeldStat(held.stat, descriptorAfter)
      && sameHeldStat(held.stat, pathAfter)
      && `sha256:${hash.digest("hex")}` === expectedDigest;
  } catch {
    return false;
  }
}

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function corpusCompilerIdentity(root) {
  try {
    const paths = ["galerina.mjs"];
    const dist = join(root, "packages-ts", "galerina-core-compiler", "dist");
    const visit = (directory) => {
      const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => lexicalCompare(left.name, right.name));
      for (const entry of entries) {
        const absolute = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error("compiler symlink refused");
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile() && /\.(?:c?js)$/u.test(entry.name)) {
          paths.push(relative(root, absolute).split(sep).join("/"));
        }
      }
    };
    visit(dist);
    paths.sort(lexicalCompare);
    const files = [];
    for (const path of paths) {
      const absolute = confinedCorpusPath(root, path);
      if (absolute === null) return { ok: false };
      const held = readHeldFile(absolute);
      if (!held.ok) return { ok: false };
      const digest = rawDigest(held.bytes);
      const stable = verifyHeldFile(held, digest);
      closeHeldFile(held);
      if (!stable) return { ok: false };
      files.push({ path, digest });
    }
    const input = { schema: "galerina.fungi-corpus-compiler-input.v2", files };
    return { ok: true, digest: corpusDigest(input) };
  } catch {
    return { ok: false };
  }
}

function decodeUtf8(bytes) {
  try {
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, value: "" };
  }
}

function expectationInput(owner, codes, error) {
  return {
    schema: "galerina.fungi-corpus-expectation.v2",
    owner,
    codes,
    error,
  };
}

function inspectCorpusExpectation(root, rel, sourceBytes, remainingBytes = null) {
  const decodedSource = decodeUtf8(sourceBytes);
  const source = decodedSource.value;
  const headers = decodedSource.ok
    ? [...source.matchAll(/^\/\/\/\s*expected_diagnostics:\s*(.+)$/gim)]
    : [];
  const sidecarRel = `${rel}.expected.diagnostics.txt`;
  const sidecarAbsolute = confinedCorpusPath(root, sidecarRel);
  let sidecarExists = false;
  let sidecarDirect = false;
  let sidecarUnreadable = false;
  let sidecarIdentityChanged = false;
  let sidecarBytes = Buffer.alloc(0);
  try {
    const state = lstatSync(sidecarAbsolute, { bigint: true });
    sidecarExists = true;
    sidecarDirect = !state.isSymbolicLink() && state.isFile();
  } catch (error) {
    if (error?.code !== "ENOENT") {
      sidecarExists = true;
      sidecarUnreadable = true;
    }
  }
  if (sidecarExists && sidecarDirect) {
    const held = readHeldFile(sidecarAbsolute, remainingBytes);
    if (!held.ok) {
      sidecarUnreadable = true;
      sidecarIdentityChanged = held.reason === "IDENTITY_CHANGED";
    } else {
      if (held.overflow) {
        closeHeldFile(held);
        return { overflow: true, bytesUsed: held.bytes.length };
      }
      sidecarBytes = held.bytes;
      const stable = verifyHeldFile(held, rawDigest(sidecarBytes));
      closeHeldFile(held);
      if (!stable) sidecarIdentityChanged = true;
    }
  }
  if (sidecarIdentityChanged) return { identityChanged: true, bytesUsed: sidecarBytes.length };

  let input;
  if (!decodedSource.ok) {
    input = expectationInput("INVALID", [], "SOURCE_NOT_UTF8");
  } else if (headers.length > 1 || (headers.length === 1 && sidecarExists)) {
    input = expectationInput("INVALID", [], "AMBIGUOUS_OWNER");
  } else if (headers.length === 1) {
    const parsed = parseExpectedCodes(headers[0][1], `${rel} expected_diagnostics`);
    input = parsed.error
      ? expectationInput("INVALID", [], "MALFORMED_CODES")
      : expectationInput("INLINE", parsed.codes, "NONE");
  } else if (sidecarExists && !sidecarDirect) {
    input = expectationInput("INVALID", [], "SIDECAR_NOT_DIRECT_REGULAR");
  } else if (sidecarUnreadable) {
    input = expectationInput("INVALID", [], "SIDECAR_UNREADABLE");
  } else if (sidecarExists) {
    const decodedSidecar = decodeUtf8(sidecarBytes);
    const parsed = decodedSidecar.ok
      ? parseExpectedCodes(decodedSidecar.value, sidecarRel)
      : { codes: [], error: "invalid utf8" };
    input = parsed.error
      ? expectationInput("INVALID", [], "MALFORMED_CODES")
      : expectationInput("SIDECAR", parsed.codes, "NONE");
  } else {
    input = expectationInput("NONE", [], "NONE");
  }
  return {
    input,
    digest: corpusDigest(input),
    mode: (input.owner === "INLINE" || input.owner === "SIDECAR") && input.codes.length > 0 ? "strict" : "plain",
    bytesUsed: sidecarBytes.length,
  };
}

function inspectCorpusFile(root, file, remainingBytes = null) {
  const absolute = confinedCorpusPath(root, file.path);
  if (absolute === null || !trackedCorpusFile(root, file.path)) return { ok: false, reason: "REPOSITORY_CHANGED" };
  const source = readHeldFile(absolute, remainingBytes);
  if (!source.ok) return { ok: false, reason: "REPOSITORY_CHANGED" };
  if (source.overflow) {
    const bytesUsed = source.bytes.length;
    closeHeldFile(source);
    return { ok: false, reason: "BYTE_OVERFLOW", bytesUsed };
  }
  const expectationRemaining = remainingBytes === null ? null : Math.max(0, remainingBytes - source.bytes.length);
  const expectation = inspectCorpusExpectation(root, file.path, source.bytes, expectationRemaining);
  if (expectation.overflow) {
    closeHeldFile(source);
    return { ok: false, reason: "BYTE_OVERFLOW", bytesUsed: source.bytes.length + expectation.bytesUsed };
  }
  if (expectation.identityChanged) {
    closeHeldFile(source);
    return { ok: false, reason: "REPOSITORY_CHANGED" };
  }
  if (
    rawDigest(source.bytes) !== file.digest
    || expectation.digest !== file.expectationDigest
    || expectation.mode !== file.mode
  ) {
    closeHeldFile(source);
    return { ok: false, reason: "REPOSITORY_CHANGED" };
  }
  return {
    ok: true,
    source,
    expectation: expectation.input,
    bytesUsed: source.bytes.length + expectation.bytesUsed,
  };
}

function corpusReceipt(shard, completed, status, termination) {
  const base = {
    schema: "galerina.fungi-corpus-shard-receipt.v2",
    shardId: shard.shardId,
    shardDigest: corpusDigest(shard),
    requestDigest: shard.requestDigest,
    startIndex: shard.startIndex,
    endIndexExclusive: shard.endIndexExclusive,
    status,
    termination,
    completed,
    unprocessed: shard.files.slice(completed.length).map((file) => ({ ...file })),
  };
  const receipt = { ...base, resultDigest: corpusDigest(base) };
  return validateShardReceipt(receipt, shard);
}

function ownershipResult(expectation, codes) {
  if (expectation.owner === "INVALID") {
    return { verdict: "REFUSED", code: "EXPECTATION_INVALID" };
  }
  if (expectation.codes.length > 0) {
    if (codes.length === 0) return { verdict: "FINDING", code: "EXPECTED_DIAGNOSTICS_ABSENT" };
    return codes.join("\0") === expectation.codes.join("\0")
      ? { verdict: "PASS", code: "EXPECTED_DIAGNOSTICS_EXACT" }
      : { verdict: "FINDING", code: "EXPECTED_DIAGNOSTICS_MISMATCH" };
  }
  return codes.length === 0
    ? { verdict: "PASS", code: "CLEAN" }
    : { verdict: "FINDING", code: "UNEXPECTED_DIAGNOSTICS" };
}

function completedCorpusResult(file, status, codes, expectation) {
  const ownership = ownershipResult(expectation, codes);
  const value = {
    schema: "galerina.fungi-corpus-file-result.v2",
    path: file.path,
    digest: file.digest,
    expectationDigest: file.expectationDigest,
    mode: file.mode,
    checkerStatus: codes.length > 0 ? "DIAGNOSTIC" : "CLEAN",
    exitCode: status,
    codes,
    ownershipVerdict: ownership.verdict,
    ownershipCode: ownership.code,
  };
  return { completed: { ...file, resultDigest: corpusDigest(value) }, ownershipVerdict: ownership.verdict };
}

function requestFileSetMatches(request) {
  return request.fileSetDigest === corpusDigest({
    schema: "galerina.fungi-corpus-file-set.v2",
    files: request.files.map((file) => ({ ...file })),
  });
}

function shardFromRequest(request, suppliedShard) {
  const limitsRecord = exactCorpusRecord(suppliedShard, [
    "schema", "shardId", "shardIndex", "shardCount", "startIndex", "endIndexExclusive",
    "requestDigest", "limits", "files",
  ]);
  if (limitsRecord === null) return null;
  const derivation = deriveCorpusShards(request, limitsRecord.limits);
  if (derivation.kind !== "accepted") return null;
  return derivation.value.find((candidate) => closedCorpusEquivalent(suppliedShard, candidate)) ?? null;
}

async function terminalCorpusReceipt(root, request, shard, completed, termination) {
  const repository = repositoryIdentity(root);
  if (!sameRepositoryIdentity(repository, request)) termination = "REPOSITORY_CHANGED";
  const compiler = corpusCompilerIdentity(root);
  if (!compiler.ok || compiler.digest !== request.compilerDigest) termination = "COMPILER_CHANGED";
  return corpusReceipt(shard, completed, "REFUSED", termination);
}

export async function runCorpusShard(value, shardValue, executionValue, signal) {
  try {
    if (!validAbortSignal(signal)) return corpusRefused("CORPUS_SHARD_SIGNAL_INVALID");
    const requestResult = validateCorpusRequest(value);
    if (requestResult.kind !== "accepted") return corpusRefused("CORPUS_SHARD_REQUEST_INVALID");
    const request = requestResult.value;
    if (!requestFileSetMatches(request)) return corpusRefused("CORPUS_SHARD_FILE_SET_INVALID");
    const shard = shardFromRequest(request, shardValue);
    if (shard === null) return corpusRefused("CORPUS_SHARD_INVALID");
    const execution = exactCorpusRecord(executionValue, CORPUS_EXECUTION_KEYS);
    if (execution === null) return corpusRefused("CORPUS_SHARD_EXECUTION_INVALID");
    const root = canonicalRepositoryRoot(execution.repositoryRoot);
    if (root === null) return corpusRefused("CORPUS_SHARD_ROOT_INVALID");

    const started = Date.now();
    const deadline = started + shard.limits.timeoutMs;
    const initialRepository = repositoryIdentity(root);
    if (!sameRepositoryIdentity(initialRepository, request)) {
      return corpusReceipt(shard, [], "REFUSED", "REPOSITORY_CHANGED");
    }
    const initialCompiler = corpusCompilerIdentity(root);
    if (!initialCompiler.ok) return corpusRefused("CORPUS_COMPILER_IDENTITY_REFUSED");
    if (initialCompiler.digest !== request.compilerDigest) {
      return corpusReceipt(shard, [], "REFUSED", "COMPILER_CHANGED");
    }

    const completed = [];
    const ownershipVerdicts = [];
    let admittedBytes = 0;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    for (const file of shard.files) {
      if (Date.now() >= deadline) return terminalCorpusReceipt(root, request, shard, completed, "TIMEOUT");
      const admitted = inspectCorpusFile(root, file, Math.max(0, shard.limits.maxBytes - admittedBytes));
      if (!admitted.ok) {
        return terminalCorpusReceipt(root, request, shard, completed, admitted.reason);
      }
      admittedBytes += admitted.bytesUsed;
      if (signal?.aborted) {
        closeHeldFile(admitted.source);
        return terminalCorpusReceipt(root, request, shard, completed, "CANCELLED");
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs < 1) {
        closeHeldFile(admitted.source);
        return terminalCorpusReceipt(root, request, shard, completed, "TIMEOUT");
      }
      const remainingStdout = Math.max(0, shard.limits.maxOutputBytes - stdoutBytes);
      const remainingStderr = Math.max(0, shard.limits.maxOutputBytes - stderrBytes);
      const child = await runOwnedProcess({
        command: process.execPath,
        args: [join(root, "galerina.mjs"), "check", file.path, ...(file.mode === "strict" ? ["--strict-types"] : [])],
        cwd: root,
        env: {},
        timeoutMs: remainingMs,
        maxOutputBytes: Math.max(1, remainingStdout, remainingStderr),
        windowsHide: true,
      });
      const stable = verifyHeldFile(admitted.source, file.digest);
      closeHeldFile(admitted.source);
      if (!stable) return terminalCorpusReceipt(root, request, shard, completed, "REPOSITORY_CHANGED");

      stdoutBytes += Buffer.byteLength(child.stdout, "utf8");
      stderrBytes += Buffer.byteLength(child.stderr, "utf8");
      if (
        child.outputLimitExceeded
        || stdoutBytes > shard.limits.maxOutputBytes
        || stderrBytes > shard.limits.maxOutputBytes
      ) return terminalCorpusReceipt(root, request, shard, completed, "OUTPUT_OVERFLOW");
      if (child.timedOut) return terminalCorpusReceipt(root, request, shard, completed, "TIMEOUT");
      if (
        child.spawnError !== null
        || child.signal !== null
        || child.status === null
        || !Number.isSafeInteger(child.status)
        || child.status < 0
        || (child.cleanupAttempted && !child.cleanupAcknowledged)
      ) return terminalCorpusReceipt(root, request, shard, completed, "CRASH");

      const output = `${child.stdout}${child.stderr}`;
      const codes = [...new Set([...output.matchAll(/(FUNGI-[A-Z][A-Z0-9]*-\d+[A-Za-z]?)/gu)].map((match) => match[1]))]
        .sort(lexicalCompare);
      if (child.status >= 128 && codes.length === 0) {
        return terminalCorpusReceipt(root, request, shard, completed, "CRASH");
      }
      const classifiable = child.status === 0
        ? codes.length > 0 || CORPUS_CLEAN_MARKER.test(output)
        : codes.length > 0;
      if (!classifiable) return terminalCorpusReceipt(root, request, shard, completed, "MISSING_RESULT");
      const result = completedCorpusResult(file, child.status, codes, admitted.expectation);
      completed.push(result.completed);
      ownershipVerdicts.push(result.ownershipVerdict);
    }

    const finalRepository = repositoryIdentity(root);
    if (!sameRepositoryIdentity(finalRepository, request)) {
      return corpusReceipt(shard, completed, "REFUSED", "REPOSITORY_CHANGED");
    }
    const finalCompiler = corpusCompilerIdentity(root);
    if (!finalCompiler.ok || finalCompiler.digest !== request.compilerDigest) {
      return corpusReceipt(shard, completed, "REFUSED", "COMPILER_CHANGED");
    }
    const status = ownershipVerdicts.includes("REFUSED")
      ? "REFUSED"
      : ownershipVerdicts.includes("FINDING") ? "FINDING" : "PASS";
    return corpusReceipt(shard, completed, status, "COMPLETE");
  } catch {
    return corpusRefused("CORPUS_SHARD_EXECUTION_REFUSED");
  }
}

function validatedPriorByShard(shards, priorReceipts) {
  const groups = new Map(shards.map((shard) => [shard.shardId, []]));
  for (const candidate of priorReceipts) {
    for (const shard of shards) {
      const result = validateShardReceipt(candidate, shard);
      if (result.kind === "accepted") groups.get(shard.shardId).push(result.value);
    }
  }
  for (const receipts of groups.values()) receipts.sort((left, right) => lexicalCompare(corpusDigest(left), corpusDigest(right)));
  return groups;
}

function localShardMatches(root, request, shard) {
  const repository = repositoryIdentity(root);
  if (!sameRepositoryIdentity(repository, request)) return false;
  const compiler = corpusCompilerIdentity(root);
  if (!compiler.ok || compiler.digest !== request.compilerDigest) return false;
  let admittedBytes = 0;
  for (const file of shard.files) {
    const admitted = inspectCorpusFile(root, file, Math.max(0, shard.limits.maxBytes - admittedBytes));
    if (!admitted.ok) return false;
    admittedBytes += admitted.bytesUsed;
    const stable = verifyHeldFile(admitted.source, file.digest);
    closeHeldFile(admitted.source);
    if (!stable) return false;
  }
  return true;
}

export async function runCorpusAggregate(value, limitValue, executionValue, signal) {
  try {
    if (!validAbortSignal(signal)) return corpusRefused("CORPUS_RUN_SIGNAL_INVALID");
    const requestResult = validateCorpusRequest(value);
    if (requestResult.kind !== "accepted") return corpusRefused("CORPUS_RUN_REQUEST_INVALID");
    const request = requestResult.value;
    if (!requestFileSetMatches(request)) return corpusRefused("CORPUS_RUN_FILE_SET_INVALID");
    const derivation = deriveCorpusShards(request, limitValue);
    if (derivation.kind !== "accepted") return corpusRefused("CORPUS_RUN_LIMITS_INVALID");
    const shards = derivation.value;
    const execution = exactCorpusRecord(executionValue, CORPUS_AGGREGATE_EXECUTION_KEYS);
    if (
      execution === null
      || !Number.isSafeInteger(execution.concurrency)
      || execution.concurrency < 1
      || execution.concurrency > 4
    ) return corpusRefused("CORPUS_RUN_EXECUTION_INVALID");
    const priorReceipts = exactCorpusArray(execution.priorReceipts);
    if (priorReceipts === null) return corpusRefused("CORPUS_RUN_PRIOR_INVALID");
    const root = canonicalRepositoryRoot(execution.repositoryRoot);
    if (root === null) return corpusRefused("CORPUS_RUN_ROOT_INVALID");

    const initialAggregate = aggregateCorpusReceipts(request, shards, priorReceipts);
    if (initialAggregate.kind !== "accepted") return corpusRefused("CORPUS_RUN_PRIOR_INVALID");
    const blockingReasons = initialAggregate.value.holdReasons.filter((reason) =>
      reason !== "MISSING_SHARD" && reason !== "UNFINISHED_SHARD");
    const priorGroups = validatedPriorByShard(shards, priorReceipts);
    const selectedPrior = shards.flatMap((shard) => {
      const receipt = priorGroups.get(shard.shardId)?.[0];
      return receipt === undefined ? [] : [receipt];
    });
    if (blockingReasons.length > 0) {
      return corpusAccepted({
        schema: "galerina.fungi-corpus-run.v2",
        receipts: selectedPrior,
        aggregate: initialAggregate.value,
      });
    }

    const receiptById = new Map();
    const pending = [];
    for (const shard of shards) {
      const prior = priorGroups.get(shard.shardId)?.[0];
      if (prior !== undefined && prior.termination === "COMPLETE" && localShardMatches(root, request, shard)) {
        receiptById.set(shard.shardId, prior);
      } else {
        pending.push(shard);
      }
    }

    let cursor = 0;
    let refusedCode = null;
    const worker = async () => {
      while (refusedCode === null) {
        const index = cursor;
        cursor += 1;
        const shard = pending[index];
        if (shard === undefined) return;
        const result = await runCorpusShard(request, shard, { repositoryRoot: root }, signal);
        if (result.kind !== "accepted") {
          refusedCode = result.code;
          return;
        }
        receiptById.set(shard.shardId, result.value);
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(execution.concurrency, pending.length) },
      () => worker(),
    ));
    if (refusedCode !== null) return corpusRefused("CORPUS_RUN_SHARD_REFUSED");
    const receipts = shards.flatMap((shard) => {
      const receipt = receiptById.get(shard.shardId);
      return receipt === undefined ? [] : [receipt];
    });
    const aggregate = aggregateCorpusReceipts(request, shards, receipts);
    if (aggregate.kind !== "accepted") return corpusRefused("CORPUS_RUN_AGGREGATE_REFUSED");
    return corpusAccepted({
      schema: "galerina.fungi-corpus-run.v2",
      receipts,
      aggregate: aggregate.value,
    });
  } catch {
    return corpusRefused("CORPUS_RUN_EXECUTION_REFUSED");
  }
}

function buildLocalCorpusRequest(root, profile, shardCount) {
  const repository = repositoryIdentity(root);
  const compiler = corpusCompilerIdentity(root);
  if (!repository.ok || !compiler.ok) return null;
  const paths = gitFungi().filter((path) => !ownedElsewhere(path)).sort(lexicalCompare);
  const files = [];
  for (const path of paths) {
    const absolute = confinedCorpusPath(root, path);
    if (absolute === null || !trackedCorpusFile(root, path)) return null;
    const held = readHeldFile(absolute);
    if (!held.ok) return null;
    const expectation = inspectCorpusExpectation(root, path, held.bytes);
    const stable = !expectation.overflow
      && !expectation.identityChanged
      && verifyHeldFile(held, rawDigest(held.bytes));
    closeHeldFile(held);
    if (!stable || expectation.input === undefined) return null;
    files.push({
      path,
      digest: rawDigest(held.bytes),
      expectationDigest: expectation.digest,
      mode: expectation.mode,
    });
  }
  const fileSetDigest = corpusDigest({ schema: "galerina.fungi-corpus-file-set.v2", files });
  const request = {
    schema: "galerina.fungi-corpus-request.v2",
    profile,
    productId: "galerina",
    repositoryHead: repository.repositoryHead,
    repositoryTree: repository.repositoryTree,
    compilerDigest: compiler.digest,
    fileSetDigest,
    shardCount,
    files,
  };
  return validateCorpusRequest(request).kind === "accepted" ? request : null;
}

function parseCorpusV2Cli(args) {
  if (args[0] !== "--corpus-v2" || args.length !== 15) return null;
  const allowed = new Set([
    "--profile", "--shard-count", "--concurrency", "--max-files", "--max-bytes", "--timeout-ms", "--max-output-bytes",
  ]);
  const values = new Map();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!allowed.has(flag) || values.has(flag) || value === undefined) return null;
    values.set(flag, value);
  }
  const profile = values.get("--profile");
  if (profile !== "WORKSET" && profile !== "PROJECT") return null;
  const integer = (flag) => {
    const value = values.get(flag);
    return typeof value === "string" && /^(?:0|[1-9]\d*)$/u.test(value) ? Number(value) : NaN;
  };
  const shardCount = integer("--shard-count");
  const concurrency = integer("--concurrency");
  const limits = {
    maxFiles: integer("--max-files"),
    maxBytes: integer("--max-bytes"),
    timeoutMs: integer("--timeout-ms"),
    maxOutputBytes: integer("--max-output-bytes"),
  };
  if (
    !Number.isSafeInteger(shardCount) || shardCount < 1
    || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4
    || Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1)
  ) return null;
  return { profile, shardCount, concurrency, limits };
}

async function runCorpusV2Cli(args) {
  const parsed = parseCorpusV2Cli(args);
  if (parsed === null) {
    console.error("CORPUS_V2_ARGUMENTS_REFUSED");
    return 2;
  }
  let root;
  try { root = realpathSync(ROOT); } catch { return 2; }
  const request = buildLocalCorpusRequest(root, parsed.profile, parsed.shardCount);
  if (request === null) {
    console.error("CORPUS_V2_LOCAL_IDENTITY_REFUSED");
    return 2;
  }
  const result = await runCorpusAggregate(request, parsed.limits, {
    repositoryRoot: root,
    concurrency: parsed.concurrency,
    priorReceipts: [],
  });
  if (result.kind !== "accepted") {
    console.error(result.code);
    return 2;
  }
  console.log(`FUNGI_CORPUS_V2 ${JSON.stringify(result.value)}`);
  return result.value.aggregate.status === "PASS" ? 0 : 1;
}

// ── compiler-build fingerprint (cache invalidation) ───────────────────────────────────────────
// The per-file cache keys on the .fungi's (size, mtime) — but the ADJUDICATOR is `galerina.mjs check`,
// the COMPILED compiler. If the compiler changes (e.g. a new checker rule) while no .fungi changes, a
// pure (size, mtime) cache replays STALE verdicts and the gate silently trusts old results — a fail-OPEN
// (found 2026-07-16: a fresh tri-lint rule left every .fungi mtime untouched, so the gate never re-ran).
// So the whole cache is scoped to the exact executable content of the adjudicator (galerina.mjs +
// core-compiler dist). A content change invalidates every row, but a byte-identical rebuild does not.
// This is stronger than the old size/mtime proxy and avoids spending ~80s after every no-op rebuild.
const compilerFingerprint = () => compilerContentFingerprint(ROOT);

function sweep(candidates) {
  const fp = compilerFingerprint();
  const raw = loadJson(CACHE, { entries: {} });
  const cache = (raw.fingerprint === fp ? raw.entries : {}) ?? {}; // compiler changed => whole cache misses
  const fresh = {};
  const failing = {};
  let checked = 0, cached = 0;
  for (const rel of candidates) {
    let st; try { st = statSync(join(ROOT, rel)); } catch { continue; } // vanished between find and sweep
    const expectation = diagnosticExpectation(rel);
    const strictTypes = expectation.codes.length > 0;
    const key = `${st.size}:${Math.round(st.mtimeMs)}:${strictTypes ? "strict" : "plain"}`;
    const hit = cache[rel];
    let verdict;
    if (hit !== undefined && hit.key === key) { verdict = hit; cached++; }
    else {
      const { ok, codes } = checkFile(rel, strictTypes);
      verdict = { key, ok, codes };
      checked++;
    }
    fresh[rel] = verdict;
    if (!verdict.ok) failing[rel] = verdict.codes;
  }
  try { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(CACHE, JSON.stringify({ generated: "audit-fungi-corpus-check", fingerprint: fp, entries: fresh }, null, 2)); } catch { /* cache is an optimisation, never a failure */ }
  return { failing, verdicts: fresh, checked, cached };
}

// ── SELF-TEST: a gate that cannot fail is worse than none ────────────────────────────────────
if (IS_MAIN && process.argv.includes("--corpus-v2")) {
  process.exit(await runCorpusV2Cli(process.argv.slice(2)));
}

if (IS_MAIN && process.argv.includes("--self-test")) {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  const { files, finder, finderDrift } = findFungi();
  const tracked = gitFungi();
  ok(files.length >= tracked.length && tracked.length > 300, `corpus found: ${files.length} .fungi via ${finder}`);
  ok(finderDrift.length === 0, finderDrift.length === 0
    ? "graph finder covers the FULL tracked corpus (0 finder drift vs git index)"
    : `FINDER DRIFT: myco missed ${finderDrift.length} tracked .fungi (e.g. ${finderDrift[0]}) — fix the query/index`);
  // The detector must FIRE on a planted broken file…
  mkdirSync(join(ROOT, "build", "_selftest"), { recursive: true });
  const bad = "build/_selftest/broken-selftest.fungi";
  writeFileSync(join(ROOT, bad), `@version 1\npure flow x() -> Int\ncontract {\n  totally_unknown_block { level 1 }\n}\n{\n  return 1\n}\n`);
  const badRes = checkFile(bad);
  ok(!badRes.ok && badRes.codes.includes("FUNGI-SYNTAX-011"), `detector FIRES on a planted broken .fungi (${badRes.codes.join(",")})`);
  // …and stay SILENT on a clean one (non-vacuous both ways).
  const good = "build/_selftest/good-selftest.fungi";
  writeFileSync(join(ROOT, good), `@version 1\npure flow x() -> Int\ncontract {\n  intent { "ok" }\n}\n{\n  return 1\n}\n`);
  ok(checkFile(good).ok, "detector stays SILENT on a clean .fungi");
  ok(/^[0-9a-f]{16}$/.test(compilerFingerprint()) && compilerFingerprint() === compilerFingerprint(),
    "compiler fingerprint is a stable hash — cache is scoped to the compiler build (a new rule busts it)");
  ok(ownedElsewhere("docs/examples/Level-4-Security/169-secret-comparison/example.fungi"), "docs/examples/** deferred to audit-example-diagnostics");
  ok(
    implicitBaselineGrowth(
      { "held.fungi": ["FUNGI-TEST-001"] },
      {
        "held.fungi": ["FUNGI-TEST-001"],
        "new.fungi": ["FUNGI-TEST-002"],
      },
    ).join() === "new.fungi",
    "implicit baseline growth is refused",
  );
  ok(
    orphanSidecars(
      ["tests/orphan.fungi.expected.diagnostics.txt"],
      ["tests/owned.fungi"],
    ).length === 1,
    "orphan diagnostic sidecar is refused",
  );
  ok(
    diagnosticOwnershipViolation(
      { codes: ["FUNGI-TEST-001"], error: null },
      { ok: false, codes: ["FUNGI-TEST-002"] },
    )?.startsWith("expected FUNGI-TEST-001"),
    "stale exact diagnostic ownership is refused",
  );
  ok(
    diagnosticOwnershipViolation(
      { codes: [], error: null },
      { ok: false, codes: ["FUNGI-TEST-003"] },
    )?.startsWith("positive source emitted"),
    "positive source diagnostics are refused",
  );
  console.log(process.exitCode ? "  fungi-corpus-check self-test FAILED" : "  fungi-corpus-check self-test: finder coverage + detector verified ✅");
  process.exit(process.exitCode ?? 0);
}

// ── enforce / record ─────────────────────────────────────────────────────────────────────────
if (IS_MAIN) {
const { files, finder, finderDrift } = findFungi();
const candidates = files.filter((f) => !ownedElsewhere(f));
const { verdicts, checked, cached } = sweep(candidates);
const base = loadJson(BASELINE, { knownFailing: {} }).knownFailing ?? {};
const positiveFailing = {};
const ownershipProblems = [];
let explicitlyOwned = 0;
for (const rel of candidates) {
  const expectation = diagnosticExpectation(rel);
  const verdict = verdicts[rel] ?? { ok: false, codes: [] };
  if (expectation.error) {
    ownershipProblems.push(`${rel}: ${expectation.error}`);
  } else if (expectation.codes.length > 0) {
    explicitlyOwned += 1;
    const violation = diagnosticOwnershipViolation(expectation, verdict);
    if (violation) ownershipProblems.push(`${rel}: ${violation}`);
  } else if (!verdict.ok) {
    positiveFailing[rel] = verdict.codes;
  }
}
const orphanedSidecars = orphanSidecars(diagnosticSidecars(), files);
const baselineGrowth = implicitBaselineGrowth(base, positiveFailing);

if (process.argv.includes("--update-baseline")) {
  if (
    baselineGrowth.length > 0
    || ownershipProblems.length > 0
    || orphanedSidecars.length > 0
  ) {
    console.error(
      "  REFUSED: --update-baseline may only shrink existing implicit debt; "
      + "new failures or diagnostic-ownership errors must be fixed.",
    );
    process.exit(1);
  }
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify({
    note: "Implicit known-failing positive .fungi (galerina check). RATCHET: may only SHRINK; intentional negatives require exact adjacent ownership.",
    generated: "audit-fungi-corpus-check",
    knownFailing: positiveFailing,
  }, null, 2) + "\n");
  console.log(`  baseline shrunk: ${Object.keys(positiveFailing).length} implicit failures of ${candidates.length} checked (${explicitlyOwned} explicit negatives; ${checked} fresh, ${cached} cached; ${finder}).`);
  process.exit(0);
}

const nowFailing = Object.keys(positiveFailing);
const NEW_BREAKS = baselineGrowth;
const NEW_CODES = nowFailing.filter((f) => f in base && positiveFailing[f].some((c) => !(base[f] ?? []).includes(c)))
  .map((f) => `${f}  new: ${positiveFailing[f].filter((c) => !(base[f] ?? []).includes(c)).join(", ")}`);
const FIXED = Object.keys(base).filter((f) => !(f in positiveFailing));

console.log(`  fungi-corpus-check: ${candidates.length} governed of ${files.length} .fungi (${finder}); ${checked} checked, ${cached} cached; ${explicitlyOwned} exact negative fixtures; ${nowFailing.length} implicit failures vs ${Object.keys(base).length} baselined.`);
if (finderDrift.length) console.log(`  ⚠️  finder drift: myco missed ${finderDrift.length} tracked .fungi (union with the git index kept the gate complete) — file on the myco roadmap.`);

const problems = [];
if (orphanedSidecars.length) problems.push(`ORPHAN diagnostic sidecar (${orphanedSidecars.length}):\n${orphanedSidecars.map((f) => `     ${f}`).join("\n")}`);
if (ownershipProblems.length) problems.push(`DIAGNOSTIC ownership violation (${ownershipProblems.length}):\n${ownershipProblems.map((f) => `     ${f}`).join("\n")}`);
if (NEW_BREAKS.length) problems.push(`NEW breakage (${NEW_BREAKS.length}):\n${NEW_BREAKS.map((f) => `     ${f}  [${positiveFailing[f].join(", ")}]`).join("\n")}`);
if (NEW_CODES.length) problems.push(`NEW diagnostic on a known-bad file (${NEW_CODES.length}):\n${NEW_CODES.map((s) => `     ${s}`).join("\n")}`);
if (FIXED.length) problems.push(`FIXED — remove from the baseline so it only shrinks (${FIXED.length}):\n${FIXED.map((f) => `     ${f}`).join("\n")}`);

if (problems.length) {
  console.error(`\n  ❌ fungi-corpus-check:\n\n  ${problems.join("\n\n  ")}\n`);
  console.error(`  Fix: every positive .fungi must pass \`node galerina.mjs check <file>\`.`);
  console.error(`  An intentional negative must carry an exact \`expected_diagnostics:\` header or`);
  console.error(`  adjacent \`<file>.fungi.expected.diagnostics.txt\` sidecar. --update-baseline may only shrink.`);
  process.exit(1);
}
console.log(`  ✅ fungi-corpus-check: explicit negatives exact; no new breakage (${nowFailing.length} implicit failures held at the shrink-only ratchet).`);
}
