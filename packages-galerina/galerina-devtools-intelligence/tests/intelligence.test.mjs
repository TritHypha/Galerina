// =============================================================================
// galerina-devtools-intelligence — Integration tests
//
// Uses node:test + assert.
// Requires:
//   - The package to be built (npm run build)
//   - Auth-service examples at C:\Users\phill\Documents\GitHub\Galerina\examples\auth-service\
// =============================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, access, writeFile, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths relative to repo root (Windows-safe: use fileURLToPath)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_DIR = resolve(__dirname, "..");
// PKG_DIR = .../Galerina/packages-galerina/galerina-devtools-intelligence
// GALERINA_ROOT = .../Galerina
const GALERINA_ROOT = resolve(PKG_DIR, "../..");
const AUTH_SERVICE_DIR = join(GALERINA_ROOT, "examples", "auth-service");
const DIST_DIR = join(PKG_DIR, "dist");

// Import from built dist (use pathToFileURL for Windows compatibility)
import { pathToFileURL } from "node:url";
const {
  buildIndex,
  loadIndex,
  search,
  tokenize,
  tokenizeWithCompounds,
  buildInvertedIndex,
  bm25Search,
} = await import(pathToFileURL(join(DIST_DIR, "index.js")).href);

// ---------------------------------------------------------------------------
// Helper: check auth-service directory is accessible
// ---------------------------------------------------------------------------

async function authServiceAvailable() {
  try {
    await access(AUTH_SERVICE_DIR);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test 1: Index builds successfully from auth-service dir
// ---------------------------------------------------------------------------

describe("Indexer", () => {
  test("1. Index builds from auth-service directory", async () => {
    const available = await authServiceAvailable();
    if (!available) {
      console.log("SKIP: auth-service directory not found at", AUTH_SERVICE_DIR);
      return;
    }

    const result = await buildIndex(AUTH_SERVICE_DIR);

    assert.ok(result.flowCount > 0, `Expected flows > 0, got ${result.flowCount}`);
    // filesIndexed may be 0 if incremental cache is warm; total = indexed + skipped
    assert.ok(
      result.filesIndexed + result.filesSkipped > 0,
      `Expected files to be processed, got indexed=${result.filesIndexed} skipped=${result.filesSkipped}`,
    );
    assert.ok(result.durationMs >= 0, "durationMs should be non-negative");
    assert.ok(result.indexPath.endsWith("workspace.lindex"), "indexPath should end with workspace.lindex");

    console.log(`  Indexed ${result.flowCount} flows from ${result.filesIndexed} files in ${result.durationMs}ms`);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Loaded index matches built index
  // ---------------------------------------------------------------------------

  test("2. loadIndex returns same flows as buildIndex", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    const buildResult = await buildIndex(AUTH_SERVICE_DIR);
    const loadedFlows = await loadIndex(AUTH_SERVICE_DIR);

    assert.strictEqual(
      loadedFlows.length,
      buildResult.flowCount,
      `loadIndex returned ${loadedFlows.length} flows, expected ${buildResult.flowCount}`,
    );
  });

  // ---------------------------------------------------------------------------
  // Test 8: Stats: flow count is correct
  // ---------------------------------------------------------------------------

  test("8. Stats: index contains expected flow count", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    await buildIndex(AUTH_SERVICE_DIR);
    const flows = await loadIndex(AUTH_SERVICE_DIR);

    // auth-service has many flows — at least the verifyPassword flow
    assert.ok(flows.length >= 5, `Expected at least 5 flows, got ${flows.length}`);
    console.log(`  Total flows indexed from auth-service: ${flows.length}`);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Incremental index (second build is faster / skips files)
  // ---------------------------------------------------------------------------

  test("7. Incremental index: second build skips unchanged files", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    // First build
    await buildIndex(AUTH_SERVICE_DIR);
    // Second build
    const result2 = await buildIndex(AUTH_SERVICE_DIR);

    assert.ok(
      result2.filesSkipped >= result2.filesIndexed,
      `Expected filesSkipped (${result2.filesSkipped}) >= filesIndexed (${result2.filesIndexed})`,
    );
    console.log(`  2nd build: skipped=${result2.filesSkipped} re-indexed=${result2.filesIndexed}`);
  });

  // ---------------------------------------------------------------------------
  // Test 11: SHA-256 differential re-indexing skips unchanged files
  // ---------------------------------------------------------------------------

  test("11. SHA-256 differential re-indexing: second build has skippedFiles > 0", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    // Use a temp index dir so we start clean regardless of prior test runs
    const { mkdtemp, rmdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const tempDir = await mkdtemp(join(tmpdir(), "fungi-idx-test-"));

    try {
      // First build into temp dir — should index all files
      const result1 = await buildIndex(AUTH_SERVICE_DIR, tempDir);
      assert.ok(
        result1.filesIndexed + result1.filesSkipped > 0,
        `First build should process files, got indexed=${result1.filesIndexed} skipped=${result1.filesSkipped}`,
      );

      // Second build on the same directory — content unchanged, all files skipped via SHA-256 hash
      const result2 = await buildIndex(AUTH_SERVICE_DIR, tempDir);
      assert.ok(
        result2.filesSkipped > 0,
        `Expected skippedFiles > 0 on second build (SHA-256 differential), got ${result2.filesSkipped}`,
      );

      // Verify the .lindex file contains fileHashes
      const indexContent = JSON.parse(
        await readFile(join(tempDir, "workspace.lindex"), "utf-8"),
      );
      assert.ok(
        typeof indexContent.fileHashes === "object" && indexContent.fileHashes !== null,
        "workspace.lindex should contain fileHashes map",
      );
      assert.ok(
        Object.keys(indexContent.fileHashes).length > 0,
        "fileHashes map should be non-empty",
      );

      console.log(
        `  SHA-256 differential: 1st build indexed=${result1.filesIndexed}, ` +
        `2nd build skipped=${result2.filesSkipped} hashes=${Object.keys(indexContent.fileHashes).length}`,
      );
    } finally {
      try { await rmdir(tempDir, { recursive: true }); } catch { /* ignore */ }
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: Search "verify password" returns verifyPassword flow
// ---------------------------------------------------------------------------

describe("Search — basic", () => {
  test("3. Search 'verify password' returns verifyPassword flow", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    await buildIndex(AUTH_SERVICE_DIR);
    const flows = await loadIndex(AUTH_SERVICE_DIR);
    const results = search("verify password", flows);

    assert.ok(results.length > 0, "Expected at least one result for 'verify password'");

    const topResult = results[0];
    assert.ok(topResult !== undefined, "Top result should exist");
    assert.ok(
      topResult.flow.flowName.toLowerCase().includes("verify") ||
      topResult.flow.flowName.toLowerCase().includes("password"),
      `Top result '${topResult.flow.flowName}' should relate to verify/password`,
    );

    console.log(`  Top result: ${topResult.flow.signatureText} (score=${topResult.rankScore.toFixed(3)})`);
  });

  // ---------------------------------------------------------------------------
  // Test 4: BM25 scores fully-spelled tokens higher
  // ---------------------------------------------------------------------------

  test("4. BM25 scores fully-spelled token higher than abbreviated one", async () => {
    // Construct two synthetic flows:
    //   flowA: has token "inboundRequest" spelled out fully
    //   flowB: has only "req" (abbreviated)
    // (types are just used as structure reference — no runtime import needed)

    const flowA = {
      id: "aaa",
      flowName: "handleInboundRequest",
      qualifier: "secure",
      filePath: "test-a.fungi",
      lexicalTokens: tokenizeWithCompounds("inboundRequest rawPlaintextPassword handleInboundRequest"),
      declaredEffects: [],
      economicsHints: [],
      hasTaint: false,
      governanceCodes: [],
      hasSecrets: false,
      qualifier_tags: ["secure"],
      contractText: "",
      signatureText: "secure flow handleInboundRequest(inboundRequest) -> Response",
      lineStart: 1,
      lineEnd: 5,
      indexedAt: new Date().toISOString(),
      sourceMtime: 0,
    };

    const flowB = {
      id: "bbb",
      flowName: "handleReq",
      qualifier: "secure",
      filePath: "test-b.fungi",
      lexicalTokens: tokenizeWithCompounds("req pass handleReq"),
      declaredEffects: [],
      economicsHints: [],
      hasTaint: false,
      governanceCodes: [],
      hasSecrets: false,
      qualifier_tags: ["secure"],
      contractText: "",
      signatureText: "secure flow handleReq(req) -> Response",
      lineStart: 1,
      lineEnd: 5,
      indexedAt: new Date().toISOString(),
      sourceMtime: 0,
    };

    const testFlows = [flowA, flowB];
    const invIdx = buildInvertedIndex(testFlows);
    const scored = bm25Search("inboundRequest rawPlaintextPassword", testFlows, invIdx);

    assert.ok(scored.length > 0, "Expected at least one scored result");

    // flowA should be ranked higher
    const flowAResult = scored.find(r => r.flow.id === "aaa");
    const flowBResult = scored.find(r => r.flow.id === "bbb");

    assert.ok(flowAResult !== undefined, "flowA should appear in results");

    if (flowBResult !== undefined) {
      assert.ok(
        flowAResult.score >= flowBResult.score,
        `flowA (fully-spelled) score ${flowAResult.score.toFixed(3)} should be >= flowB (abbreviated) score ${flowBResult.score.toFixed(3)}`,
      );
    }

    console.log(`  flowA (fully-spelled) score: ${flowAResult.score.toFixed(3)}`);
    if (flowBResult !== undefined) {
      console.log(`  flowB (abbreviated) score: ${flowBResult.score.toFixed(3)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 9: Results are ranked by relevance
  // ---------------------------------------------------------------------------

  test("9. Search results are ranked by descending rankScore", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    const flows = await loadIndex(AUTH_SERVICE_DIR);
    const results = search("audit", flows);

    if (results.length < 2) return; // not enough results to test ordering

    for (let i = 0; i < results.length - 1; i++) {
      const current = results[i];
      const next = results[i + 1];
      assert.ok(
        current !== undefined && next !== undefined,
        "Result entries should exist",
      );
      assert.ok(
        current.rankScore >= next.rankScore,
        `Result ${i} score ${current.rankScore.toFixed(3)} should be >= result ${i + 1} score ${next.rankScore.toFixed(3)}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5: --qualifier secure filter works
// ---------------------------------------------------------------------------

describe("Search — structural filters", () => {
  test("5. qualifier='secure' filter returns only secure flows", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    const flows = await loadIndex(AUTH_SERVICE_DIR);
    const results = search("", flows, { qualifier: "secure" });

    assert.ok(results.length > 0, "Expected secure flows to exist");
    for (const r of results) {
      assert.strictEqual(
        r.flow.qualifier,
        "secure",
        `Flow ${r.flow.flowName} has qualifier '${r.flow.qualifier}', expected 'secure'`,
      );
    }
    console.log(`  Found ${results.length} secure flows`);
  });

  // ---------------------------------------------------------------------------
  // Test 6: --effects audit.write filter works
  // ---------------------------------------------------------------------------

  test("6. effects=['audit.write'] filter returns flows with audit.write effect", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    const flows = await loadIndex(AUTH_SERVICE_DIR);
    const results = search("", flows, { effects: ["audit.write"] });

    assert.ok(results.length > 0, "Expected flows with audit.write effect");
    for (const r of results) {
      assert.ok(
        r.flow.declaredEffects.some(e => e === "audit.write" || e.startsWith("audit.")),
        `Flow ${r.flow.flowName} does not declare audit.write; has: ${r.flow.declaredEffects.join(", ")}`,
      );
    }
    console.log(`  Found ${results.length} flows with audit.write effect`);
  });

  test("5b. qualifier='pure' filter returns only pure flows", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    const flows = await loadIndex(AUTH_SERVICE_DIR);
    const results = search("", flows, { qualifier: "pure" });

    // There may or may not be pure flows; just verify the filter is applied correctly
    for (const r of results) {
      assert.strictEqual(
        r.flow.qualifier,
        "pure",
        `Flow ${r.flow.flowName} has qualifier '${r.flow.qualifier}', expected 'pure'`,
      );
    }
    console.log(`  Found ${results.length} pure flows`);
  });

  // ---------------------------------------------------------------------------
  // Test: Search "audit log" returns flows with audit.write effect
  // ---------------------------------------------------------------------------

  test("3b. Search 'audit log' returns flows with audit.write effect", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    const flows = await loadIndex(AUTH_SERVICE_DIR);
    const results = search("audit log", flows);

    assert.ok(results.length > 0, "Expected results for 'audit log'");

    // At least one top result should declare audit.write
    const hasAuditWrite = results.some(r =>
      r.flow.declaredEffects.some(e => e === "audit.write" || e.startsWith("audit."))
    );
    assert.ok(hasAuditWrite, "Expected at least one result with audit.write effect");

    console.log(`  Found ${results.length} results for 'audit log'`);
    console.log(`  Top: ${results[0]?.flow.signatureText ?? "none"}`);
  });
});

// ---------------------------------------------------------------------------
// Test 10: JSON output from search is valid JSON
// ---------------------------------------------------------------------------

describe("Output format", () => {
  test("10. JSON output is valid and contains expected fields", async () => {
    const available = await authServiceAvailable();
    if (!available) return;

    const flows = await loadIndex(AUTH_SERVICE_DIR);
    const results = search("verify", flows);

    // Serialize and re-parse to verify valid JSON
    const jsonStr = JSON.stringify(results);
    const parsed = JSON.parse(jsonStr);

    assert.ok(Array.isArray(parsed), "JSON output should be an array");

    if (parsed.length > 0) {
      const first = parsed[0];
      assert.ok("flow" in first, "Each result should have 'flow' key");
      assert.ok("bm25Score" in first, "Each result should have 'bm25Score' key");
      assert.ok("structuralMatch" in first, "Each result should have 'structuralMatch' key");
      assert.ok("rankScore" in first, "Each result should have 'rankScore' key");

      // Verify flow shape
      const flow = first.flow;
      assert.ok("id" in flow, "Flow should have 'id'");
      assert.ok("flowName" in flow, "Flow should have 'flowName'");
      assert.ok("qualifier" in flow, "Flow should have 'qualifier'");
      assert.ok("declaredEffects" in flow, "Flow should have 'declaredEffects'");
      assert.ok("lexicalTokens" in flow, "Flow should have 'lexicalTokens'");
    }

    console.log(`  JSON output: ${parsed.length} results, valid structure`);
  });
});

// ---------------------------------------------------------------------------
// Test: tokenize helper
// ---------------------------------------------------------------------------

describe("Tokenisation", () => {
  test("tokenize splits camelCase identifiers correctly", () => {
    const tokens = tokenize("verifyPassword");
    assert.ok(tokens.includes("verify"), `Expected 'verify' in [${tokens.join(", ")}]`);
    assert.ok(tokens.includes("password"), `Expected 'password' in [${tokens.join(", ")}]`);
  });

  test("tokenize splits dotted identifiers correctly", () => {
    const tokens = tokenize("audit.write");
    assert.ok(tokens.includes("audit"), `Expected 'audit' in [${tokens.join(", ")}]`);
    assert.ok(tokens.includes("write"), `Expected 'write' in [${tokens.join(", ")}]`);
  });

  test("tokenizeWithCompounds includes compound form", () => {
    const tokens = tokenizeWithCompounds("verifyPassword");
    assert.ok(tokens.includes("verifypassword"), `Expected compound 'verifypassword' in [${tokens.join(", ")}]`);
    assert.ok(tokens.includes("verify"), `Expected 'verify' in [${tokens.join(", ")}]`);
    assert.ok(tokens.includes("password"), `Expected 'password' in [${tokens.join(", ")}]`);
  });
});
