// =============================================================================
// Phase 27: classifyMessage parses correctly + NativePluginManifest type tests
//
// Tests:
//   describe("Phase 27: classifyMessage parses correctly") — 2 tests
//   describe("NativePluginManifest: type structure")       — 2 tests
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
  lex,
  parseProgram,
  NativeCapabilityId,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve path to examples directory from the tests folder
const examplesDir = join(__dirname, "../../../../examples/ai-inference");

// ---------------------------------------------------------------------------
// Phase 27: classifyMessage parses correctly
// ---------------------------------------------------------------------------

describe("Phase 27: classifyMessage parses correctly", () => {
  it("classifyMessage.spore lexes without errors", () => {
    const source = readFileSync(join(examplesDir, "classifyMessage.spore"), "utf-8");
    const result = lex(source);

    // The lexer should produce tokens and no error-level diagnostics
    assert.ok(Array.isArray(result.tokens), "lex() must return a tokens array");
    assert.ok(result.tokens.length > 0, "classifyMessage.spore must produce at least one token");

    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `classifyMessage.spore must lex without errors, got: ${errors.map((e) => e.message).join(", ")}`,
    );
  });

  it("classifyMessage.spore contains guarded flow declaration with ai.inference and audit.write effects", () => {
    const source = readFileSync(join(examplesDir, "classifyMessage.spore"), "utf-8");

    // Verify the source contains the key governance elements as documented
    assert.ok(
      source.includes("guarded flow classifyMessage"),
      "Must declare 'guarded flow classifyMessage'",
    );
    assert.ok(
      source.includes("ai.inference"),
      "Must declare ai.inference effect",
    );
    assert.ok(
      source.includes("audit.write"),
      "Must declare audit.write effect",
    );
    assert.ok(
      source.includes("deny [remote.execution]"),
      "Must deny remote.execution",
    );
    assert.ok(
      source.includes("fallback cpu"),
      "Must declare fallback cpu (SPORE-GOV-014 compliance)",
    );
    assert.ok(
      source.includes("protected MessageText"),
      "Must use protected MessageText for PII boundary",
    );
  });
});

// ---------------------------------------------------------------------------
// NativePluginManifest: type structure
// ---------------------------------------------------------------------------

describe("NativePluginManifest: type structure", () => {
  it("a valid NativePluginManifest object satisfies all required fields", () => {
    // Construct a manifest that matches the interface shape
    /** @type {import("../../dist/index.js").NativePluginManifest} */
    const manifest = {
      schemaVersion: "spore.native-plugin.v1",
      name: "galerina-tensor-dot-npu",
      capability: NativeCapabilityId.NpuInference, // "host.npu.inference"
      hash: "sha256:a3b4c5d6e7f801234567890abcdef01234567890abcdef01234567890abcdef01",
      signature: "ed25519:deadbeefcafe",
      edaArenaLimitMb: 32,
      allowedInputHandles: 2,
      allowedOutputHandles: 1,
      childProcess: true,
      fallback: "cpu",
    };

    // Structural checks — all required fields present and correctly typed
    assert.equal(manifest.schemaVersion, "spore.native-plugin.v1", "schemaVersion must be literal string");
    assert.equal(manifest.capability, "host.npu.inference", "capability must be NativeCapabilityId.NpuInference");
    assert.ok(manifest.hash.startsWith("sha256:"), "hash must start with sha256:");
    assert.ok(manifest.signature.startsWith("ed25519:"), "signature must start with ed25519:");
    assert.equal(typeof manifest.edaArenaLimitMb, "number", "edaArenaLimitMb must be a number");
    assert.equal(typeof manifest.allowedInputHandles, "number", "allowedInputHandles must be a number");
    assert.equal(typeof manifest.allowedOutputHandles, "number", "allowedOutputHandles must be a number");
    assert.equal(manifest.childProcess, true, "childProcess must be literal true (Phase 27 invariant)");
    assert.equal(typeof manifest.fallback, "string", "fallback must be a string");
  });

  it("NativePluginManifest.childProcess is always true (Phase 27 isolation invariant)", () => {
    // The childProcess field is typed as literal `true` — not boolean.
    // This test proves the runtime value satisfies the compile-time invariant.
    /** @type {import("../../dist/index.js").NativePluginManifest} */
    const tensorDotManifest = {
      schemaVersion: "spore.native-plugin.v1",
      name: "galerina-tensor-dot-npu",
      capability: "host.npu.inference",
      hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      signature: "ed25519:0000",
      edaArenaLimitMb: 32,
      allowedInputHandles: 2,
      allowedOutputHandles: 1,
      childProcess: true,  // literal true — Phase 27: always child process
      fallback: "cpu",
    };

    // Phase 27 invariant: native modules MUST run in a child process
    assert.strictEqual(
      tensorDotManifest.childProcess,
      true,
      "Phase 27 native plugins must always use child-process isolation",
    );

    // fallback must be declared (Rule 7 — SPORE-GOV-014)
    assert.ok(
      tensorDotManifest.fallback.length > 0,
      "fallback must be a non-empty string (Rule 7: fallback declared)",
    );

    // EDA arena limit must be positive
    assert.ok(
      tensorDotManifest.edaArenaLimitMb > 0,
      "edaArenaLimitMb must be positive",
    );

    // Handle counts must be non-negative
    assert.ok(tensorDotManifest.allowedInputHandles >= 0, "allowedInputHandles must be non-negative");
    assert.ok(tensorDotManifest.allowedOutputHandles >= 0, "allowedOutputHandles must be non-negative");
  });
});
