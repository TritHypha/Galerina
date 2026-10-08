import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { decodeCBOR, encodeCBOR } from "../dist/manifest-generator.js";
import { signRegistryObject } from "../../../governance/revocation-registry.mjs";

const REPO = join(import.meta.dirname, "..", "..", "..");
const CLI = join(REPO, "galerina.mjs");
const SOURCE = `@version 1
pure flow answer() -> Int {
  return 42
}
`;

function run(args, env, cwd) {
  const childEnv = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GALERINA_PROFILE",
    "GALERINA_MANIFEST_PROFILE",
    "GALERINA_SIGNING_ENV",
    "GALERINA_SIGNING_KEY_ID",
    "GALERINA_SIGNING_ALGORITHM",
    "GALERINA_SIGNING_PRIVATE_KEY_B64",
    "GALERINA_SIGNING_MLDSA_PRIVATE_KEY_B64",
  ]) {
    delete childEnv[key];
  }
  Object.assign(childEnv, env);
  return spawnSync(
    process.execPath,
    [CLI, ...args],
    {
      cwd,
      encoding: "utf8",
      env: childEnv,
      shell: false,
      timeout: 120_000,
    },
  );
}

function writeTrustedEmptyRevocationSnapshot(rootDir) {
  const keyId = "test-revocation-root";
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const governance = join(rootDir, "governance");
  mkdirSync(governance, { recursive: true });

  writeFileSync(
    join(governance, "trust-anchor.json"),
    JSON.stringify({ schemaVersion: 1, registrySigningRootKeyId: keyId }),
  );
  writeFileSync(
    join(governance, `signing-key-${keyId}.pub.pem`),
    publicKey.export({ type: "spki", format: "pem" }),
  );
  const signed = signRegistryObject(
    { schemaVersion: 1, appendOnly: true, revoked: [] },
    privateKey.export({ type: "pkcs8", format: "pem" }),
    keyId,
  );
  writeFileSync(
    join(governance, "revocations.json"),
    `${JSON.stringify(signed, null, 2)}\n`,
  );
}

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

test("classical CLI refuses a legacy CBOR signature and an untrustworthy revocation registry", () => {
  const cwd = mkdtempSync(join(tmpdir(), "galerina-classical-refusal-"));
  try {
    const keygen = run(["keygen"], {}, cwd);
    assert.equal(keygen.status, 0, output(keygen));
    writeFileSync(join(cwd, "answer.fungi"), SOURCE);

    const build = run(["build", "answer.fungi"], {}, cwd);
    assert.equal(build.status, 0, output(build));

    const verifyControl = run(["verify", "answer.fungi"], {}, cwd);
    assert.equal(verifyControl.status, 0, output(verifyControl));

    writeTrustedEmptyRevocationSnapshot(cwd);
    const runControl = run(
      ["run", "answer.fungi", "--invoke", "answer"],
      { GALERINA_PROFILE: "production" },
      cwd,
    );
    assert.equal(runControl.status, 0, output(runControl));
    assert.match(output(runControl), /42/);

    const cborPath = join(cwd, "build", "answer.lmanifest");
    const canonical = readFileSync(cborPath);
    const decoded = decodeCBOR(new Uint8Array(canonical)).value;
    writeFileSync(
      cborPath,
      Buffer.from(encodeCBOR({
        ...decoded,
        governanceSignature: {
          ...decoded.governanceSignature,
          canon: "legacy",
        },
      })),
    );
    const legacy = run(
      ["run", "answer.fungi", "--invoke", "answer"],
      { GALERINA_PROFILE: "production" },
      cwd,
    );
    assert.equal(legacy.status, 1);
    assert.match(output(legacy), /FUNGI-MANIFEST-LEGACY-FORMAT/);
    writeFileSync(cborPath, canonical);

    const governance = join(cwd, "governance");
    mkdirSync(governance, { recursive: true });
    writeFileSync(
      join(governance, "trust-anchor.json"),
      JSON.stringify({
        schemaVersion: 1,
        registrySigningRootKeyId: "missing-test-root",
      }),
    );
    writeFileSync(
      join(governance, "revocations.json"),
      JSON.stringify({ schemaVersion: 1, revoked: [] }),
    );
    const registryRefusal = run(["verify", "answer.fungi"], {}, cwd);
    assert.equal(registryRefusal.status, 1);
    assert.match(output(registryRefusal), /FUNGI-REVOCATION-REGISTRY/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
