import assert from "node:assert/strict";
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
import { createHash, generateKeyPairSync } from "node:crypto";

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
  return spawnSync(
    process.execPath,
    [CLI, ...args],
    {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...env },
      shell: false,
      timeout: 120_000,
    },
  );
}

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function installEphemeralPinnedRevocationSnapshot(cwd) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const keyId = createHash("sha256").update(publicKey).digest("hex").slice(0, 16);
  const governance = join(cwd, "governance");
  mkdirSync(governance, { recursive: true });
  writeFileSync(
    join(governance, "trust-anchor.json"),
    JSON.stringify({ schemaVersion: 1, registrySigningRootKeyId: keyId }),
  );
  writeFileSync(join(governance, `signing-key-${keyId}.pub.pem`), publicKey);
  const registry = signRegistryObject(
    { schemaVersion: 1, appendOnly: true, revoked: [] },
    privateKey,
    keyId,
  );
  writeFileSync(
    join(governance, "revocations.json"),
    JSON.stringify(registry, null, 2) + "\n",
  );
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

    installEphemeralPinnedRevocationSnapshot(cwd);
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
