#!/usr/bin/env node
// =============================================================================
// registry-index-cli — walkthrough §3 signer/verifier CLI for the certified
// package registry index (#72 / Phase-28).
//
// Thin, single-witness binding of real files to the SHIPPED decider
// (galerina-framework-app-kernel/dist/registry-index.js). This tool contains NO
// verification logic of its own: build/sign/verify all route through
// buildRegistryIndex / signRegistryIndex / verifyRegistryIndex / admitFromRegistry.
//
// FAIL-CLOSED REVIEW GATE (the #72 walkthrough's blocker 2, encoded as mechanism):
// an entry is signable ONLY on positive evidence — governance.reviewed === true,
// reviewedBy/reviewedAt present, a real sha256 content hash, and the authority
// fields (publisher/keyId/certificationLevel/riskRating). A stub manifest
// ("Pending governance review", hash "sha256:pending") is structurally
// un-signable: build/sign REFUSE with per-manifest reasons. Signing an index of
// stubs would convert "unverified" into "authoritatively asserted" — this tool
// makes that state unreachable rather than relying on operator discipline.
//
// Key custody: `sign` loads the authority key ONLY from the environment
// (GALERINA_REGISTRY_SIGNING_KEY_PEM_PATH + GALERINA_SIGNING_KEY_ID), never from
// the tree, and never prints key material — keyId and the index sha256 pin only.
// The agent builds this tool; the OWNER runs the real signing ceremony
// (docs/security/galerina-72-signed-registry-index-walkthrough.md §4).
//
// Modes:
//   build  --out <file> [--issued-at <iso>] [--registry-dir <dir>] [--registry <id>]
//   sign   --out <file> [--issued-at <iso>] [--registry-dir <dir>] [--registry <id>]
//          (re-builds from the manifests — the manifest tree is the single source
//           of truth; there is no sign-an-arbitrary-file mode by design)
//   verify --in <file> --pubkey <pem-path> --key-id <id> [--min-issued-at <iso>]
//   --self-test   hermetic: fixtures + ephemeral keys, no repo/file-system state
// =============================================================================

import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, createPublicKey } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REGISTRY_DIR = join(ROOT, "packages-galerina", "galerina-registry", "packages");
const DECIDER_PATH = join(ROOT, "packages-galerina", "galerina-framework-app-kernel", "dist", "registry-index.js");

const CERT_LEVELS = ["uncertified", "community", "verified", "certified", "enterprise", "regulated"];
const RISK_RATINGS = ["low", "medium", "high", "critical"];
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

// ── minimal manifest reader (only the package.galerina.yaml shape; no yaml dep) ──
export function parseManifest(text) {
  const out = { capabilities: [], effects: [], governance: {} };
  const scalar = (v) => {
    const t = v.trim();
    if (t === "null" || t === "") return null;
    if (t === "true") return true;
    if (t === "false") return false;
    return t.replace(/^["']/, "").replace(/["']$/, "");
  };
  let listKey = null;
  let inGovernance = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && listKey) { out[listKey].push(scalar(listItem[1])); continue; }
    const govKey = inGovernance && line.match(/^\s{2,}([A-Za-z][\w-]*):\s*(.*)$/);
    if (govKey && !line.match(/^\S/)) { out.governance[govKey[1]] = scalar(govKey[2]); continue; }
    const top = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (top) {
      const [, key, val] = top;
      inGovernance = key === "governance";
      listKey = val.trim() === "" && !inGovernance ? key : null;
      if (listKey && out[listKey] === undefined) out[listKey] = [];
      if (!listKey && !inGovernance) out[key] = scalar(val);
    }
  }
  return out;
}

// ── the fail-closed review gate: signable ONLY on positive evidence ──────────
export function reviewGate(manifest, path) {
  const reasons = [];
  const g = manifest.governance ?? {};
  if (g.reviewed !== true) reasons.push("governance.reviewed is not true (deny-by-default: unreviewed)");
  if (!g.reviewedBy) reasons.push("governance.reviewedBy is missing/null");
  if (!g.reviewedAt) reasons.push("governance.reviewedAt is missing/null");
  if (!manifest.name) reasons.push("name is missing");
  if (!manifest.version) reasons.push("version is missing");
  if (!SHA256_RE.test(String(manifest.hash ?? ""))) reasons.push(`hash '${manifest.hash}' is not a real sha256:<64-hex> content hash`);
  if (!manifest.publisher) reasons.push("publisher (authority-asserted) is missing");
  if (!manifest.keyId) reasons.push("keyId (expected manifest-signing key) is missing");
  if (!CERT_LEVELS.includes(manifest.certificationLevel)) reasons.push(`certificationLevel '${manifest.certificationLevel}' is not one of ${CERT_LEVELS.join("|")}`);
  if (!RISK_RATINGS.includes(manifest.riskRating)) reasons.push(`riskRating '${manifest.riskRating}' is not one of ${RISK_RATINGS.join("|")}`);
  if (manifest.installScript !== null && manifest.installScript !== undefined) reasons.push("installScript is declared (FUNGI-PKG-004: denied)");
  return { ok: reasons.length === 0, path, reasons };
}

function collectManifests(registryDir) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "package.galerina.yaml") found.push(p);
    }
  };
  walk(registryDir);
  return found.sort();
}

export function buildFromDir(decider, registryDir, registryId, issuedAt) {
  const manifests = collectManifests(registryDir);
  if (manifests.length === 0) throw new Error(`REFUSED: no package.galerina.yaml manifests under ${registryDir} — an empty certified index is not a thing (#72).`);
  const gates = manifests.map((p) => ({ p, m: parseManifest(readFileSync(p, "utf8")) })).map(({ p, m }) => ({ m, gate: reviewGate(m, p) }));
  const refused = gates.filter((x) => !x.gate.ok);
  if (refused.length > 0) {
    const detail = refused.map((x) => `  ${x.gate.path}\n${x.gate.reasons.map((r) => `    - ${r}`).join("\n")}`).join("\n");
    throw new Error(`REFUSED: ${refused.length} of ${gates.length} manifest(s) fail the review gate (fail-closed — signing a stub catalog converts "unverified" into "authoritatively asserted"):\n${detail}`);
  }
  const entries = gates.map(({ m }) => ({
    name: m.name, version: m.version, sourceHash: m.hash, publisher: m.publisher, keyId: m.keyId,
    certificationLevel: m.certificationLevel, riskRating: m.riskRating,
    capabilities: m.capabilities ?? [], effects: m.effects ?? [],
  }));
  return decider.buildRegistryIndex({ registry: registryId, issuedAt, entries });
}

const sha256hex = (s) => createHash("sha256").update(s).digest("hex");

function arg(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

async function loadDecider() {
  return import(pathToFileURL(DECIDER_PATH).href);
}

// ── self-test (hermetic: temp dir + ephemeral in-memory keys) ────────────────
const APPROVED_YAML = (name, hashHex, keyId) => `name: "${name}"
version: "1.0.0"
registry: "https://registry.galerina.dev"
capabilities:
  - audit.write
effects:
  - audit.write
installScript: null
hash: "sha256:${hashHex}"
publisher: "galerina-governance"
keyId: "${keyId}"
certificationLevel: "certified"
riskRating: "low"
governance:
  reviewed: true
  reviewedBy: "governance-authority"
  reviewedAt: "2026-07-18T00:00:00Z"
`;
const STUB_YAML = `name: "@galerina/stub"
version: "0.1.0"
installScript: null
hash: "sha256:pending"
signature: null
governance:
  reviewed: false
  reviewedBy: null
  reviewedAt: null
  notes: "Phase 28 scaffold. Pending governance review."
`;

async function selfTest() {
  const decider = await loadDecider();
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: cond === true });
  const tmp = mkdtempSync(join(tmpdir(), "reg-idx-selftest-"));
  try {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const forged = generateKeyPairSync("ed25519");
    const KEY_ID = "test-authority-1";
    const H1 = "a".repeat(64), H2 = "b".repeat(64);
    const { mkdirSync } = await import("node:fs");
    const put = (rel, text) => { const p = join(tmp, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p; };

    // T1 — the gate REFUSES the live stub shape with per-field reasons
    const stubGate = reviewGate(parseManifest(STUB_YAML), "stub");
    ok("gate refuses stub (reviewed:false)", stubGate.ok === false && stubGate.reasons.some((r) => r.includes("reviewed")));
    ok("gate refuses pending hash", stubGate.reasons.some((r) => r.includes("sha256:<64-hex>")));
    ok("gate refuses missing authority fields", stubGate.reasons.some((r) => r.includes("publisher")));

    // T2 — build over approved-only manifests: deterministic + sorted
    put("good/@g/a/package.galerina.yaml", APPROVED_YAML("@g/a", H1, "pkgkey-1"));
    put("good/@g/b/package.galerina.yaml", APPROVED_YAML("@g/b", H2, "pkgkey-2"));
    const issuedAt = "2026-07-18T12:00:00Z";
    const idx1 = buildFromDir(decider, join(tmp, "good"), "test-registry", issuedAt);
    const idx2 = buildFromDir(decider, join(tmp, "good"), "test-registry", issuedAt);
    ok("build is deterministic (byte-equal)", decider.registryIndexSigningInput(idx1) === decider.registryIndexSigningInput(idx2));
    ok("entries sorted by name", idx1.entries[0].name === "@g/a" && idx1.entries.length === 2);

    // T3 — build REFUSES when any stub is present (fail-closed, not skip-and-continue)
    put("mixed/@g/a/package.galerina.yaml", APPROVED_YAML("@g/a", H1, "pkgkey-1"));
    put("mixed/@g/stub/package.galerina.yaml", STUB_YAML);
    let refusedMixed = false;
    try { buildFromDir(decider, join(tmp, "mixed"), "test-registry", issuedAt); } catch (e) { refusedMixed = /REFUSED: 1 of 2/.test(String(e.message)); }
    ok("build refuses a mixed tree (one stub poisons the act)", refusedMixed);

    // T4 — sign + self-verify through the decider (single witness)
    const signFn = (msg) => edSign(null, Buffer.from(msg), privateKey).toString("base64");
    const signed = decider.signRegistryIndex(idx1, KEY_ID, signFn);
    const verifier = (msg, sigB64, keyId) => keyId !== KEY_ID ? "no-key" : edVerify(null, Buffer.from(msg), publicKey, Buffer.from(sigB64, "base64"));
    ok("sign → verify = verified", decider.verifyRegistryIndex(signed, verifier) === "verified");

    // T5 — tamper one signed fact → BAD_SIGNATURE
    const tampered = { ...signed, entries: [{ ...signed.entries[0], sourceHash: "sha256:" + "c".repeat(64) }, signed.entries[1]] };
    let code5 = null; try { decider.verifyRegistryIndex(tampered, verifier); } catch (e) { code5 = e.code; }
    ok("tampered entry → BAD_SIGNATURE", code5 === decider.ERR_REGISTRY_INDEX_BAD_SIGNATURE);

    // T6 — forked authority: signed by a different key claiming the same keyId → BAD_SIGNATURE; unknown keyId → NO_KEY
    const forgedSigned = decider.signRegistryIndex(idx1, KEY_ID, (msg) => edSign(null, Buffer.from(msg), forged.privateKey).toString("base64"));
    let code6a = null; try { decider.verifyRegistryIndex(forgedSigned, verifier); } catch (e) { code6a = e.code; }
    const alienSigned = decider.signRegistryIndex(idx1, "alien-key", (msg) => edSign(null, Buffer.from(msg), forged.privateKey).toString("base64"));
    let code6b = null; try { decider.verifyRegistryIndex(alienSigned, verifier); } catch (e) { code6b = e.code; }
    ok("forged authority (same keyId) → BAD_SIGNATURE", code6a === decider.ERR_REGISTRY_INDEX_BAD_SIGNATURE);
    ok("unknown authority keyId → NO_KEY", code6b === decider.ERR_REGISTRY_INDEX_NO_KEY);

    // T7 — the roadmap e2e: FORKED-but-validly-signed PACKAGE is REFUSED at admission
    const policy = { allowedLevels: ["certified", "enterprise", "regulated"] };
    const forkedPkg = decider.admitFromRegistry(signed, verifier, { name: "@g/a", version: "1.0.0", sourceHash: "sha256:" + "d".repeat(64) }, policy);
    ok("forked-but-signed package → HASH_MISMATCH refusal", forkedPkg.ok === false && forkedPkg.code === decider.ERR_REGISTRY_HASH_MISMATCH);
    const unlisted = decider.admitFromRegistry(signed, verifier, { name: "@g/evil", version: "1.0.0", sourceHash: "sha256:" + H1 }, policy);
    ok("unlisted package → PACKAGE_UNKNOWN refusal", unlisted.ok === false && unlisted.code === decider.ERR_REGISTRY_PACKAGE_UNKNOWN);
    const wrongSigner = decider.admitFromRegistry(signed, verifier, { name: "@g/a", version: "1.0.0", sourceHash: "sha256:" + H1, keyId: "not-pkgkey-1" }, policy);
    ok("package signed by un-pinned keyId → KEYID_MISMATCH refusal", wrongSigner.ok === false && wrongSigner.code === decider.ERR_REGISTRY_KEYID_MISMATCH);
    const admitted = decider.admitFromRegistry(signed, verifier, { name: "@g/a", version: "1.0.0", sourceHash: "sha256:" + H1, keyId: "pkgkey-1" }, policy);
    ok("genuine package admits", admitted.ok === true);

    // T8 — unsigned index → UNSIGNED; rollback floor → STALE
    let code8 = null; try { decider.verifyRegistryIndex(idx1, verifier); } catch (e) { code8 = e.code; }
    ok("unsigned index → UNSIGNED refusal", code8 === decider.ERR_REGISTRY_INDEX_UNSIGNED);
    let code8b = null; try { decider.verifyRegistryIndex(signed, verifier, "2027-01-01T00:00:00Z"); } catch (e) { code8b = e.code; }
    ok("older-than-floor index → STALE refusal (rollback defense)", code8b === decider.ERR_REGISTRY_INDEX_STALE);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const failed = checks.filter((c) => !c.pass);
  for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
  console.log(failed.length === 0
    ? `✅ registry-index-cli self-test: ${checks.length}/${checks.length} checks pass (hermetic, ephemeral keys).`
    : `❌ registry-index-cli self-test: ${failed.length}/${checks.length} FAILED.`);
  return failed.length === 0 ? 0 : 1;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (args.includes("--self-test")) process.exit(await selfTest());

  const decider = await loadDecider();
  const registryDir = arg(args, "--registry-dir", DEFAULT_REGISTRY_DIR);
  const registryId = arg(args, "--registry", "https://registry.galerina.dev");
  const issuedAt = arg(args, "--issued-at", new Date().toISOString());

  if (mode === "build" || mode === "sign") {
    const out = arg(args, "--out", null);
    if (!out) { console.error(`usage: registry-index-cli ${mode} --out <file> [--issued-at <iso>] [--registry-dir <dir>]`); process.exit(2); }
    let index;
    try {
      index = buildFromDir(decider, registryDir, registryId, issuedAt);
    } catch (e) {
      console.error(String(e.message));
      process.exit(1);
    }
    if (mode === "sign") {
      const keyPath = process.env.GALERINA_REGISTRY_SIGNING_KEY_PEM_PATH;
      const keyId = process.env.GALERINA_SIGNING_KEY_ID;
      if (!keyPath || !keyId) {
        console.error("REFUSED: sign requires GALERINA_REGISTRY_SIGNING_KEY_PEM_PATH + GALERINA_SIGNING_KEY_ID in the environment (owner ceremony — see docs/security/galerina-72-signed-registry-index-walkthrough.md §4). Key material never lives in the tree.");
        process.exit(1);
      }
      const privateKey = readFileSync(keyPath, "utf8");
      index = decider.signRegistryIndex(index, keyId, (msg) => edSign(null, Buffer.from(msg), privateKey).toString("base64"));
      const pub = createPublicKey(privateKey);
      const verifier = (msg, sigB64, kid) => kid !== keyId ? "no-key" : edVerify(null, Buffer.from(msg), pub, Buffer.from(sigB64, "base64"));
      decider.verifyRegistryIndex(index, verifier); // self-verify or throw BEFORE writing
      console.log(`signed by keyId '${keyId}' (key material not shown) — self-verified.`);
    }
    const bytes = JSON.stringify(index, null, 2) + "\n";
    writeFileSync(out, bytes);
    console.log(`${mode === "sign" ? "SIGNED" : "UNSIGNED"} index → ${out}`);
    console.log(`entries: ${index.entries.length} · issuedAt: ${index.issuedAt} · sha256 pin: ${sha256hex(bytes)}`);
    process.exit(0);
  }

  if (mode === "verify") {
    const file = arg(args, "--in", null);
    const pubkeyPath = arg(args, "--pubkey", null);
    const keyId = arg(args, "--key-id", null);
    const minIssuedAt = arg(args, "--min-issued-at", undefined);
    if (!file || !pubkeyPath || !keyId) { console.error("usage: registry-index-cli verify --in <file> --pubkey <pem> --key-id <id> [--min-issued-at <iso>]"); process.exit(2); }
    const index = JSON.parse(readFileSync(file, "utf8"));
    const pub = createPublicKey(readFileSync(pubkeyPath, "utf8"));
    const verifier = (msg, sigB64, kid) => kid !== keyId ? "no-key" : edVerify(null, Buffer.from(msg), pub, Buffer.from(sigB64, "base64"));
    try {
      decider.verifyRegistryIndex(index, verifier, minIssuedAt);
      console.log(`VERIFIED: keyId '${keyId}' · ${index.entries.length} entries · issuedAt ${index.issuedAt}`);
      process.exit(0);
    } catch (e) {
      console.error(`REFUSED (${e.code ?? "ERR"}): ${e.message}`);
      process.exit(1);
    }
  }

  console.log("registry-index-cli — build | sign | verify | --self-test  (see file header)");
  process.exit(mode ? 2 : 0);
}

main().catch((e) => { console.error(String(e?.stack ?? e)); process.exit(1); });
