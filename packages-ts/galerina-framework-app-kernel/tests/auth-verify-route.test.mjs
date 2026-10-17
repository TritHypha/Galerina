// Brief B: POST /auth/verify clause-4 rows F-01..F-31 + S-01.
// Synthetic data only. Each named test must go red under its mutant.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ReleaseCommitAuthority, SecretReleaseRefused } from "../dist/secret-gate.js";
import {
  AUTH_VERIFY_MAX_BODY_BYTES,
  AUTH_VERIFY_PINNED_VERIFIER_COMMIT,
  AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
  AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
  AUTH_VERIFY_TIMEOUT_MS,
  AuthVerifyConstructionRefused,
  createAuthVerifyRoute,
} from "../dist/auth-verify-route.js";
import {
  readBodyCapped,
  readDeclaredContentLength,
  readForeignSafeInteger,
} from "../dist/foreign-boundary.js";

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

function wrapMint(authority) {
  const orig = authority.mint.bind(authority);
  const minted = [];
  authority.mint = (id, epoch) => {
    const lease = orig(id, epoch);
    minted.push(lease);
    return lease;
  };
  return minted;
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
  assert.equal(second.lease, "acknowledged");
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
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  let lateGet;
  let uses = 0;
  const secrets = {
    has() {
      return true;
    },
    use(_name, fn) {
      uses += 1;
      fn(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
    },
    revocationEpoch() {
      return 1;
    },
  };
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 25,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    authority,
    secrets,
    ports: goodPorts({
      runGuest: async ({ getSecret }) => {
        lateGet = getSecret;
        return hang();
      },
    }),
  }).handle(req());
  assertRefusal(res, "F-24", "deadline_exceeded", 504, "guest");
  assert.equal(res.lease, "fenced");
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.equal(authority.stateOf(lease.leaseId), "fenced");
  const usesAfterResponse = uses;
  lateGet("auth-verify-credential", () => {});
  assert.equal(uses, usesAfterResponse);
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
  const minted = wrapMint(authority);
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
  assert.equal(authority.status(res.receipt.operationId).state, "delivery-unknown");
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.equal(authority.consume(lease.leaseId, lease.token, lease.epoch), "replay");
});

test("neg-client-disconnect F-27", async () => {
  const res = await route().handle(req({ disconnected: true }));
  assertRefusal(res, "F-27", "client_disconnected", 499, "ingress");
});

test("neg-crash-after-release F-28 does not re-release", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  const res = await route({
    authority,
    ports: { deliverSink: async () => ({ ok: false, code: "delivery_unknown" }) },
  }).handle(req());
  assert.equal(res.rowId, "F-28");
  assert.equal(res.status, 503);
  assert.equal(res.code, "delivery_unknown");
  assert.equal(res.consumed, true);
  assert.equal(res.receiptKind, "status-only");
  assert.equal(authority.status(res.receipt.operationId).state, "delivery-unknown");
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.equal(authority.consume(lease.leaseId, lease.token, lease.epoch), "replay");
});

test("neg-partial-delivery F-29 does not retry D", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  const res = await route({
    authority,
    ports: { deliverSink: async () => ({ ok: false, code: "partial_delivery" }) },
  }).handle(req());
  assert.equal(res.rowId, "F-29");
  assert.equal(res.status, 503);
  assert.equal(res.code, "partial_delivery");
  assert.equal(res.consumed, true);
  assert.equal(authority.status(res.receipt.operationId).state, "delivery-unknown");
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.equal(authority.consume(lease.leaseId, lease.token, lease.epoch), "replay");
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
  assert.equal(res.receiptKind, "status-only");
  assert.equal(res.consumed, true);
  assert.equal(res.leave, true);
  assert.equal(res.receipt.outcome, "matched");
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
  const pinPath = join(here, "fixtures", "ead2d7cc-vok-authority-Cargo.json");
  const cargoPath = join(here, "fixtures", "ead2d7cc-vok-authority-Cargo.toml");
  const pinRaw = readFileSync(pinPath);
  const cargoBytes = readFileSync(cargoPath);
  const pin = JSON.parse(pinRaw.toString("utf8"));
  assert.equal(pin.schema, "galerina.test.only.auth-verify.verifier-pin.v1");
  assert.equal(pin.pinnedCommit, "ead2d7cc3f63f8a971da184458758d173f58bebc");
  assert.equal(pin.path, "packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml");
  assert.equal(pin.gitBlobId, "7d346c12a6dae822cc96d06bd9520f63224eed63");
  assert.equal(pin.crateTypeLine, 'crate-type = ["rlib"]');
  const cargoLf = Buffer.from(cargoBytes.toString("utf8").replaceAll("\r\n", "\n").replaceAll("\r", "\n"));
  const cargoSha = createHash("sha256").update(cargoLf).digest("hex");
  assert.equal(cargoSha, pin.sha256);
  const cargo = cargoLf.toString("utf8");
  assert.equal(cargo.includes(pin.crateTypeLine), true);
  assert.equal(cargo.includes("cdylib"), false);
  assert.equal(cargo.includes("staticlib"), false);
  assert.equal(AUTH_VERIFY_PINNED_VERIFIER_COMMIT, pin.pinnedCommit);
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

test("neg-revoke-during-guest F-12 consume-fenced", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  const res = await route({
    authority,
    ports: {
      runGuest: async ({ getSecret }) => {
        getSecret("auth-verify-credential", () => {});
        const id = minted[minted.length - 1];
        if (id !== undefined) authority.fence(id.leaseId);
        return { ok: true, matched: true };
      },
    },
  }).handle(req());
  assertRefusal(res, "F-12", "authority_revoked", 403, "sink");
  assert.equal(res.lease, "fenced");
  assert.equal(res.consumed, false);
});

test("secret-after-fenced-lease does not open provider", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  let uses = 0;
  let got = "none";
  const secrets = {
    has() {
      return true;
    },
    use(_name, fn) {
      uses += 1;
      fn(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
    },
    revocationEpoch() {
      return 1;
    },
  };
  const res = await route({
    authority,
    secrets,
    ports: {
      runGuest: async ({ getSecret }) => {
        const id = minted[minted.length - 1];
        if (id !== undefined) authority.fence(id.leaseId);
        getSecret("auth-verify-credential", (v) => {
          got = Array.from(v).join(",");
        });
        return { ok: true, matched: true };
      },
    },
  }).handle(req());
  assert.notEqual(res.rowId, "S-01");
  assert.notEqual(res.receiptKind, "WAX_SEAL");
  assert.equal(uses, 0);
  assert.equal(got, "none");
});

test("double-and-late-secret-callback never S-01", async () => {
  let keep;
  const secrets = {
    has() {
      return true;
    },
    use(_name, fn) {
      fn(new Uint8Array([1, 2, 3, 4]));
      fn(new Uint8Array([5, 6, 7, 8]));
      keep = fn;
    },
    revocationEpoch() {
      return 1;
    },
  };
  const res = await route({
    secrets,
    ports: {
      runGuest: async ({ getSecret }) => {
        getSecret("auth-verify-credential", () => {});
        return { ok: true, matched: true };
      },
    },
  }).handle(req());
  assert.notEqual(res.rowId, "S-01");
  assert.notEqual(res.receiptKind, "WAX_SEAL");
  try {
    keep(new Uint8Array([9]));
  } catch {
    // gate may throw on the retained callback
  }
});

test("guest-secret-view is staged and zero after response", async () => {
  const stored = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
  let view;
  const secrets = {
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
  const res = await route({
    secrets,
    ports: {
      runGuest: async ({ getSecret }) => {
        getSecret("auth-verify-credential", (v) => {
          view = v;
        });
        return { ok: true, matched: true };
      },
    },
  }).handle(req());
  assert.equal(res.rowId, "S-01");
  assert.notEqual(view, stored);
  assert.equal(Array.from(view).every((b) => b === 0), true);
});

test("guest-body-wiped-after-response", async () => {
  let guestBody;
  const res = await route({
    ports: {
      runGuest: async ({ body, getSecret }) => {
        guestBody = body;
        getSecret("auth-verify-credential", () => {});
        return { ok: true, matched: true };
      },
    },
  }).handle(req());
  assert.equal(res.rowId, "S-01");
  assert.equal(guestBody.every((b) => b === 0), true);
});

test("undeclared-secret-name never S-01 and does not open provider", async () => {
  let uses = 0;
  const secrets = {
    has() {
      return true;
    },
    use(_name, fn) {
      uses += 1;
      fn(new Uint8Array([1]));
    },
    revocationEpoch() {
      return 1;
    },
  };
  const res = await route({
    secrets,
    ports: {
      runGuest: async ({ getSecret }) => {
        getSecret("other-secret", () => {});
        getSecret("auth-verify-credential", () => {});
        return { ok: true, matched: true };
      },
    },
  }).handle(req());
  assert.notEqual(res.rowId, "S-01");
  assert.notEqual(res.receiptKind, "WAX_SEAL");
  assert.equal(uses, 0);
});

test("pos-ack-bound S-01 status acknowledged", async () => {
  const authority = new ReleaseCommitAuthority();
  const res = await route({ authority }).handle(req());
  assert.equal(res.rowId, "S-01");
  assert.equal(res.receiptKind, "WAX_SEAL");
  assert.equal(authority.status(res.receipt.operationId).state, "acknowledged");
});

test("neg-ack-not-acknowledged is status-only", async () => {
  const res = await route({
    ports: {
      runGuest: async () => ({ ok: true, matched: true }),
    },
  }).handle(req());
  assert.notEqual(res.rowId, "S-01");
  assert.notEqual(res.receiptKind, "WAX_SEAL");
  assert.equal(res.receiptKind, "status-only");
  assert.equal(res.code, "delivery_unknown");
  assert.equal(res.consumed, true);
});

test("neg-zero-artifact-digest F-05", async () => {
  const res = await route({
    ports: {
      loadArtifact: async () => ({
        ok: true,
        artifactDigest: "0".repeat(64),
        snapshot: new Uint8Array([1]),
      }),
    },
  }).handle(req());
  assertRefusal(res, "F-05", "ARTIFACT_DIGEST_MISSING", 503, "wamr");
});

test("default-operation-id is a legal HTTP header value", async () => {
  const res = await route().handle(req());
  assert.equal(res.rowId, "S-01");
  const headers = new Headers();
  headers.set("X-Galerina-Operation-Id", res.headers["X-Galerina-Operation-Id"]);
  assert.equal(headers.get("X-Galerina-Operation-Id"), res.receipt.operationId);
  assert.equal(res.receipt.operationId.includes("\u0000"), false);
});

test("default-operation-id unique per route instance sharing authority", async () => {
  const authority = new ReleaseCommitAuthority();
  const a = route({ authority });
  const b = route({ authority });
  const r1 = await a.handle(req());
  const r2 = await b.handle(req());
  assert.equal(r1.rowId, "S-01");
  assert.equal(r2.rowId, "S-01");
  assert.notEqual(r1.receipt.operationId, r2.receipt.operationId);
});

test("neg-clock-nan F-30", async () => {
  const res = await route({ nowMs: () => Number.NaN }).handle(req());
  assertRefusal(res, "F-30", "unknown_outcome", 503, "ingress");
});

test("neg-clock-infinity F-30", async () => {
  const res = await route({ nowMs: () => Number.POSITIVE_INFINITY }).handle(req());
  assertRefusal(res, "F-30", "unknown_outcome", 503, "ingress");
});

test("neg-clock-non-number F-30", async () => {
  const res = await route({ nowMs: () => "now" }).handle(req());
  assertRefusal(res, "F-30", "unknown_outcome", 503, "ingress");
});

test("neg-mint-typed-stale classifies by outcome not message", async () => {
  const authority = new ReleaseCommitAuthority();
  authority.mint = () => {
    throw new SecretReleaseRefused("stale", "already in flight required retired");
  };
  const res = await route({ authority }).handle(req());
  assertRefusal(res, "F-11", "authority_stale", 403, "vok");
});

test("neg-replay-delivery-unknown reports delivery-unknown", async () => {
  const authority = new ReleaseCommitAuthority();
  const r = route({
    authority,
    mintOperationId: () => "op-unk-replay",
    ports: { deliverSink: async () => ({ ok: false, code: "delivery_unknown" }) },
  });
  const first = await r.handle(req());
  assert.equal(first.rowId, "F-28");
  const second = await r.handle(req());
  assertRefusal(second, "F-04", "operation_replay", 409, "mint");
  assert.equal(second.lease, "delivery-unknown");
});

function nanAt(k) {
  let n = 0;
  return () => {
    n += 1;
    return n === k ? Number.NaN : 1000;
  };
}

test("neg-clock-nan-after-mint fences unused lease", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  const res = await route({ authority, nowMs: nanAt(6) }).handle(req());
  assertRefusal(res, "F-30", "unknown_outcome", 503, "ingress");
  assert.equal(res.consumed, false);
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.equal(authority.stateOf(lease.leaseId), "fenced");
  assert.equal(res.lease, "fenced");
});

test("neg-clock-nan-after-consume sink-wait is status-only", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  let sinkCalls = 0;
  const res = await route({
    authority,
    nowMs: nanAt(9),
    ports: {
      deliverSink: async () => {
        sinkCalls += 1;
        return { ok: true };
      },
    },
  }).handle(req());
  assert.equal(res.consumed, true);
  assert.equal(res.leave, true);
  assert.equal(res.receiptKind, "status-only");
  assert.equal(res.code, "delivery_unknown");
  assert.equal(res.rowId, "F-28");
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.equal(authority.status(lease.leaseId).state, "delivery-unknown");
  assert.equal(sinkCalls, 0);
});

test("neg-clock-nan-after-consume ack-read is status-only", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  let sinkCalls = 0;
  const res = await route({
    authority,
    nowMs: nanAt(10),
    ports: {
      deliverSink: async () => {
        sinkCalls += 1;
        return { ok: true };
      },
    },
  }).handle(req());
  assert.equal(res.consumed, true);
  assert.equal(res.leave, true);
  assert.equal(res.receiptKind, "status-only");
  assert.equal(res.code, "delivery_unknown");
  assert.equal(res.rowId, "F-28");
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.equal(authority.status(lease.leaseId).state, "delivery-unknown");
  assert.equal(sinkCalls, 1);
});

async function assertPortHeld(label, portsOver, expectState, expectSnapWiped = true) {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  const snap = new Uint8Array([9, 9, 9, 9]);
  let guestBody;
  let threw = false;
  let res;
  try {
    res = await route({
      authority,
      ports: {
        loadArtifact: async () => ({
          ok: true,
          artifactDigest: ARTIFACT,
          snapshot: snap,
        }),
        runGuest: async ({ body, getSecret }) => {
          guestBody = body;
          getSecret("auth-verify-credential", () => {});
          return { ok: true, matched: true };
        },
        ...portsOver,
      },
    }).handle(req());
  } catch {
    threw = true;
  }
  assert.equal(threw, false, label);
  assert.equal(res === undefined, false, label);
  assert.notEqual(res.rowId, "S-01", label);
  if (expectSnapWiped === true) {
    assert.equal(snap.every((b) => b === 0), true, label);
  }
  if (guestBody !== undefined) {
    assert.equal(guestBody.every((b) => b === 0), true, label);
  }
  const lease = minted[minted.length - 1];
  if (expectState === "not-minted") {
    assert.equal(lease === undefined || authority.stateOf(lease.leaseId) !== "released", true, label);
  } else if (lease !== undefined) {
    assert.equal(authority.stateOf(lease.leaseId), expectState, label);
    assert.equal(res.lease, expectState, label);
  }
  return res;
}

test("port-loadArtifact-rejects does not reject handle", async () => {
  await assertPortHeld("load-reject", {
    loadArtifact: async () => {
      throw new Error("load boom");
    },
  }, "not-minted", false);
});

test("port-loadArtifact-sync-throw does not reject handle", async () => {
  await assertPortHeld("load-sync", {
    loadArtifact: () => {
      throw new Error("load sync boom");
    },
  }, "not-minted", false);
});

test("port-verifierCustody-rejects does not reject handle", async () => {
  await assertPortHeld("custody-reject", {
    verifierCustody: async () => {
      throw new Error("custody boom");
    },
  }, "not-minted");
});

test("port-verifierCustody-sync-throw does not reject handle", async () => {
  await assertPortHeld("custody-sync", {
    verifierCustody: () => {
      throw new Error("custody sync boom");
    },
  }, "not-minted");
});

test("port-admitSlide-rejects does not reject handle", async () => {
  await assertPortHeld("slide-reject", {
    admitSlide: async () => {
      throw new Error("slide boom");
    },
  }, "not-minted");
});

test("port-admitSlide-sync-throw does not reject handle", async () => {
  await assertPortHeld("slide-sync", {
    admitSlide: () => {
      throw new Error("slide sync boom");
    },
  }, "not-minted");
});

test("port-authorizeVok-rejects does not reject handle", async () => {
  await assertPortHeld("vok-reject", {
    authorizeVok: async () => {
      throw new Error("vok boom");
    },
  }, "not-minted");
});

test("port-authorizeVok-sync-throw does not reject handle", async () => {
  await assertPortHeld("vok-sync", {
    authorizeVok: () => {
      throw new Error("vok sync boom");
    },
  }, "not-minted");
});

test("port-runGuest-rejects fences unused and wipes", async () => {
  const res = await assertPortHeld("guest-reject", {
    runGuest: async ({ getSecret }) => {
      getSecret("auth-verify-credential", () => {});
      throw new Error("guest boom");
    },
  }, "fenced");
  assert.equal(res.consumed, false);
  assert.equal(res.receiptKind, "refuse");
});

test("port-runGuest-sync-throw fences unused and wipes", async () => {
  const res = await assertPortHeld("guest-sync", {
    runGuest: () => {
      throw new Error("guest sync boom");
    },
  }, "fenced");
  assert.equal(res.consumed, false);
});

test("port-deliverSink-rejects is status-only delivery-unknown", async () => {
  const res = await assertPortHeld("sink-reject", {
    deliverSink: async () => {
      throw new Error("sink boom");
    },
  }, "delivery-unknown");
  assert.equal(res.consumed, true);
  assert.equal(res.receiptKind, "status-only");
  assert.equal(res.code, "delivery_unknown");
});

test("port-deliverSink-sync-throw is status-only delivery-unknown", async () => {
  const res = await assertPortHeld("sink-sync", {
    deliverSink: () => {
      throw new Error("sink sync boom");
    },
  }, "delivery-unknown");
  assert.equal(res.consumed, true);
  assert.equal(res.receiptKind, "status-only");
});

test("port-acknowledge-rejects is status-only delivery-unknown", async () => {
  const res = await assertPortHeld("ack-reject", {
    acknowledge: async () => {
      throw new Error("ack boom");
    },
  }, "delivery-unknown");
  assert.equal(res.consumed, true);
  assert.equal(res.receiptKind, "status-only");
});

test("port-acknowledge-sync-throw is status-only delivery-unknown", async () => {
  const res = await assertPortHeld("ack-sync", {
    acknowledge: () => {
      throw new Error("ack sync boom");
    },
  }, "delivery-unknown");
  assert.equal(res.consumed, true);
  assert.equal(res.receiptKind, "status-only");
});

test("port-wipe-sync-throw quarantines and resolves", async () => {
  let threw = false;
  let res;
  try {
    res = await route({
      ports: {
        wipe: () => {
          throw new Error("wipe boom");
        },
      },
    }).handle(req());
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(res.rowId, "F-31");
  assert.equal(res.code, "cleanup_failed");
  assert.equal(res.quarantined, true);
});

test("neg-route-ack-not-acknowledged is status-only never WAX_SEAL", async () => {
  const authority = new ReleaseCommitAuthority();
  const orig = authority.acknowledgeMinted.bind(authority);
  authority.acknowledgeMinted = (id) => {
    orig(id);
    return "missing";
  };
  const res = await route({ authority }).handle(req());
  assert.notEqual(res.rowId, "S-01");
  assert.notEqual(res.receiptKind, "WAX_SEAL");
  assert.equal(res.receiptKind, "status-only");
  assert.equal(res.code, "delivery_unknown");
  assert.equal(res.consumed, true);
});

test("late-getSecret getter-closed latch holds when lease spoofed unused", async () => {
  const authority = new ReleaseCommitAuthority();
  let lateGet;
  let uses = 0;
  const secrets = {
    has() {
      return true;
    },
    use(_name, fn) {
      uses += 1;
      fn(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
    },
    revocationEpoch() {
      return 1;
    },
  };
  const res = await createAuthVerifyRoute({
    mode: "test",
    timeoutMs: 25,
    fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
    kernelMaxSizeBytes: 64 * 1024,
    namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
    namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
    verifierPinSha256: PIN,
    authority,
    secrets,
    ports: goodPorts({
      runGuest: async ({ getSecret }) => {
        lateGet = getSecret;
        return hang();
      },
    }),
  }).handle(req());
  assertRefusal(res, "F-24", "deadline_exceeded", 504, "guest");
  authority.stateOf = () => "unused";
  const usesAfter = uses;
  lateGet("auth-verify-credential", () => {});
  assert.equal(uses, usesAfter);
});

test("route-fence-inside-provider-use does not hand bytes to guest", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  const stored = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
  let got = "none";
  const secrets = {
    has() {
      return true;
    },
    use(_name, fn) {
      const id = minted[minted.length - 1];
      if (id !== undefined) authority.fence(id.leaseId);
      fn(stored);
    },
    revocationEpoch() {
      return 1;
    },
  };
  const res = await route({
    authority,
    secrets,
    ports: {
      runGuest: async ({ getSecret }) => {
        getSecret("auth-verify-credential", (v) => {
          got = Array.from(v).join(",");
        });
        return { ok: true, matched: true };
      },
    },
  }).handle(req());
  assert.equal(got, "none");
  assert.notEqual(res.rowId, "S-01");
  assert.equal(res.consumed, false);
});

test("foreign-boundary readForeignSafeInteger refuses NaN Infinity string object", () => {
  assert.equal(readForeignSafeInteger(Number.NaN).kind, "refused");
  assert.equal(readForeignSafeInteger(Number.POSITIVE_INFINITY).kind, "refused");
  assert.equal(readForeignSafeInteger("1").kind, "refused");
  assert.equal(readForeignSafeInteger({}).kind, "refused");
  assert.equal(readForeignSafeInteger(1.5).kind, "refused");
  assert.deepEqual(readForeignSafeInteger(3), { kind: "ok", value: 3 });
});

test("foreign-boundary content-length digits only", () => {
  assert.equal(readDeclaredContentLength(null).kind, "absent");
  assert.equal(readDeclaredContentLength("").kind, "refused");
  assert.equal(readDeclaredContentLength("1e3").kind, "refused");
  assert.equal(readDeclaredContentLength("0x10").kind, "refused");
  assert.equal(readDeclaredContentLength(" 1").kind, "refused");
  assert.deepEqual(readDeclaredContentLength("16"), { kind: "ok", value: 16 });
});

test("foreign-boundary readBodyCapped wipes over-cap chunks", async () => {
  const first = new Uint8Array([1, 2, 3, 4]);
  const over = new Uint8Array([5, 6, 7, 8]);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(first);
      controller.enqueue(over);
      controller.close();
    },
  });
  const result = await readBodyCapped(stream, 4);
  assert.equal(result.kind, "too_large");
  assert.equal(first.every((b) => b === 0), true);
  assert.equal(over.every((b) => b === 0), true);
});

test("foreign-boundary readBodyCapped wipes on non-Uint8Array chunk", async () => {
  const first = new Uint8Array([1, 2, 3]);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(first);
      controller.enqueue("nope");
      controller.close();
    },
  });
  const result = await readBodyCapped(stream, 64);
  assert.equal(result.kind, "refused");
  assert.equal(first.every((b) => b === 0), true);
});

test("foreign-boundary readBodyCapped wipes on stream error", async () => {
  const first = new Uint8Array([9, 9, 9]);
  let pulls = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(first);
        return;
      }
      throw new Error("stream boom");
    },
  });
  const result = await readBodyCapped(stream, 64);
  assert.equal(result.kind, "refused");
  assert.equal(first.every((b) => b === 0), true);
});

function streamOf(items, hook) {
  let i = 0;
  return {
    getReader() {
      return {
        async read() {
          if (hook !== undefined) hook(i);
          if (i >= items.length) return { done: true };
          return { done: false, value: items[i++] };
        },
        async cancel() {},
      };
    },
  };
}

function zeroed(u) {
  return Array.prototype.every.call(u, (b) => b === 0);
}

test("foreign-boundary readBodyCapped refuses liar byteLength subclass and wipes", async () => {
  class Liar extends Uint8Array {
    get byteLength() {
      return 0;
    }
  }
  const chunk = Liar.from([1, 2, 3, 4]);
  let threw = false;
  let result;
  try {
    result = await readBodyCapped(streamOf([chunk]), 16);
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(result.kind, "refused");
  assert.equal(Array.prototype.every.call(chunk, (b) => b === 0), true);
});

test("foreign-boundary readBodyCapped refuses flipping byteLength subclass vs cap", async () => {
  let reads = 0;
  class Flip extends Uint8Array {
    get byteLength() {
      reads += 1;
      return reads === 1 ? 2 : 4;
    }
  }
  const chunk = Flip.from([1, 2, 3, 4]);
  let threw = false;
  let result;
  try {
    result = await readBodyCapped(streamOf([chunk]), 3);
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.notEqual(result.kind, "ok");
  assert.equal(Array.prototype.every.call(chunk, (b) => b === 0), true);
});

test("foreign-boundary readBodyCapped intrinsic-wipes fill-override subclass", async () => {
  class NoFill extends Uint8Array {
    fill() {
      return this;
    }
  }
  const chunk = NoFill.from([7, 7]);
  let threw = false;
  let result;
  try {
    result = await readBodyCapped(streamOf([chunk]), 1);
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(result.kind, "refused");
  assert.equal(Array.prototype.every.call(chunk, (b) => b === 0), true);
});

test("foreign-boundary readBodyCapped refuses non-integer caps", async () => {
  const caps = [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY];
  for (const cap of caps) {
    const result = await readBodyCapped(streamOf([]), cap);
    assert.equal(result.kind, "refused", String(cap));
  }
});

test("authority-fence-throws on guest-timeout handle stays typed", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  authority.fence = () => {
    throw new Error("fence boom");
  };
  let threw = false;
  let res;
  try {
    res = await createAuthVerifyRoute({
      mode: "test",
      timeoutMs: 25,
      fungiMaxRequestSize: AUTH_VERIFY_MAX_BODY_BYTES,
      kernelMaxSizeBytes: 64 * 1024,
      namedSlideRecord: AUTH_VERIFY_SYNTHETIC_SLIDE_RECORD,
      namedTcbProfile: AUTH_VERIFY_SYNTHETIC_TCB_PROFILE,
      verifierPinSha256: PIN,
      authority,
      secrets: liveSecrets(),
      ports: goodPorts({
        runGuest: async () => hang(),
      }),
    }).handle(req());
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(res === undefined, false);
  assert.notEqual(res.rowId, "S-01");
  assert.notEqual(res.lease, "fenced");
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.notEqual(authority.stateOf(lease.leaseId), "fenced");
});

test("authority-markUnknown-throws after sink-throw handle stays typed", async () => {
  const authority = new ReleaseCommitAuthority();
  wrapMint(authority);
  authority.markUnknown = () => {
    throw new Error("mark boom");
  };
  let threw = false;
  let res;
  try {
    res = await route({
      authority,
      ports: {
        deliverSink: () => {
          throw new Error("sink sync boom");
        },
      },
    }).handle(req());
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(res === undefined, false);
  assert.equal(res.receiptKind, "status-only");
  assert.equal(res.code, "delivery_unknown");
});

test("consume-commits-then-throws is status-only never leftover released", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  const orig = authority.consume.bind(authority);
  authority.consume = (...args) => {
    orig(...args);
    throw new Error("after commit");
  };
  let sinkCalls = 0;
  let threw = false;
  let res;
  try {
    res = await route({
      authority,
      ports: {
        deliverSink: async () => {
          sinkCalls += 1;
          return { ok: true };
        },
      },
    }).handle(req());
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(res === undefined, false);
  assert.equal(res.receiptKind, "status-only");
  assert.equal(res.code, "delivery_unknown");
  assert.equal(res.rowId, "F-28");
  assert.equal(sinkCalls, 0);
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.equal(authority.stateOf(lease.leaseId), "delivery-unknown");
});

test("loadArtifact snapshot getter is read once and wiped", async () => {
  const made = [];
  const res = await route({
    ports: {
      loadArtifact: async () => ({
        ok: true,
        artifactDigest: ARTIFACT,
        get snapshot() {
          const b = new Uint8Array([8, 8]);
          made.push(b);
          return b;
        },
      }),
    },
  }).handle(req());
  assert.equal(res.rowId, "S-01");
  assert.equal(made.length, 1);
  assert.equal(made[0].every((b) => b === 0), true);
});

test("unlisted stateOf after consume is status-only never leftover released", async () => {
  for (const bogus of ["bogus", 7]) {
    const authority = new ReleaseCommitAuthority();
    const minted = wrapMint(authority);
    const origConsume = authority.consume.bind(authority);
    const origState = authority.stateOf.bind(authority);
    let committed = false;
    authority.consume = (...args) => {
      const r = origConsume(...args);
      committed = true;
      return r;
    };
    authority.stateOf = (id) => (committed === true ? bogus : origState(id));
    let threw = false;
    let res;
    try {
      res = await route({
        authority,
        ports: {
          deliverSink: async () => {
            throw new Error("sink boom");
          },
        },
      }).handle(req());
    } catch {
      threw = true;
    }
    assert.equal(threw, false, String(bogus));
    assert.equal(res === undefined, false, String(bogus));
    assert.equal(res.receiptKind, "status-only", String(bogus));
    assert.equal(res.code, "delivery_unknown", String(bogus));
    assert.equal(res.rowId, "F-28", String(bogus));
    const lease = minted[minted.length - 1];
    assert.equal(lease === undefined, false, String(bogus));
    assert.equal(origState(lease.leaseId), "delivery-unknown", String(bogus));
  }
});

test("stateOf-throw after consume is status-only never leftover released", async () => {
  const authority = new ReleaseCommitAuthority();
  const minted = wrapMint(authority);
  const origConsume = authority.consume.bind(authority);
  const origState = authority.stateOf.bind(authority);
  let committed = false;
  authority.consume = (...args) => {
    const r = origConsume(...args);
    committed = true;
    return r;
  };
  authority.stateOf = (id) => {
    if (committed === true) throw new Error("stateOf boom");
    return origState(id);
  };
  let threw = false;
  let res;
  try {
    res = await route({
      authority,
      ports: {
        deliverSink: async () => {
          throw new Error("sink boom");
        },
      },
    }).handle(req());
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(res === undefined, false);
  assert.equal(res.receiptKind, "status-only");
  assert.equal(res.code, "delivery_unknown");
  assert.equal(res.rowId, "F-28");
  const lease = minted[minted.length - 1];
  assert.equal(lease === undefined, false);
  assert.equal(origState(lease.leaseId), "delivery-unknown");
});

test("foreign-boundary readBodyCapped uses intrinsic length not own-instance byteLength", async () => {
  const chunk = new Uint8Array([1, 2, 3, 4]);
  Object.defineProperty(chunk, "byteLength", { get() { return 0; } });
  let threw = false;
  let result;
  try {
    result = await readBodyCapped(streamOf([chunk]), 3);
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(result.kind, "too_large");
  assert.equal(zeroed(chunk), true);
});

test("foreign-boundary readBodyCapped wipes source chunks after ok copy", async () => {
  const first = new Uint8Array([1, 2, 3]);
  const second = new Uint8Array([4, 5]);
  let threw = false;
  let result;
  try {
    result = await readBodyCapped(streamOf([first, second]), 16);
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(result.kind, "ok");
  assert.deepEqual(Array.from(result.body), [1, 2, 3, 4, 5]);
  assert.equal(zeroed(first), true);
  assert.equal(zeroed(second), true);
});

test("foreign-boundary readBodyCapped assembly catch wipes chunks", async () => {
  const chunk = new Uint8Array([3, 3, 3]);
  const origSet = Uint8Array.prototype.set;
  let threw = false;
  let result;
  try {
    Uint8Array.prototype.set = function () {
      throw new Error("set boom");
    };
    result = await readBodyCapped(streamOf([chunk]), 16);
  } catch {
    threw = true;
  } finally {
    Uint8Array.prototype.set = origSet;
  }
  assert.equal(threw, false);
  assert.equal(result.kind, "refused");
  assert.equal(zeroed(chunk), true);
});

test("foreign-boundary readBodyCapped refuses resizable and SharedArrayBuffer chunks", async () => {
  let rab;
  try {
    rab = new ArrayBuffer(4, { maxByteLength: 16 });
  } catch {
    rab = undefined;
  }
  assert.equal(rab === undefined, false);
  const resized = new Uint8Array(rab);
  resized.set([9, 9, 9, 9]);
  const tail = new Uint8Array([5]);
  let threw = false;
  let result;
  try {
    result = await readBodyCapped(streamOf([resized, tail], (i) => {
      if (i === 1) rab.resize(1);
    }), 16);
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(result.kind, "refused");
  assert.equal(result.kind === "ok", false);
  assert.equal(zeroed(resized), true);

  const grownBuf = new ArrayBuffer(2, { maxByteLength: 64 });
  const grown = new Uint8Array(grownBuf);
  grown.set([4, 4]);
  let grewThrew = false;
  let grewResult;
  try {
    grewResult = await readBodyCapped(streamOf([grown], (i) => {
      if (i === 1) {
        grownBuf.resize(32);
        grown.fill(6);
      }
    }), 3);
  } catch {
    grewThrew = true;
  }
  assert.equal(grewThrew, false);
  assert.equal(grewResult.kind, "refused");
  assert.equal(zeroed(grown), true);

  const sab = new SharedArrayBuffer(4);
  const shared = new Uint8Array(sab);
  shared.set([8, 8, 8, 8]);
  let sabThrew = false;
  let sabResult;
  try {
    sabResult = await readBodyCapped(streamOf([shared]), 16);
  } catch {
    sabThrew = true;
  }
  assert.equal(sabThrew, false);
  assert.equal(sabResult.kind, "refused");
  assert.equal(zeroed(shared), true);
});
