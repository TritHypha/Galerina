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
  for (const name of Object.keys(childEnv)) {
    if (name.startsWith("GALERINA_SIGNING_") || name === "GALERINA_MANIFEST_PROFILE"
      || name === "GIT_DIR" || name === "GIT_WORK_TREE" || name === "GIT_INDEX_FILE"
      || name === "GIT_OBJECT_DIRECTORY" || name === "GIT_ALTERNATE_OBJECT_DIRECTORIES") {
      delete childEnv[name];
    }
  }
  return spawnSync(
    process.execPath,
    [CLI, ...args],
    {
      cwd,
      encoding: "utf8",
      env: { ...childEnv, GALERINA_PROFILE: "dev", ...env },
      shell: false,
      timeout: 120_000,
    },
  );
}

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

test("classical CLI admits a trusted fixture and refuses invalid signature or revocation evidence", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "galerina-classical-refusal-"));
  try {
    const keygen = run(["keygen"], {}, cwd);
    assert.equal(keygen.status, 0, output(keygen));
    writeFileSync(join(cwd, "answer.fungi"), SOURCE);

    const build = run(["build", "answer.fungi"], {}, cwd);
    assert.equal(build.status, 0, output(build));

    const verifyControl = run(["verify", "answer.fungi"], {}, cwd);
    assert.equal(verifyControl.status, 0, output(verifyControl));

    // Only this fixture's ephemeral key may establish its test trust root.
    const signing = Object.fromEntries(
      readFileSync(join(cwd, ".env.galerina-signing"), "utf8")
        .split(/\r?\n/).flatMap(line => {
          const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
          return match ? [[match[1], match[2].trim()]] : [];
        }),
    );
    const keyId = signing.GALERINA_SIGNING_KEY_ID;
    assert.match(keyId, /^[0-9a-f]{16}$/);
    assert.ok(signing.GALERINA_SIGNING_PRIVATE_KEY_B64, "fixture keygen must supply its key");
    const privatePem = Buffer.from(signing.GALERINA_SIGNING_PRIVATE_KEY_B64, "base64").toString("utf8");
    const governance = join(cwd, "governance");
    const pinPath = join(governance, "trust-anchor.json");
    const registryPath = join(governance, "revocations.json");
    const registryBody = { schemaVersion: 1, appendOnly: true, revoked: [] };
    const signedRegistry = signRegistryObject(registryBody, privatePem, keyId);
    const restoreRegistry = () => {
      writeFileSync(pinPath, JSON.stringify({ schemaVersion: 1, registrySigningRootKeyId: keyId }));
      writeFileSync(registryPath, JSON.stringify(signedRegistry));
    };
    restoreRegistry();

    const runControl = run(
      ["run", "answer.fungi", "--invoke", "answer"],
      { GALERINA_PROFILE: "production" },
      cwd,
    );
    assert.equal(runControl.status, 0, output(runControl));
    assert.equal(runControl.stdout.trim().split(/\r?\n/).at(-1), "42");

    // A production bypass of any independent trust requirement must turn a
    // refusal below into success, failing the corresponding assertion.
    const refusals = [
      ["missing snapshot", () => rmSync(registryPath), /registry is MISSING/],
      ["unsigned snapshot", () => writeFileSync(registryPath, JSON.stringify(registryBody)), /registry is UNSIGNED/],
      ["wrong pinned root", () => writeFileSync(pinPath, JSON.stringify({
        schemaVersion: 1, registrySigningRootKeyId: keyId === "0000000000000000" ? "1111111111111111" : "0000000000000000",
      })), /rogue-signer rejected/],
      ["tampered signed payload", () => writeFileSync(registryPath, JSON.stringify({ ...signedRegistry, appendOnly: false })), /signature INVALID/],
      ["signed non-append-only snapshot", () => writeFileSync(registryPath, JSON.stringify(
        signRegistryObject({ ...registryBody, appendOnly: false }, privatePem, keyId),
      )), /not a pinned, signed, append-only v1 snapshot/],
    ];
    for (const [name, mutate, reason] of refusals) {
      await t.test(name, () => {
        restoreRegistry();
        mutate();
        const refused = run(["run", "answer.fungi", "--invoke", "answer"], { GALERINA_PROFILE: "production" }, cwd);
        assert.equal(refused.status, 1, output(refused));
        assert.match(output(refused), /FUNGI-MANIFEST-INVALID/);
        assert.match(output(refused), reason);
      });
    }
    restoreRegistry();

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
