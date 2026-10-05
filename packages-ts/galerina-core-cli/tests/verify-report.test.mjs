import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  verifyArtefacts,
  createVerificationReport,
  renderVerificationReport,
  writeVerificationReport,
  VERIFICATION_REPORT_FILE,
  VERIFICATION_REPORT_SCHEMA,
  FUNGI_VERIFY_003,
  FUNGI_VERIFY_005,
} from "../dist/index.js";

const digest = (s) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const art = (path, hash) => ({ path, kind: "manifest", hash, target: "wasm" });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "galerina-vreport-"));
  mkdirSync(join(root, "build"));
  writeFileSync(join(root, "build", "runtime-manifest.json"), '{"a":1}');
  writeFileSync(join(root, "build", "build-hash.txt"), "abc");
  return root;
}

test("a fully verified set produces a successful, deterministic report", async () => {
  const root = fixture();
  try {
    const result = await verifyArtefacts([art("build/runtime-manifest.json", digest('{"a":1}')), art("build/build-hash.txt", digest("abc"))], root);
    const report = createVerificationReport(result);
    assert.equal(report.schema, VERIFICATION_REPORT_SCHEMA);
    assert.equal(report.success, true);
    assert.deepEqual(report.summary, { total: 2, verified: 2, failed: 0 });
    assert.equal(report.generatedAt, undefined);
    assert.ok(report.limitations.includes("integrity helper, not a filesystem sandbox"));
    assert.ok(Object.isFrozen(report) && Object.isFrozen(report.artefacts) && Object.isFrozen(report.artefacts[0]));
    assert.equal(renderVerificationReport(report), renderVerificationReport(createVerificationReport(result)));
    assert.deepEqual(Object.keys(JSON.parse(renderVerificationReport(report))), ["schema", "success", "summary", "artefacts", "diagnostics", "limitations"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a mismatch is reported as failed with its code", async () => {
  const root = fixture();
  try {
    const result = await verifyArtefacts([art("build/runtime-manifest.json", digest("other")), art("build/build-hash.txt", digest("abc"))], root);
    const report = createVerificationReport(result);
    assert.equal(report.success, false);
    assert.deepEqual(report.summary, { total: 2, verified: 1, failed: 1 });
    assert.deepEqual(report.artefacts[0].codes, [FUNGI_VERIFY_003]);
    assert.deepEqual(report.diagnostics.map((d) => d.code), [FUNGI_VERIFY_003]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an empty set is never reported as success", async () => {
  const report = createVerificationReport(await verifyArtefacts([], "."));
  assert.equal(report.success, false);
  assert.deepEqual(report.diagnostics.map((d) => d.code), [FUNGI_VERIFY_005]);
});

test("the report recomputes success and does not trust a forged result", () => {
  const forged = { success: true, artefacts: [{ path: "x", hash: "", verified: true, diagnostics: [{ code: "FUNGI-VERIFY-003", message: "m", path: "x" }] }], diagnostics: [] };
  assert.equal(createVerificationReport(forged).success, false);
  assert.equal(createVerificationReport({ success: true, artefacts: [], diagnostics: [] }).success, false);
  assert.equal(createVerificationReport(null).success, false);
  const extra = createVerificationReport({ success: true, artefacts: [{ path: "a", hash: "h", verified: true, diagnostics: [], secret: "s" }], diagnostics: [], injected: 1 });
  assert.equal(extra.success, true);
  assert.deepEqual(Object.keys(extra.artefacts[0]), ["path", "hash", "verified", "codes"]);
  assert.ok(!renderVerificationReport(extra).includes("secret"));
  assert.ok(!renderVerificationReport(extra).includes("injected"));
});

test("hostile getters and proxies cannot throw out of the report builder or forge success", () => {
  const boom = () => { throw new Error("getter"); };
  const hostile = Object.defineProperty({ artefacts: [], diagnostics: [] }, "success", { get: boom });
  assert.equal(createVerificationReport(hostile).success, false);
  const art = Object.defineProperty({ path: "a", hash: "h", diagnostics: [] }, "verified", { get: boom });
  const r = createVerificationReport({ success: true, artefacts: [art], diagnostics: [] });
  assert.equal(r.success, false);
  assert.equal(r.artefacts[0].verified, false);
  const proxy = new Proxy([], { get: boom });
  assert.equal(createVerificationReport({ success: true, artefacts: proxy, diagnostics: [] }).success, false);
  const diag = Object.defineProperty({}, "code", { get: boom });
  const d = createVerificationReport({ success: true, artefacts: [{ path: "a", hash: "h", verified: true, diagnostics: [] }], diagnostics: [diag] });
  assert.equal(d.success, false);
  assert.equal(d.diagnostics[0].code, "");
});

test("generatedAt is optional and must be a UTC ISO timestamp", () => {
  const ok = { success: true, artefacts: [{ path: "a", hash: "h", verified: true, diagnostics: [] }], diagnostics: [] };
  assert.equal(createVerificationReport(ok, { generatedAt: "2026-10-05T10:00:00Z" }).generatedAt, "2026-10-05T10:00:00Z");
  for (const bad of ["2026-10-05", "2026-10-05T10:00:00+01:00", "yesterday", "2026-13-40T99:99:99Z", 5]) {
    assert.throws(() => createVerificationReport(ok, { generatedAt: bad }), RangeError, String(bad));
  }
});

test("writeVerificationReport writes once into an existing directory and refuses to overwrite", async () => {
  const root = fixture();
  try {
    const result = await verifyArtefacts([art("build/build-hash.txt", digest("abc"))], root);
    const out = join(root, "build");
    const { path, report } = await writeVerificationReport(result, out);
    assert.ok(path.endsWith(VERIFICATION_REPORT_FILE));
    assert.equal(readFileSync(path, "utf8"), renderVerificationReport(report));
    await assert.rejects(writeVerificationReport(result, out), /EEXIST/);
    await assert.rejects(writeVerificationReport(result, join(root, "missing-dir")), /ENOENT/);
    await assert.rejects(writeVerificationReport(result, join(root, "build", "build-hash.txt")), TypeError);
    await assert.rejects(writeVerificationReport(result, ""), TypeError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("forged diagnostic message is withheld (C12 NB-3)", () => {
  const marker = "planted-free-text-c12-nb3";
  const report = createVerificationReport({
    success: false,
    artefacts: [],
    diagnostics: [{ code: "FUNGI-VERIFY-003", message: marker, path: "x" }],
  });
  assert.equal(report.diagnostics[0].message, "diagnostic message withheld");
  assert.ok(!JSON.stringify(report).includes(marker));
});
