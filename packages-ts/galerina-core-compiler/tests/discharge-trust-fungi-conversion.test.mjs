import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  CompilerTrust,
  checkEffects,
  dischargeTrust,
  executeFlow,
  parseProgram,
} from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..", "src", "self-hosted", "hardening-trust-boundary.fungi");
const CURRENT = Object.freeze([
  CompilerTrust.REFUTED,
  CompilerTrust.UNVERIFIED,
  CompilerTrust.PROVEN,
]);
const EVIDENCE = Object.freeze([
  Object.freeze({ source: false, verdict: CompilerTrust.REFUTED }),
  Object.freeze({ source: undefined, verdict: CompilerTrust.UNVERIFIED }),
  Object.freeze({ source: true, verdict: CompilerTrust.PROVEN }),
]);

function compileCandidate() {
  const source = readFileSync(SOURCE, "utf8").replace(/^\uFEFF/u, "");
  const program = parseProgram(source, "hardening-trust-boundary.fungi");
  assert.deepEqual(
    (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  assert.deepEqual(
    checkEffects(program.flows, program.ast)
      .flatMap((result) => result.diagnostics)
      .filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  return { program, source };
}

describe("compiler package-owned Fungi trust discharge", () => {
  it("preserves the complete sticky-refutation and verification table", async () => {
    const { program, source } = compileCandidate();
    assert.doesNotMatch(source, /^\s*(?:for|while|loop)\b/mu);
    assert.doesNotMatch(source, /\b(?:null|NaN|throw|try|catch)\b/u);
    assert.doesNotMatch(source, /\belse\s+if\b/u);
    assert.doesNotMatch(source, /\belse\b/u);

    assert.deepEqual(EVIDENCE.map(({ verdict }) => verdict), [-1, 0, 1]);
    for (const current of CURRENT) {
      for (const evidence of EVIDENCE) {
        const expected = dischargeTrust(current, evidence.source);
        const interpreted = await executeFlow(
          "dischargeTrustFungi",
          new Map([
            ["current", { __tag: "verdict", value: current }],
            ["verification", { __tag: "verdict", value: evidence.verdict }],
          ]),
          program.ast,
          program.flows,
        );
        assert.deepEqual(
          interpreted.value,
          { __tag: "verdict", value: expected },
          `discharge(${current}, ${String(evidence.source)})`,
        );
      }
    }
  });
});
