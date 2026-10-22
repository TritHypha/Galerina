import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const UNIT = join(MEM, "src", "secret-gate.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const EVIDENCE = join(MEM, "evidence", "34-secret-gate", "ts-differential.txt");
const PIN = "dc0f9c8c4f1365f0228cda213b2ecd001400463e";
const TS_PATH = "packages-ts/galerina-framework-app-kernel/src/secret-gate.ts";
const RCP_PATH = "packages-ts/galerina-framework-app-kernel/src/release-commit-point.ts";
const TS_SHA = "bfb6ccd88ef2cc47017dd8fc439d0d82386954949baaa81244a5471fc52855d8";
const RCP_SHA = "ab0080fb6efc20937f69f88e85da4d65d37d4e0da634e495753015a9fca9e5b3";
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";

const UNIT_SOURCE_LANDING = Object.freeze({ kind: "LANDING" });
let unitSourceOverride = UNIT_SOURCE_LANDING;

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, timeout: 120000 });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  if (!m) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_ABSENT", value: 0 };
  }
  const value = Number(m[1]);
  if (Number.isSafeInteger(value) !== true) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_NOT_SAFE_INTEGER", value: 0 };
  }
  return { status: r.status, text, present: true, reason: "INVOKE_VALUE_PRESENT", value };
}

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  assert.notEqual(first, -1, "version marker");
  return src.slice(first + marker.length);
}

function flattenUnit() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const unit = unitSourceOverride === UNIT_SOURCE_LANDING ? readFileSync(UNIT, "utf8") : unitSourceOverride;
  const cbParts = unit.split(CB_IMPORT);
  assert.equal(cbParts.length, 2, "c-boundary import once");
  const rcpParts = (cbParts[0] + cbParts[1]).split(RCP_IMPORT);
  assert.equal(rcpParts.length, 2, "release-commit-point import once");
  const rest = stripVersion(rcpParts[0] + rcpParts[1]);
  const dir = mkdtempSync(join(tmpdir(), "q34-diff-flat-"));
  const file = join(dir, "flat.fungi");
  writeFileSync(file, boundary + "\n" + stripVersion(rcp) + "\n" + rest);
  return { dir, file };
}

function runFlow(flow, args) {
  const flat = flattenUnit();
  try {
    return invoke(flat.file, flow, args);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function admitFungi(over) {
  const o = over || {};
  return runFlow("admit", [
    o.requiredCountClass ?? 0,
    o.requiredCount ?? 1,
    o.providerClass ?? 0,
    o.providerPresent ?? 1,
    o.presenceClass ?? 0,
    o.presenceStatus ?? 0,
    o.epochClass ?? 0,
    o.epoch ?? 1,
    o.epochPresentClass ?? 0,
    o.epochPresentToken ?? 1,
  ]);
}

function preFungi(over) {
  const o = over || {};
  return runFlow("deliverPreHandoff", [
    o.declaredClass ?? 0,
    o.declaredToken ?? 1,
    o.providerClass ?? 0,
    o.providerPresent ?? 1,
    o.epochPresentClass ?? 0,
    o.epochPresentToken ?? 1,
    o.epochMintClass ?? 0,
    o.epochMint ?? 1,
    o.epochUseClass ?? 0,
    o.epochUse ?? 1,
    o.epochMovedClass ?? 0,
    o.epochMovedToken ?? 0,
    o.revokeClass ?? 0,
    o.revokeCommittedToken ?? 0,
    o.validityClass ?? 0,
    o.currentValidityToken ?? 1,
  ]);
}

function postFungi(over) {
  const o = over || {};
  return runFlow("deliverPostHandoff", [
    o.preClass ?? 0,
    o.prePacked ?? 100,
    o.callbackClass ?? 0,
    o.callbackOutcome ?? 1,
    o.wipeClass ?? 0,
    o.wipeResult ?? 0,
    o.cleanupClass ?? 0,
    o.cleanupEvidence ?? 1,
    o.authClass ?? 0,
    o.independentAuthToken ?? 1,
    o.custodyClass ?? 0,
    o.preparedCustodyToken ?? 1,
    o.emptyClass ?? 0,
    o.emptyObligationSetToken ?? 1,
    o.consumedAuthClass ?? 0,
    o.consumedAuthorityToken ?? 1,
    o.presentClass ?? 0,
    o.presentToken ?? 1,
    o.matchClass ?? 0,
    o.tokenMatchToken ?? 1,
    o.epochMatchClass ?? 0,
    o.epochMatchToken ?? 1,
    o.leaseClass ?? 0,
    o.leaseState ?? 0,
    o.revokeClass ?? 0,
    o.revokeCommittedToken ?? 0,
    o.currentValidityClass ?? 0,
    o.currentValidityToken ?? 1,
  ]);
}

function deliverFungi(over) {
  const p = preFungi(over);
  if (p.present !== true || p.value !== 100) {
    return p;
  }
  return postFungi({ ...(over || {}), prePacked: 100 });
}

function replaceOnce(s, from, to) {
  const i = s.indexOf(from);
  assert.notEqual(i, -1, "needle missing: " + from.slice(0, 80));
  const j = s.indexOf(from, i + from.length);
  assert.equal(j, -1, "needle not unique: " + from.slice(0, 80));
  return s.slice(0, i) + to + s.slice(i + from.length);
}

function withMutant(from, to, runRed) {
  const origBytes = readFileSync(UNIT);
  const orig = origBytes.toString("utf8");
  const mutant = replaceOnce(orig, from, to);
  const prev = unitSourceOverride;
  unitSourceOverride = mutant;
  try {
    runRed();
  } finally {
    unitSourceOverride = prev;
    assert.equal(readFileSync(UNIT).equals(origBytes), true, "tracked UNIT unchanged");
  }
}

function gitShow(path) {
  const shown = spawnSync("git", ["show", PIN + ":" + path], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
  assert.equal(shown.status, 0, shown.stderr);
  return shown.stdout;
}

async function loadFrozen() {
  assert.equal(process.features.typescript, "strip", "Node type-strip required");
  const sg = gitShow(TS_PATH);
  const rcp = gitShow(RCP_PATH);
  const sgSha = createHash("sha256").update(sg, "utf8").digest("hex");
  const rcpSha = createHash("sha256").update(rcp, "utf8").digest("hex");
  assert.equal(sgSha, TS_SHA);
  assert.equal(rcpSha, RCP_SHA);
  const dir = mkdtempSync(join(tmpdir(), "q34-frozen-ts-"));
  writeFileSync(join(dir, "release-commit-point.ts"), rcp);
  writeFileSync(join(dir, "release-commit-point.js"), 'export * from "./release-commit-point.ts";\n');
  writeFileSync(join(dir, "secret-gate.ts"), sg);
  const mod = await import(pathToFileURL(join(dir, "secret-gate.ts")).href + "?t=" + String(Date.now()));
  return { dir, mod, source: sg };
}

function bytes() {
  return new Uint8Array([7, 7, 7]);
}

function provider(over) {
  const o = over || {};
  let epoch = o.epoch ?? 1;
  const p = {
    has(name) {
      if (o.hasThrow === true) throw new Error("disposed");
      if (Object.prototype.hasOwnProperty.call(o, "hasValue")) return o.hasValue;
      return true;
    },
    use(name, fn) {
      if (o.callback === "none") return;
      if (o.callback === "twice") {
        fn(bytes());
        fn(bytes());
        return;
      }
      if (o.useReturn !== undefined) {
        fn(bytes());
        return o.useReturn;
      }
      if (o.epochAtUse !== undefined) epoch = o.epochAtUse;
      fn(bytes());
    },
  };
  if (o.noEpoch !== true) {
    p.revocationEpoch = () => epoch;
  }
  return p;
}

function tsAdmit(mod, req, prov, options) {
  const gate = mod.createSecretGate(prov, options || {});
  return gate.admit(req);
}

function tsGet(mod, req, name, fn, prov, options) {
  const gate = mod.createSecretGate(prov, options || {});
  return gate.getSecret(req, name, fn);
}

const ROWS = [
  { row: "empty require no provider", ts: "null-admit", fungi: 100, verdict: "PRESERVED" },
  { row: "nonempty no provider", ts: "secret_unavailable", fungi: 101, verdict: "PRESERVED" },
  { row: "nonempty has true", ts: "null-admit", fungi: 100, verdict: "PRESERVED" },
  { row: "nonempty has false", ts: "secret_unavailable", fungi: 101, verdict: "PRESERVED" },
  { row: "nonempty has threw", ts: "secret_unavailable", fungi: 101, verdict: "PRESERVED" },
  { row: "unlisted presence", ts: "no-unlisted-tag", fungi: 111, verdict: "INTENDED_DIVERGENCE" },
  { row: "empty require provider no epoch", ts: "null-admit", fungi: 103, verdict: "INTENDED_DIVERGENCE" },
  { row: "undeclared name", ts: "undefined", fungi: 112, verdict: "INTENDED_DIVERGENCE" },
  { row: "callback not called", ts: "throw", fungi: 113, verdict: "INTENDED_DIVERGENCE" },
  { row: "callback twice", ts: "throw", fungi: 114, verdict: "INTENDED_DIVERGENCE" },
  { row: "callback returns value", ts: "throw", fungi: 115, verdict: "INTENDED_DIVERGENCE" },
  { row: "callback thenable", ts: "throw", fungi: 116, verdict: "INTENDED_DIVERGENCE" },
  { row: "epoch moved", ts: "throw-stale", fungi: 118, verdict: "INTENDED_DIVERGENCE" },
  { row: "epoch mint versus use mismatch", ts: "throw-stale", fungi: 118, verdict: "INTENDED_DIVERGENCE" },
  { row: "cleanup UNKNOWN", ts: "no-cleanup-tag", fungi: 106, verdict: "INTENDED_DIVERGENCE" },
  { row: "delivered once-void wipe ok listed cleanup", ts: "undefined", fungi: 106, verdict: "INTENDED_DIVERGENCE" },
];

test("F1 frozen TS executed and flattened fungi packed code matches each row", async () => {
  const frozen = await loadFrozen();
  try {
    assert.equal(typeof frozen.mod.createSecretGate, "function");
    const evidence = readFileSync(EVIDENCE, "utf8");
    let i = 0;
    while (i < ROWS.length) {
      const row = ROWS[i];
      const listed = row.verdict === "PRESERVED" || row.verdict === "INTENDED_DIVERGENCE" || row.verdict === "NEEDS_LANGUAGE" || row.verdict === "UNKNOWN";
      assert.equal(listed, true, row.row + " unlisted verdict");
      const needle = row.row + " | " + String(row.fungi) + " | " + row.verdict;
      assert.equal(evidence.includes(needle), true, "evidence missing " + needle);
      i = i + 1;
    }

    const emptyNone = tsAdmit(frozen.mod, [], undefined);
    assert.equal(emptyNone, null);
    assert.equal(admitFungi({ requiredCount: 0, providerPresent: 0, epochPresentToken: 0 }).value, 100);

    const nonemptyNone = tsAdmit(frozen.mod, ["k"], undefined);
    assert.equal(nonemptyNone, "secret_unavailable");
    assert.equal(admitFungi({ requiredCount: 1, providerPresent: 0, epochPresentToken: 0 }).value, 101);

    const present = tsAdmit(frozen.mod, ["k"], provider());
    assert.equal(present, null);
    assert.equal(admitFungi({}).value, 100);

    const absent = tsAdmit(frozen.mod, ["k"], provider({ hasValue: false }));
    assert.equal(absent, "secret_unavailable");
    assert.equal(admitFungi({ presenceStatus: 1 }).value, 101);

    const threw = tsAdmit(frozen.mod, ["k"], provider({ hasThrow: true }));
    assert.equal(threw, "secret_unavailable");
    assert.equal(admitFungi({ presenceStatus: 4 }).value, 101);

    const unlisted = admitFungi({ presenceStatus: 9 });
    assert.equal(unlisted.value, 111);

    const emptyLegacyTs = tsAdmit(frozen.mod, [], provider({ noEpoch: true }));
    assert.equal(emptyLegacyTs, null);
    assert.equal(admitFungi({ requiredCount: 0, providerPresent: 1, epochPresentToken: 0 }).value, 103);

    const undeclared = tsGet(frozen.mod, ["k"], "other", () => undefined, provider());
    assert.equal(undeclared, undefined);
    assert.equal(deliverFungi({ declaredToken: 0 }).value, 112);

    let notCalled = "none";
    try {
      tsGet(frozen.mod, ["k"], "k", () => undefined, provider({ callback: "none" }), { requireRevocationEpoch: true });
    } catch {
      notCalled = "throw";
    }
    assert.equal(notCalled, "throw");
    assert.equal(deliverFungi({ callbackOutcome: 0 }).value, 113);

    let twice = "none";
    try {
      tsGet(frozen.mod, ["k"], "k", () => undefined, provider({ callback: "twice" }), { requireRevocationEpoch: true });
    } catch {
      twice = "throw";
    }
    assert.equal(twice, "throw");
    assert.equal(deliverFungi({ callbackOutcome: 2 }).value, 114);

    let retVal = "none";
    try {
      tsGet(frozen.mod, ["k"], "k", () => 1, provider(), { requireRevocationEpoch: true });
    } catch {
      retVal = "throw";
    }
    assert.equal(retVal, "throw");
    assert.equal(deliverFungi({ callbackOutcome: 3 }).value, 115);

    let thenable = "none";
    try {
      tsGet(frozen.mod, ["k"], "k", () => Promise.resolve(1), provider(), { requireRevocationEpoch: true });
    } catch {
      thenable = "throw";
    }
    assert.equal(thenable, "throw");
    assert.equal(deliverFungi({ callbackOutcome: 4 }).value, 116);

    let moved = "none";
    try {
      tsGet(frozen.mod, ["k"], "k", () => undefined, provider({ epoch: 1, epochAtUse: 2 }), { requireRevocationEpoch: true });
    } catch {
      moved = "throw";
    }
    assert.equal(moved, "throw");
    assert.equal(deliverFungi({ epochMovedToken: 1 }).value, 118);
    assert.equal(deliverFungi({ epochMint: 1, epochUse: 2, epochMovedToken: 0 }).value, 118);

    assert.equal(deliverFungi({ cleanupEvidence: 4 }).value, 106);

    const delivered = tsGet(frozen.mod, ["k"], "k", () => undefined, provider(), { requireRevocationEpoch: true });
    assert.equal(delivered, undefined);
    assert.equal(deliverFungi({}).value, 106);
    assert.equal(deliverFungi({ cleanupEvidence: 0 }).value, 106);
    assert.equal(deliverFungi({ cleanupEvidence: 1 }).value, 106);
    assert.equal(postFungi({ currentValidityToken: 0 }).value, 106);
    assert.equal(postFungi({ currentValidityToken: 0, presentToken: 0 }).value, 106);
    assert.equal(postFungi({ currentValidityToken: 0, revokeCommittedToken: 1 }).value, 106);
    assert.equal(postFungi({ consumedAuthorityToken: 0, presentToken: 0 }).value, 106);
    assert.equal(postFungi({ consumedAuthorityToken: 0, revokeCommittedToken: 1 }).value, 106);
    assert.equal(postFungi({ currentValidityToken: 2 }).value, 111);
    assert.equal(postFungi({ currentValidityClass: 3 }).value, 110);
    assert.equal(postFungi({ currentValidityClass: 11 }).value, 111);
    assert.equal(preFungi({ epochMintClass: 3 }).value, 110);
    assert.equal(preFungi({ epochMintClass: 11 }).value, 111);
    assert.equal(preFungi({ epochUseClass: 3 }).value, 110);
    assert.equal(preFungi({ epochUseClass: 11 }).value, 111);
    assert.equal(postFungi({ preClass: 3 }).value, 110);
    assert.equal(postFungi({ preClass: 11 }).value, 111);
  } finally {
    rmSync(frozen.dir, { recursive: true, force: true });
  }
});

test("F1 tamper empty-require admit 0 to 1 turns differential RED", () => {
  withMutant(
    "if requiredCount == 0 {\n    if providerPresent == 0 {\n      return finish(0, true)",
    "if requiredCount == 0 {\n    if providerPresent == 0 {\n      return finish(1, true)",
    () => {
      const r = admitFungi({ requiredCount: 0, providerPresent: 0, epochPresentToken: 0 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.notEqual(r.value, 100, "empty no-provider must not stay Admit");
    },
  );
  const restore = admitFungi({ requiredCount: 0, providerPresent: 0, epochPresentToken: 0 });
  assert.equal(restore.value, 100, "restore empty admit");
});

test("F1 tamper undeclared 12 to 0 turns differential RED", () => {
  withMutant(
    "if declaredToken == 0 {\n    return finish(12, true)",
    "if declaredToken == 0 {\n    return finish(0, true)",
    () => {
      const r = deliverFungi({ declaredToken: 0 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.notEqual(r.value, 112, "undeclared must not stay 112");
    },
  );
  const restore = deliverFungi({ declaredToken: 0 });
  assert.equal(restore.value, 112, "restore undeclared");
});
