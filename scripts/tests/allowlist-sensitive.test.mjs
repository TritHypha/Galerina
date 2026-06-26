// =============================================================================
// allowlist-sensitive.test.mjs — regression lock for the sensitive-border audit.
//
// THE BUG (fixed): the audit's SENSITIVE regexes were anchored `^node:…$`, but the
// package-graph scanner accepts a builtin written BARE too (NODE_BUILTINS maps bare
// `child_process` to "node_core" exactly as it maps `node:child_process`). So an
// allowlist entry of bare `child_process` / `tls` / `net` / `vm` / `process` passed
// `graph --check` yet was INVISIBLE here — the package reported ZERO sensitive borders.
// Plus `node:module` (createRequire → arbitrary module + native-addon load, an eval/
// spawn-equivalent) and bare/`node:process` (env exfil, dlopen) were not in the table.
//
// These tests assert: bare AND node:-prefixed forms both classify; module + process are
// covered; benign builtins stay benign; and a fixture package with a bare entry is flagged
// end-to-end through the real CLI (it previously appeared 0 times).
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { classify, auditAllowlist, scan } from "../audit-allowlist-sensitive.mjs";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Pure classifier: bare AND node:-prefixed both classify (the core regression) ──────────────────────

test("classify: bare builtins are flagged (this was the fail-open) — same cap as node:-prefixed", () => {
  // The exact bare specifiers the scanner accepts as node_core but the old regex missed.
  assert.equal(classify("child_process")?.cap, "process-spawn");
  assert.equal(classify("tls")?.cap, "raw-socket");
  assert.equal(classify("net")?.cap, "raw-socket");
  assert.equal(classify("dgram")?.cap, "raw-socket");
  assert.equal(classify("http")?.cap, "http");
  assert.equal(classify("dns")?.cap, "dns");
  assert.equal(classify("fs")?.cap, "filesystem");
  assert.equal(classify("vm")?.cap, "dynamic-eval");
  assert.equal(classify("os")?.cap, "os-info");
  assert.equal(classify("worker_threads")?.cap, "spawn-thread");
  // node:-prefixed forms still classify identically (no regression on the original surface).
  assert.equal(classify("node:child_process")?.cap, "process-spawn");
  assert.equal(classify("node:tls")?.cap, "raw-socket");
  assert.equal(classify("node:fs/promises")?.cap, "filesystem");
  assert.equal(classify("node:dns/promises")?.cap, "dns");
});

test("classify: node:module + bare module → dynamic-require (the bigger eval primitive)", () => {
  // createRequire()/Module._load can load arbitrary modules AND native addons (dlopen-equivalent).
  assert.equal(classify("node:module")?.cap, "dynamic-require");
  assert.equal(classify("module")?.cap, "dynamic-require");
});

test("classify: process / node:process → host-introspection (env exfil, dlopen)", () => {
  assert.equal(classify("process")?.cap, "host-introspection");
  assert.equal(classify("node:process")?.cap, "host-introspection");
  // `child_process` must NOT be mis-bucketed as the (different) `process` capability — anchors hold.
  assert.equal(classify("child_process")?.cap, "process-spawn");
});

test("classify: benign builtins / workspace deps stay benign (no false positives)", () => {
  for (const benign of ["node:path", "path", "node:crypto", "crypto", "node:url", "node:util",
    "node:events", "node:stream", "node:buffer", "@galerina/tower-citizen", "lodash"]) {
    assert.equal(classify(benign), null, `${benign} must not be flagged sensitive`);
  }
});

test("classify: known-dangerous third-party wrappers flagged (best-effort blocklist)", () => {
  assert.equal(classify("execa")?.cap, "process-spawn");
  assert.equal(classify("cross-spawn")?.cap, "process-spawn");
  assert.equal(classify("axios")?.cap, "http");
  assert.equal(classify("node-fetch")?.cap, "http");
  // Subpath import resolves to the base package name.
  assert.equal(classify("axios/lib/adapters/http")?.cap, "http");
  // The third-party hits are tagged so the report can distinguish them from authoritative node-core.
  assert.equal(classify("execa")?.source, "thirdparty");
  assert.equal(classify("node:child_process")?.source, "node-core");
});

// ── auditAllowlist: the report's exact reproduction array (was 0, now all sensitive) ──────────────────

test("auditAllowlist: the reproduction allowlist that scored 0 now flags every sensitive entry", () => {
  const allow = ["child_process", "process", "tls", "net", "node:module", "vm", "execa"];
  const hits = auditAllowlist(allow);
  assert.equal(hits.length, 7, "all 7 sensitive borders flagged (old node:-anchored table caught 0)");
  const caps = Object.fromEntries(hits.map((h) => [h.spec, h.cap]));
  assert.deepEqual(caps, {
    "child_process": "process-spawn",
    "process": "host-introspection",
    "tls": "raw-socket",
    "net": "raw-socket",
    "node:module": "dynamic-require",
    "vm": "dynamic-eval",
    "execa": "process-spawn",
  });
});

test("auditAllowlist: a non-array allowlist denies safely (returns no hits, never throws)", () => {
  assert.deepEqual(auditAllowlist(undefined), []);
  assert.deepEqual(auditAllowlist("child_process"), []); // a string is not an array → no silent classify
});

// ── scan(): fixture packages tree — a bare-child_process border is surfaced end-to-end ────────────────

function makePkgTree() {
  const root = mkdtempSync(join(tmpdir(), "allowlist-sensitive-"));
  const writePolicy = (pkg, allowedExternal) => {
    const dir = join(root, pkg, ".graph");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "boundary-policy.json"),
      JSON.stringify({ packageName: `@galerina/${pkg}`, allowedExternal }));
  };
  writePolicy("bare-spawn", ["@galerina/x", "child_process", "node:module", "process"]); // 3 sensitive
  writePolicy("benign", ["@galerina/x", "node:path", "node:crypto"]);                     // 0 sensitive
  mkdirSync(join(root, "no-policy"), { recursive: true });                              // counted "missing"
  return root;
}

test("scan: a fixture package with a BARE child_process border is flagged (was invisible)", () => {
  const root = makePkgTree();
  const { rows, scanned, missing } = scan(root);
  assert.equal(scanned, 2);
  assert.equal(missing, 1);

  const bare = rows.find((r) => r.pkg === "bare-spawn");
  assert.ok(bare, "the bare-child_process package appears in the audit");
  const caps = bare.sensitive.map((s) => s.cap).sort();
  assert.deepEqual(caps, ["dynamic-require", "host-introspection", "process-spawn"]);
  assert.ok(bare.sensitive.some((s) => s.spec === "child_process" && s.cap === "process-spawn"));

  // The benign package opened no sensitive border — no false positive.
  assert.ok(!rows.some((r) => r.pkg === "benign"), "benign package not flagged");
  rmSync(root, { recursive: true, force: true });
});

// ── Real CLI end-to-end: the binary itself now prints the bare border (it appeared 0 times before) ────

test("CLI: `audit-allowlist-sensitive.mjs --pkg-dir <fixture>` prints the bare child_process border", () => {
  const root = makePkgTree();
  const r = spawnSync(process.execPath,
    [join(SCRIPTS, "audit-allowlist-sensitive.mjs"), "--pkg-dir", root],
    { encoding: "utf8" });
  assert.equal(r.status, 0);
  // The previously-invisible bare entry + its capability now appear in the human report.
  assert.match(r.stdout, /bare-spawn/);
  assert.match(r.stdout, /child_process\s+\[process-spawn\]/);
  assert.match(r.stdout, /dynamic-require/);
  assert.match(r.stdout, /capabilities in use:.*process-spawn/);
  rmSync(root, { recursive: true, force: true });
});
