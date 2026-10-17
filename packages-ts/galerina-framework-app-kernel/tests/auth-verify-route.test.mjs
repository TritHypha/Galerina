// Brief B: POST /auth/verify clause-4 rows F-01..F-31 + S-01.
// Synthetic data only. Each named test must go red under its mutant.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ReleaseCommitAuthority } from "../dist/secret-gate.js";
import {
  AUTH_VERIFY_MAX_BODY_BYTES,
  AUTH_VERIFY_PINNED_VERIFIER_COMMIT,
  AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
  AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
  AUTH_VERIFY_TIMEOUT_MS,
  AuthVerifyConstructionRefused,
  createAuthVerifyRoute,
} from "../dist/auth-verify-route.js";

const enc = new TextEncoder();
const dec = new TextDecoder();
const PIN = "ab".repeat(32);
const ARTIFACT = "cd".repeat(32);

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function liveSecrets() {
  const stored = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
  return {
    has() {
      return true;
    },
    use(_name, fn) {
      fn(stored);
    },
    revocationEpoch() {
      return 1;
    },
  };
}

function hang() {
  return new Promise(() => {});
}

function goodPorts(over = {}) {
  return {
    verifierCustody: async () => ({ ok: true }),
    loadArtifact: async () => ({
      ok: true,
      artifactDigest: ARTIFACT,
      snapshot: new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01]),
    }),
    admitSlide: async () => ({ ok: true }),
    authorizeVok: async () => ({ ok: true, epoch: 1 }),
    runGuest: async ({ getSecret }) => {
      getSecret("auth-verify-credential", () => {});
      return { ok: true, matched: true };
    },
    deliverSink: async () => ({ ok: true }),
    acknowledge: async () => ({ ok: true }),
    wipe: (copies) => {
      for (const copy of copies) copy.fill(0);
    },
    ...over,
  };
}

function route(over = {}) {
  return createAuthVerifyRoute({
    mode: "test",
    timeoutMs: AUTH_VERIFY_TIMEOUT_MS,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    ports: goodPorts(over.ports ?? {}),
    secrets: over.secrets ?? liveSecrets(),
    authority: over.authority,
    mintOperationId: over.mintOperationId,
    nowMs: over.nowMs,
    revokeBeforeRelease: over.revokeBeforeRelease,
    requiredSecrets: over.requiredSecrets,
  });
}

function req(over = {}) {
  return {
    method: "POST",
    path: "/auth/verify",
    contentType: "application/json",
    body: enc.encode("synthetic-submit"),
    channelAllow: true,
    principal: "synthetic-principal",
    ...over,
  };
}

function errorOf(res) {
  return JSON.parse(dec.decode(res.body)).error;
}

function outcomeOf(res) {
  return JSON.parse(dec.decode(res.body)).outcome;
}

function assertRefusal(res, rowId, code, status, stage) {
  assert.equal(res.rowId, rowId);
  assert.equal(res.code, code);
  assert.equal(res.status, status);
  assert.equal(res.stage, stage);
  assert.equal(res.leave, false);
  assert.equal(errorOf(res), code);
  assert.equal(Object.hasOwn(JSON.parse(dec.decode(res.body)), "matched"), false);
  const text = dec.decode(res.body);
  assert.equal(text.includes("synthetic-submit"), false);
  assert.equal(text.includes("\u0011"), false);
}

test("construction: missing timeout refuses", () => {
  assert.throws(
    () => createAuthVerifyRoute({
      mode: "test",
      timeoutMs: 0,
      fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
      kernelMaxSizeBytes: 64 * 1024,
      namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
      namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
      verifierPinSha256: PIN,
      ports: goodPorts(),
      secrets: liveSecrets(),
    }),
    AuthVerifyConstructionRefused,
  );
});

test("construction: missing Fungi max request size refuses", () => {
  assert.throws(
    () => createAuthVerifyRoute({
      mode: "test",
      timeoutMs: 5000,
      fungiMaxRequestSize: 0,
      kernelMaxSizeBytes: 64 * 1024,
      namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
      namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
      verifierPinSha256: PIN,
      ports: goodPorts(),
      secrets: liveSecrets(),
    }),
    AuthVerifyConstructionRefused,
  );
});

test("pos-release-before-revoke S-01 boolean only, one consume", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = [];
  const origMint = authority.mint.bind(authority);
  authority.mint = (id, epoch) => {
    const lease = origMint(id, epoch);
    minted.push(lease.leaseId);
    return lease;
  };
  let sinkSaw = "";
  const r = route({
    authority,
    ports: {
      deliverSink: async () => {
        const id = minted[minted.length - 1];
        sinkSaw = id === undefined ? "missing" : authority.stateOf(id);
        return { ok: true };
      },
    },
  });
  const body = enc.encode("synthetic-submit");
  const res = await r.handle(req({ body }));
  assert.equal(sinkSaw, "released");
  assert.equal(res.wiped, true);
  assert.equal(res.rowId, "S-01");
  assert.equal(res.status, 200);
  assert.equal(res.code, "released");
  assert.equal(outcomeOf(res), "matched");
  assert.equal(res.leave, true);
  assert.equal(res.consumed, true);
  assert.equal(res.receiptKind, "WAX_SEAL");
  assert.equal(res.receipt.authorizing, false);
  assert.equal(res.headers["X-Galerina-Operation-Id"], res.receipt.operationId);
  assert.equal(res.headers["X-Galerina-Request-Digest"], sha256Hex(body));
  assert.equal(res.headers["X-Galerina-Artifact-Digest"], ARTIFACT);
  assert.equal(res.headers["X-Galerina-Request-Digest"], res.receipt.requestDigest);
  assert.equal(JSON.parse(dec.decode(res.body)).token, undefined);
  assert.equal(JSON.parse(dec.decode(res.body)).leaseId, undefined);
  assert.notEqual(authority.consume(res.receipt.leaseId, "nope", 1), "released");
  authority.fence(res.receipt.leaseId);
  assert.equal(authority.stateOf(res.receipt.leaseId) === "released"
    || authority.stateOf(res.receipt.leaseId) === "acknowledged", true);
});

test("neg-malformed-input F-01", async () => {
  const res = await route().handle(req({ method: "GET" }));
  assertRefusal(res, "F-01", "malformed_input", 400, "ingress");
  assert.equal(res.secretTouched, false);
  assert.equal(res.lease, "not-minted");
});

test("neg-oversized-body F-02", async () => {
  const res = await route().handle(req({ body: new Uint8Array(AUTH_VERIFY_MAX_BODY_BYTES + 1) }));
  assertRefusal(res, "F-02", "payload_too_large", 413, "ingress");
  assert.equal(res.secretTouched, false);
});

test("neg-missing-operation-id F-03", async () => {
  const res = await route({ mintOperationId: () => "" }).handle(req());
  assertRefusal(res, "F-03", "operation_id_missing", 400, "mint");
});

test("neg-replay-operation-id F-04", async () => {
  const r = route({ mintOperationId: () => "op-replay" });
  const first = await r.handle(req());
  assert.equal(first.rowId, "S-01");
  const second = await r.handle(req());
  assertRefusal(second, "F-04", "operation_replay", 409, "mint");
});

test("neg-artifact-digest-missing F-05", async () => {
  const res = await route({
    ports: { loadArtifact: async () => ({ ok: false, code: "ARTIFACT_DIGEST_MISSING" }) },
  }).handle(req());
  assertRefusal(res, "F-05", "ARTIFACT_DIGEST_MISSING", 503, "wamr");
  assert.equal(res.secretTouched, false);
});

test("neg-artifact-mismatch F-06", async () => {
  const res = await route({
    ports: { loadArtifact: async () => ({ ok: false, code: "ARTIFACT_MISMATCH" }) },
  }).handle(req());
  assertRefusal(res, "F-06", "ARTIFACT_MISMATCH", 403, "wamr");
});

test("neg-aot-refused F-07", async () => {
  const res = await route({
    ports: { loadArtifact: async () => ({ ok: false, code: "AOT_REFUSED" }) },
  }).handle(req());
  assertRefusal(res, "F-07", "AOT_REFUSED", 403, "wamr");
});

test("neg-bytecode-required F-08", async () => {
  const res = await route({
    ports: { loadArtifact: async () => ({ ok: false, code: "BYTECODE_REQUIRED" }) },
  }).handle(req());
  assertRefusal(res, "F-08", "BYTECODE_REQUIRED", 403, "wamr");
});

test("neg-slide-refused F-09", async () => {
  const res = await route({
    ports: { admitSlide: async () => ({ ok: false }) },
  }).handle(req());
  assertRefusal(res, "F-09", "slide_admission_refused", 403, "slide");
  assert.equal(res.secretTouched, false);
});

test("production unnamed SLIDE record is F-09", async () => {
  const res = await createAuthVerifyRoute({
    mode: "production",
    timeoutMs: 5000,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    ports: goodPorts(),
    secrets: liveSecrets(),
  }).handle(req());
  assertRefusal(res, "F-09", "slide_admission_refused", 403, "slide");
});

test("neg-authority-missing F-10", async () => {
  const res = await route({
    ports: { authorizeVok: async () => ({ ok: false, code: "authority_missing" }) },
  }).handle(req());
  assertRefusal(res, "F-10", "authority_missing", 503, "vok");
});

test("neg-authority-stale F-11", async () => {
  const authority = new ReleaseCommitAuthority();
  const orig = authority.consume.bind(authority);
  authority.consume = (id, token, epoch) => orig(id, token, epoch + 1);
  const res = await route({ authority }).handle(req());
  assertRefusal(res, "F-11", "authority_stale", 403, "sink");
  assert.equal(res.lease, "fenced");
});

test("neg-revoke-before-release F-12", async () => {
  const res = await route({ revokeBeforeRelease: true }).handle(req());
  assertRefusal(res, "F-12", "authority_revoked", 403, "sink");
  assert.equal(res.lease, "fenced");
  assert.equal(res.consumed, false);
});

test("neg-verifier-missing F-13", async () => {
  const res = await route({
    ports: { verifierCustody: async () => ({ ok: false, code: "ARTIFACT_DIGEST_MISSING", reason: "missing" }) },
  }).handle(req());
  assertRefusal(res, "F-13", "ARTIFACT_DIGEST_MISSING", 503, "verifier");
});

test("neg-verifier-pin-mismatch F-14", async () => {
  const res = await route({
    ports: { verifierCustody: async () => ({ ok: false, code: "VERDICT_REFUSED", reason: "pin" }) },
  }).handle(req());
  assertRefusal(res, "F-14", "VERDICT_REFUSED", 403, "verifier");
});

test("neg-verifier-spawn-failure F-15", async () => {
  const res = await route({
    ports: { verifierCustody: async () => ({ ok: false, code: "VERDICT_REFUSED", reason: "spawn" }) },
  }).handle(req());
  assertRefusal(res, "F-15", "VERDICT_REFUSED", 503, "verifier");
});

test("neg-verdict-malformed F-16", async () => {
  const res = await route({
    ports: { verifierCustody: async () => ({ ok: false, code: "VERDICT_REFUSED", reason: "malformed" }) },
  }).handle(req());
  assertRefusal(res, "F-16", "VERDICT_REFUSED", 403, "verifier");
});

test("neg-verifier-nonzero-exit F-17", async () => {
  const res = await route({
    ports: { verifierCustody: async () => ({ ok: false, code: "VERDICT_REFUSED", reason: "nonzero" }) },
  }).handle(req());
  assertRefusal(res, "F-17", "VERDICT_REFUSED", 403, "verifier");
});

test("neg-secret-unavailable F-18", async () => {
  const secrets = {
    has() {
      return false;
    },
    use() {},
    revocationEpoch() {
      return 1;
    },
  };
  const res = await route({ secrets }).handle(req());
  assertRefusal(res, "F-18", "secret_unavailable", 503, "provider");
});

test("neg-guest-trap F-19", async () => {
  const res = await route({
    ports: { runGuest: async () => ({ ok: false, code: "guest_trap" }) },
  }).handle(req());
  assertRefusal(res, "F-19", "guest_trap", 503, "guest");
});

test("neg-timeout-verifier F-20", async () => {
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 25,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    ports: goodPorts({ verifierCustody: () => hang() }),
    secrets: liveSecrets(),
  }).handle(req());
  assertRefusal(res, "F-20", "deadline_exceeded", 504, "verifier");
});

test("neg-timeout-slide F-21", async () => {
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 25,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    ports: goodPorts({ admitSlide: () => hang() }),
    secrets: liveSecrets(),
  }).handle(req());
  assertRefusal(res, "F-21", "deadline_exceeded", 504, "slide");
});

test("neg-timeout-vok F-22", async () => {
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 25,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    ports: goodPorts({ authorizeVok: () => hang() }),
    secrets: liveSecrets(),
  }).handle(req());
  assertRefusal(res, "F-22", "deadline_exceeded", 504, "vok");
});

test("neg-timeout-provider F-23", async () => {
  let t = 0;
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 5,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    nowMs: () => t,
    ports: goodPorts({
      authorizeVok: async () => {
        t = 1000;
        return { ok: true, epoch: 1 };
      },
    }),
    secrets: liveSecrets(),
  }).handle(req());
  assertRefusal(res, "F-23", "deadline_exceeded", 504, "provider");
  assert.equal(res.lease, "fenced");
});

test("neg-timeout-guest F-24", async () => {
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 25,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    ports: goodPorts({ runGuest: () => hang() }),
    secrets: liveSecrets(),
  }).handle(req());
  assertRefusal(res, "F-24", "deadline_exceeded", 504, "guest");
});

test("neg-timeout-sink F-25", async () => {
  let t = 0;
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 5,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    nowMs: () => t,
    ports: goodPorts({
      runGuest: async ({ getSecret }) => {
        getSecret("auth-verify-credential", () => {});
        t = 1000;
        return { ok: true, matched: true };
      },
    }),
    secrets: liveSecrets(),
  }).handle(req());
  assertRefusal(res, "F-25", "deadline_exceeded", 504, "sink");
  assert.equal(res.consumed, false);
});

test("neg-timeout-ack F-26 does not re-release", async () => {
  const authority = new ReleaseCommitAuthority();
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 25,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    authority,
    ports: goodPorts({ acknowledge: () => hang() }),
    secrets: liveSecrets(),
  }).handle(req());
  assert.equal(res.rowId, "F-26");
  assert.equal(res.status, 504);
  assert.equal(res.code, "deadline_exceeded");
  assert.equal(res.consumed, true);
  assert.equal(res.receiptKind, "status-only");
  assert.notEqual(authority.consume(res.receipt.leaseId, "token", 1), "released");
});

test("neg-client-disconnect F-27", async () => {
  const res = await route().handle(req({ disconnected: true }));
  assertRefusal(res, "F-27", "client_disconnected", 499, "ingress");
});

test("neg-crash-after-release F-28 does not re-release", async () => {
  const authority = new ReleaseCommitAuthority();
  const res = await route({
    authority,
    ports: { deliverSink: async () => ({ ok: false, code: "delivery_unknown" }) },
  }).handle(req());
  assert.equal(res.rowId, "F-28");
  assert.equal(res.status, 503);
  assert.equal(res.code, "delivery_unknown");
  assert.equal(res.consumed, true);
  assert.equal(res.receiptKind, "status-only");
  assert.notEqual(authority.consume(res.receipt.leaseId, "token", 1), "released");
});

test("neg-partial-delivery F-29 does not retry D", async () => {
  const authority = new ReleaseCommitAuthority();
  const res = await route({
    authority,
    ports: { deliverSink: async () => ({ ok: false, code: "partial_delivery" }) },
  }).handle(req());
  assert.equal(res.rowId, "F-29");
  assert.equal(res.status, 503);
  assert.equal(res.code, "partial_delivery");
  assert.equal(res.consumed, true);
  assert.notEqual(authority.consume(res.receipt.leaseId, "token", 1), "released");
});

test("neg-unknown-outcome F-30", async () => {
  const res = await route({
    ports: { runGuest: async () => ({ ok: true, matched: "unknown" }) },
  }).handle(req());
  assertRefusal(res, "F-30", "unknown_outcome", 503, "guest");
});

test("neg-cleanup-failure F-31 quarantines", async () => {
  const res = await route({
    ports: {
      wipe: () => {
        throw new Error("wipe failed");
      },
    },
  }).handle(req());
  assert.equal(res.rowId, "F-31");
  assert.equal(res.status, 503);
  assert.equal(res.code, "cleanup_failed");
  assert.equal(res.quarantined, true);
  assert.equal(res.receiptKind, "refuse+quarantine");
  assert.equal(res.consumed, true);
});

test("timeout-late-result is wiped and never disclosed", async () => {
  let resolveCustody;
  const pending = new Promise((resolve) => {
    resolveCustody = resolve;
  });
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 25,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    ports: goodPorts({ verifierCustody: () => pending }),
    secrets: liveSecrets(),
  }).handle(req());
  assertRefusal(res, "F-20", "deadline_exceeded", 504, "verifier");
  resolveCustody({ ok: true });
  await pending;
  assert.equal(res.leave, false);
  assert.equal(res.consumed, false);
});

test("response-binding swap/replay onto another request is refused", async () => {
  const r = route();
  const a = await r.handle(req({ body: enc.encode("body-a") }));
  const b = await r.handle(req({ body: enc.encode("body-b") }));
  assert.equal(a.rowId, "S-01");
  assert.equal(b.rowId, "S-01");
  assert.notEqual(a.headers["X-Galerina-Request-Digest"], b.headers["X-Galerina-Request-Digest"]);
  assert.notEqual(a.receipt.operationId, b.receipt.operationId);
  assert.equal(a.headers["X-Galerina-Request-Digest"], sha256Hex(enc.encode("body-a")));
  assert.equal(b.headers["X-Galerina-Request-Digest"] === sha256Hex(enc.encode("body-a")), false);
});

test("unnamed TCB profile refuses production disclosure", async () => {
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 5000,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: "not-a-named-profile",
    verifierPinSha256: PIN,
    ports: goodPorts(),
    secrets: liveSecrets(),
  }).handle(req());
  assert.equal(res.status, 503);
  assert.equal(res.code, "tcb_profile_refused");
  assert.equal(res.leave, false);
});

test("verifier-dependency: C WAMR host does not link Rust; #183 crate-type is rlib", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = join(here, "..", "..", "..");
  const hostC = readFileSync(join(repo, "packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_secrets_gateway_host.c"), "utf8");
  const verdictC = readFileSync(join(repo, "packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_vok_verdict.c"), "utf8");
  const hostH = readFileSync(join(repo, "packages-ts/galerina-core-runtime/native/wamr-host/include/wamr_secrets_gateway_host.h"), "utf8");
  for (const src of [hostC, verdictC, hostH]) {
    assert.equal(/rustc|libvok_artifact|extern "C" rust|cargo build/i.test(src), false);
  }
  const u6bCargo = "C:/Users/phill/AppData/Local/Temp/galerina-u6b-vok-digest-20261016/packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml";
  const cargo = readFileSync(u6bCargo, "utf8");
  assert.equal(cargo.includes('crate-type = ["rlib"]'), true);
  assert.equal(cargo.includes("cdylib"), false);
  assert.equal(cargo.includes("staticlib"), false);
  assert.equal(AUTH_VERIFY_PINNED_VERIFIER_COMMIT, "ead2d7cc3f63f8a971da184458758d173f58bebc");
});

test("S-01 not-matched is boolean-only success", async () => {
  const res = await route({
    ports: {
      runGuest: async ({ getSecret }) => {
        getSecret("auth-verify-credential", () => {});
        return { ok: true, matched: false };
      },
    },
  }).handle(req());
  assert.equal(res.rowId, "S-01");
  assert.equal(outcomeOf(res), "not-matched");
  assert.equal(res.status, 200);
});
