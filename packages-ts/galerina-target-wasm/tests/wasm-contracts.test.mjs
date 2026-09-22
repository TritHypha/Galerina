import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WASM_ARTEFACT_SCHEMA,
  WASM_FALLBACK_SCHEMA,
  WASM_HANDOFF_SCHEMA,
  WASM_DIAGNOSTIC_REGISTRY,
  validateWasmArtefact,
  validateWasmFallbackIdentity,
  bindComputeSelectionToWasmFallback,
  validateWasmHandoff,
  verifyWasmAttestationSignature,
  createWasmTargetReport,
} from "../dist/index.js";

const EXAMPLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");

const codes = (diags) => diags.map((d) => d.code);

const MINIMAL_WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const BYTES_HEX = Buffer.from(MINIMAL_WASM).toString("hex");
const DIGEST = createHash("sha256").update(MINIMAL_WASM).digest("hex");
const OTHER_BYTES = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x01]);
const OTHER_DIGEST = createHash("sha256").update(OTHER_BYTES).digest("hex");

function artefact(overrides = {}) {
  return {
    schema: WASM_ARTEFACT_SCHEMA,
    path: "out/mod.wasm",
    target: { runtime: "server", features: ["simd"] },
    exports: [{ name: "run", kind: "func" }],
    imports: [],
    digest: DIGEST,
    bytesHex: BYTES_HEX,
    attestation: { sha256: DIGEST, profile: "dev", signature: "" },
    limits: { memoryMinPages: 1, memoryMaxPages: 4, tableMax: 0, fuel: 1000 },
    effects: [],
    ...overrides,
  };
}

describe("validateWasmArtefact — v1 identity contract", () => {
  it("accepts a digest-bound artefact", () => {
    assert.deepEqual(codes(validateWasmArtefact(artefact())), []);
  });

  it("requires a path and a known runtime", () => {
    const diags = validateWasmArtefact(artefact({
      path: "",
      target: { runtime: "native", features: [] },
    }));
    assert.ok(codes(diags).includes("FUNGI-WASM-003"));
    assert.ok(codes(diags).includes("FUNGI-WASM-005"));
  });

  it("refuses a path that escapes the artefact root", () => {
    const diags = validateWasmArtefact(artefact({ path: "../secret.wasm" }));
    assert.ok(codes(diags).includes("FUNGI-WASM-004"));
  });

  it("warns (not errors) when an artefact declares no exports", () => {
    const diags = validateWasmArtefact(artefact({ exports: [] }));
    assert.deepEqual(codes(diags), ["FUNGI-WASM-014"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("refuses a digest that does not match the bound bytes", () => {
    const diags = validateWasmArtefact(artefact({
      digest: OTHER_DIGEST,
      attestation: { sha256: OTHER_DIGEST, profile: "dev", signature: "" },
    }));
    assert.ok(codes(diags).includes("FUNGI-WASM-007"));
  });

  it("refuses a forged attestation hash", () => {
    const diags = validateWasmArtefact(artefact({
      attestation: { sha256: OTHER_DIGEST, profile: "dev", signature: "" },
    }));
    assert.ok(codes(diags).includes("FUNGI-WASM-010"));
  });

  it("refuses certified artefacts without a signature", () => {
    const diags = validateWasmArtefact(artefact({
      attestation: { sha256: DIGEST, profile: "certified", signature: "" },
    }));
    assert.ok(codes(diags).includes("FUNGI-WASM-012"));
  });

  it("refuses duplicate export identity", () => {
    const diags = validateWasmArtefact(artefact({
      exports: [
        { name: "run", kind: "func" },
        { name: "run", kind: "func" },
      ],
    }));
    assert.ok(codes(diags).includes("FUNGI-WASM-015"));
  });

  it("refuses a browser artefact that claims filesystem", () => {
    const diags = validateWasmArtefact(artefact({
      target: { runtime: "browser", features: [] },
      effects: ["filesystem"],
    }));
    assert.ok(codes(diags).includes("FUNGI-WASM-017"));
  });

  it("refuses missing identity fields on a legacy metadata record", () => {
    const diags = validateWasmArtefact({
      path: "out/mod.wasm",
      target: { runtime: "server", features: [] },
      exports: ["run"],
      imports: [],
    });
    assert.equal(diags[0]?.code, "FUNGI-WASM-001");
  });
});

describe("createWasmTargetReport — admitted vs refused", () => {
  it("admits a clean artefact and lifts export warnings without treating them as refusal", () => {
    const { report, diagnostics } = createWasmTargetReport({
      artefacts: [artefact(), artefact({
        path: "out/empty.wasm",
        bytesHex: Buffer.from(OTHER_BYTES).toString("hex"),
        digest: OTHER_DIGEST,
        attestation: { sha256: OTHER_DIGEST, profile: "dev", signature: "" },
        exports: [],
      })],
    });
    assert.equal(report.schema, WASM_ARTEFACT_SCHEMA);
    assert.equal(report.admitted.length, 2);
    assert.equal(report.refused.length, 0);
    assert.equal(report.warnings.length, 1);
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-WASM-014"));
  });

  it("does not admit an artefact that failed identity or runtime checks", () => {
    const { report, diagnostics } = createWasmTargetReport({
      artefacts: [artefact({ target: { runtime: "native", features: [] } })],
    });
    assert.equal(report.admitted.length, 0);
    assert.equal(report.refused.length, 1);
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-WASM-005"));
  });

  it("refuses duplicate digests in one report", () => {
    const { report, diagnostics } = createWasmTargetReport({
      artefacts: [artefact(), artefact({ path: "out/copy.wasm" })],
    });
    assert.equal(report.admitted.length, 1);
    assert.equal(report.refused.length, 1);
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-WASM-018"));
  });

  it("refuses hostile collections and returns a detached report snapshot", () => {
    const input = { artefacts: [artefact()] };
    const { report, diagnostics } = createWasmTargetReport(input);
    assert.deepEqual(diagnostics, []);
    input.artefacts[0].exports.push({ name: "rogue", kind: "func" });
    input.artefacts.push(artefact({ path: "out/second.wasm" }));
    assert.deepEqual(report.admitted[0].exports, [{ name: "run", kind: "func" }]);
    assert.equal(report.admitted.length, 1);
    const proxyRefused = createWasmTargetReport({ artefacts: [new Proxy(artefact(), {})] });
    assert.equal(proxyRefused.diagnostics[0]?.code, "FUNGI-WASM-001");
    assert.equal(proxyRefused.report.admitted.length, 0);
    const sparse = [];
    sparse.length = 1;
    const sparseRefused = createWasmTargetReport({ artefacts: sparse });
    assert.equal(sparseRefused.diagnostics[0]?.code, "FUNGI-WASM-001");
  });
});

describe("validateWasmFallbackIdentity", () => {
  const fallback = {
    schema: WASM_FALLBACK_SCHEMA,
    requested: "wasm",
    selected: "cpu",
    reason: "No preferred compute target is available.",
    fallbackUsed: true,
  };

  it("accepts an explicit fallback with a reason", () => {
    assert.deepEqual(codes(validateWasmFallbackIdentity(fallback)), []);
  });

  it("refuses silent fallback and identical requested/selected when fallbackUsed", () => {
    assert.ok(codes(validateWasmFallbackIdentity({ ...fallback, reason: " " })).includes("FUNGI-WASM-022"));
    assert.ok(codes(validateWasmFallbackIdentity({ ...fallback, selected: "wasm" })).includes("FUNGI-WASM-025"));
  });

  it("binds a compute selection shape without admitting an artefact", () => {
    const diags = bindComputeSelectionToWasmFallback({
      requested: "wasm",
      selectedTarget: "cpu",
      reason: "No preferred compute target is available.",
      fallback: true,
    });
    assert.deepEqual(codes(diags), []);
    const silent = bindComputeSelectionToWasmFallback({
      requested: "wasm",
      selectedTarget: "cpu",
      reason: "",
      fallback: true,
    });
    assert.ok(codes(silent).includes("FUNGI-WASM-022"));
  });
});

describe("validateWasmHandoff — compiler/compute planning contract", () => {
  const handoff = {
    schema: WASM_HANDOFF_SCHEMA,
    compiler: { projectRoot: "packages-ts/galerina-target-wasm", entryFiles: ["src/index.ts"] },
    compute: {
      requested: "wasm",
      selectedTarget: "wasm",
      reason: "Target is available and appears first in preference order.",
      fallback: false,
      satisfied: true,
    },
    wasmRuntime: "server",
    admission: "not-evaluated",
  };

  it("accepts a wasm selection with a wasmRuntime and does not admit", () => {
    assert.deepEqual(codes(validateWasmHandoff(handoff)), []);
  });

  it("refuses treating a handoff as artefact admission", () => {
    assert.ok(codes(validateWasmHandoff({ ...handoff, admission: "admitted" })).includes("FUNGI-WASM-029"));
  });

  it("requires wasmRuntime only when compute selects wasm", () => {
    const missing = { ...handoff };
    delete missing.wasmRuntime;
    assert.ok(codes(validateWasmHandoff(missing)).includes("FUNGI-WASM-028"));
    const cpu = {
      ...handoff,
      compute: { ...handoff.compute, selectedTarget: "cpu", requested: "wasm", fallback: true, reason: "No preferred compute target is available." },
    };
    delete cpu.wasmRuntime;
    assert.deepEqual(codes(validateWasmHandoff(cpu)), []);
    assert.ok(codes(validateWasmHandoff({ ...cpu, wasmRuntime: "server" })).includes("FUNGI-WASM-028"));
  });

  it("refuses gpu/photonic as wasmRuntime and escaping compiler paths", () => {
    assert.ok(codes(validateWasmHandoff({ ...handoff, wasmRuntime: "gpu" })).includes("FUNGI-WASM-005"));
    assert.ok(codes(validateWasmHandoff({
      ...handoff,
      compiler: { projectRoot: "../secret", entryFiles: ["src/index.ts"] },
    })).includes("FUNGI-WASM-027"));
  });
});

describe("examples and out-of-package duties", () => {
  it("validates the checked-in artefact and handoff examples", () => {
    const raw = JSON.parse(readFileSync(join(EXAMPLE_DIR, "artefact.example.json"), "utf8"));
    const example = {
      ...raw,
      digest: DIGEST,
      attestation: { ...raw.attestation, sha256: DIGEST },
    };
    assert.deepEqual(codes(validateWasmArtefact(example)), []);
    const plan = JSON.parse(readFileSync(join(EXAMPLE_DIR, "handoff.example.json"), "utf8"));
    assert.deepEqual(codes(validateWasmHandoff(plan)), []);
  });

  it("never treats a non-empty signature as verified", () => {
    const diags = validateWasmArtefact(artefact({
      attestation: { sha256: DIGEST, profile: "certified", signature: "deadbeef" },
    }));
    assert.equal(diags.some((d) => d.code === "FUNGI-WASM-012"), false);
    const verify = verifyWasmAttestationSignature("deadbeef", DIGEST);
    assert.deepEqual(codes(verify), ["FUNGI-WASM-030"]);
  });

  it("does not open the artefact path on disk", () => {
    const diags = validateWasmArtefact(artefact({ path: "out/does-not-exist-on-disk.wasm" }));
    assert.deepEqual(codes(diags), []);
  });

  it("exports a closed FUNGI-WASM diagnostic registry", () => {
    assert.equal(WASM_DIAGNOSTIC_REGISTRY["FUNGI-WASM-001"], "input refused");
    assert.equal(Object.keys(WASM_DIAGNOSTIC_REGISTRY).every((code) => code.startsWith("FUNGI-WASM-")), true);
  });
});
