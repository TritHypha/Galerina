/**
 * Verify/run-side PQ FLOOR (consume side) — regression test for the one-directional
 * PQ-downgrade fail-open closed 2026-06-24 (galerina.mjs `verify` command + run-admission).
 *
 * The SIGN side already mandates a hybrid Ed25519+ML-DSA-65 manifest under
 * GALERINA_MANIFEST_PROFILE=certified (see cli-hybrid-signing-roundtrip.test.mjs). Before this
 * fix the CONSUME side did NOT: a v1 (Ed25519-only) manifest was ACCEPTED by `verify`/`run`
 * even under a PQ-required posture — a classical downgrade slipped straight through. This test
 * locks the closure on the authoritative `verify` path (which == the deploy pipeline's
 * build-verify step):
 *
 *   (1) keygen (CLASSICAL) + build (non-certified)  → a real v1 Ed25519-only manifest
 *   (2) verify, DEFAULT posture (no env)            → exit 0   (default consume UNCHANGED)
 *   (3) verify, GALERINA_MANIFEST_PROFILE=certified   → exit 1, SPORE-MANIFEST-PQ-REQUIRED (fail-closed)
 *   (4) verify, GALERINA_MANIFEST_PROFILE=certifed    → unrecognized → fail-secure to certified:
 *                                                     warn + exit 1 (a typo NEVER drops the PQ mandate)
 *
 * Uses the EXISTING dist (no rebuild) — same posture as cli-hybrid-signing-roundtrip.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..", "..");
const CLI = join(REPO, "galerina.mjs");

const run = (args, env, dir) =>
  spawnSync("node", [CLI, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });
const out = (r) => (r.stdout ?? "") + (r.stderr ?? "");

// A PURE Int flow: no effects → fuses cleanly, manifest signs over the governance facts.
const PURE_FLOW = `flow answer() -> Int {
  return 42
}
`;

test("certified-consume PQ floor: a v1 manifest is rejected at verify under certified, accepted by default", () => {
  const dir = mkdtempSync(join(tmpdir(), "galerina-pqfloor-"));
  try {
    // ── (1) CLASSICAL keygen + non-certified build → a genuine v1 Ed25519-only manifest. ──
    const kg = run(["keygen"], {}, dir);
    assert.equal(kg.status, 0, `classical keygen should exit 0: ${out(kg)}`);

    writeFileSync(join(dir, "answer.spore"), PURE_FLOW);

    const build = run(["build", "answer.spore"], {}, dir);
    assert.equal(build.status, 0, `non-certified build should succeed: ${out(build)}`);

    // Precondition: a classical non-certified build emits a v1 (NON-hybrid) manifest — the exact
    // shape the floor must reject under certified. If this ever becomes v2 by default the test below
    // would be vacuous, so assert the precondition explicitly.
    const manifest = JSON.parse(readFileSync(join(dir, "build", "answer.lmanifest.json"), "utf8"));
    assert.notEqual(manifest.schemaVersion, "spore.manifest.v2",
      "precondition: a classical non-certified build emits a v1 (non-hybrid) manifest");

    // ── (2) DEFAULT posture — UNCHANGED: a signed v1 manifest still verifies (exit 0). ──
    const vDefault = run(["verify", "answer.spore"], {}, dir);
    assert.equal(vDefault.status, 0,
      `default verify of a v1 manifest must still pass (default consume unchanged): ${out(vDefault)}`);

    // ── (3) CERTIFIED posture — the CLOSED fail-open: a v1 manifest is refused fail-closed. ──
    const vCert = run(["verify", "answer.spore"], { GALERINA_MANIFEST_PROFILE: "certified" }, dir);
    assert.equal(vCert.status, 1,
      `certified verify of a v1 manifest must fail closed (exit 1): ${out(vCert)}`);
    assert.match(out(vCert), /SPORE-MANIFEST-PQ-REQUIRED/,
      "certified consume of a v1 manifest is reported as SPORE-MANIFEST-PQ-REQUIRED");

    // ── (4) UNRECOGNIZED posture (typo) — fail-secure to certified: warns, then STILL refuses. ──
    const vTypo = run(["verify", "answer.spore"], { GALERINA_MANIFEST_PROFILE: "certifed" }, dir);
    assert.equal(vTypo.status, 1,
      `an unrecognized profile must fail-secure to certified (exit 1): ${out(vTypo)}`);
    assert.match(out(vTypo), /SPORE-MANIFEST-PROFILE-UNRECOGNIZED/,
      "an unrecognized profile warns it is fail-securing to certified");
    assert.match(out(vTypo), /SPORE-MANIFEST-PQ-REQUIRED/,
      "...and still enforces the PQ floor (a typo never silently downgrades)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
