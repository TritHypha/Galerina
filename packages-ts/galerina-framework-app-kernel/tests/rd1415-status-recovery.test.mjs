// RD-1415 status-only recovery: closed union, no re-release, bound ACK.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ReleaseCommitAuthority } from "../dist/secret-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "..", "src", "release-commit-point.ts");
const tscPath = join(here, "..", "node_modules", "typescript", "bin", "tsc");
const KINDS = ["RELEASED_ACKED", "RELEASED_UNACKED", "REFUSED", "DELIVERY_UNKNOWN", "NOT_FOUND"];

function compile() {
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
    cwd: join(here, ".."),
    encoding: "utf8",
  });
  assert.equal(built.status, 0, built.stderr || built.stdout);
}

test("status is a closed union and unused/missing/fenced map fail-closed", () => {
  const authority = new ReleaseCommitAuthority();
  const unused = authority.mint("op-unused", 1);
  const unusedStatus = authority.status("op-unused");
  assert.equal(unusedStatus.kind, "NOT_FOUND");
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

test("kernel mints releaseOperationId from requestId and seq, not a client field", () => {
  const src = readFileSync(new URL("../src/kernel.ts", import.meta.url), "utf8");
  assert.match(src, /const releaseOperationId = `\$\{req\.requestId\}\\u0000\$\{releaseSeq\}`/);
  assert.match(src, /requireBoundOperationId:\s*true/);
  assert.doesNotMatch(src, /releaseOperationId = req\.(body|headers|query)/);
});

function srcText() {
  return readFileSync(srcPath).toString("utf8").replaceAll("\r\n", "\n");
}

function writeSrc(text) {
  writeFileSync(srcPath, text);
}

test("mutant: UNKNOWN collapsed to REFUSED goes red then restores green", async () => {
  const original = readFileSync(srcPath);
  const originalText = srcText();
  const mutated = originalText.replace(
    'case "delivery-unknown":\n        return Object.freeze({ kind: "DELIVERY_UNKNOWN", operationId: id });',
    'case "delivery-unknown":\n        return Object.freeze({ kind: "REFUSED", operationId: id });',
  );
  assert.notEqual(mutated, originalText, "UNKNOWN-collapse mutant is a real edit");
  try {
    writeSrc(mutated);
    compile();
    const url = `${pathToFileURL(join(here, "..", "dist", "release-commit-point.js")).href}?m=${Date.now()}`;
    const { ReleaseCommitAuthority: Mutated } = await import(url);
    const authority = new Mutated();
    const lease = authority.mint("op-m1", 1);
    assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
    authority.markUnknown("op-m1");
    assert.equal(authority.status("op-m1").kind, "REFUSED", "mutant must go red by collapsing UNKNOWN");
  } finally {
    writeFileSync(srcPath, original);
    compile();
  }
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-m1", 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
  authority.markUnknown("op-m1");
  assert.equal(authority.status("op-m1").kind, "DELIVERY_UNKNOWN");
});

test("mutant: default arm admits goes red then restores green", async () => {
  const original = readFileSync(srcPath);
  const originalText = srcText();
  const mutated = originalText.replace(
    "if (rec === undefined) {\n      return Object.freeze({ kind: \"NOT_FOUND\", operationId: id });\n    }",
    "if (rec === undefined) {\n      return Object.freeze({ kind: \"RELEASED_ACKED\", operationId: id });\n    }",
  );
  assert.notEqual(mutated, originalText, "default-arm mutant is a real edit");
  try {
    writeFileSync(srcPath, mutated);
    compile();
    const url = `${pathToFileURL(join(here, "..", "dist", "release-commit-point.js")).href}?m=${Date.now() + 1}`;
    const { ReleaseCommitAuthority: Mutated } = await import(url);
    const authority = new Mutated();
    assert.equal(authority.status("nope").kind, "RELEASED_ACKED", "mutant must go red by admitting on default");
  } finally {
    writeFileSync(srcPath, original);
    compile();
  }
  const authority = new ReleaseCommitAuthority();
  assert.equal(authority.status("nope").kind, "NOT_FOUND");
});

test("mutant: ack ignores operation id goes red then restores green", async () => {
  const original = readFileSync(srcPath);
  const originalText = srcText();
  const mutated = originalText.replace(
    "const rec = this.#leases.get(operationId);\n    if (rec === undefined) {\n      this.#record(operationId, \"missing\");\n      return \"missing\";\n    }\n    if (typeof token !== \"string\" || token.length === 0 || rec.token !== token) {",
    "const rec = this.#leases.values().next().value;\n    if (rec === undefined) {\n      this.#record(operationId, \"missing\");\n      return \"missing\";\n    }\n    if (typeof token !== \"string\" || token.length === 0 || rec.token !== token) {",
  );
  assert.notEqual(mutated, originalText, "ack-ignores-id mutant is a real edit");
  try {
    writeFileSync(srcPath, mutated);
    compile();
    const url = `${pathToFileURL(join(here, "..", "dist", "release-commit-point.js")).href}?m=${Date.now() + 2}`;
    const { ReleaseCommitAuthority: Mutated } = await import(url);
    const authority = new Mutated();
    const a = authority.mint("op-keep", 1);
    authority.mint("op-other", 1);
    assert.equal(authority.consume(a.leaseId, a.token, 1), "released");
    const outcome = authority.ack("op-other", a.token, 1);
    assert.equal(outcome, "acknowledged", "mutant must go red by ACKing a foreign id");
  } finally {
    writeFileSync(srcPath, original);
    compile();
  }
  const authority = new ReleaseCommitAuthority();
  const a = authority.mint("op-keep", 1);
  authority.mint("op-other", 1);
  assert.equal(authority.consume(a.leaseId, a.token, 1), "released");
  assert.equal(authority.ack("op-other", a.token, 1), "stale");
  assert.equal(authority.stateOf("op-keep"), "released");
});

test("mutant: recovery re-releases goes red then restores green", async () => {
  const original = readFileSync(srcPath);
  const originalText = srcText();
  const mutated = originalText.replace(
    'case "released":\n        return Object.freeze({ kind: "RELEASED_UNACKED", operationId: id });',
    'case "released": {\n        rec.state = "unused";\n        this.consume(id, rec.token, rec.epoch);\n        return Object.freeze({ kind: "RELEASED_UNACKED", operationId: id });\n      }',
  );
  assert.notEqual(mutated, originalText, "re-release mutant is a real edit");
  try {
    writeFileSync(srcPath, mutated);
    compile();
    const url = `${pathToFileURL(join(here, "..", "dist", "release-commit-point.js")).href}?m=${Date.now() + 3}`;
    const { ReleaseCommitAuthority: Mutated } = await import(url);
    const authority = new Mutated();
    const lease = authority.mint("op-re", 1);
    assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
    authority.status("op-re");
    const events = authority.auditEvents().filter((e) => e.outcome === "released");
    assert.ok(events.length >= 2, "mutant must go red by re-releasing on status");
  } finally {
    writeFileSync(srcPath, original);
    compile();
  }
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-re", 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
  authority.status("op-re");
  const events = authority.auditEvents().filter((e) => e.outcome === "released");
  assert.equal(events.length, 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "replay");
});
