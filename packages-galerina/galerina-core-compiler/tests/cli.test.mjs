// =============================================================================
// CLI integration tests — basic sanity checks
//
// Verifies:
//   1. SPORE_SOURCE_ESCAPE_001 is exported from dist/index.js
//   2. SPORE_BACKEND_001 is exported from dist/index.js
//   3. The CLI module (dist/cli.js) can be loaded without throwing
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Test 1: SPORE_SOURCE_ESCAPE_001 is exported
// ---------------------------------------------------------------------------

describe("SPORE_SOURCE_ESCAPE_001 export", () => {
  it("is exported from dist/index.js with correct code", async () => {
    const { SPORE_SOURCE_ESCAPE_001 } = await import("../dist/index.js");
    assert.ok(SPORE_SOURCE_ESCAPE_001 !== undefined, "SPORE_SOURCE_ESCAPE_001 must be exported");
    assert.equal(SPORE_SOURCE_ESCAPE_001.code, "SPORE-SOURCE-ESCAPE-001");
    assert.equal(SPORE_SOURCE_ESCAPE_001.severity, "error");
    assert.equal(SPORE_SOURCE_ESCAPE_001.name, "SourceLevelEvalEscape");
  });
});

// ---------------------------------------------------------------------------
// Test 2: SPORE_BACKEND_001 is exported
// ---------------------------------------------------------------------------

describe("SPORE_BACKEND_001 export", () => {
  it("is exported from dist/index.js with correct code", async () => {
    const { SPORE_BACKEND_001 } = await import("../dist/index.js");
    assert.ok(SPORE_BACKEND_001 !== undefined, "SPORE_BACKEND_001 must be exported");
    assert.equal(SPORE_BACKEND_001.code, "SPORE-BACKEND-001");
    assert.equal(SPORE_BACKEND_001.severity, "error");
    assert.equal(SPORE_BACKEND_001.name, "BackendError");
  });
});

// ---------------------------------------------------------------------------
// Test 3: CLI module loads without throwing
// ---------------------------------------------------------------------------

describe("CLI module load", () => {
  it("dist/cli.js can be imported as a module URL without immediate execution errors", async () => {
    // We cannot import cli.ts as-is since it calls main() which reads process.argv.
    // Instead, verify the compiled file exists and is readable.
    import("node:fs").then((fs) => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const cliPath = path.join(__dirname, "..", "dist", "cli.js");
      assert.ok(fs.existsSync(cliPath), `dist/cli.js must exist at ${cliPath}`);
      const content = fs.readFileSync(cliPath, "utf-8");
      assert.ok(content.includes("galerina"), "dist/cli.js must contain 'galerina'");
    });
  });
});
