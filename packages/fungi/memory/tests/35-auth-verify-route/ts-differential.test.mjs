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
const BODY = join(MEM, "src", "body-reader.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const SECRET = join(MEM, "src", "secret-gate.fungi");
const UNIT = join(MEM, "src", "auth-verify-route.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const EVIDENCE = join(MEM, "evidence", "35-auth-verify-route", "ts-differential.txt");
const PIN = "dc0f9c8c4f1365f0228cda213b2ecd001400463e";
const PARKED = "b59598787fdbeaccafe2f2d2daf062170dd17a05";
const TS_PATH = "packages-ts/galerina-framework-app-kernel/src/auth-verify-route.ts";
const RCP_PATH = "packages-ts/galerina-framework-app-kernel/src/release-commit-point.ts";
const SG_PATH = "packages-ts/galerina-framework-app-kernel/src/secret-gate.ts";
const FB_PATH = "packages-ts/galerina-framework-app-kernel/src/foreign-boundary.ts";
const TS_SHA = "2cddca1eefd6bbd4c3e6d1ec7ba4fa53ec5e798f737d52712cc9ca683be0d4db";
const RCP_SHA = "ab0080fb6efc20937f69f88e85da4d65d37d4e0da634e495753015a9fca9e5b3";
const SG_SHA = "bfb6ccd88ef2cc47017dd8fc439d0d82386954949baaa81244a5471fc52855d8";
const FB_SHA = "11bb502b0a0080a9953cdc4b548666919662c4df9eabcfb898a43348db2286b5";
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const BODY_IMPORT = "\nimport \"./body-reader.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const SECRET_IMPORT = "\nimport \"./secret-gate.fungi\"\n";

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

function splitOnce(src, needle, label) {
  const parts = src.split(needle);
  assert.equal(parts.length, 2, label);
  return parts[0] + "\n" + parts[1];
}

function stripBodyFinish(src) {
  const start = src.indexOf("pure flow finish(");
  const next = src.indexOf("pure flow rangesOverlap");
  return src.slice(0, start) + src.slice(next);
}

function flattenUnit() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const bodyReader = readFileSync(BODY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const secret = readFileSync(SECRET, "utf8");
  const unit = readFileSync(UNIT, "utf8");
  let rest = unit;
  rest = splitOnce(rest, CB_IMPORT, "cb");
  rest = splitOnce(rest, BODY_IMPORT, "body");
  rest = splitOnce(rest, RCP_IMPORT, "rcp");
  rest = splitOnce(rest, SECRET_IMPORT, "secret");
  rest = stripVersion(rest);
  let secretRest = secret;
  secretRest = splitOnce(secretRest, CB_IMPORT, "secret-cb");
  secretRest = splitOnce(secretRest, RCP_IMPORT, "secret-rcp");
  const dir = mkdtempSync(join(tmpdir(), "q35-diff-flat-"));
  const file = join(dir, "flat.fungi");
  writeFileSync(
    file,
    boundary + "\n" + stripVersion(stripBodyFinish(bodyReader)) + "\n" + stripVersion(rcp) + "\n" + stripVersion(secretRest) + "\n" + rest,
  );
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

function gitShow(rev, path) {
  const shown = spawnSync("git", ["show", rev + ":" + path], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
  assert.equal(shown.status, 0, shown.stderr);
  return shown.stdout;
}

function sha(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function stubPorts() {
  const digest = "ab".repeat(32);
  return {
    verifierCustody: async () => ({ ok: true }),
    loadArtifact: async () => ({ ok: true, artifactDigest: digest, snapshot: new Uint8Array([1]) }),
    admitSlide: async () => ({ ok: true }),
    authorizeVok: async () => ({ ok: true, epoch: 1 }),
    runGuest: async () => ({ ok: true, matched: true }),
    deliverSink: async () => ({ ok: true }),
    acknowledge: async () => ({ ok: true }),
    wipe: () => {},
  };
}

function stubSecrets() {
  return {
    has() {
      return true;
    },
    use(_name, fn) {
      fn(new Uint8Array([1]));
    },
    revocationEpoch() {
      return 1;
    },
  };
}

async function loadFrozen(rev) {
  assert.equal(process.features.typescript, "strip", "Node type-strip required");
  const route = gitShow(rev, TS_PATH);
  const rcp = gitShow(rev, RCP_PATH);
  const sg = gitShow(rev, SG_PATH);
  const fb = gitShow(rev, FB_PATH);
  if (rev === PIN) {
    assert.equal(sha(route), TS_SHA);
    assert.equal(sha(rcp), RCP_SHA);
    assert.equal(sha(sg), SG_SHA);
    assert.equal(sha(fb), FB_SHA);
  }
  const dir = mkdtempSync(join(tmpdir(), "q35-frozen-ts-"));
  writeFileSync(join(dir, "foreign-boundary.ts"), fb);
  writeFileSync(join(dir, "foreign-boundary.js"), 'export * from "./foreign-boundary.ts";\n');
  writeFileSync(join(dir, "release-commit-point.ts"), rcp);
  writeFileSync(join(dir, "release-commit-point.js"), 'export * from "./release-commit-point.ts";\n');
  writeFileSync(join(dir, "secret-gate.ts"), sg);
  writeFileSync(join(dir, "secret-gate.js"), 'export * from "./secret-gate.ts";\n');
  writeFileSync(join(dir, "auth-verify-route.ts"), route);
  const mod = await import(pathToFileURL(join(dir, "auth-verify-route.ts")).href + "?t=" + String(Date.now()));
  return { dir, mod, rev };
}

function makeRoute(mod, over) {
  const o = over || {};
  return mod.createAuthVerifyRoute({
    mode: "test",
    timeoutMs: o.timeoutMs ?? 5000,
    fungiMaxRequestSize: 16384,
    kernelMaxSizeBytes: 16384,
    namedSlideRecord: mod.AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: mod.AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: "ab".repeat(32),
    ports: stubPorts(),
    secrets: stubSecrets(),
    nowMs: o.nowMs ?? (() => 1000),
  });
}

function baseReq(over) {
  const o = over || {};
  return {
    method: o.method ?? "POST",
    path: o.path ?? "/auth/verify",
    contentType: o.contentType ?? "application/json",
    body: o.body ?? new Uint8Array([123]),
    channelAllow: o.channelAllow ?? true,
    principal: o.principal ?? "p1",
    disconnected: o.disconnected,
  };
}

const ROWS = [
  { row: "wrong method GET", ts: "malformed_input", fungi: 112, verdict: "INTENDED_DIVERGENCE" },
  { row: "path trailing slash", ts: "malformed_input", fungi: 113, verdict: "INTENDED_DIVERGENCE" },
  { row: "body over cap", ts: "payload_too_large", fungi: 116, verdict: "PRESERVED" },
  { row: "client disconnected", ts: "client_disconnected", fungi: 140, verdict: "INTENDED_DIVERGENCE" },
  { row: "unknown body field", ts: "no-unknown-field-tag", fungi: 117, verdict: "INTENDED_DIVERGENCE" },
  { row: "caller mint", ts: "predictable-mint-ok", fungi: 120, verdict: "INTENDED_DIVERGENCE" },
  { row: "clock missing", ts: "unknown_outcome", fungi: 121, verdict: "INTENDED_DIVERGENCE" },
  { row: "post-consume success", ts: "released", fungi: 106, verdict: "INTENDED_DIVERGENCE" },
  { row: "MONOTONIC_TYPED_TIME", ts: "Date.now", fungi: 121, verdict: "NEEDS_LANGUAGE" },
  { row: "CONSTANT_TIME_COMPARE", ts: "sha256-seal", fungi: 100, verdict: "NEEDS_LANGUAGE" },
];

test("F1 frozen TS executed at dc0f9c8c and flattened fungi packed code matches each row", async () => {
  let frozen;
  let used = PIN;
  try {
    frozen = await loadFrozen(PIN);
  } catch (e1) {
    try {
      frozen = await loadFrozen(PARKED);
      used = PARKED;
    } catch (e2) {
      assert.fail("neither oracle loaded dc=" + String(e1) + " parked=" + String(e2));
    }
  }
  try {
    assert.equal(typeof frozen.mod.createAuthVerifyRoute, "function");
    const evidence = readFileSync(EVIDENCE, "utf8");
    assert.equal(evidence.includes("oracle " + used), true, "evidence oracle pin");
    let i = 0;
    while (i < ROWS.length) {
      const row = ROWS[i];
      const listed = row.verdict === "PRESERVED" || row.verdict === "INTENDED_DIVERGENCE" || row.verdict === "NEEDS_LANGUAGE" || row.verdict === "UNKNOWN";
      assert.equal(listed, true, row.row + " unlisted verdict");
      const needle = row.row + " | " + String(row.fungi) + " | " + row.verdict;
      assert.equal(evidence.includes(needle), true, "evidence missing " + needle);
      i = i + 1;
    }

    const route = makeRoute(frozen.mod);
    const get = await route.handle(baseReq({ method: "GET" }));
    assert.equal(get.code, "malformed_input");
    assert.equal(runFlow("admitIngress", [0, 1, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0]).value, 112);

    const slash = await route.handle(baseReq({ path: "/auth/verify/" }));
    assert.equal(slash.code, "malformed_input");
    assert.equal(runFlow("admitIngress", [0, 0, 0, 1, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0]).value, 113);

    const over = await route.handle(baseReq({ body: new Uint8Array(16385) }));
    assert.equal(over.code, "payload_too_large");
    assert.equal(runFlow("admitIngress", [0, 0, 0, 0, 0, 0, 0, 0, 0, 105, 0, 0, 0, 0]).value, 116);

    const disc = await route.handle(baseReq({ disconnected: true }));
    assert.equal(disc.code, "client_disconnected");
    assert.equal(runFlow("applyPostConsume", [0, 100, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1]).value, 140);

    assert.equal(runFlow("admitIngress", [0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 1, 0, 0]).value, 117);
    assert.equal(runFlow("mintOperation", [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]).value, 120);
    assert.equal(runFlow("applyClock", [0, 1000, 0, 0, 0, 1000, 0, 5000, 0, 1, 0, 1]).value, 121);
    assert.equal(runFlow("applyPostConsume", [0, 100, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1]).value, 106);
  } finally {
    rmSync(frozen.dir, { recursive: true, force: true });
  }
});
