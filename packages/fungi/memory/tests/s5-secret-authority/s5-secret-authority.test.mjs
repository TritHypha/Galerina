// S5 (closure path): secret authority out of TypeScript. RED TESTS FIRST (gcw-s5a, 2026-10-22).
// Zero-trust choice (preflight-s5-01-8f5158ff): option A, a thin NON-AUTHORIZING TS loader.
// The verdict at gate 9.5 is the return code of the built secret-gate WebAssembly admit export.
// TS only maps host observations onto the documented Int tags; any unlisted code, a load failure,
// a missing artifact or a hash mismatch refuses (typed UNKNOWN), never admits.
// Rejected: B fence-only (TS createSecretGate stays live), C self-hosted presence-fold twin
// (no epoch/revocation codes), D TS shadow decider on the live path (two deciders = bypass surface),
// and any kernel option that injects artifact bytes (a lying-artifact door).
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const GALERINA = join(REPO, "galerina.mjs");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const GATE = join(MEM, "src", "secret-gate.fungi");
const PORT = join(MEM, "src", "secrets-provider-port.fungi");
const AK = join(REPO, "packages-ts", "galerina-framework-app-kernel");
const KERNEL_TS = join(AK, "src", "kernel.ts");
const HOLD_PIN_TS = join(AK, "src", "hold-pin.ts");
const LOADER_TS = join(AK, "src", "fungi-secret-gate-loader.ts");
const LOADER_JS = join(AK, "dist", "fungi-secret-gate-loader.js");
const ASSET = join(AK, "assets", "secret-gate-admit.wasm");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  assert.notEqual(first, -1, "version marker");
  return src.slice(first + marker.length);
}

function flatGateSource(unitText) {
  const unit = unitText === undefined ? readFileSync(GATE, "utf8") : unitText;
  assert.equal(unit.split(CB_IMPORT).length, 2, "c-boundary import once");
  assert.equal(unit.split(RCP_IMPORT).length, 2, "release-commit-point import once");
  const rest = stripVersion(unit.split(CB_IMPORT).join("").split(RCP_IMPORT).join(""));
  return readFileSync(BOUNDARY, "utf8") + "\n" + stripVersion(readFileSync(RCP, "utf8")) + "\n" + rest;
}

// Build the flattened secret-gate unit to WebAssembly under a unique build name; clean up after.
function buildGateWasm(unitText) {
  const dir = mkdtempSync(join(tmpdir(), "s5-gate-"));
  const file = uniqueFungiFile(dir);
  const name = file.slice(dir.length + 1, -".fungi".length);
  writeFileSync(file, flatGateSource(unitText));
  const outs = ["wasm", "wat", "lmanifest"].map((ext) => join(REPO, "build", name + "." + ext));
  try {
    const r = spawnSync(process.execPath, [GALERINA, "build", file], { encoding: "utf8", cwd: REPO, timeout: 180000 });
    assert.equal(r.status, 0, "galerina build failed: " + (r.stdout || "") + (r.stderr || ""));
    assert.equal(existsSync(outs[0]), true, "build produced no wasm");
    return new Uint8Array(readFileSync(outs[0]));
  } finally {
    for (const p of outs) rmSync(p, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}

async function loader() {
  assert.equal(existsSync(LOADER_TS), true, "S5 loader source missing: " + LOADER_TS);
  assert.equal(existsSync(LOADER_JS), true, "S5 loader not built (tsc app-kernel): " + LOADER_JS);
  return import(pathToFileURL(LOADER_JS).href);
}

function importsOf(src) {
  return [...src.matchAll(/^\s*import\s[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[0]);
}

// ---------------- providers (synthetic only; no real credentials) ----------------
const bytes = new Uint8Array([1, 2, 3]);
function provider(present, epoch) {
  const p = {
    has(name) {
      const v = present[name];
      if (v === "THROW") throw new Error("disposed");
      return v;
    },
    use(name, fn) { if (present[name] === true) fn(bytes); },
  };
  if (epoch !== "LEGACY") p.revocationEpoch = () => { if (epoch === "THROW") throw new Error("x"); return epoch; };
  return p;
}

// Expected verdicts follow suite 34 (secret-gate.fungi admit): packed 100 admits, all else refuses.
const GRID = [
  ["no provider, empty require", undefined, [], null],
  ["no provider, one required", undefined, ["a"], "secret_unavailable"],
  ["epoch provider, empty require", provider({}, 0), [], null],
  ["epoch provider, present", provider({ a: true }, 3), ["a"], null],
  ["epoch provider, two present", provider({ a: true, b: true }, 3), ["a", "b"], null],
  ["second required absent", provider({ a: true, b: false }, 3), ["a", "b"], "secret_unavailable"],
  ["absent", provider({ a: false }, 3), ["a"], "secret_unavailable"],
  ["has throws", provider({ a: "THROW" }, 3), ["a"], "secret_unavailable"],
  ["has returns string true", provider({ a: "true" }, 3), ["a"], "secret_unavailable"],
  ["has returns 1", provider({ a: 1 }, 3), ["a"], "secret_unavailable"],
  ["has returns undefined", provider({}, 3), ["a"], "secret_unavailable"],
  ["legacy provider, empty require (Fungi 103)", provider({}, "LEGACY"), [], "secret_unavailable"],
  ["legacy provider, present", provider({ a: true }, "LEGACY"), ["a"], "secret_unavailable"],
  ["epoch throws", provider({ a: true }, "THROW"), ["a"], "secret_unavailable"],
  ["epoch negative", provider({ a: true }, -1), ["a"], "secret_unavailable"],
  ["epoch NaN", provider({ a: true }, Number.NaN), ["a"], "secret_unavailable"],
  ["epoch not integer", provider({ a: true }, 1.5), ["a"], "secret_unavailable"],
  ["hole in required list", provider({ a: true }, 3), [undefined], "secret_unavailable"],
];

// ---------------- S5-R1: kernel.ts no longer decides with TS createSecretGate ----------------
test("S5-R1a gate 9.5 admits only through the Fungi WebAssembly loader", () => {
  const src = readFileSync(KERNEL_TS, "utf8");
  assert.equal(/secretGate\.admit\(/.test(src), false, "gate 9.5 still calls TS secretGate.admit");
  assert.equal(importsOf(src).some((l) => l.includes("\"./fungi-secret-gate-loader.js\"")), true, "kernel.ts must import the S5 loader");
});

test("S5-R1b kernel.ts module graph does not reach TS createSecretGate", () => {
  const src = readFileSync(KERNEL_TS, "utf8");
  assert.equal(importsOf(src).some((l) => /\bcreateSecretGate\b/.test(l)), false, "kernel.ts imports createSecretGate");
  assert.equal(/\bcreateSecretGate\s*\(/.test(src), false, "kernel.ts calls createSecretGate");
});

// ---------------- S5-R2: verdict equals WebAssembly admit; artifact pinned ----------------
test("S5-R2a shipped artifact is pinned and equals a fresh build of secret-gate.fungi", async () => {
  const L = await loader();
  assert.equal(existsSync(ASSET), true, "pinned artifact missing: " + ASSET);
  const shipped = new Uint8Array(readFileSync(ASSET));
  assert.equal(L.SECRET_GATE_ADMIT_SHA256, sha256(shipped), "pinned sha must match shipped asset");
  assert.equal(sha256(buildGateWasm()), sha256(shipped), "shipped asset must be a reproducible build of the landed unit");
});

test("S5-R2b loader verdict matches the documented admit grid", async () => {
  const L = await loader();
  const shipped = new Uint8Array(readFileSync(ASSET));
  const res = L.loadFungiSecretGate({ wasmBytes: shipped, expectedSha256: L.SECRET_GATE_ADMIT_SHA256 });
  assert.equal(res.ok, true, "load of pinned artifact: " + res.code);
  for (const [label, p, req, want] of GRID) {
    assert.equal(res.gate.admit(p, req), want, label);
  }
});

test("S5-R2c tampered artifact refuses at load with a typed code", async () => {
  const L = await loader();
  const shipped = new Uint8Array(readFileSync(ASSET));
  const t = new Uint8Array(shipped);
  t[t.length - 1] ^= 0x01;
  const res = L.loadFungiSecretGate({ wasmBytes: t, expectedSha256: L.SECRET_GATE_ADMIT_SHA256 });
  assert.equal(res.ok, false);
  assert.equal(res.code, "FUNGI-SECRET-009");
  assert.equal("gate" in res, false, "a refused load exposes no gate");
});

test("S5-R2d an artifact returning an unlisted code refuses (never admits)", async () => {
  const L = await loader();
  const unit = readFileSync(GATE, "utf8");
  const needle = "  return finish(0, true)\n}\n\npure flow deliverPreHandoff(";
  assert.equal(unit.split(needle).length, 2, "mutant needle unique");
  const lying = buildGateWasm(unit.replace(needle, "  return finish(5, true)\n}\n\npure flow deliverPreHandoff("));
  const res = L.loadFungiSecretGate({ wasmBytes: lying, expectedSha256: sha256(lying) });
  assert.equal(res.ok, true, "self-consistent mutant loads (the pin, not the loader, rejects it in the kernel)");
  assert.equal(res.gate.admit(provider({ a: true }, 3), ["a"]), "secret_unavailable", "packed 105 is unlisted");
  assert.equal(res.gate.admit(undefined, []), null, "empty-no-provider path still admits via finish(0)");
});

// ---------------- S5-R3: missing artifact refuses ----------------
test("S5-R3 missing or empty artifact refuses with typed UNKNOWN", async () => {
  const L = await loader();
  for (const wasmBytes of [undefined, null, new Uint8Array(0), "secret-gate-admit.wasm"]) {
    const res = L.loadFungiSecretGate({ wasmBytes, expectedSha256: L.SECRET_GATE_ADMIT_SHA256 });
    assert.equal(res.ok, false, String(wasmBytes));
    assert.equal(res.code, "FUNGI-SECRET-008", String(wasmBytes));
  }
  const noPin = L.loadFungiSecretGate({ wasmBytes: new Uint8Array(readFileSync(ASSET)) });
  assert.equal(noPin.ok, false, "a load without an expected hash refuses");
});

// ---------------- S5-R4: HOLD pin unaffected ----------------
test("S5-R4 hold-pin stays non-authorizing and does not reach the loader", () => {
  const src = readFileSync(HOLD_PIN_TS, "utf8");
  assert.equal(importsOf(src).some((l) => /fungi-secret-gate-loader|secret-gate\.js/.test(l)), false);
  assert.equal(existsSync(LOADER_TS), true, "S5 loader must exist for this pin to mean anything");
});

// ---------------- S5-R5: Fungi SecretsProvider port (X-KG12), per secret ----------------
function invokePort(args) {
  assert.equal(existsSync(PORT), true, "Fungi SecretsProvider port missing: " + PORT);
  const unit = readFileSync(PORT, "utf8");
  const dir = mkdtempSync(join(tmpdir(), "s5-port-"));
  const file = uniqueFungiFile(dir);
  writeFileSync(file, readFileSync(BOUNDARY, "utf8") + "\n" + stripVersion(readFileSync(RCP, "utf8")) + "\n" + stripVersion(unit.split(CB_IMPORT).join("").split(RCP_IMPORT).join("")));
  try {
    const r = spawnSync(process.execPath, [GALERINA, "run", file, "--invoke", "portAccess", ...args.map(String)], { encoding: "utf8", cwd: REPO, timeout: 120000 });
    const text = (r.stdout || "") + (r.stderr || "");
    assert.equal(r.status, 0, "invoke failed: " + text);
    // Same value parse as suite 34 invoke(): "=> N" or a bare trailing integer.
    const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
    assert.notEqual(m, null, "no value: " + text);
    return Number(m[1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("S5-R5 per-secret port: only a declared name with a present provider is reachable", () => {
  // portAccess(declaredClass, declaredToken, providerClass, providerPresent)
  assert.equal(invokePort([0, 1, 0, 1]), 100, "declared + provider");
  assert.equal(invokePort([0, 0, 0, 1]), 112, "undeclared name refuses (12 Undeclared)");
  assert.equal(invokePort([0, 1, 0, 0]), 119, "provider absent refuses (19 ProviderAbsent)");
  assert.equal(invokePort([0, 0, 0, 0]), 112, "undeclared is decided before provider presence (no presence leak)");
  assert.equal(invokePort([0, 0, 0, 7]), 111, "unlisted provider token is Unlisted even for an undeclared name");
  assert.equal(invokePort([0, 2, 0, 0]), 111, "unlisted declared token is Unlisted even when the provider is absent");
  assert.equal(invokePort([0, 2, 0, 1]), 111, "unlisted declared token");
  assert.equal(invokePort([0, 1, 0, 7]), 111, "unlisted provider token");
  assert.equal(invokePort([3, 1, 0, 1]), 110, "foreign class (NaN) on declared");
  assert.equal(invokePort([0, 1, 11, 1]), 111, "unlisted class on provider");
});
// ---------------- S5-R6: ack / noteUnknown / delivery verdicts must come from the WebAssembly ----------------
// RED TESTS FIRST (gcw-s5d, 2026-10-22). Before kernel.ts can route ack, noteUnknown and
// getSecret through the pinned Fungi secret-gate WebAssembly (and so drop createSecretGate,
// S5-R1b), the shipped exports must reproduce the lease transitions the kernel has today
// (ReleaseCommitAuthority, frozen TS reference). These differentials call the SHIPPED asset
// directly; the TS reference is only the oracle of current kernel behaviour, never a decider.
// lease: 0 unused 1 released 2 acknowledged 3 fenced 4 delivery-unknown (release-commit-point.fungi)
// packed outcome = 100 + outcome: 1 acknowledged 2 fenced 3 replay 4 stale 5 missing 6 delivery-unknown 8 no-op
const LEASE = ["unused", "released", "acknowledged", "fenced", "delivery-unknown"];
const OUTCOME = { 101: "acknowledged", 102: "fenced", 103: "replay", 104: "stale", 105: "missing" };

function shippedExports() {
  const mod = new WebAssembly.Module(new Uint8Array(readFileSync(ASSET)));
  assert.equal(WebAssembly.Module.imports(mod).length, 0, "asset must import nothing");
  return new WebAssembly.Instance(mod, {}).exports;
}

async function referenceAuthority() {
  const RCP_JS = join(AK, "dist", "release-commit-point.js");
  assert.equal(existsSync(RCP_JS), true, "app-kernel not built: " + RCP_JS);
  return (await import(pathToFileURL(RCP_JS).href)).ReleaseCommitAuthority;
}

// Drive a fresh reference authority to a lease state for opId (synthetic ids and epochs only).
function leaseIn(Authority, state, opId) {
  const a = new Authority();
  const lease = a.mint(opId, 3);
  if (state === "released" || state === "acknowledged" || state === "delivery-unknown") {
    assert.equal(a.consume(lease.leaseId, lease.token, 3), "released");
  }
  if (state === "acknowledged") a.acknowledgeMinted(opId);
  if (state === "delivery-unknown") a.markUnknown(opId);
  if (state === "fenced") a.fence(lease.leaseId);
  assert.equal(a.status(opId).state, state, "reference setup " + state);
  return a;
}

// gcw-s5d finding: gateNoteUndelivered is revokeDelivery (acknowledged -> delivery-unknown, released no-op;
// pinned by suite 34). The kernel noteUnknown is the opposite edge (released-but-unacked -> delivery-unknown,
// acknowledged no-op), so it needs its own export, gateNoteUnknown. Reusing revokeDelivery would flip
// kernel behaviour; changing revokeDelivery would break the suite-34 contract. Both are rejected.
test("S5-R6a WebAssembly noteUnknown verdict reproduces the kernel lease transition", async () => {
  const e = shippedExports();
  const Authority = await referenceAuthority();
  assert.equal(typeof e.gateNoteUnknown, "function", "gateNoteUnknown export (kernel noteUnknown edge)");
  assert.equal(e.gateNoteUndelivered(0, 2), 106, "revokeDelivery edge unchanged (suite 34)");
  assert.equal(e.gateNoteUndelivered(0, 1), 108, "revokeDelivery edge unchanged (suite 34)");
  const diffs = [];
  for (let s = 0; s < LEASE.length; s += 1) {
    const ref = leaseIn(Authority, LEASE[s], "s5-r6a-" + s);
    ref.markUnknown("s5-r6a-" + s);
    const want = ref.status("s5-r6a-" + s).state;
    const packed = e.gateNoteUnknown(0, s);
    const got = packed === 106 ? "delivery-unknown" : packed === 108 ? LEASE[s] : "UNLISTED:" + String(packed);
    if (got !== want) diffs.push(LEASE[s] + ": kernel->" + want + " wasm->" + got + " (" + String(packed) + ")");
    // The kernel records a delivery-unknown audit event only on the released edge; every other
    // listed lease must be the no-op 108 so the WebAssembly never reports a fresh transition.
    if ((packed === 106) !== (LEASE[s] === "released")) diffs.push(LEASE[s] + ": transition reported " + String(packed));
  }
  assert.deepEqual(diffs, [], "noteUnknown parity");
  assert.equal(e.gateNoteUnknown(0, 9), 111, "unlisted lease refuses 11");
  assert.equal(e.gateNoteUnknown(0, -1), 111, "negative lease refuses 11");
  assert.equal(e.gateNoteUnknown(3, 1), 110, "foreign class (NaN) refuses 10, never transitions");
  assert.equal(e.gateNoteUnknown(11, 1), 111, "unlisted class refuses 11");
});

test("S5-R6b WebAssembly ack verdict reproduces the kernel acknowledgeMinted outcome", async () => {
  const e = shippedExports();
  const Authority = await referenceAuthority();
  const diffs = [];
  for (let s = 0; s < LEASE.length; s += 1) {
    const ref = leaseIn(Authority, LEASE[s], "s5-r6b-" + s);
    const want = ref.acknowledgeMinted("s5-r6b-" + s);
    // present, token match, epoch present + match: the kernel acks with the token it minted.
    // auditCommitted = 1: the kernel acks only after publication (rd1415 ack-after-publication).
    const packed = e.gateAcknowledge(0, 1, 0, 1, 0, 1, 0, 3, 0, 1, 0, s, 0, 1);
    const got = OUTCOME[packed] ?? "UNLISTED:" + String(packed);
    if (got !== want) diffs.push(LEASE[s] + ": kernel->" + want + " wasm->" + got);
  }
  const missing = new Authority();
  const wantMissing = missing.acknowledgeMinted("s5-r6b-none");
  const gotMissing = OUTCOME[e.gateAcknowledge(0, 0, 0, 1, 0, 1, 0, 3, 0, 1, 0, 0, 0, 1)];
  if (gotMissing !== wantMissing) diffs.push("missing: kernel->" + wantMissing + " wasm->" + gotMissing);
  assert.deepEqual(diffs, [], "ack parity");
  assert.notEqual(e.gateAcknowledge(0, 1, 0, 1, 0, 1, 0, 3, 0, 1, 0, 1, 0, 0), 101, "never acknowledged before audit commit");
});

test("S5-R6c MB-06: a successful delivery is DELIVERY_UNKNOWN and can never be acknowledged", () => {
  // Phillip 2026-10-22 option (a): the kernel adopts MB-06. A successful handoff maps to 106
  // DELIVERY_UNKNOWN (lease delivery-unknown); there is no released-pending-ack verdict, and a
  // later ACK is refused, never 101 acknowledged.
  const e = shippedExports();
  const pre = e.deliverPreHandoff(0, 1, 0, 1, 0, 1, 0, 3, 0, 3, 0, 0, 0, 0, 0, 1);
  assert.equal(pre, 100, "pre-handoff admits a declared, present, epoch-stable secret");
  // callback once-void, wipe ok, cleanup NotRequired, guard tokens 1, lease unused, no revoke, valid.
  const post = e.deliverPostHandoff(0, pre, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1);
  assert.equal(post, 106, "successful handoff is DELIVERY_UNKNOWN (MB-06), got " + String(post));
  const ack = e.gateAcknowledge(0, 1, 0, 1, 0, 1, 0, 3, 0, 1, 0, 4, 0, 1);
  assert.notEqual(ack, 101, "ACK after a delivery-unknown handoff must never reach acknowledged");
  assert.ok(Number.isInteger(ack) && ack >= 100 && ack <= 199, "ACK refusal is a listed typed code: " + String(ack));
});
// ---------------- S5-R7: getSecret/noteUnknown decided by the WebAssembly (gcw-s5f, RED FIRST) ----------------
// Routing round plan: TS keeps IO only (provider.use, staging copy, wipe); every lease decision on the
// getSecret/noteUnknown path is a verdict of the pinned secret-gate WebAssembly (deliverPreHandoff,
// gateNoteUnknown) reached through the loader. kernel.ts builds createSecretReleaseShell(provider,
// { decider: fungiGate }) and stops importing createSecretGate (S5-R1b goes green).
// Zero-trust choices: the shell has NO default decider (construction without one throws); an unlisted
// noteUnknown verdict fails toward delivery-unknown (never leaves a released lease open); an unlisted
// pre verdict refuses before provider.use. Rejected: wrapping createSecretGate behind a new name (games
// R1b, TS still decides); a TS fallback decider when the WebAssembly refuses (two deciders = bypass);
// leaving the lease released on an unlisted noteUnknown verdict (keeps a window open after bytes left).
const SECRET_GATE_JS = join(AK, "dist", "secret-gate.js");
const SYN_PRE_OK = Object.freeze({ declared: true, providerPresent: true, epochPresent: true, epochMint: 3, epochUse: 3, epochMoved: false, revoked: false, currentlyValid: true });

test("S5-R7a loader noteUnknownVerdict is the WebAssembly gateNoteUnknown verdict", async () => {
  const L = await loader();
  const res = L.loadFungiSecretGate({ wasmBytes: new Uint8Array(readFileSync(ASSET)), expectedSha256: L.SECRET_GATE_ADMIT_SHA256 });
  assert.equal(res.ok, true, "load: " + res.code);
  assert.equal(typeof res.gate.noteUnknownVerdict, "function", "gate.noteUnknownVerdict");
  const want = ["no-op", "delivery-unknown", "no-op", "no-op", "no-op"];
  for (let s = 0; s < want.length; s += 1) assert.equal(res.gate.noteUnknownVerdict(s), want[s], LEASE[s]);
  for (const bad of [9, -1, 1.5, "1", undefined, Number.NaN, 2 ** 40]) {
    assert.equal(res.gate.noteUnknownVerdict(bad), "UNKNOWN", "unlisted lease " + String(bad));
  }
});

test("S5-R7b loader preHandoffVerdict is the WebAssembly deliverPreHandoff verdict", async () => {
  const L = await loader();
  const res = L.loadFungiSecretGate({ wasmBytes: new Uint8Array(readFileSync(ASSET)), expectedSha256: L.SECRET_GATE_ADMIT_SHA256 });
  assert.equal(res.ok, true, "load: " + res.code);
  assert.equal(typeof res.gate.preHandoffVerdict, "function", "gate.preHandoffVerdict");
  assert.equal(res.gate.preHandoffVerdict(SYN_PRE_OK), "admit", "declared, present, epoch-stable, valid");
  const refusals = [
    ["undeclared", { declared: false }],
    ["provider absent", { providerPresent: false }],
    ["epoch absent", { epochPresent: false }],
    ["mint != use", { epochUse: 4 }],
    ["epoch moved", { epochMoved: true }],
    ["revoked", { revoked: true }],
    ["no longer valid", { currentlyValid: false }],
    ["NaN epoch", { epochUse: Number.NaN }],
    ["string epoch", { epochMint: "3" }],
    ["huge epoch", { epochMint: 2 ** 40, epochUse: 2 ** 40 }],
    ["truthy non-boolean declared", { declared: "yes" }],
    ["numeric provider token", { providerPresent: 1 }],
    ["truthy revoked flag is not false", { revoked: "no" }],
  ];
  for (const [label, patch] of refusals) {
    assert.notEqual(res.gate.preHandoffVerdict({ ...SYN_PRE_OK, ...patch }), "admit", label);
  }
  assert.notEqual(res.gate.preHandoffVerdict(undefined), "admit", "missing facts never admit");
});

test("S5-R7c createSecretReleaseShell obeys the decider and has no default decider", async () => {
  assert.equal(existsSync(SECRET_GATE_JS), true, "app-kernel not built: " + SECRET_GATE_JS);
  const G = await import(pathToFileURL(SECRET_GATE_JS).href);
  assert.equal(typeof G.createSecretReleaseShell, "function", "createSecretReleaseShell export");
  let uses = 0;
  const provider = { has: (n) => n === "SYN_A", use: (n, fn) => { uses += 1; fn(new Uint8Array([7, 7, 7])); }, revocationEpoch: () => 3 };
  assert.throws(() => G.createSecretReleaseShell(provider, {}), "no decider = refuse construction");
  // A refusing pre verdict: provider.use is never reached and no lease is released.
  const refuseAll = { preHandoffVerdict: () => "refuse", noteUnknownVerdict: () => "no-op" };
  const s1 = G.createSecretReleaseShell(provider, { decider: refuseAll, requireBoundOperationId: true, requireRevocationEpoch: true });
  assert.throws(() => s1.getSecret(["SYN_A"], "SYN_A", () => undefined, undefined, "syn-op-1"));
  assert.equal(uses, 0, "provider.use not reached after a refusing pre verdict");
  assert.notEqual(s1.status("syn-op-1").state, "released");
  // Admit, then a listed no-op noteUnknown verdict is obeyed (TS does not decide on its own).
  const admitNoop = { preHandoffVerdict: () => "admit", noteUnknownVerdict: () => "no-op" };
  const s2 = G.createSecretReleaseShell(provider, { decider: admitNoop, requireBoundOperationId: true, requireRevocationEpoch: true });
  s2.getSecret(["SYN_A"], "SYN_A", () => undefined, undefined, "syn-op-2");
  assert.equal(s2.status("syn-op-2").state, "released");
  s2.noteUnknown("syn-op-2");
  assert.equal(s2.status("syn-op-2").state, "released", "listed no-op verdict obeyed");
  // An unlisted noteUnknown verdict fails toward delivery-unknown, never leaves the lease released.
  const admitBogus = { preHandoffVerdict: () => "admit", noteUnknownVerdict: () => "BOGUS" };
  const s3 = G.createSecretReleaseShell(provider, { decider: admitBogus, requireBoundOperationId: true, requireRevocationEpoch: true });
  s3.getSecret(["SYN_A"], "SYN_A", () => undefined, undefined, "syn-op-3");
  s3.noteUnknown("syn-op-3");
  assert.equal(s3.status("syn-op-3").state, "delivery-unknown", "unlisted verdict fails toward UNKNOWN");
  // An unlisted pre verdict refuses (never admits).
  const preBogus = { preHandoffVerdict: () => 100, noteUnknownVerdict: () => "no-op" };
  const s4 = G.createSecretReleaseShell(provider, { decider: preBogus, requireBoundOperationId: true, requireRevocationEpoch: true });
  const before = uses;
  assert.throws(() => s4.getSecret(["SYN_A"], "SYN_A", () => undefined, undefined, "syn-op-4"));
  assert.equal(uses, before, "unlisted pre verdict refuses before provider.use");
});
// S5-R8 (gcw-s5i): kill the two surviving round-h mutants. M10 = kernel wired to an admit-all stub
// decider; M12 = shell treats any non-false presence fact as currently valid. Both tests pass on
// 35513230 and must go red under their mutant. Synthetic data only.
// Zero-trust choice: the WebAssembly epoch domain [0, 2147483647] (non -0 integer) is the authority;
// a TS readEpoch that accepts 2^31 or -0 is not a second opinion. Rejected: an identity check that
// the kernel passed the loader gate (structural, misses a wrapper stub); widening the WebAssembly
// domain to match TS (lets an out-of-domain epoch reach a lease).
const APP_KERNEL_INDEX_JS = join(AK, "dist", "index.js");

test("S5-R8a kernel getSecret obeys the WebAssembly pre-handoff verdict (an epoch leaving the domain after admission never delivers)", async () => {
  assert.equal(existsSync(APP_KERNEL_INDEX_JS), true, "app-kernel not built: " + APP_KERNEL_INDEX_JS);
  const { createAppKernel } = await import(pathToFileURL(APP_KERNEL_INDEX_JS).href);
  // Gate 9.5 admits on epoch 3; the epoch then leaves the WebAssembly domain once the handler runs.
  // TS readEpoch accepts both bad values (safe, non-negative); only deliverPreHandoff refuses them.
  for (const [label, epoch] of [["epoch 2^31 above the WebAssembly i32 domain", 2 ** 31], ["negative zero epoch", -0]]) {
    let consumerCalled = false;
    let uses = 0;
    let inHandler = false;
    const kernel = createAppKernel({
      routes: [{ method: "GET", path: "/syn", handler: "syn", auth: { mode: "public" }, secrets: { require: ["SYN_A"] } }],
      dispatch: {
        syn: ({ getSecret }) => {
          inHandler = true;
          getSecret("SYN_A", () => { consumerCalled = true; });
          return { body: { ok: true } };
        },
      },
      secretsProvider: {
        has: (n) => n === "SYN_A",
        use: (_n, fn) => { uses += 1; fn(new Uint8Array([9, 9])); },
        revocationEpoch: () => (inHandler ? epoch : 3),
      },
    });
    const res = await kernel.handle({ method: "GET", path: "/syn", headers: {}, body: new Uint8Array(0), query: {}, requestId: "rq-s5-r8a", receivedAt: 0 });
    assert.equal(inHandler, true, label + ": admission passed and the handler ran");
    assert.equal(consumerCalled, false, label + ": consumer never receives bytes");
    assert.equal(uses, 0, label + ": provider.use never reached");
    assert.notEqual(res.status, 200, label + ": request does not succeed");
  }
});

test("S5-R8b shell treats only the literal true presence fact as currently valid", async () => {
  const L = await loader();
  const res = L.loadFungiSecretGate({ wasmBytes: new Uint8Array(readFileSync(ASSET)), expectedSha256: L.SECRET_GATE_ADMIT_SHA256 });
  assert.equal(res.ok, true, "load: " + res.code);
  const G = await import(pathToFileURL(SECRET_GATE_JS).href);
  let uses = 0;
  const provider = { has: (n) => n === "SYN_A", use: (_n, fn) => { uses += 1; fn(new Uint8Array([5])); }, revocationEpoch: () => 3 };
  const shell = G.createSecretReleaseShell(provider, { decider: res.gate, requireBoundOperationId: true, requireRevocationEpoch: true });
  const notTrue = [["missing", undefined], ["one", 1], ["string true", "true"], ["object", {}], ["boxed true", Object(true)]];
  let i = 0;
  for (const [label, observed] of notTrue) {
    i += 1;
    assert.throws(() => shell.getSecret(["SYN_A"], "SYN_A", () => undefined, undefined, "syn-r8b-" + i, observed), label + " refuses");
    assert.equal(uses, 0, label + ": provider.use not reached");
  }
  shell.getSecret(["SYN_A"], "SYN_A", () => undefined, undefined, "syn-r8b-ok", true);
  assert.equal(uses, 1, "literal true admits through the WebAssembly");
});

// S5-R8c (gcw-s5k): an IN-DOMAIN epoch move between gate 9.5 admission and handoff never delivers.
// Found by the round check at 24bbacba: the shell read epochMint and epochUse back-to-back inside
// getSecret, so 3 -> 5 after admission looked unmoved. Zero-trust choice: the kernel reads the epoch
// BEFORE the post-wait admit (a has() that bumps it is then seen as a move) and binds that admitted
// epoch as the epochMint fact; deliverPreHandoff then sees epochMoved. Rejected: re-reading the epoch
// at getSecret (blind to any move before the handler runs); a per-call fallback when no admitted
// epoch is passed (a missing fact would silently restore the old blind path).
test("S5-R8c kernel getSecret refuses when the epoch moves inside the domain after admission", async () => {
  assert.equal(existsSync(APP_KERNEL_INDEX_JS), true, "app-kernel not built: " + APP_KERNEL_INDEX_JS);
  const { createAppKernel } = await import(pathToFileURL(APP_KERNEL_INDEX_JS).href);
  for (const [label, handlerEpoch, expectDelivery] of [["epoch 3 -> 5 in domain", 5, false], ["control: epoch stays 3", 3, true]]) {
    let consumerCalled = false;
    let uses = 0;
    let inHandler = false;
    const kernel = createAppKernel({
      routes: [{ method: "GET", path: "/syn", handler: "syn", auth: { mode: "public" }, secrets: { require: ["SYN_A"] } }],
      dispatch: {
        syn: ({ getSecret }) => {
          inHandler = true;
          getSecret("SYN_A", () => { consumerCalled = true; });
          return { body: { ok: true } };
        },
      },
      secretsProvider: {
        has: (n) => n === "SYN_A",
        use: (_n, fn) => { uses += 1; fn(new Uint8Array([7, 7])); },
        revocationEpoch: () => (inHandler ? handlerEpoch : 3),
      },
    });
    const res = await kernel.handle({ method: "GET", path: "/syn", headers: {}, body: new Uint8Array(0), query: {}, requestId: "rq-s5-r8c", receivedAt: 0 });
    assert.equal(inHandler, true, label + ": admission passed and the handler ran");
    assert.equal(consumerCalled, expectDelivery, label + ": consumer delivery");
    assert.equal(uses, expectDelivery ? 1 : 0, label + ": provider.use calls");
    if (expectDelivery) assert.equal(res.status, 200, label + ": control succeeds");
    else assert.notEqual(res.status, 200, label + ": request does not succeed");
  }
});

// S5-R8d (gcw-s5l): an in-domain epoch move AFTER the pre-handoff verdict but BEFORE mint never
// delivers. Found by round check s5r2 at f57250f1 (probe P2): the two pre-handoff reads saw 3, the
// mint and use reads saw 5, and mint was compared only to use, so a revocation landing in that gap
// delivered (200, provider.use once). Zero-trust choice: the mint epoch must equal the ADMITTED epoch
// (and use must equal mint, already enforced by consume), so every epoch read after admission is
// pinned to the admitted fact. Rejected: comparing mint vs use only (blind to a move before mint);
// re-running the pre-handoff decider after mint (a lease would already exist for a refused request).
test("S5-R8d kernel getSecret refuses when the epoch moves after the pre-handoff verdict but before mint", async () => {
  assert.equal(existsSync(APP_KERNEL_INDEX_JS), true, "app-kernel not built: " + APP_KERNEL_INDEX_JS);
  const { createAppKernel } = await import(pathToFileURL(APP_KERNEL_INDEX_JS).href);
  // Epoch reads seen inside the handler, in order: 2 pre-handoff reads, the mint read, the use read.
  const cases = [
    ["3,3 then 5,5 (P2)", [3, 3, 5, 5], false],
    ["3,3 then 5 at mint, back to 3 at use", [3, 3, 5, 3], false],
    ["3,3 then 0,0 (move down)", [3, 3, 0, 0], false],
    ["control: 3,3,3,3", [3, 3, 3, 3], true],
  ];
  for (const [label, seq, expectDelivery] of cases) {
    let consumerCalled = false;
    let uses = 0;
    let inHandler = false;
    let reads = 0;
    const kernel = createAppKernel({
      routes: [{ method: "GET", path: "/syn", handler: "syn", auth: { mode: "public" }, secrets: { require: ["SYN_A"] } }],
      dispatch: {
        syn: ({ getSecret }) => {
          inHandler = true;
          getSecret("SYN_A", () => { consumerCalled = true; });
          return { body: { ok: true } };
        },
      },
      secretsProvider: {
        has: (n) => n === "SYN_A",
        use: (_n, fn) => { uses += 1; fn(new Uint8Array([8, 8])); },
        revocationEpoch: () => {
          if (!inHandler) return 3;
          const v = seq[Math.min(reads, seq.length - 1)];
          reads += 1;
          return v;
        },
      },
    });
    const res = await kernel.handle({ method: "GET", path: "/syn", headers: {}, body: new Uint8Array(0), query: {}, requestId: "rq-s5-r8d", receivedAt: 0 });
    assert.equal(inHandler, true, label + ": admission passed and the handler ran");
    assert.equal(consumerCalled, expectDelivery, label + ": consumer delivery");
    if (expectDelivery) {
      assert.equal(uses, 1, label + ": provider.use once");
      assert.equal(res.status, 200, label + ": control succeeds");
    } else {
      assert.equal(uses, 0, label + ": provider.use never reached (refused at mint)");
      assert.notEqual(res.status, 200, label + ": request does not succeed");
    }
  }
});
// ---------------- S5-R9: every loader refusal code is a registered FUNGI-* code (gcw-s5j) ----------------
// Owner ruling 2026-10-22 22:38: the two artifact codes join the FUNGI-SECRET family.
// Zero-trust choice: assert against the GENERATED registry and the append-only code history, not a
// hand list in this test, so an unregistered emit can never pass. Rejected: keeping APPK_* as a second
// namespace (unscanned by the registry) and an exemption list.
test("S5-R9a loader refusal codes are FUNGI-SECRET-008/009 and both are registered", () => {
  const src = readFileSync(LOADER_TS, "utf8");
  assert.equal(/APPK_SECRET_GATE_ARTIFACT/.test(src), false, "no unregistered APPK_* artifact code is emitted");
  const emitted = [...new Set([...src.matchAll(/refused\("([A-Z0-9_-]+)"\)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(emitted, ["FUNGI-SECRET-008", "FUNGI-SECRET-009"]);
  const reg = JSON.parse(readFileSync(join(REPO, "build", "code-registry", "registry.json"), "utf8"));
  const hist = JSON.parse(readFileSync(join(REPO, "scripts", "baselines", "code-history.json"), "utf8"));
  for (const code of emitted) {
    const row = reg.entries.find((e) => e.code === code);
    assert.ok(row, `${code} is in build/code-registry/registry.json`);
    assert.notEqual(row.status, "dead", `${code} is not a retired/dead code`);
    const h = hist.records.filter((r) => r.code === code);
    assert.equal(h.length, 1, `${code} has exactly one code-history row`);
    assert.equal(h[0].status, "active");
  }
});
