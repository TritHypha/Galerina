import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import * as Config from "../dist/index.js";
import * as Compiler from "../../galerina-core-compiler/dist/index.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSET = join(PACKAGE_ROOT, "src", "self-hosted", "environment-mode.fungi");
const VALUES = Object.freeze([
  "development",
  "test",
  "staging",
  "production",
  "",
  "Development",
  " production ",
  "preview",
  "production\u0000",
]);

const digest = (character) => `sha256:${character.repeat(64)}`;

function checkerEvidence() {
  return {
    schema: Compiler.CHECKED_MODULE_EVIDENCE_SCHEMA,
    stages: ["parser", "symbols", "types", "effects", "values", "governance"]
      .map((name, index) => ({
        id: index + 1,
        name,
        digest: digest(String.fromCharCode(97 + index)),
        outcome: "passed",
      })),
  };
}

describe("core-config environment mode String snapshot route", () => {
  it("matches the live TypeScript predicate through the real Fungi asset", async () => {
    const sourceBytes = new Uint8Array(readFileSync(ASSET));
    const source = new TextDecoder().decode(sourceBytes);
    const parsed = Compiler.parseProgram(source, "environment-mode.fungi", {
      requireVersionHeader: true,
    });
    assert.deepEqual(parsed.diagnostics, []);

    const sealed = Compiler.sealStringMatchCheckedModuleSnapshot({
      sourceBytes,
      sourceFile: "environment-mode.fungi",
      parseResult: parsed,
      checkerEvidence: checkerEvidence(),
      compilerIdentity: {
        packageId: "@galerina/core-compiler",
        version: "1.0.0-beta.2",
        commitDigest: digest("f"),
      },
    });
    const snapshotReference = Compiler.createArtifactReference(
      "galerina",
      "checked-module-snapshot",
      sealed.snapshotBytes,
    );
    const gir = Compiler.emitCanonicalStringMatchGIRFromSnapshot(
      sealed.snapshotBytes,
      snapshotReference,
    );

    assert.equal(sealed.snapshot.flowName, "isEnvironmentMode");
    assert.deepEqual(
      sealed.snapshot.arms.map(({ literal, result }) => ({ literal, result })),
      [
        { literal: "development", result: true },
        { literal: "test", result: true },
        { literal: "staging", result: true },
        { literal: "production", result: true },
        { literal: null, result: false },
      ],
    );
    assert.equal(sealed.authorityReleased, false);
    assert.equal(gir.authorityReleased, false);
    assert.equal(gir.snapshotReference.digest, sealed.snapshotDigest);

    for (const value of VALUES) {
      const fungi = await Compiler.executeFlow(
        "isEnvironmentMode",
        new Map([["value", { __tag: "string", value }]]),
        parsed.ast,
        parsed.flows,
      );
      assert.deepEqual(
        fungi.value,
        { __tag: "bool", value: Config.isEnvironmentMode(value) },
        `Fungi/TypeScript differential for ${JSON.stringify(value)}`,
      );
    }
  });
});
