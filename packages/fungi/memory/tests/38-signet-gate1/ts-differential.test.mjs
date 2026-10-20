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
const UNIT = join(MEM, "src", "signet-grant-seal.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const PIN = "dc0f9c8c4f1365f0228cda213b2ecd001400463e";
const HOST_PATH = "scripts/lib/assurance-fabric/authenticated-host.mjs";
const HOST_SHA = "2cfa23f25bc50c09bb914ba4bb9dc4bac0efbfb2da3800da0d0cd9117be72cd7";
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";

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
  const unit = readFileSync(UNIT, "utf8");
  const cbParts = unit.split(CB_IMPORT);
  assert.equal(cbParts.length, 2, "c-boundary import once");
  const rcpParts = (cbParts[0] + cbParts[1]).split(RCP_IMPORT);
  assert.equal(rcpParts.length, 2, "release-commit-point import once");
  const rest = stripVersion(rcpParts[0] + rcpParts[1]);
  const dir = mkdtempSync(join(tmpdir(), "q38-diff-flat-"));
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

function issueFungi(over) {
  const o = over || {};
  return runFlow("issueGrant", [
    o.subjectCountClass ?? 0,
    o.subjectCount ?? 1,
    o.duplicateClass ?? 0,
    o.duplicateToken ?? 0,
    o.digestClass ?? 0,
    o.digestOk ?? 1,
    o.profileClass ?? 0,
    o.profilePresent ?? 1,
    o.epochClass ?? 0,
    o.epoch ?? 1,
    o.clockClass ?? 0,
    o.clock ?? 1000,
    o.clockPresentClass ?? 0,
    o.clockPresent ?? 1,
    o.randomClass ?? 0,
    o.randomPresent ?? 1,
    o.keyClass ?? 0,
    o.keyPresent ?? 1,
    o.ttlClass ?? 0,
    o.ttl ?? 60000,
    o.suiteClass ?? 0,
    o.suiteId ?? 0,
    o.pqClass ?? 0,
    o.pqAvailable ?? 1,
  ]);
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

async function loadFrozenHost() {
  const host = gitShow(HOST_PATH);
  const sha = createHash("sha256").update(host, "utf8").digest("hex");
  assert.equal(sha, HOST_SHA, "frozen authenticated-host sha");
  const dir = mkdtempSync(join(tmpdir(), "q38-ts-host-"));
  const siblings = [
    "authenticated-host.mjs",
    "result-model.mjs",
    "private-host.mjs",
    "unsafe-observation.mjs",
    "strict-json.mjs",
  ];
  let i = 0;
  while (i < siblings.length) {
    const name = siblings[i];
    const body = name === "authenticated-host.mjs" ? host : gitShow("scripts/lib/assurance-fabric/" + name);
    writeFileSync(join(dir, name), body);
    i = i + 1;
  }
  const mod = await import(pathToFileURL(join(dir, "authenticated-host.mjs")).href);
  return { dir, mod };
}

function digestHex(n) {
  return "sha256:" + "ab".repeat(32);
}

test("F1 frozen TS empty subjects throws; fungi packed 101 INTENDED_DIVERGENCE", async () => {
  const { dir, mod } = await loadFrozenHost();
  try {
    let threw = false;
    try {
      mod.createAuthenticatedAssuranceHost({
        subjects: [],
        profileId: "p1",
        policyDigest: digestHex(),
        target: "t",
        abi: "a",
        buildPoint: "b",
      });
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "TS empty subjects throws");
    const fungi = issueFungi({ subjectCount: 0 });
    assert.equal(fungi.value, 101, "fungi empty subjects typed 101");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F1 frozen TS TTL 0 issues; fungi packed 109 INTENDED_DIVERGENCE", async () => {
  const { dir, mod } = await loadFrozenHost();
  try {
    const host = mod.createAuthenticatedAssuranceHost({
      subjects: [{ subjectId: "s1", digest: digestHex() }],
      profileId: "p1",
      policyDigest: digestHex(),
      target: "t",
      abi: "a",
      buildPoint: "b",
    });
    const envelope = {
      schemaVersion: 1,
      componentDigest: digestHex(),
      policyDigest: digestHex(),
      target: "t",
      abi: "a",
      dependencyClosureDigest: digestHex(),
      capabilityDigest: digestHex(),
      buildPoint: "b",
      epoch: 1,
      evidenceSetDigest: digestHex(),
    };
    let tsIssued = false;
    try {
      const grant = host.issueGrant(envelope, "synthetic.effect.v1", 0);
      tsIssued = grant != null && typeof grant.grantId === "string";
    } catch {
      tsIssued = false;
    }
    assert.equal(tsIssued, true, "TS TTL 0 issues");
    const fungi = issueFungi({ ttl: 0 });
    assert.equal(fungi.value, 109, "fungi TTL 0 refuses 109");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F1 frozen TS hybrid-incomplete never Assured; fungi 114 then classify 101", async () => {
  const fungiIssue = issueFungi({ pqAvailable: 0 });
  assert.equal(fungiIssue.value, 114, "fungi PQ unavailable refuses issue");
  const fungiClass = runFlow("classifySeal", [0, 1, 0, 0, 0, 0, 0, 0]);
  assert.equal(fungiClass.value, 101, "classical-only seal Unknown never Assured");
});
