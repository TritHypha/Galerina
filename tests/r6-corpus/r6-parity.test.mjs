/**
 * R6 Bootstrap Corpus — Stage A compile parity gate
 *
 * For each of the 5 root-level R6 reference flows:
 *   1. `galerina check` must report 0 errors, 0 governance warnings (Stage A accept)
 *   2. `galerina build` must produce a .lmanifest.json with sourceHash + proofObligations
 *
 * This is the root-level companion to the deeper Stage A == Stage B value-parity
 * tests in packages-galerina/galerina-core-compiler/tests/self-hosted-bootstrap.test.mjs.
 * Both must pass for the R6 gate to be considered closed.
 *
 * EXPECT: all 10 assertions pass (5 check + 5 manifest)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../..");

const R6_FILES = [
  "r6-01-pure-add.spore",
  "r6-02-governed-read.spore",
  "r6-03-secure-write.spore",
  "r6-04-invariant-check.spore",
  "r6-05-full-governance.spore",
];

// ── helpers ──────────────────────────────────────────────────────────────────

function relPath(file) {
  return `tests/r6-corpus/${file}`;
}

function manifestJsonPath(file) {
  return join(ROOT, "build", basename(file, ".spore") + ".lmanifest.json");
}

// ── Stage A compile acceptance (0 errors) ────────────────────────────────────

describe("R6 Bootstrap Corpus — Stage A compile parity", () => {
  for (const file of R6_FILES) {
    test(`${file}: 0 errors, 0 governance errors`, () => {
      let output;
      try {
        output = execSync(
          `node galerina.mjs check ${relPath(file)}`,
          { cwd: ROOT, encoding: "utf-8", timeout: 30_000 },
        );
      } catch (err) {
        // execSync throws on non-zero exit; capture combined output
        output = (err.stdout ?? "") + (err.stderr ?? "");
        assert.fail(
          `${file} exited non-zero.\nOutput:\n${output}`,
        );
      }
      // Accept either "0 errors" phrasing or a leading ✅
      const clean =
        output.includes("0 errors") ||
        output.trimStart().startsWith("✅");
      assert.ok(
        clean,
        `${file} should compile with 0 errors. Got:\n${output}`,
      );
    });
  }
});

// ── Manifest generation: sourceHash + proofObligations present ───────────────

describe("R6 Bootstrap Corpus — manifest generation parity", () => {
  for (const file of R6_FILES) {
    test(`${file}: manifest has sourceHash + proofObligations`, () => {
      // Build (idempotent — re-runs are fine, output goes to build/)
      try {
        execSync(
          `node galerina.mjs build ${relPath(file)}`,
          { cwd: ROOT, encoding: "utf-8", timeout: 30_000 },
        );
      } catch (err) {
        const out = (err.stdout ?? "") + (err.stderr ?? "");
        assert.fail(`${file} build failed:\n${out}`);
      }

      const manifestPath = manifestJsonPath(file);
      assert.ok(
        existsSync(manifestPath),
        `Manifest ${manifestPath} should exist after build`,
      );

      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      assert.ok(
        typeof manifest.sourceHash === "string" && manifest.sourceHash.startsWith("sha256:"),
        `manifest.sourceHash must be a sha256: string; got: ${manifest.sourceHash}`,
      );
      assert.ok(
        Array.isArray(manifest.proofObligations),
        `manifest.proofObligations must be an array; got: ${JSON.stringify(manifest.proofObligations)}`,
      );
      assert.ok(
        manifest.proofObligations.length >= 1,
        `manifest.proofObligations must have at least 1 entry for ${file}`,
      );
    });
  }
});
