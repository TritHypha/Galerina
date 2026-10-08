import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  verifyFileContainer,
  FILE_CONTAINER_SCHEMA,
  ALL_ZERO_OPERATIONAL_PIN,
  FUNGI_VERIFY_017,
  FUNGI_VERIFY_018,
} from "../dist/index.js";
import { runVerifyCommand, VERIFY_EXIT_MANIFEST } from "../dist/verify/verify-command.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

describe("verifyFileContainer", () => {
  it("refuses a non-object", () => {
    const r = verifyFileContainer([]);
    assert.equal(r.success, false);
    assert.equal(r.diagnostics[0].code, FUNGI_VERIFY_017);
  });

  it("refuses an unsigned galerina.manifest.v1 object", () => {
    const r = verifyFileContainer({ schemaVersion: FILE_CONTAINER_SCHEMA, buildId: "ECHO_BUILD_ID" });
    assert.equal(r.success, false);
    assert.equal(r.diagnostics.length, 1);
    assert.equal(r.diagnostics[0].code, FUNGI_VERIFY_017);
    assert.equal(r.diagnostics[0].field, "signature");
    assert.equal(JSON.stringify(r).includes("ECHO_BUILD_ID"), false);
  });

  it("refuses a dummy signature while operational pins are all-zero (no crypto, no keys)", () => {
    const r = verifyFileContainer({ schemaVersion: FILE_CONTAINER_SCHEMA, signature: "not-a-key" });
    assert.equal(r.success, false);
    assert.equal(r.diagnostics[0].code, FUNGI_VERIFY_018);
    assert.equal(JSON.stringify(r).includes("not-a-key"), false);
  });

  it("does not interpret nested README fields (no reader)", () => {
    const r = verifyFileContainer({
      schemaVersion: FILE_CONTAINER_SCHEMA,
      routes: [{ method: "PLEASE_ECHO" }],
    });
    assert.equal(r.success, false);
    assert.equal(r.diagnostics[0].code, FUNGI_VERIFY_017);
    assert.equal(JSON.stringify(r).includes("PLEASE_ECHO"), false);
  });

  it("pins all-zero operational pins in beta-v1-platform-policy.json", () => {
    const policy = JSON.parse(readFileSync(join(repoRoot, "governance", "beta-v1-platform-policy.json"), "utf8"));
    const auth = policy.releaseEvidenceAuthority;
    assert.equal(auth.operationalEd25519PublicKeySha256, ALL_ZERO_OPERATIONAL_PIN);
    assert.equal(auth.operationalMlDsa65PublicKeySha256, ALL_ZERO_OPERATIONAL_PIN);
    assert.equal(auth.delegationSha256, ALL_ZERO_OPERATIONAL_PIN);
  });

  it("pins compiler README v0.2 schemaVersion and ProofGraph verifier export (no package dependency)", () => {
    const readme = readFileSync(join(here, "..", "..", "galerina-core-compiler", "README.md"), "utf8");
    assert.equal(readme.includes('schemaVersion: "galerina.manifest.v1"'), true);
    const index = readFileSync(join(here, "..", "..", "galerina-core-compiler", "src", "index.ts"), "utf8");
    assert.equal(/\bverifyGovernanceSignature\b/.test(index), true);
    assert.equal(/\bverifyGovernanceSignatureHybrid\b/.test(index), true);
  });
});

describe("galerina verify --manifest file container", () => {
  it("exit 7 on an unsigned galerina.manifest.v1 object", async () => {
    const base = mkdtempSync(join(tmpdir(), "galerina-vfc-"));
    try {
      writeFileSync(join(base, "arts.json"), "[]\n");
      writeFileSync(join(base, "container.json"), JSON.stringify({ schemaVersion: FILE_CONTAINER_SCHEMA }) + "\n");
      const result = await runVerifyCommand({
        cwd: base,
        env: {},
        args: ["--artefacts", "arts.json", "--manifest", "container.json"],
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, VERIFY_EXIT_MANIFEST);
      assert.equal(result.details.includes(FUNGI_VERIFY_017), true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
