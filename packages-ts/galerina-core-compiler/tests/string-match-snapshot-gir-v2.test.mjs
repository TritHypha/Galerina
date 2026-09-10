import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const source = `@version 1
pure flow isEnvironmentMode(value: String) -> Bool {
  match value {
    "development" => return true
    "test" => return true
    "staging" => return true
    "production" => return true
    _ => return false
  }
}
`;

const evidence = {
  schema: L.CHECKED_MODULE_EVIDENCE_SCHEMA,
  stages: ["parser", "symbols", "types", "effects", "values", "governance"].map((name, index) => ({
    id: index + 1,
    name,
    digest: digest(String.fromCharCode(97 + index)),
    outcome: "passed",
  })),
};

const seal = (text = source) => {
  const sourceBytes = new TextEncoder().encode(text);
  const parseResult = L.parseProgram(text, "environment-mode.fungi", { requireVersionHeader: true });
  return L.sealStringMatchCheckedModuleSnapshot({
    sourceBytes,
    sourceFile: "environment-mode.fungi",
    parseResult,
    checkerEvidence: evidence,
    compilerIdentity: {
      packageId: "@galerina/core-compiler",
      version: "1.0.0-beta.2",
      commitDigest: digest("f"),
    },
  });
};

describe("versioned String-match checked snapshot and GIR", () => {
  it("seals and round-trips exact literal bytes without widening scalar v1", () => {
    const result = seal();
    assert.equal(result.snapshot.schema, L.STRING_MATCH_SNAPSHOT_SCHEMA);
    assert.equal(result.snapshot.edition, L.STRING_MATCH_SNAPSHOT_EDITION);
    assert.equal(result.snapshot.parameterType, "String");
    assert.equal(result.snapshot.returnType, "Bool");
    assert.deepEqual(result.snapshot.arms.map((arm) => arm.literal), ["development", "test", "staging", "production", null]);
    assert.deepEqual(result.snapshot.arms.map((arm) => arm.result), [true, true, true, true, false]);
    assert.deepEqual(L.decodeStringMatchCheckedModuleSnapshot(result.snapshotBytes), result.snapshot);
    assert.equal(L.digestStringMatchCheckedModuleSnapshot(result.snapshotBytes), result.snapshotDigest);
    assert.equal(result.authorityReleased, false);
  });

  it("emits deterministic String-capable GIR and binds it to the checked snapshot", () => {
    const result = seal();
    const reference = L.createArtifactReference("galerina", "checked-module-snapshot", result.snapshotBytes);
    const emission = L.emitCanonicalStringMatchGIRFromSnapshot(result.snapshotBytes, reference);
    assert.equal(emission.schema, L.STRING_MATCH_GIR_SCHEMA);
    assert.equal(emission.authorityReleased, false);
    assert.equal(emission.girReference.kind, "canonical-gir");
    assert.equal(emission.girDigest, L.digestArtifactBytes(emission.girBytes));
    assert.equal(emission.semanticProfileId, L.STRING_MATCH_SEMANTIC_PROFILE_ID);
    assert.deepEqual(
      L.emitCanonicalStringMatchGIRFromSnapshot(result.snapshotBytes, reference).girBytes,
      emission.girBytes,
    );
  });

  it("refuses malformed String domains, arm order, and mismatched references", () => {
    const result = seal();
    const reference = L.createArtifactReference("galerina", "checked-module-snapshot", result.snapshotBytes);
    assert.throws(() => L.encodeStringMatchCheckedModuleSnapshot({
      ...result.snapshot,
      arms: result.snapshot.arms.slice(0, -1),
    }), /ARMS_WILDCARD/u);
    assert.throws(() => L.encodeStringMatchCheckedModuleSnapshot({
      ...result.snapshot,
      arms: [{ ...result.snapshot.arms[0], literal: "test" }, ...result.snapshot.arms.slice(1)],
    }), /ARMS_DUPLICATE/u);
    assert.throws(() => L.encodeStringMatchCheckedModuleSnapshot({
      ...result.snapshot,
      arms: [{ ...result.snapshot.arms.at(-1), id: 1 }, ...result.snapshot.arms.slice(0, -1).map((arm, index) => ({ ...arm, id: index + 2 }))],
    }), /ARMS_WILDCARD_ORDER/u);
    assert.throws(() => L.emitCanonicalStringMatchGIRFromSnapshot(result.snapshotBytes, L.createArtifactReference("galerina", "checked-module-snapshot", new TextEncoder().encode("wrong"))), /SNAPSHOT_REFERENCE/u);
    assert.throws(() => L.encodeStringMatchCheckedModuleSnapshot({
      ...result.snapshot,
      arms: [{ ...result.snapshot.arms[0], literal: "bad\u0000value" }, ...result.snapshot.arms.slice(1)],
    }), /ARM_LITERAL_NUL/u);
  });

  it("refuses hostile checker arrays before reading accessors or inherited fields", () => {
    const result = seal();
    const accessorCheckers = [...result.snapshot.checkerIdentities];
    Object.defineProperty(accessorCheckers, "0", { configurable: true, enumerable: true, get() { throw new Error("accessed"); } });
    assert.throws(() => L.encodeStringMatchCheckedModuleSnapshot({ ...result.snapshot, checkerIdentities: accessorCheckers }), /CHECKERS_ACCESSOR/u);
    const alteredPrototypeCheckers = [...result.snapshot.checkerIdentities];
    Object.setPrototypeOf(alteredPrototypeCheckers, Object.prototype);
    assert.throws(() => L.encodeStringMatchCheckedModuleSnapshot({ ...result.snapshot, checkerIdentities: alteredPrototypeCheckers }), /CHECKERS_PROTOTYPE/u);
  });
});
