#!/usr/bin/env node
/**
 * governance/key-inventory.mjs — classify every governance/signing-key-*.pub.pem and
 * produce a FAIL-CLOSED retire/archive plan for signing-key house-cleaning (RD-0368 §6).
 *
 * ZERO-TRUST: this tool NEVER reads private-key material. It reads only PUBLIC artifacts
 * (governance/trust-anchor.json, governance/revocations.json, and *.pub.pem filenames) and
 * scans governed text files for REFERENCES to each key id. It does not open .env.galerina-signing
 * or any *.env, and it never prints key bytes.
 *
 * Disposition rule (fail-closed): a key is KEPT if it is the trust-anchor root, a revoked key,
 * the current registry signer, the (declared) operational key, an escrowed key, or is referenced
 * by ANY other governed artifact. ONLY a key that is none of those AND has zero references beyond
 * its own public-key file is proposed for retirement — and "retirement" means MOVE to
 * governance/retired/, NEVER delete (a public key still verifies everything it ever signed).
 *
 * Usage:
 *   node governance/key-inventory.mjs                 # report (human table)
 *   node governance/key-inventory.mjs --json          # machine-readable plan
 *   node governance/key-inventory.mjs --self-test     # prove the classifier (fixture)
 * Options:
 *   --root <dir>        repo root to inventory (default ".")
 *   --active <keyId>    mark this key id as the operational signer (KEEP)
 *   --escrow-dir <dir>  flag keys whose private half is escrowed as <dir>/galerina-signing-key-<id>.env
 *                       (FILENAME existence only — the file is never opened)
 */
import {
  readFileSync, existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from "node:fs";
import { join, basename, sep } from "node:path";
import { tmpdir } from "node:os";

const SKIP_DIRS = new Set([".git", "node_modules", "build", "dist", "coverage", ".cache", ".turbo"]);
const SKIP_EXT = new Set([
  ".wasm", ".wat", ".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zst", ".gz", ".zip",
  ".db", ".sqlite", ".node", ".ico", ".webp", ".mp4", ".woff", ".woff2", ".ttf",
]);
const MAX_FILE_BYTES = 1_000_000;
const KEY_FILE_RE = /^signing-key-([0-9a-f]{8,})\.pub\.pem$/;

/** Read a JSON file; missing → null; malformed → throw (fail closed). */
function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** List the key ids that have a governance/signing-key-<id>.pub.pem file. */
export function listKeyIds(rootDir) {
  const govDir = join(rootDir, "governance");
  if (!existsSync(govDir)) return [];
  const ids = [];
  for (const name of readdirSync(govDir)) {
    const m = KEY_FILE_RE.exec(name);
    if (m) ids.push(m[1]);
  }
  return ids.sort();
}

/** Whole-(hex)-word matcher for a key id, so a 16-hex id never matches inside a longer hash. */
function idMatcher(id) {
  return new RegExp(`(?<![0-9a-f])${id}(?![0-9a-f])`);
}

/** Walk rootDir, yielding readable text-file paths (skips VCS/build/binary/oversize). */
function* walkText(rootDir, skipDirs = SKIP_DIRS) {
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!skipDirs.has(e.name)) stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      const dot = e.name.lastIndexOf(".");
      const ext = dot >= 0 ? e.name.slice(dot).toLowerCase() : "";
      if (SKIP_EXT.has(ext)) continue;
      if (e.name.endsWith(".env") || e.name.startsWith(".env")) continue; // never open key envs
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.size > MAX_FILE_BYTES) continue;
      yield full;
    }
  }
}

/**
 * Find, for each key id, the governed files that REFERENCE it (excluding the key's own
 * public-key files). Returns Map<id, Array<relPath>>.
 */
export function scanReferences(rootDir, ids, skipDirs = SKIP_DIRS) {
  const matchers = ids.map((id) => ({ id, re: idMatcher(id) }));
  const refs = new Map(ids.map((id) => [id, []]));
  for (const file of walkText(rootDir, skipDirs)) {
    const rel = file.startsWith(rootDir) ? file.slice(rootDir.length).replace(/^[\\/]/, "") : file;
    const base = basename(file);
    let text;
    try { text = readFileSync(file, "utf-8"); } catch { continue; }
    for (const { id, re } of matchers) {
      // A key's OWN public-key files are not "references" to it.
      if (base === `signing-key-${id}.pub.pem` || base === `signing-key-${id}.mldsa.pub.b64`) continue;
      if (re.test(text)) refs.get(id).push(rel.split(sep).join("/"));
    }
  }
  return refs;
}

/**
 * Classify every key and decide KEEP vs RETIRE. Pure over its inputs (testable).
 * @returns {Array<{keyId,klass,keep,refs,escrowed,reason}>}
 */
export function classify({ ids, rootKeyId, revokedIds, signerKeyId, activeKeyId, escrowedIds, refs }) {
  const revoked = new Set(revokedIds ?? []);
  const escrowed = new Set(escrowedIds ?? []);
  return ids.map((keyId) => {
    const r = (refs.get?.(keyId)) ?? refs[keyId] ?? [];
    let klass, keep, reason;
    if (keyId === rootKeyId) { klass = "root"; keep = true; reason = "pinned trust-anchor root"; }
    else if (revoked.has(keyId)) { klass = "revoked"; keep = true; reason = "revoked (append-only reference)"; }
    else if (keyId === signerKeyId) { klass = "registry-signer"; keep = true; reason = "signs revocations.json"; }
    else if (activeKeyId && keyId === activeKeyId) { klass = "operational"; keep = true; reason = "declared active signer"; }
    else if (escrowed.has(keyId)) { klass = "escrowed"; keep = true; reason = "private half in escrow"; }
    else if (r.length > 0) { klass = "referenced"; keep = true; reason = `referenced by ${r.length} artifact(s)`; }
    else { klass = "orphan-candidate"; keep = false; reason = "no ledger role, zero references"; }
    return { keyId, klass, keep, refs: r, escrowed: escrowed.has(keyId), reason };
  });
}

/** Build the full inventory for a real repo. */
export function inventory({ rootDir = ".", activeKeyId = null, escrowDir = null, thorough = false } = {}) {
  const ids = listKeyIds(rootDir);
  const anchor = readJson(join(rootDir, "governance", "trust-anchor.json"));
  const registry = readJson(join(rootDir, "governance", "revocations.json"));
  const rootKeyId = anchor?.registrySigningRootKeyId ?? null;
  const revokedIds = (registry?.revoked ?? []).map((e) => e?.keyId).filter(Boolean);
  const signerKeyId = registry?.signature?.keyId ?? null;
  const escrowedIds = [];
  if (escrowDir) {
    for (const id of ids) {
      if (existsSync(join(escrowDir, `galerina-signing-key-${id}.env`))) escrowedIds.push(id);
    }
  }
  // --thorough drops the build/dist skips (still never .git/node_modules/*.env) so a key that
  // only ever signs a REGENERATED artifact under build/ is not mis-classified as an orphan.
  const skipDirs = thorough ? new Set([".git", "node_modules"]) : SKIP_DIRS;
  const refs = scanReferences(rootDir, ids, skipDirs);
  const rows = classify({ ids, rootKeyId, revokedIds, signerKeyId, activeKeyId, escrowedIds, refs });
  return { rootKeyId, signerKeyId, activeKeyId, revokedIds, escrowedIds, thorough, rows };
}

function renderReport(inv) {
  const lines = [];
  lines.push("Signing-key inventory (RD-0368 §6) — fail-closed retire/archive plan");
  lines.push(`  root=${inv.rootKeyId ?? "—"}  signer=${inv.signerKeyId ?? "—"}  active=${inv.activeKeyId ?? "(not supplied)"}`);
  lines.push(`  scan scope: ${inv.thorough ? "THOROUGH (incl. build/dist)" : "source tree (build/dist excluded — run --thorough before archiving)"}`);
  lines.push("");
  const pad = (s, n) => String(s).padEnd(n);
  lines.push(`  ${pad("keyId", 18)} ${pad("class", 17)} ${pad("refs", 5)} disposition`);
  lines.push(`  ${"-".repeat(18)} ${"-".repeat(17)} ${"-".repeat(5)} ${"-".repeat(30)}`);
  for (const row of inv.rows) {
    const disp = row.keep ? "KEEP" : "RETIRE → governance/retired/";
    lines.push(`  ${pad(row.keyId, 18)} ${pad(row.klass, 17)} ${pad(row.refs.length, 5)} ${disp}  (${row.reason})`);
  }
  const retire = inv.rows.filter((r) => !r.keep);
  lines.push("");
  if (retire.length === 0) {
    lines.push("  No retire candidates — every key has a ledger role or a live reference.");
  } else {
    lines.push(`  ${retire.length} retire candidate(s): ${retire.map((r) => r.keyId).join(", ")}`);
    lines.push("  → move each governance/signing-key-<id>.pub.pem (and .mldsa.pub.b64) to governance/retired/,");
    lines.push("    record the supersession in revocations.json, and re-sign under the root (needs the RD-0368 root rotation first).");
  }
  return lines.join("\n");
}

// ── self-test: prove the classifier keeps the load-bearing keys and flags only a true orphan ──
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "key-inv-"));
  try {
    const gov = join(dir, "governance");
    mkdirSync(gov, { recursive: true });
    const K = {
      root: "aaaaaaaaaaaaaaaa", revoked: "bbbbbbbbbbbbbbbb", signer: "aaaaaaaaaaaaaaaa",
      active: "cccccccccccccccc", referenced: "dddddddddddddddd", orphan: "eeeeeeeeeeeeeeee",
    };
    for (const id of [K.root, K.revoked, K.active, K.referenced, K.orphan]) {
      writeFileSync(join(gov, `signing-key-${id}.pub.pem`), `-----BEGIN PUBLIC KEY-----\n# ${id}\n-----END PUBLIC KEY-----\n`);
    }
    writeFileSync(join(gov, "trust-anchor.json"), JSON.stringify({ registrySigningRootKeyId: K.root }));
    writeFileSync(join(gov, "revocations.json"), JSON.stringify({
      revoked: [{ keyId: K.revoked }], signature: { keyId: K.signer, algorithm: "ed25519", value: "x" },
    }));
    // A manifest that references the "referenced" key id (but not the orphan).
    mkdirSync(join(dir, "examples"), { recursive: true });
    writeFileSync(join(dir, "examples", "some.manifest.json"), JSON.stringify({ signedBy: K.referenced }));

    const inv = inventory({ rootDir: dir, activeKeyId: K.active });
    const by = Object.fromEntries(inv.rows.map((r) => [r.keyId, r]));
    const assert = (cond, msg) => { if (!cond) throw new Error(`self-test FAILED: ${msg}`); };
    assert(by[K.root].keep && by[K.root].klass === "root", "root must be KEEP/root");
    assert(by[K.revoked].keep && by[K.revoked].klass === "revoked", "revoked must be KEEP/revoked");
    assert(by[K.active].keep && by[K.active].klass === "operational", "active must be KEEP/operational");
    assert(by[K.referenced].keep && by[K.referenced].klass === "referenced", "referenced must be KEEP/referenced");
    assert(by[K.referenced].refs.some((f) => f.includes("some.manifest.json")), "referenced must cite the manifest");
    assert(!by[K.orphan].keep && by[K.orphan].klass === "orphan-candidate", "orphan must be RETIRE/orphan-candidate");
    const retired = inv.rows.filter((r) => !r.keep).map((r) => r.keyId);
    assert(retired.length === 1 && retired[0] === K.orphan, "exactly one retire candidate (the orphan)");
    console.log("key-inventory self-test: PASS (root/revoked/operational/referenced KEEP; only the true orphan retires)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── CLI ──
function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes("--self-test")) { selfTest(); return; }
  const inv = inventory({
    rootDir: opt("--root") ?? ".",
    activeKeyId: opt("--active") ?? null,
    escrowDir: opt("--escrow-dir") ?? null,
    thorough: argv.includes("--thorough"),
  });
  if (argv.includes("--json")) { console.log(JSON.stringify(inv, null, 2)); return; }
  console.log(renderReport(inv));
}

main();
