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
  const ports = stubPorts();
  if (o.ports) {
    const names = Object.keys(o.ports);
    let i = 0;
    while (i < names.length) {
      ports[names[i]] = o.ports[names[i]];
      i = i + 1;
    }
  }
  return mod.createAuthVerifyRoute({
    mode: o.mode ?? "test",
    timeoutMs: o.timeoutMs ?? 5000,
    fungiMaxRequestSize: o.fungiMaxRequestSize ?? 16384,
    kernelMaxSizeBytes: 16384,
    namedSlideRecord: mod.AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: mod.AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: "ab".repeat(32),
    ports,
    secrets: o.secrets ?? stubSecrets(),
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

const INGRESS_OK = [0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0];
const POST_OK = [0, 100, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1];
const CLOCK_OK = [0, 1000, 0, 1, 0, 1000, 0, 5000, 0, 1, 0, 1];
const PRE_OK = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0];
const CONSUME_OK = [0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
const MINT_OK = [0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0];

const ROWS = [
  { row: "wrong method GET", ts: "malformed_input", fungi: 112, verdict: "INTENDED_DIVERGENCE", exec: "handle", req: { method: "GET" }, flow: "admitIngress", args: [0, 1, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0] },
  { row: "path trailing slash", ts: "malformed_input", fungi: 113, verdict: "INTENDED_DIVERGENCE", exec: "handle", req: { path: "/auth/verify/" }, flow: "admitIngress", args: [0, 0, 0, 1, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0] },
  { row: "content-type empty", ts: "malformed_input", fungi: 114, verdict: "INTENDED_DIVERGENCE", exec: "handle", req: { contentType: "" }, flow: "admitIngress", args: [0, 0, 0, 0, 0, 1, 0, 0, 0, 100, 0, 0, 0, 0] },
  { row: "channel refused", ts: "malformed_input", fungi: 115, verdict: "INTENDED_DIVERGENCE", exec: "handle", req: { channelAllow: false }, flow: "admitIngress", args: [0, 0, 0, 0, 0, 0, 0, 1, 0, 100, 0, 0, 0, 0] },
  { row: "body over cap", ts: "payload_too_large", fungi: 116, verdict: "PRESERVED", exec: "handle", req: { body: new Uint8Array(16385) }, flow: "admitIngress", args: [0, 0, 0, 0, 0, 0, 0, 0, 0, 105, 0, 0, 0, 0] },
  { row: "client disconnected", ts: "client_disconnected", fungi: 140, verdict: "INTENDED_DIVERGENCE", exec: "handle", req: { disconnected: true }, flow: "applyPostConsume", args: [0, 100, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1] },
  { row: "unknown body field", ts: "no-unknown-field-tag", fungi: 117, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "admitIngress", args: [0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 1, 0, 0], unknownReason: "TS_NO_UNKNOWN_FIELD_TAG" },
  { row: "malformed body", ts: "malformed_input", fungi: 118, verdict: "PRESERVED", exec: "handle", req: { body: new Uint8Array(0) }, flow: "admitIngress", args: [0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 1] },
  { row: "body throw UNKNOWN", ts: "unknown_outcome", fungi: 106, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "admitIngress", args: [0, 0, 0, 0, 0, 0, 0, 0, 0, 110, 0, 0, 0, 0], unknownReason: "TS_NEEDS_BODY_STREAM_FIXTURE" },
  { row: "caller mint", ts: "predictable-mint-ok", fungi: 120, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "mintOperation", args: [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], unknownReason: "AVR-N1_TS_ACCEPTS_PREDICTABLE_MINT" },
  { row: "clock missing", ts: "unknown_outcome", fungi: 121, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "applyClock", args: [0, 1000, 0, 0, 0, 1000, 0, 5000, 0, 1, 0, 1], unknownReason: "TS_CLOCK_REFUSED_THROW" },
  { row: "deadline overrun", ts: "unknown_outcome", fungi: 129, verdict: "PRESERVED", exec: "fungi", flow: "applyClock", args: [0, 7000, 0, 1, 0, 1000, 0, 5000, 0, 1, 0, 1], unknownReason: "TS_DEADLINE_ARMS_AT_DISPATCH" },
  { row: "digest missing", ts: "artifact_digest_missing", fungi: 125, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "artifact mismatch", ts: "artifact_mismatch", fungi: 126, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "AOT refused", ts: "aot_refused", fungi: 127, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "bytecode required", ts: "bytecode_required", fungi: 128, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "slide refused", ts: "slide_admission_refused", fungi: 130, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "authority missing", ts: "authority_missing", fungi: 131, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "authority stale", ts: "authority_stale", fungi: 132, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "authority revoked", ts: "authority_revoked", fungi: 133, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "VERDICT refused", ts: "verdict_refused", fungi: 134, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "secret unavailable", ts: "secret_unavailable", fungi: 135, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 101, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_SECRET_ADMIT_NOT_HAS" },
  { row: "tcb refused", ts: "tcb_profile_refused", fungi: 136, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 1, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "replay recovery", ts: "replay", fungi: 137, verdict: "PRESERVED", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 2], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "unlisted recovery", ts: "no-unlisted-recovery-tag", fungi: 138, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "applyPrePorts", args: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 7, 0, 7, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 9], unknownReason: "TS_NO_UNLISTED_RECOVERY_TAG" },
  { row: "revoke first", ts: "revoke-before-release-option", fungi: 102, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "applyConsume", args: [0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], unknownReason: "AVR-N2_NO_REVOKE_BEFORE_RELEASE_OPTION" },
  { row: "consume released", ts: "released", fungi: 100, verdict: "PRESERVED", exec: "fungi", flow: "applyConsume", args: CONSUME_OK, unknownReason: "TS_HANDLE_CONTINUES_PAST_COMMIT" },
  { row: "guest trap", ts: "guest_trap", fungi: 139, verdict: "PRESERVED", exec: "fungi", flow: "applyPostConsume", args: [0, 100, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "cleanup failed", ts: "cleanup_failed", fungi: 141, verdict: "PRESERVED", exec: "fungi", flow: "applyPostConsume", args: [0, 100, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "ack refused", ts: "ack-not-acknowledged", fungi: 142, verdict: "PRESERVED", exec: "fungi", flow: "applyPostConsume", args: [0, 100, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1], unknownReason: "TS_NEEDS_PORT_FIXTURE" },
  { row: "receipt no suite", ts: "no-suite-tag", fungi: 143, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "applyPostConsume", args: [0, 100, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1], unknownReason: "C186-F3_TS_NO_SUITE_ID_TAG" },
  { row: "post-consume success", ts: "released", fungi: 106, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "applyPostConsume", args: POST_OK, unknownReason: "TS_HANDLE_CONTINUES_PAST_COMMIT" },
  { row: "http default 503", ts: "undefined-map", fungi: 503, verdict: "PRESERVED", exec: "fungi", flow: "httpStatusFor", args: [0, 999], unknownReason: "TS_HTTP_MAP_ON_STRING_CODE" },
  { row: "disconnect HTTP 499", ts: "client_disconnected", fungi: 499, verdict: "PRESERVED", exec: "fungi", flow: "httpStatusFor", args: [0, 140], unknownReason: "TS_HTTP_MAP_ON_STRING_CODE" },
  { row: "POST exact method", ts: "released-or-later", fungi: 100, verdict: "PRESERVED", exec: "fungi", flow: "admitIngress", args: INGRESS_OK, unknownReason: "TS_HANDLE_IS_FULL_PIPELINE" },
  { row: "MONOTONIC_TYPED_TIME", ts: "Date.now", fungi: 121, verdict: "NEEDS_LANGUAGE", exec: "fungi", flow: "applyClock", args: [0, 1000, 0, 0, 0, 1000, 0, 5000, 0, 1, 0, 1], unknownReason: "MONOTONIC_TYPED_TIME" },
  { row: "CONSTANT_TIME_COMPARE", ts: "sha256-seal", fungi: 100, verdict: "NEEDS_LANGUAGE", exec: "fungi", flow: "sealReceipt", args: [0, 0, 0, 1], unknownReason: "CONSTANT_TIME_COMPARE" },
  { row: "PQ classical-only", ts: "classical-seal", fungi: 106, verdict: "NEEDS_LANGUAGE", exec: "fungi", flow: "sealReceipt", args: [0, 1, 0, 1], unknownReason: "hybrid AND" },
  { row: "HOST_ADAPTER_PRESENCE", ts: "classTag", fungi: 110, verdict: "UNKNOWN", exec: "fungi", flow: "admitIngress", args: [3, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0], unknownReason: "HOST_ADAPTER_PRESENCE" },
  { row: "MB-06 listed cleanup", ts: "cleanup-pending", fungi: 106, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "applyConsume", args: [0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], unknownReason: "MB-06_CARRIED_UNKNOWN" },
  { row: "Addendum D OPEN ordering", ts: "open-items", fungi: 106, verdict: "UNKNOWN", exec: "fungi", flow: "applyPostConsume", args: POST_OK, unknownReason: "TOTAL_EFFECT_OUTCOME" },
  { row: "post prePacked not 100", ts: "post-refuse-as-safe", fungi: 106, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "applyPostConsume", args: [0, 106, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1], unknownReason: "A1_AFTER_CONSUME_UNKNOWN" },
  { row: "post unlisted token", ts: "post-unlisted-refuse", fungi: 106, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "applyPostConsume", args: [0, 100, 0, 9, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1], unknownReason: "A1_AFTER_CONSUME_UNKNOWN" },
  { row: "post foreign classTag", ts: "post-class-refuse", fungi: 106, verdict: "INTENDED_DIVERGENCE", exec: "fungi", flow: "applyPostConsume", args: [0, 100, 3, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1], unknownReason: "A1_AFTER_CONSUME_UNKNOWN" },
];

test("F3 frozen TS and flattened fungi executed for every parity row or UNKNOWN with typed reason", async () => {
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
  const flat = flattenUnit();
  try {
    assert.equal(typeof frozen.mod.createAuthVerifyRoute, "function");
    const evidence = readFileSync(EVIDENCE, "utf8");
    assert.equal(evidence.includes("oracle " + used), true, "evidence oracle pin");
    const parity = readFileSync(join(MEM, "evidence", "35-auth-verify-route", "parity.md"), "utf8");
    assert.equal(parity.includes("1196"), true, "line-count correction 1196");
    assert.equal(parity.includes("rd1415-*.test.mjs importing auth-verify-route at dc0f9c8c = 0 files"), true, "rd1415 zero record");
    assert.equal(parity.includes("## Frozen TS 102 cases"), true, "102-case map");
    assert.equal(parity.includes("## Frozen TS 31 mutant labels"), true, "31-label map");
    const rdList = spawnSync("git", ["ls-tree", "-r", "--name-only", PIN], { cwd: REPO, encoding: "utf8" }).stdout.split("\n");
    const rdFiles = rdList.filter((p) => p.includes("tests/rd1415-") && p.endsWith(".test.mjs"));
    assert.equal(rdFiles.length, 10, "rd1415 file count at pin");
    let rdHits = 0;
    let ri = 0;
    while (ri < rdFiles.length) {
      const shown = spawnSync("git", ["show", PIN + ":" + rdFiles[ri]], { cwd: REPO, encoding: "utf8", maxBuffer: 2_000_000 });
      if (shown.stdout.includes("auth-verify-route") === true) {
        rdHits = rdHits + 1;
      }
      ri = ri + 1;
    }
    assert.equal(rdHits, 0, "rd1415 importing auth-verify-route");

    let i = 0;
    while (i < ROWS.length) {
      const row = ROWS[i];
      const listed = row.verdict === "PRESERVED" || row.verdict === "INTENDED_DIVERGENCE" || row.verdict === "NEEDS_LANGUAGE" || row.verdict === "UNKNOWN";
      assert.equal(listed, true, row.row + " unlisted verdict");
      const needle = row.row + " | " + String(row.fungi) + " | " + row.verdict;
      assert.equal(evidence.includes(needle), true, "evidence missing " + needle);
      if (row.exec === "handle") {
        assert.equal(row.unknownReason === undefined, true, row.row + " live TS row must not carry unknownReason");
      } else {
        assert.equal(typeof row.unknownReason, "string", row.row + " needs typed reason");
        assert.equal(row.unknownReason.length > 0, true, row.row + " empty reason");
        assert.equal(evidence.includes(row.unknownReason), true, "evidence missing reason " + row.unknownReason);
      }
      const fungi = invoke(flat.file, row.flow, row.args);
      assert.equal(fungi.status, 0, row.row + " fungi status " + fungi.text);
      assert.equal(fungi.present, true, row.row + " fungi absent");
      assert.equal(fungi.value, row.fungi, row.row + " fungi packed");
      i = i + 1;
    }

    const route = makeRoute(frozen.mod);
    const get = await route.handle(baseReq({ method: "GET" }));
    assert.equal(get.code, "malformed_input");
    const slash = await route.handle(baseReq({ path: "/auth/verify/" }));
    assert.equal(slash.code, "malformed_input");
    const over = await route.handle(baseReq({ body: new Uint8Array(16385) }));
    assert.equal(over.code, "payload_too_large");
    const disc = await route.handle(baseReq({ disconnected: true }));
    assert.equal(disc.code, "client_disconnected");
    const ct = await route.handle(baseReq({ contentType: "" }));
    assert.equal(ct.code, "malformed_input");
    const ch = await route.handle(baseReq({ channelAllow: false }));
    assert.equal(ch.code, "malformed_input");
    const mal = await route.handle(baseReq({ body: new Uint8Array(0) }));
    assert.equal(mal.code, "malformed_input");
    const pipeline = await route.handle(baseReq({ body: new Uint8Array([123, 125]) }));
    assert.equal(typeof pipeline.code, "string");

    let constructThrew = false;
    try {
      frozen.mod.createAuthVerifyRoute({
        mode: "test",
        fungiMaxRequestSize: 16384,
        kernelMaxSizeBytes: 16384,
        namedSlideRecord: frozen.mod.AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
        namedTcbProfile: frozen.mod.AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
        verifierPinSha256: "ab".repeat(32),
        ports: stubPorts(),
        secrets: stubSecrets(),
      });
    } catch {
      constructThrew = true;
    }
    assert.equal(constructThrew, true, "missing timeoutMs must refuse construction");
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
    rmSync(frozen.dir, { recursive: true, force: true });
  }
});

test("F3 parity.md maps 102 frozen TS cases and 31 mutant labels", () => {
  const parity = readFileSync(join(MEM, "evidence", "35-auth-verify-route", "parity.md"), "utf8");
  const caseBlock = parity.slice(parity.indexOf("## Frozen TS 102 cases"), parity.indexOf("## Frozen TS 31 mutant labels"));
  const caseRows = caseBlock.split("\n").filter((l) => /^\|[0-9]/.test(l) || /^\| [0-9]/.test(l));
  assert.equal(caseRows.length, 102, "102-case table rows " + String(caseRows.length));
  const mutBlock = parity.slice(parity.indexOf("## Frozen TS 31 mutant labels"));
  const mutRows = mutBlock.split("\n").filter((l) => /^\|[0-9]/.test(l) || /^\| [0-9]/.test(l));
  assert.equal(mutRows.length, 31, "31-label table rows " + String(mutRows.length));
});
