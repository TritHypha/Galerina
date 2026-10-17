// RD-1415 status-only recovery: closed union, no re-release, bound ACK.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createSecretGate,
  ReleaseCommitAuthority,
  RELEASE_LEASE_CAP,
} from "../dist/secret-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const cloneRoot = join(pkgRoot, "..", "..");
const srcPath = join(pkgRoot, "src", "release-commit-point.ts");
const secretGateSrcPath = join(pkgRoot, "src", "secret-gate.ts");
const tscPath = join(pkgRoot, "node_modules", "typescript", "bin", "tsc");
const KINDS = ["RELEASED_ACKED", "RELEASED_UNACKED", "REFUSED", "DELIVERY_UNKNOWN", "NOT_FOUND"];
const SYNTHETIC = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];

function countingProvider() {
  let useCount = 0;
  return {
    has() {
      return true;
    },
    use(_name, fn) {
      useCount += 1;
      fn(new Uint8Array(SYNTHETIC));
    },
    revocationEpoch() {
      return 1;
    },
    useCount() {
      return useCount;
    },
  };
}

function srcText() {
  return readFileSync(srcPath, "utf8").replaceAll("\r\n", "\n");
}

function appKernelSrcPorcelain() {
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--", "packages-ts/galerina-framework-app-kernel/src", "packages-ts/galerina-framework-app-kernel/dist"],
    { cwd: cloneRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function authorityFromMutatedSource(mutatedSource) {
  const dir = mkdtempSync(join(tmpdir(), "u4-status-mutant-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "release-commit-point.ts"), mutatedSource);
    writeFileSync(join(dir, "src", "secret-gate.ts"), readFileSync(secretGateSrcPath));
    const built = spawnSync(process.execPath, [
      tscPath,
      "src/release-commit-point.ts",
      "src/secret-gate.ts",
      "--outDir", "dist",
      "--rootDir", "src",
      "--module", "nodenext",
      "--moduleResolution", "nodenext",
      "--target", "es2022",
      "--skipLibCheck",
      "--noCheck",
    ], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.equal(built.status, 0, built.stderr || built.stdout);
    const url = `${pathToFileURL(join(dir, "dist", "release-commit-point.js")).href}?m=${Date.now()}`;
    return await import(url);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("status is a closed union and unused/missing/fenced map fail-closed", () => {
  const authority = new ReleaseCommitAuthority();
  const unused = authority.mint("op-unused", 1);
  const unusedStatus = authority.status("op-unused");
  assert.equal(unusedStatus.kind, "DELIVERY_UNKNOWN");
  assert.ok(KINDS.includes(unusedStatus.kind));
  const missing = authority.status("no-such-op");
  assert.equal(missing.kind, "NOT_FOUND");
  authority.fence(unused.leaseId);
  const fenced = authority.status("op-unused");
  assert.equal(fenced.kind, "REFUSED");
  const before = authority.stateOf("op-unused");
  assert.equal(authority.ack("op-unused", unused.token, 1), "fenced");
  assert.equal(authority.stateOf("op-unused"), before);
  assert.equal(authority.status("op-unused").kind, "REFUSED");
});

test("status of released/acked/unknown never re-consumes", () => {
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-status", 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
  assert.equal(authority.status("op-status").kind, "RELEASED_UNACKED");
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "replay");
  assert.equal(authority.status("op-status").kind, "RELEASED_UNACKED");
  assert.equal(authority.ack(lease.leaseId, lease.token, 1), "acknowledged");
  assert.equal(authority.status("op-status").kind, "RELEASED_ACKED");
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "replay");
  authority.markUnknown("op-status");
  assert.equal(authority.status("op-status").kind, "RELEASED_ACKED");
  const unknown = authority.mint("op-unknown", 1);
  assert.equal(authority.consume(unknown.leaseId, unknown.token, 1), "released");
  authority.markUnknown("op-unknown");
  assert.equal(authority.status("op-unknown").kind, "DELIVERY_UNKNOWN");
  assert.equal(authority.consume(unknown.leaseId, unknown.token, 1), "replay");
  assert.equal(authority.ack(unknown.leaseId, unknown.token, 1), "replay");
  assert.equal(authority.status("op-unknown").kind, "DELIVERY_UNKNOWN");
});

test("status leaves every lease state unchanged and never re-consumes", () => {
  const cases = [];

  const unusedAuth = new ReleaseCommitAuthority();
  const unusedProvider = countingProvider();
  const unusedGate = createSecretGate(unusedProvider, { authority: unusedAuth, requireBoundOperationId: true });
  const unusedLease = unusedAuth.mint("op-s-unused", 1);
  cases.push({
    name: "unused",
    authority: unusedAuth,
    provider: unusedProvider,
    gate: unusedGate,
    id: "op-s-unused",
    lease: unusedLease,
    consumeAfter: "released",
  });

  const releasedAuth = new ReleaseCommitAuthority();
  const releasedProvider = countingProvider();
  const releasedGate = createSecretGate(releasedProvider, { authority: releasedAuth, requireBoundOperationId: true });
  releasedGate.getSecret(["credential"], "credential", () => {}, undefined, "op-s-released");
  cases.push({
    name: "released",
    authority: releasedAuth,
    provider: releasedProvider,
    gate: releasedGate,
    id: "op-s-released",
    lease: { leaseId: "op-s-released", token: releasedAuth.mint("op-s-released", 1).token, epoch: 1 },
    consumeAfter: "replay",
  });

  const ackedAuth = new ReleaseCommitAuthority();
  const ackedProvider = countingProvider();
  const ackedGate = createSecretGate(ackedProvider, { authority: ackedAuth, requireBoundOperationId: true });
  ackedGate.getSecret(["credential"], "credential", () => {}, undefined, "op-s-acked");
  ackedGate.acknowledge("op-s-acked");
  cases.push({
    name: "acknowledged",
    authority: ackedAuth,
    provider: ackedProvider,
    gate: ackedGate,
    id: "op-s-acked",
    lease: { leaseId: "op-s-acked", token: ackedAuth.mint("op-s-acked", 1).token, epoch: 1 },
    consumeAfter: "replay",
  });

  const unknownAuth = new ReleaseCommitAuthority();
  const unknownProvider = countingProvider();
  const unknownGate = createSecretGate(unknownProvider, { authority: unknownAuth, requireBoundOperationId: true });
  unknownGate.getSecret(["credential"], "credential", () => {}, undefined, "op-s-unknown");
  unknownGate.noteUnknown("op-s-unknown");
  cases.push({
    name: "delivery-unknown",
    authority: unknownAuth,
    provider: unknownProvider,
    gate: unknownGate,
    id: "op-s-unknown",
    lease: { leaseId: "op-s-unknown", token: unknownAuth.mint("op-s-unknown", 1).token, epoch: 1 },
    consumeAfter: "replay",
  });

  const fencedAuth = new ReleaseCommitAuthority();
  const fencedProvider = countingProvider();
  const fencedGate = createSecretGate(fencedProvider, { authority: fencedAuth, requireBoundOperationId: true });
  const fencedLease = fencedAuth.mint("op-s-fenced", 1);
  fencedAuth.fence(fencedLease.leaseId);
  cases.push({
    name: "fenced",
    authority: fencedAuth,
    provider: fencedProvider,
    gate: fencedGate,
    id: "op-s-fenced",
    lease: fencedLease,
    consumeAfter: "fenced",
  });

  const retiredAuth = new ReleaseCommitAuthority();
  const retiredProvider = countingProvider();
  const retiredGate = createSecretGate(retiredProvider, { authority: retiredAuth, requireBoundOperationId: true });
  let retiredLease = { leaseId: "op-s-retired-0", token: "", epoch: 1 };
  for (let i = 0; i < RELEASE_LEASE_CAP; i += 1) {
    const lease = retiredAuth.mint(`op-s-retired-${i}`, 1);
    assert.equal(retiredAuth.consume(lease.leaseId, lease.token, 1), "released");
    assert.equal(retiredAuth.ack(lease.leaseId, lease.token, 1), "acknowledged");
    if (i === 0) retiredLease = lease;
  }
  const extra = retiredAuth.mint("op-s-retired-extra", 1);
  assert.equal(retiredAuth.consume(extra.leaseId, extra.token, 1), "released");
  cases.push({
    name: "retired",
    authority: retiredAuth,
    provider: retiredProvider,
    gate: retiredGate,
    id: "op-s-retired-0",
    lease: retiredLease,
    consumeAfter: "missing",
  });

  const missingAuth = new ReleaseCommitAuthority();
  const missingProvider = countingProvider();
  const missingGate = createSecretGate(missingProvider, { authority: missingAuth, requireBoundOperationId: true });
  cases.push({
    name: "missing",
    authority: missingAuth,
    provider: missingProvider,
    gate: missingGate,
    id: "op-s-missing",
    lease: { leaseId: "op-s-missing", token: "none", epoch: 1 },
    consumeAfter: "missing",
  });

  for (const row of cases) {
    const releasedBefore = row.authority.auditEvents().filter((e) => e.outcome === "released").length;
    const usesBefore = row.provider.useCount();
    const stateBefore = row.authority.stateOf(row.id);
    const status = row.authority.status(row.id);
    const gateStatus = row.gate.status(row.id);
    assert.equal(status.kind, gateStatus.kind, `${row.name} gate.status kind`);
    assert.equal(row.authority.auditEvents().filter((e) => e.outcome === "released").length, releasedBefore, `${row.name} released count`);
    assert.equal(row.provider.useCount(), usesBefore, `${row.name} useCount`);
    assert.equal(row.authority.stateOf(row.id), stateBefore, `${row.name} stateOf`);
    assert.equal(row.authority.consume(row.lease.leaseId, row.lease.token, row.lease.epoch), row.consumeAfter, `${row.name} consume after status`);
  }
});

test("retired and unused read DELIVERY_UNKNOWN; never-minted reads NOT_FOUND", () => {
  const authority = new ReleaseCommitAuthority();
  authority.mint("op-live-unused", 1);
  assert.equal(authority.status("op-live-unused").kind, "DELIVERY_UNKNOWN");
  for (let i = 0; i < RELEASE_LEASE_CAP; i += 1) {
    const lease = authority.mint(`op-cap-${i}`, 1);
    assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
    assert.equal(authority.ack(lease.leaseId, lease.token, 1), "acknowledged");
  }
  const extra = authority.mint("op-cap-extra", 1);
  assert.equal(authority.consume(extra.leaseId, extra.token, 1), "released");
  assert.equal(authority.status("op-cap-0").kind, "DELIVERY_UNKNOWN");
  assert.notEqual(authority.status("op-cap-0").kind, "NOT_FOUND");
  assert.equal(authority.stateOf("op-cap-0"), "missing");
  assert.equal(authority.status("never-minted").kind, "NOT_FOUND");
  assert.equal(authority.status("").kind, "NOT_FOUND");
});

test("ack of foreign/replayed id or wrong epoch refuses without flipping state", () => {
  const authority = new ReleaseCommitAuthority();
  const a = authority.mint("op-a", 3);
  const b = authority.mint("op-b", 3);
  assert.equal(authority.consume(a.leaseId, a.token, 3), "released");
  assert.equal(authority.ack("op-b", a.token, 3), "stale");
  assert.equal(authority.stateOf("op-a"), "released");
  assert.equal(authority.stateOf("op-b"), "unused");
  assert.equal(authority.ack("op-a", b.token, 3), "stale");
  assert.equal(authority.stateOf("op-a"), "released");
  assert.equal(authority.ack("op-a", a.token, 9), "stale");
  assert.equal(authority.stateOf("op-a"), "released");
  assert.equal(authority.ack("op-a", a.token, 3), "acknowledged");
  assert.equal(authority.ack("op-a", a.token, 3), "acknowledged");
  assert.equal(authority.stateOf("op-a"), "acknowledged");
});

test("SOURCE-PIN ONLY: kernel mints releaseOperationId from requestId and seq, not a client field", () => {
  const src = readFileSync(new URL("../src/kernel.ts", import.meta.url), "utf8");
  assert.match(src, /const releaseOperationId = `\$\{req\.requestId\}\\u0000\$\{releaseSeq\}`/);
  assert.match(src, /requireBoundOperationId:\s*true/);
  assert.doesNotMatch(src, /releaseOperationId = req\.(body|headers|query)/);
});

test("mutant: UNKNOWN collapsed to REFUSED goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    'case "delivery-unknown":\n        return Object.freeze({ kind: "DELIVERY_UNKNOWN", operationId: id });',
    'case "delivery-unknown":\n        return Object.freeze({ kind: "REFUSED", operationId: id });',
  );
  assert.notEqual(mutated, originalText, "UNKNOWN-collapse mutant is a real edit");
  const { ReleaseCommitAuthority: Mutated } = await authorityFromMutatedSource(mutated);
  const authority = new Mutated();
  const lease = authority.mint("op-m1", 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
  authority.markUnknown("op-m1");
  assert.equal(authority.status("op-m1").kind, "REFUSED", "mutant must go red by collapsing UNKNOWN");
  assert.equal(appKernelSrcPorcelain(), before);
  const green = new ReleaseCommitAuthority();
  const greenLease = green.mint("op-m1", 1);
  assert.equal(green.consume(greenLease.leaseId, greenLease.token, 1), "released");
  green.markUnknown("op-m1");
  assert.equal(green.status("op-m1").kind, "DELIVERY_UNKNOWN");
});

test("mutant: missing rec admits goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    "if (rec === undefined) {\n      if (this.#retired.has(id)) {\n        return Object.freeze({ kind: \"DELIVERY_UNKNOWN\", operationId: id });\n      }\n      return Object.freeze({ kind: \"NOT_FOUND\", operationId: id });\n    }",
    "if (rec === undefined) {\n      return Object.freeze({ kind: \"RELEASED_ACKED\", operationId: id });\n    }",
  );
  assert.notEqual(mutated, originalText, "missing-rec mutant is a real edit");
  const { ReleaseCommitAuthority: Mutated } = await authorityFromMutatedSource(mutated);
  const authority = new Mutated();
  assert.equal(authority.status("nope").kind, "RELEASED_ACKED", "mutant must go red by admitting a never-minted id");
  assert.equal(appKernelSrcPorcelain(), before);
  const green = new ReleaseCommitAuthority();
  assert.equal(green.status("nope").kind, "NOT_FOUND");
});

test("mutant: unused and default arm read NOT_FOUND goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    "const unusedOrUnknown: string = rec.state;\n        void unusedOrUnknown;\n        return Object.freeze({ kind: \"DELIVERY_UNKNOWN\", operationId: id });",
    "const unusedOrUnknown: string = rec.state;\n        void unusedOrUnknown;\n        return Object.freeze({ kind: \"NOT_FOUND\", operationId: id });",
  );
  assert.notEqual(mutated, originalText, "unused/default-NOT_FOUND mutant is a real edit");
  const { ReleaseCommitAuthority: Mutated } = await authorityFromMutatedSource(mutated);
  const authority = new Mutated();
  authority.mint("op-unused-nf", 1);
  assert.equal(authority.status("op-unused-nf").kind, "NOT_FOUND", "mutant must go red by hiding a live unused lease");
  assert.equal(appKernelSrcPorcelain(), before);
  const green = new ReleaseCommitAuthority();
  green.mint("op-unused-nf", 1);
  assert.equal(green.status("op-unused-nf").kind, "DELIVERY_UNKNOWN");
});

test("mutant: retired reads NOT_FOUND goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    "if (this.#retired.has(id)) {\n        return Object.freeze({ kind: \"DELIVERY_UNKNOWN\", operationId: id });\n      }",
    "if (this.#retired.has(id)) {\n        return Object.freeze({ kind: \"NOT_FOUND\", operationId: id });\n      }",
  );
  assert.notEqual(mutated, originalText, "retired-NOT_FOUND mutant is a real edit");
  const { ReleaseCommitAuthority: Mutated } = await authorityFromMutatedSource(mutated);
  const authority = new Mutated();
  for (let i = 0; i < RELEASE_LEASE_CAP; i += 1) {
    const lease = authority.mint(`op-ret-${i}`, 1);
    assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
    assert.equal(authority.ack(lease.leaseId, lease.token, 1), "acknowledged");
  }
  const extra = authority.mint("op-ret-extra", 1);
  assert.equal(authority.consume(extra.leaseId, extra.token, 1), "released");
  assert.equal(authority.status("op-ret-0").kind, "NOT_FOUND", "mutant must go red by hiding a retired disclosure");
  assert.equal(appKernelSrcPorcelain(), before);
  const green = new ReleaseCommitAuthority();
  for (let i = 0; i < RELEASE_LEASE_CAP; i += 1) {
    const lease = green.mint(`op-ret-${i}`, 1);
    assert.equal(green.consume(lease.leaseId, lease.token, 1), "released");
    assert.equal(green.ack(lease.leaseId, lease.token, 1), "acknowledged");
  }
  const greenExtra = green.mint("op-ret-extra", 1);
  assert.equal(green.consume(greenExtra.leaseId, greenExtra.token, 1), "released");
  assert.equal(green.status("op-ret-0").kind, "DELIVERY_UNKNOWN");
});



test("mutant: ack ignores operation id goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    "const rec = this.#leases.get(operationId);\n    if (rec === undefined) {\n      this.#record(operationId, \"missing\");\n      return \"missing\";\n    }\n    if (typeof token !== \"string\" || token.length === 0 || rec.token !== token) {",
    "const rec = this.#leases.values().next().value;\n    if (rec === undefined) {\n      this.#record(operationId, \"missing\");\n      return \"missing\";\n    }\n    if (typeof token !== \"string\" || token.length === 0 || rec.token !== token) {",
  );
  assert.notEqual(mutated, originalText, "ack-ignores-id mutant is a real edit");
  const { ReleaseCommitAuthority: Mutated } = await authorityFromMutatedSource(mutated);
  const authority = new Mutated();
  const a = authority.mint("op-keep", 1);
  authority.mint("op-other", 1);
  assert.equal(authority.consume(a.leaseId, a.token, 1), "released");
  const outcome = authority.ack("op-other", a.token, 1);
  assert.equal(outcome, "acknowledged", "mutant must go red by ACKing a foreign id");
  assert.equal(appKernelSrcPorcelain(), before);
  const green = new ReleaseCommitAuthority();
  const ga = green.mint("op-keep", 1);
  green.mint("op-other", 1);
  assert.equal(green.consume(ga.leaseId, ga.token, 1), "released");
  assert.equal(green.ack("op-other", ga.token, 1), "stale");
  assert.equal(green.stateOf("op-keep"), "released");
});

test("mutant: recovery re-releases goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    'case "released":\n        return Object.freeze({ kind: "RELEASED_UNACKED", operationId: id });',
    'case "released": {\n        rec.state = "unused";\n        this.consume(id, rec.token, rec.epoch);\n        return Object.freeze({ kind: "RELEASED_UNACKED", operationId: id });\n      }',
  );
  assert.notEqual(mutated, originalText, "re-release mutant is a real edit");
  const { ReleaseCommitAuthority: Mutated } = await authorityFromMutatedSource(mutated);
  const authority = new Mutated();
  const lease = authority.mint("op-re", 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
  authority.status("op-re");
  const events = authority.auditEvents().filter((e) => e.outcome === "released");
  assert.ok(events.length >= 2, "mutant must go red by re-releasing on status");
  assert.equal(appKernelSrcPorcelain(), before);
  const green = new ReleaseCommitAuthority();
  const greenLease = green.mint("op-re", 1);
  assert.equal(green.consume(greenLease.leaseId, greenLease.token, 1), "released");
  green.status("op-re");
  const greenEvents = green.auditEvents().filter((e) => e.outcome === "released");
  assert.equal(greenEvents.length, 1);
  assert.equal(green.consume(greenLease.leaseId, greenLease.token, 1), "replay");
});
