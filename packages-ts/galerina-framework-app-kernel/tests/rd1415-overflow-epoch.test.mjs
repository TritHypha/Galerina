// RD-1415 U4 overflow + epoch typing: watermark, unforgeable ids, NaN fence, never-check.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, cpSync, symlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAppKernel } from "../dist/kernel.js";
import {
  ReleaseCommitAuthority,
  SecretReleaseRefused,
  RELEASE_LEASE_CAP,
  RELEASE_RETIRED_CAP,
  readForeignSafeInteger,
} from "../dist/secret-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const cloneRoot = join(pkgRoot, "..", "..");
const srcPath = join(pkgRoot, "src", "release-commit-point.ts");
const secretGateSrcPath = join(pkgRoot, "src", "secret-gate.ts");
const tscPath = join(pkgRoot, "node_modules", "typescript", "bin", "tsc");
const SYNTHETIC = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];

function isRefused(err, outcome) {
  return err instanceof SecretReleaseRefused && err.outcome === outcome;
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
  const dir = mkdtempSync(join(tmpdir(), "u4-overflow-mutant-"));
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

function tscFile(source) {
  const dir = mkdtempSync(join(tmpdir(), "u4-overflow-tsc-"));
  try {
    const file = join(dir, "release-commit-point.ts");
    writeFileSync(file, source);
    return spawnSync(process.execPath, [
      tscPath,
      file,
      "--strict",
      "--noEmit",
      "--target", "es2022",
      "--skipLibCheck",
    ], {
      cwd: dir,
      encoding: "utf8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const OVERFLOW_DROP_COUNT = RELEASE_LEASE_CAP + RELEASE_RETIRED_CAP + 1;

function fillReleasedAcked(authority, count) {
  for (let i = 0; i < count; i += 1) {
    const lease = authority.mint(`op-${i}`, 1);
    assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
    assert.equal(authority.ack(lease.leaseId, lease.token, 1), "acknowledged");
  }
}

function mintConsumeOutcome(authority, operationId, epoch) {
  try {
    const lease = authority.mint(operationId, epoch);
    return authority.consume(lease.leaseId, lease.token, epoch);
  } catch (err) {
    if (err !== null && typeof err === "object" && "outcome" in err && typeof err.outcome === "string") {
      return err.outcome;
    }
    throw err;
  }
}

function secretKernel(authority) {
  const stored = new Uint8Array(SYNTHETIC);
  return createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => {});
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has() {
        return true;
      },
      use(_name, fn) {
        fn(new Uint8Array(stored));
      },
      revocationEpoch() {
        return 1;
      },
    },
    releaseAuthority: authority,
  });
}

test("readForeignSafeInteger refuses null NaN Infinity non-integers and non-numbers", () => {
  assert.equal(readForeignSafeInteger(1).ok, true);
  if (readForeignSafeInteger(1).ok) assert.equal(readForeignSafeInteger(1).value, 1);
  assert.equal(readForeignSafeInteger(Number.NaN).ok, false);
  assert.equal(readForeignSafeInteger(Number.POSITIVE_INFINITY).ok, false);
  assert.equal(readForeignSafeInteger(Number.NEGATIVE_INFINITY).ok, false);
  assert.equal(readForeignSafeInteger(1.5).ok, false);
  assert.equal(readForeignSafeInteger(-1).ok, true);
  assert.equal(readForeignSafeInteger("1").ok, false);
  assert.equal(readForeignSafeInteger({}).ok, false);
  assert.equal(readForeignSafeInteger(null).ok, false);
  assert.equal(readForeignSafeInteger(undefined).ok, false);
});

test("N1a: never-minted reads NOT_FOUND before any tombstone drop", () => {
  const authority = new ReleaseCommitAuthority();
  assert.equal(authority.status("never-minted").kind, "NOT_FOUND");
  fillReleasedAcked(authority, RELEASE_LEASE_CAP + RELEASE_RETIRED_CAP);
  assert.equal(authority.status("never-minted").kind, "NOT_FOUND");
  assert.equal(authority.status("op-0").kind, "DELIVERY_UNKNOWN");
});

test("N1a: after a tombstone drop, absent ids read DELIVERY_UNKNOWN", () => {
  const authority = new ReleaseCommitAuthority();
  fillReleasedAcked(authority, OVERFLOW_DROP_COUNT);
  assert.equal(authority.status("op-0").kind, "DELIVERY_UNKNOWN");
  assert.notEqual(authority.status("op-0").kind, "NOT_FOUND");
  assert.equal(authority.status("never-minted").kind, "DELIVERY_UNKNOWN");
  assert.notEqual(authority.status("never-minted").kind, "NOT_FOUND");
});

test("N1b P3: remint of dropped op-0 does not return released", () => {
  const authority = new ReleaseCommitAuthority();
  fillReleasedAcked(authority, OVERFLOW_DROP_COUNT);
  const outcome = mintConsumeOutcome(authority, "op-0", 1);
  assert.notEqual(outcome, "released");
  assert.equal(outcome, "replay");
});

test("N1b: authority-issued ids are unique and mint refuses unissued issued-form ids", () => {
  const authority = new ReleaseCommitAuthority();
  const first = authority.issueLeaseId();
  const second = authority.issueLeaseId();
  assert.notEqual(first, second);
  const m1 = authority.mint(first, 1);
  const m2 = authority.mint(second, 1);
  assert.equal(m1.leaseId, first);
  assert.equal(m2.leaseId, second);
  const nul = first.indexOf("\u0000");
  assert.ok(nul > 0);
  const forged = `${first.slice(0, nul)}\u00009999`;
  assert.throws(
    () => authority.mint(forged, 1),
    (err) => isRefused(err, "missing"),
  );
});

test("N1b: two kernels sharing one authority and requestId get different lease ids", async () => {
  const authority = new ReleaseCommitAuthority();
  const req = {
    method: "GET",
    path: "/pay",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId: "rq-shared",
    receivedAt: 0,
  };
  const r1 = await secretKernel(authority).handle(req);
  const r2 = await secretKernel(authority).handle(req);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  const released = authority.auditEvents().filter((e) => e.outcome === "released");
  assert.equal(released.length, 2);
  assert.notEqual(released[0].operationId, released[1].operationId);
  assert.notEqual(released[0].operationId, "rq-shared\u00001");
  assert.notEqual(released[1].operationId, "rq-shared\u00001");
});

test("N3: consume with NaN Infinity -1 1.5 string object refuses and fences", () => {
  const badEpochs = [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, "1", {}];
  for (const epoch of badEpochs) {
    const authority = new ReleaseCommitAuthority();
    const lease = authority.mint("op-epoch", 1);
    const outcome = authority.consume(lease.leaseId, lease.token, epoch);
    assert.equal(outcome, "stale", `consume ${String(epoch)}`);
    assert.equal(authority.stateOf(lease.leaseId), "fenced", `fence ${String(epoch)}`);
    assert.equal(authority.status(lease.leaseId).kind, "REFUSED");
    assert.equal(authority.consume(lease.leaseId, lease.token, 1), "fenced");
  }
});

test("N3: ack with NaN Infinity -1 1.5 string object refuses and changes nothing", () => {
  const badEpochs = [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, "1", {}];
  for (const epoch of badEpochs) {
    const authority = new ReleaseCommitAuthority();
    const lease = authority.mint("op-ack-epoch", 1);
    assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
    const outcome = authority.ack(lease.leaseId, lease.token, epoch);
    assert.equal(outcome, "stale", `ack ${String(epoch)}`);
    assert.equal(authority.stateOf(lease.leaseId), "released", `unchanged ${String(epoch)}`);
    assert.equal(authority.status(lease.leaseId).kind, "RELEASED_UNACKED");
    assert.equal(authority.ack(lease.leaseId, lease.token, 1), "acknowledged");
  }
});

test("N4: unused and default still read DELIVERY_UNKNOWN", () => {
  const authority = new ReleaseCommitAuthority();
  authority.mint("op-unused", 1);
  assert.equal(authority.status("op-unused").kind, "DELIVERY_UNKNOWN");
});

test("mutant: watermark drop reads NOT_FOUND goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    "if (this.#tombstoneDropped) {\n        return Object.freeze({ kind: \"DELIVERY_UNKNOWN\", operationId: id });\n      }",
    "if (false && this.#tombstoneDropped) {\n        return Object.freeze({ kind: \"DELIVERY_UNKNOWN\", operationId: id });\n      }",
  );
  assert.notEqual(mutated, originalText, "watermark mutant is a real edit");
  const { ReleaseCommitAuthority: Mutated } = await authorityFromMutatedSource(mutated);
  const authority = new Mutated();
  fillReleasedAcked(authority, OVERFLOW_DROP_COUNT);
  assert.equal(authority.status("never-minted").kind, "NOT_FOUND", "mutant must go red by reading NOT_FOUND after a drop");
  assert.equal(appKernelSrcPorcelain(), before);
  const green = new ReleaseCommitAuthority();
  fillReleasedAcked(green, OVERFLOW_DROP_COUNT);
  assert.equal(green.status("never-minted").kind, "DELIVERY_UNKNOWN");
});

test("mutant: remint of a dropped id goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    "} else if (this.#tombstoneDropped) {\n      throw new SecretReleaseRefused(\"replay\", \"Release lease is not provably fresh.\");\n    }",
    "} else if (false && this.#tombstoneDropped) {\n      throw new SecretReleaseRefused(\"replay\", \"Release lease is not provably fresh.\");\n    }",
  );
  assert.notEqual(mutated, originalText, "remint mutant is a real edit");
  const { ReleaseCommitAuthority: Mutated } = await authorityFromMutatedSource(mutated);
  const authority = new Mutated();
  fillReleasedAcked(authority, OVERFLOW_DROP_COUNT);
  const outcome = mintConsumeOutcome(authority, "op-0", 1);
  assert.equal(outcome, "released", "mutant must go red by releasing a dropped id again");
  assert.equal(appKernelSrcPorcelain(), before);
  const green = new ReleaseCommitAuthority();
  fillReleasedAcked(green, OVERFLOW_DROP_COUNT);
  assert.notEqual(mintConsumeOutcome(green, "op-0", 1), "released");
});

test("mutant: M17 skip NaN fence goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const mutated = originalText.replace(
    "const epochRead = readForeignSafeInteger(observedEpoch);\n    if (!epochRead.ok || epochRead.value !== rec.epoch) {\n      rec.state = \"fenced\";",
    "const epochRead = readForeignSafeInteger(observedEpoch);\n    if (!epochRead.ok || epochRead.value !== rec.epoch) {\n      if (!(typeof observedEpoch === \"number\" && Number.isNaN(observedEpoch))) rec.state = \"fenced\";",
  );
  assert.notEqual(mutated, originalText, "M17 mutant is a real edit");
  const { ReleaseCommitAuthority: Mutated } = await authorityFromMutatedSource(mutated);
  const authority = new Mutated();
  const lease = authority.mint("op-nan", 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, Number.NaN), "stale");
  assert.equal(authority.stateOf(lease.leaseId), "unused", "mutant must go red by skipping the NaN fence");
  assert.equal(appKernelSrcPorcelain(), before);
  const green = new ReleaseCommitAuthority();
  const greenLease = green.mint("op-nan", 1);
  assert.equal(green.consume(greenLease.leaseId, greenLease.token, Number.NaN), "stale");
  assert.equal(green.stateOf(greenLease.leaseId), "fenced");
});

test("mutant: remove never check lets an added state compile", () => {
  const before = appKernelSrcPorcelain();
  const originalText = srcText();
  const withGhost = originalText.replace(
    'export type ReleaseLeaseState =\n  | "unused"\n  | "released"\n  | "acknowledged"\n  | "fenced"\n  | "delivery-unknown";',
    'export type ReleaseLeaseState =\n  | "unused"\n  | "released"\n  | "acknowledged"\n  | "fenced"\n  | "delivery-unknown"\n  | "ghost";',
  );
  assert.notEqual(withGhost, originalText, "ghost state is a real edit");
  const headGhost = tscFile(withGhost);
  assert.notEqual(headGhost.status, 0, "HEAD never check must fail tsc on an added state");
  const mutant = originalText.replaceAll(
    "const _exhaustive: never = rec.state;",
    "const _exhaustive: string = rec.state;",
  );
  assert.notEqual(mutant, originalText, "never-check mutant is a real edit");
  const mutantGhost = mutant.replace(
    'export type ReleaseLeaseState =\n  | "unused"\n  | "released"\n  | "acknowledged"\n  | "fenced"\n  | "delivery-unknown";',
    'export type ReleaseLeaseState =\n  | "unused"\n  | "released"\n  | "acknowledged"\n  | "fenced"\n  | "delivery-unknown"\n  | "ghost";',
  );
  const mutantTsc = tscFile(mutantGhost);
  assert.equal(mutantTsc.status, 0, mutantTsc.stderr || mutantTsc.stdout);
  assert.equal(appKernelSrcPorcelain(), before);
});

test("mutant: kernel uses requestId alone goes red then restores green", async () => {
  const before = appKernelSrcPorcelain();
  const originalJs = readFileSync(join(pkgRoot, "dist", "kernel.js"), "utf8");
  const mutated = originalJs.replace(
    "releaseOperationId = secretGate.issueLeaseId();",
    "releaseOperationId = `${req.requestId}\\u00001`;",
  );
  assert.notEqual(mutated, originalJs, "kernel requestId mutant is a real edit");
  const dir = mkdtempSync(join(tmpdir(), "u4-kernel-mutant-"));
  try {
    cpSync(join(pkgRoot, "dist"), join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "package.json"), readFileSync(join(pkgRoot, "package.json")));
    const nm = join(dir, "node_modules");
    if (!existsSync(nm)) symlinkSync(join(pkgRoot, "node_modules"), nm, "junction");
    writeFileSync(join(dir, "dist", "kernel.js"), mutated);
    const url = `${pathToFileURL(join(dir, "dist", "kernel.js")).href}?m=${Date.now()}`;
    const { createAppKernel: MutatedKernel } = await import(url);
    const authority = new ReleaseCommitAuthority();
    const stored = new Uint8Array(SYNTHETIC);
    function makeKernel() {
      return MutatedKernel({
        routes: [{
          method: "GET",
          path: "/pay",
          handler: "pay",
          auth: { mode: "public" },
          secrets: { require: ["db.main"] },
        }],
        dispatch: {
          pay: ({ getSecret }) => {
            getSecret("db.main", () => {});
            return { body: { ok: true } };
          },
        },
        secretsProvider: {
          has() {
            return true;
          },
          use(_name, fn) {
            fn(new Uint8Array(stored));
          },
          revocationEpoch() {
            return 1;
          },
        },
        releaseAuthority: authority,
      });
    }
    const req = {
      method: "GET",
      path: "/pay",
      headers: {},
      body: new Uint8Array(0),
      query: {},
      requestId: "rq-shared",
      receivedAt: 0,
    };
    const r1 = await makeKernel().handle(req);
    const r2 = await makeKernel().handle(req);
    assert.equal(r1.status, 200);
    const released = authority.auditEvents().filter((e) => e.outcome === "released");
    assert.ok(released.length >= 1);
    assert.equal(released[0].operationId, "rq-shared\u00001", "mutant must go red by using requestId as lease id");
    assert.ok(
      r2.status !== 200 || (released.length === 2 && released[0].operationId === released[1].operationId),
      "mutant must go red by colliding lease ids",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(appKernelSrcPorcelain(), before);
  const greenAuth = new ReleaseCommitAuthority();
  const req = {
    method: "GET",
    path: "/pay",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId: "rq-shared",
    receivedAt: 0,
  };
  assert.equal((await secretKernel(greenAuth).handle(req)).status, 200);
  assert.equal((await secretKernel(greenAuth).handle(req)).status, 200);
  const greenReleased = greenAuth.auditEvents().filter((e) => e.outcome === "released");
  assert.equal(greenReleased.length, 2);
  assert.notEqual(greenReleased[0].operationId, greenReleased[1].operationId);
});
