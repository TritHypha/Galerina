import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  checkEffects,
  emitGIR,
  executeFlow,
  parseProgram,
} from "../../galerina-core-compiler/dist/index.js";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const PACKAGE_ROOT = join(ROOT, "packages-ts", "galerina-test");
const OVERLAY_ROOT = join(PACKAGE_ROOT, "src", "self-hosted", "conversion-overlays");
const PACKAGE = join(PACKAGE_ROOT, "package.json");

const CANDIDATES = Object.freeze([
  ["myco-max-index-path-length.fungi", "mycoMaxIndexPathLength", "Int", 4096, "galerina-tools-myco/src/graph/index-contract.ts", "MAX_INDEX_PATH_LENGTH = 4096"],
  ["myco-max-index-term-length.fungi", "mycoMaxIndexTermLength", "Int", 4096, "galerina-tools-myco/src/graph/index-contract.ts", "MAX_INDEX_TERM_LENGTH = 4096"],
  ["myco-max-index-files.fungi", "mycoMaxIndexFiles", "Int", 250_000, "galerina-tools-myco/src/graph/index-contract.ts", "MAX_INDEX_FILES = 250_000"],
  ["myco-max-index-terms-per-file.fungi", "mycoMaxIndexTermsPerFile", "Int", 100_000, "galerina-tools-myco/src/graph/index-contract.ts", "MAX_INDEX_TERMS_PER_FILE = 100_000"],
  ["myco-max-index-term-edges.fungi", "mycoMaxIndexTermEdges", "Int", 2_000_000, "galerina-tools-myco/src/graph/index-contract.ts", "MAX_INDEX_TERM_EDGES = 2_000_000"],
  ["myco-max-index-bytes.fungi", "mycoMaxIndexBytes", "Int", 64 * 1024 * 1024, "galerina-tools-myco/src/graph/index-contract.ts", "MAX_INDEX_BYTES = 64 * 1024 * 1024"],
  ["myco-index-format.fungi", "mycoIndexFormat", "Int", 1, "galerina-tools-myco/src/graph/store.ts", "FORMAT = 1"],
  ["myco-index-dir.fungi", "mycoIndexDir", "String", ".myco", "galerina-tools-myco/src/graph/store.ts", "INDEX_DIR = \".myco\""],
  ["myco-index-file.fungi", "mycoIndexFile", "String", "index.json", "galerina-tools-myco/src/graph/store.ts", "INDEX_FILE = \"index.json\""],
  ["myco-max-repetition.fungi", "mycoMaxRepetition", "Int", 1000, "galerina-tools-myco/src/query/regex-guard.ts", "MAX_REPETITION = 1000"],
  ["myco-max-regex-line-length.fungi", "mycoMaxRegexLineLength", "Int", 200_000, "galerina-tools-myco/src/query/regex-guard.ts", "MAX_REGEX_LINE_LEN = 200_000"],
  ["myco-search-time-budget-ms.fungi", "mycoSearchTimeBudgetMs", "Int", 120_000, "galerina-tools-myco/src/query/regex-guard.ts", "SEARCH_TIME_BUDGET_MS = 120_000"],
  ["myco-regex-operation-time-budget-ms.fungi", "mycoRegexOperationTimeBudgetMs", "Int", 250, "galerina-tools-myco/src/query/regex-guard.ts", "REGEX_OPERATION_TIME_BUDGET_MS = 250"],
  ["myco-sniff-bytes.fungi", "mycoSniffBytes", "Int", 8000, "galerina-tools-myco/src/util/binary.ts", "SNIFF_BYTES = 8000"],
  ["tri-regex-match.fungi", "triRegexMatch", "Verdict", 1, "galerina-tri-regex/src/types.ts", "MATCH: TriVerdict = 1"],
  ["tower-policy-has-allowlist.fungi", "towerPolicyHasAllowlist", "Int", 1, "galerina-tower-citizen/src/compiled-policy.ts", "POL_HAS_ALLOWLIST    = 0b00001"],
  ["tower-policy-deny-host-native.fungi", "towerPolicyDenyHostNative", "Int", 2, "galerina-tower-citizen/src/compiled-policy.ts", "POL_DENY_HOST_NATIVE = 0b00010"],
  ["tower-policy-has-call-budget.fungi", "towerPolicyHasCallBudget", "Int", 4, "galerina-tower-citizen/src/compiled-policy.ts", "POL_HAS_CALL_BUDGET  = 0b00100"],
  ["tower-policy-has-token-budget.fungi", "towerPolicyHasTokenBudget", "Int", 8, "galerina-tower-citizen/src/compiled-policy.ts", "POL_HAS_TOKEN_BUDGET = 0b01000"],
  ["tower-policy-has-cost-ceiling.fungi", "towerPolicyHasCostCeiling", "Int", 16, "galerina-tower-citizen/src/compiled-policy.ts", "POL_HAS_COST_CEILING = 0b10000"],
  ["tower-ai-inference-capability.fungi", "towerAiInferenceCapability", "Int", 32, "galerina-tower-citizen/src/hybrid-engine.ts", "AI_INFERENCE_CAP = 0b00100000"],
  ["tower-demo-count.fungi", "towerDemoCount", "Int", 16, "galerina-tower-citizen/src/hybrid-engine.ts", "DEMO_COUNT = 16"],
  ["tower-photonic-reprogram-capability.fungi", "towerPhotonicReprogramCapability", "String", "photonic.reprogram", "galerina-tower-citizen/src/photonic-admission.ts", "PHOTONIC_REPROGRAM_CAP = \"photonic.reprogram\""],
  ["tower-max-plugin-input-bytes.fungi", "towerMaxPluginInputBytes", "Int", 4 * 1024 * 1024, "galerina-tower-citizen/src/plugin-sandbox.ts", "MAX_INPUT_BYTES = 4 * 1024 * 1024"],
  ["tower-max-plugin-input-depth.fungi", "towerMaxPluginInputDepth", "Int", 32, "galerina-tower-citizen/src/plugin-sandbox.ts", "MAX_INPUT_DEPTH = 32"],
  ["tower-max-plugin-input-nodes.fungi", "towerMaxPluginInputNodes", "Int", 10_000, "galerina-tower-citizen/src/plugin-sandbox.ts", "MAX_INPUT_NODES = 10_000"],
  ["tower-max-container-fields.fungi", "towerMaxContainerFields", "Int", 1_000, "galerina-tower-citizen/src/plugin-sandbox.ts", "MAX_CONTAINER_FIELDS = 1_000"],
  ["tower-transition-context.fungi", "towerTransitionContext", "String", "galerina.registry.rotation.transition.v1", "galerina-tower-citizen/src/registry-key-rotation.ts", "TRANSITION_CONTEXT = \"galerina.registry.rotation.transition.v1\""],
  ["tower-challenge-context.fungi", "towerChallengeContext", "String", "galerina.registry.rotation.challenge.v1", "galerina-tower-citizen/src/registry-key-rotation.ts", "CHALLENGE_CONTEXT = \"galerina.registry.rotation.challenge.v1\""],
  ["tower-snapshot-key-context.fungi", "towerSnapshotKeyContext", "String", "galerina.snapshot.epoch.key.v1", "galerina-tower-citizen/src/snapshot-key-provider.ts", "SNAPSHOT_KEY_CONTEXT = \"galerina.snapshot.epoch.key.v1\""],
  ["tower-storage-admit-capability.fungi", "towerStorageAdmitCapability", "String", "storage.admit", "galerina-tower-citizen/src/substrate-erasure.ts", "STORAGE_ADMIT_CAP = \"storage.admit\""],
  ["tower-governance-diagnostic.fungi", "towerGovernanceDiagnostic", "String", "FUNGI-GOV-3VL-001", "galerina-tower-citizen/src/three-valued-governance.ts", "GOV_3VL_DIAGNOSTIC = \"FUNGI-GOV-3VL-001\""],
  ["tower-encoding-reject.fungi", "towerEncodingReject", "Int", 0, "galerina-tower-citizen/src/tpl-simulator.ts", "ENC_REJECT = 0b00"],
  ["tower-encoding-hold.fungi", "towerEncodingHold", "Int", 1, "galerina-tower-citizen/src/tpl-simulator.ts", "ENC_HOLD   = 0b01"],
  ["tower-encoding-commit.fungi", "towerEncodingCommit", "Int", 2, "galerina-tower-citizen/src/tpl-simulator.ts", "ENC_COMMIT = 0b10"],
  ["tower-encoding-illegal.fungi", "towerEncodingIllegal", "Int", 3, "galerina-tower-citizen/src/tpl-simulator.ts", "ENC_ILLEGAL = 0b11"],
  ["tower-trits-per-i32.fungi", "towerTritsPerI32", "Int", 16, "galerina-tower-citizen/src/tpl-simulator.ts", "TRITS_PER_I32 = 16"],
  ["tower-canary.fungi", "towerCanary", "Int", 0x7e57cafe, "galerina-tower-citizen/src/tpl-simulator.ts", "CANARY = 0x7e57cafe"],
  ["tri-regex-infinity-sentinel.fungi", "triRegexInfinitySentinel", "Int", 0x7fffffff, "galerina-tri-regex/src/engine.ts", "INF = 0x7fffffff"],
  ["tri-regex-max-code-point.fungi", "triRegexMaxCodePoint", "Int", 0x10ffff, "galerina-tri-regex/src/parser.ts", "MAX_CP = 0x10ffff"],
].map(([file, flow, type, value, source, sourceText]) => Object.freeze({ file, flow, type, value, source, sourceText })));

describe("40-file governed conversion overlay", () => {
  it("contains exactly 40 new source twins and binds every exact TypeScript literal", () => {
    assert.equal(CANDIDATES.length, 40);
    const loadedAssets = JSON.parse(readFileSync(PACKAGE, "utf8")).packageGraph?.loadedAssets ?? [];
    const overlayAssets = loadedAssets.filter((asset) => asset.includes("/conversion-overlays/"));
    assert.equal(new Set(overlayAssets).size, overlayAssets.length, "conversion overlay identities must be unique");
    for (const candidate of CANDIDATES) {
      assert.ok(
        loadedAssets.includes(`src/self-hosted/conversion-overlays/${candidate.file}`),
        candidate.file,
      );
    }
    for (const candidate of CANDIDATES) {
      const asset = join(OVERLAY_ROOT, candidate.file);
      assert.ok(existsSync(asset), `${candidate.file} must exist`);
      const reference = readFileSync(join(ROOT, "packages-ts", candidate.source), "utf8");
      assert.ok(reference.includes(candidate.sourceText), `${candidate.source} must retain ${candidate.sourceText}`);
    }
  });

  it("parses, effect-checks, emits GIR and interprets every exact primitive", async () => {
    for (const candidate of CANDIDATES) {
      const source = readFileSync(join(OVERLAY_ROOT, candidate.file), "utf8").replace(/^\uFEFF/u, "");
      const program = parseProgram(source, candidate.file);
      assert.deepEqual(
        (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error"),
        [],
        candidate.file,
      );
      const effects = checkEffects(program.flows, program.ast);
      assert.deepEqual(
        effects.flatMap((result) => result.diagnostics).filter((diagnostic) => diagnostic.severity === "error"),
        [],
        candidate.file,
      );
      const { gir } = emitGIR(program.ast, program.flows, effects);
      assert.equal(gir.flows.length, 1, candidate.file);
      const execution = await executeFlow(candidate.flow, new Map(), program.ast, program.flows);
      assert.deepEqual(execution.value, {
        __tag: candidate.type === "Int" ? "int" : candidate.type === "Verdict" ? "verdict" : "string",
        value: candidate.value,
      }, candidate.file);
    }
  });
});
