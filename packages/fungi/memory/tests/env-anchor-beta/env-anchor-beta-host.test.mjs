// ENV-ANCHOR-BETA red tests, HOST half (RD-1413 critical path). RED FIRST (gcw-k3u108, 2026-10-26):
// red on 226aa1491 because packages/fungi/memory/host/env-anchor-beta-host.mjs does not exist yet.
// Covers EA-R6 (no secret value in errors, stderr or audit), EA-R7 (no ambient process.env, no defaults,
// undeclared name hidden), EA-R11 (fault after boot -> secret_unavailable, revocationEpoch advances),
// and pins the M6 (value in error) and M7 (fallback default) mutants.
// Zero-trust host placement (rejected options in ENVANCHOR-redtest-plan-469e6f49-20261025.md, k3u108 addendum):
// a thin JavaScript host shim beside the native unit, NOT a new TS file (TS is frozen reference). The shim
// only parses bytes into Int facts and builds a SecretsProvider-shaped object; every admit/refuse decision is
// taken by the native flows in env-anchor-beta.fungi.
// Host API pinned here:
//   loadEnvAnchorBeta({ envPath, manifest, argv, modeClass, faultProbe }) -> { provider, auditEvents }
//     manifest: frozen array of { name, hexBytes } (exactly these two fields; any other field refuses 111).
//     argv: the process argv as data; any manifest name appearing in it refuses 182 (never read as a source).
//     modeClass: 0 owner-only, 1 group/world-readable, 2 UNKNOWN (the caller's stat result, typed).
//     faultProbe: () => boolean, consulted on every has/use; true or a throw latches the provider faulted.
//   On refusal it throws EnvAnchorRefused with { code, key, rule } only. code is the native packed code.
// Synthetic data only: every .env here is written to a fresh temp dir with random canary bytes.
// The real .env is NEVER read. NON_AUTHORIZING.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const HOST = join(MEM, "host", "env-anchor-beta-host.mjs");
const KERNEL = join(REPO, "packages-ts", "galerina-framework-app-kernel", "dist", "index.js");

async function host() {
  assert.equal(existsSync(HOST), true, "host shim missing: " + HOST);
  const mod = await import(pathToFileURL(HOST).href);
  assert.equal(typeof mod.loadEnvAnchorBeta, "function", "loadEnvAnchorBeta exported");
  assert.equal(typeof mod.EnvAnchorRefused, "function", "EnvAnchorRefused exported");
  return mod;
}

function canaryHex(n) {
  return randomBytes(n).toString("hex");
}

function withEnv(text, fn) {
  const dir = mkdtempSync(join(tmpdir(), "eabh-"));
  const p = join(dir, "synthetic.env");
  try {
    writeFileSync(p, text);
    chmodSync(p, 0o600);
    return fn(p, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const NAME_A = "EAB_SYNTH_KEY_A";
const NAME_B = "EAB_SYNTH_KEY_B";
const MANIFEST = Object.freeze([Object.freeze({ name: NAME_A, hexBytes: 32 }), Object.freeze({ name: NAME_B, hexBytes: 16 })]);

function base(overrides) {
  return Object.assign({ manifest: MANIFEST, argv: [], modeClass: 0, faultProbe: () => false }, overrides);
}

// Every rendering of an error a log line or a crash dump could carry.
function renderings(err) {
  const own = {};
  for (const k of Object.getOwnPropertyNames(err)) own[k] = err[k];
  return [String(err), err.message || "", err.stack || "", JSON.stringify(own), JSON.stringify(err)].join("\n");
}

function assertNoLeak(text, canary, where) {
  assert.equal(text.includes(canary), false, where + " carries the canary value");
  assert.equal(text.includes(canary.slice(0, 8)), false, where + " carries a canary prefix");
  assert.equal(text.includes(Buffer.from(canary, "hex").toString("base64")), false, where + " carries the canary as base64");
}

async function refusal(mod, opts) {
  try {
    await mod.loadEnvAnchorBeta(opts);
  } catch (err) {
    assert.ok(err instanceof mod.EnvAnchorRefused, "refusal is typed EnvAnchorRefused, got " + String(err && err.name));
    return err;
  }
  assert.fail("expected a refusal");
}

// ---------------- EA-R6 / M6: value never in errors, audit or stderr ----------------
test("EA-R6/M6 malformed, duplicate and unknown-key refusals carry key and rule only, never the value", async () => {
  const mod = await host();
  const a = canaryHex(32);
  const b = canaryHex(16);
  const bad = canaryHex(31);
  const cases = [
    [NAME_A + "=" + bad + "\n" + NAME_B + "=" + b + "\n", 177, bad, "malformed"],
    [NAME_A + "=" + a + "\n" + NAME_A + "=" + a + "\n" + NAME_B + "=" + b + "\n", 178, a, "duplicate"],
    [NAME_A + "=" + a + "\n" + NAME_B + "=" + b + "\nEAB_SYNTH_EXTRA=" + bad + "\n", 179, bad, "unknown key"],
  ];
  for (const [text, code, canary, label] of cases) {
    await withEnv(text, async (envPath) => {
      const err = await refusal(mod, base({ envPath }));
      assert.equal(err.code, code, label + " refuses " + code);
      assert.deepEqual(Object.keys(err).filter((k) => k !== "name").sort(), ["code", "key", "rule"], label + " carries code/key/rule only");
      assertNoLeak(renderings(err), canary, label + " error");
      assertNoLeak(renderings(err), b, label + " error (other key)");
    });
  }
});

test("EA-R6 audit events after a good boot and a use never carry the value", async () => {
  const mod = await host();
  const a = canaryHex(32);
  const b = canaryHex(16);
  await withEnv(NAME_A + "=" + a + "\n" + NAME_B + "=" + b + "\n", async (envPath) => {
    const r = await mod.loadEnvAnchorBeta(base({ envPath }));
    let seen = 0;
    r.provider.use(NAME_A, (v) => { seen = v.length; });
    assert.equal(seen, 32, "decoded 32 bytes handed to use()");
    const audit = JSON.stringify(r.auditEvents());
    assertNoLeak(audit, a, "audit");
    assertNoLeak(audit, b, "audit");
  });
});

test("EA-R6 an uncaught refusal in a child process prints no value to stderr or stdout", () => {
  const bad = canaryHex(31);
  const dir = mkdtempSync(join(tmpdir(), "eabh-"));
  try {
    const envPath = join(dir, "synthetic.env");
    writeFileSync(envPath, NAME_A + "=" + bad + "\n" + NAME_B + "=" + canaryHex(16) + "\n");
    chmodSync(envPath, 0o600);
    const script = join(dir, "child.mjs");
    writeFileSync(script, "import { loadEnvAnchorBeta } from " + JSON.stringify(pathToFileURL(HOST).href) + ";\n" +
      "await loadEnvAnchorBeta({ envPath: " + JSON.stringify(envPath) + ", manifest: " + JSON.stringify(MANIFEST) +
      ", argv: [], modeClass: 0, faultProbe: () => false });\n");
    const r = spawnSync(process.execPath, [script], { encoding: "utf8", cwd: dir, timeout: 300000 });
    assert.notEqual(r.status, 0, "the child must not boot");
    const out = (r.stdout || "") + (r.stderr || "");
    assert.ok(out.includes("EnvAnchorRefused") && out.includes("177"), "child died on the typed 177 refusal, not on something else: " + out.slice(0, 400));
    assertNoLeak((r.stdout || "") + (r.stderr || ""), bad, "child output");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------- EA-R7 / M7: no ambient env, no defaults, undeclared hidden ----------------
test("EA-R7/M7 a key missing from the file refuses 175 even when process.env carries it; no default field accepted", async () => {
  const mod = await host();
  const ambient = canaryHex(16);
  process.env[NAME_B] = ambient;
  try {
    await withEnv(NAME_A + "=" + canaryHex(32) + "\n", async (envPath) => {
      const err = await refusal(mod, base({ envPath }));
      assert.equal(err.code, 175, "missing key refuses 175; ambient process.env is never a source");
      assert.equal(err.key, NAME_B);
      assertNoLeak(renderings(err), ambient, "missing-key error");
    });
  } finally {
    delete process.env[NAME_B];
  }
  await withEnv(NAME_A + "=" + canaryHex(32) + "\n", async (envPath) => {
    const withDefault = [MANIFEST[0], { name: NAME_B, hexBytes: 16, default: canaryHex(16) }];
    const err = await refusal(mod, base({ envPath, manifest: withDefault }));
    assert.equal(err.code, 111, "a manifest entry with any extra field (default) refuses 111");
  });
});

test("EA-R7 boot never writes process.env; undeclared name is hidden; static shim has no process.env or process.argv", async () => {
  const mod = await host();
  await withEnv(NAME_A + "=" + canaryHex(32) + "\n" + NAME_B + "=" + canaryHex(16) + "\n", async (envPath) => {
    const r = await mod.loadEnvAnchorBeta(base({ envPath }));
    assert.equal(Object.prototype.hasOwnProperty.call(process.env, NAME_A), false, "boot must not export to process.env");
    assert.equal(Object.prototype.hasOwnProperty.call(process.env, NAME_B), false, "boot must not export to process.env");
    assert.equal(r.provider.has("EAB_SYNTH_UNDECLARED"), false, "undeclared name is absent");
    let called = false;
    r.provider.use("EAB_SYNTH_UNDECLARED", () => { called = true; });
    assert.equal(called, false, "use() never runs fn for an undeclared name");
  });
  const src = readFileSync(HOST, "utf8");
  assert.equal(/process\s*\.\s*env|process\s*\[\s*["']env/.test(src), false, "shim never touches process.env");
  assert.equal(/process\s*\.\s*argv/.test(src), false, "shim never reads process.argv (argv arrives as data only)");
  for (const flow of ["envFileAdmit", "envKeyAdmit", "envAadAdmit", "envSecretAccess"]) {
    assert.ok(src.includes(flow), "shim routes decisions through native flow " + flow);
  }
});

test("EA-R9 host: a manifest name in argv refuses 182 before the file is read", async () => {
  const mod = await host();
  const err = await refusal(mod, base({ envPath: join(tmpdir(), "eabh-does-not-exist-" + canaryHex(6)), argv: ["node", "app", "--" + NAME_A + "=x"] }));
  assert.equal(err.code, 182);
});

// ---------------- EA-R11: fault after boot ----------------
test("EA-R11 a fault after boot latches: has() false, use() silent, epoch advances, gate admit() refuses secret_unavailable", async () => {
  const mod = await host();
  const kernel = await import(pathToFileURL(KERNEL).href);
  assert.equal(typeof kernel.createSecretGate, "function", "app-kernel dist exports createSecretGate");
  await withEnv(NAME_A + "=" + canaryHex(32) + "\n" + NAME_B + "=" + canaryHex(16) + "\n", async (envPath) => {
    let fault = false;
    const r = await mod.loadEnvAnchorBeta(base({ envPath, faultProbe: () => fault }));
    const gate = kernel.createSecretGate(r.provider);
    assert.equal(gate.admit([NAME_A]), null, "healthy provider admits");
    const e0 = r.provider.revocationEpoch();
    assert.equal(Number.isSafeInteger(e0), true, "epoch is a safe integer");
    fault = true;
    assert.equal(r.provider.has(NAME_A), false, "faulted has() is false");
    const e1 = r.provider.revocationEpoch();
    assert.ok(e1 > e0, "epoch advances on fault");
    fault = false;
    assert.equal(r.provider.has(NAME_A), false, "fault latches; no recovery without a fresh boot");
    let called = false;
    r.provider.use(NAME_A, () => { called = true; });
    assert.equal(called, false, "faulted use() never runs fn");
    assert.equal(gate.admit([NAME_A]), "secret_unavailable", "gate refuses 503 secret_unavailable");
    assert.equal(r.provider.revocationEpoch(), e1, "epoch moves once per fault, not per call");
  });
  await withEnv(NAME_A + "=" + canaryHex(32) + "\n" + NAME_B + "=" + canaryHex(16) + "\n", async (envPath) => {
    const r = await mod.loadEnvAnchorBeta(base({ envPath, faultProbe: () => { throw new Error("probe"); } }));
    assert.equal(r.provider.has(NAME_A), false, "a throwing probe counts as a fault (UNKNOWN refuses)");
  });
});