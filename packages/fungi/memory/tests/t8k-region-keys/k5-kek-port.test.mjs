// T8K-K5 the durable-data KEK is reached only through the SecretsProvider port. Synthetic only.
// startupKek(declared, providerPresent, kekForm): declared/providerPresent as portAccess (0/1);
// kekForm 0 MISSING 1 MALFORMED 2 WELL_FORMED else Unlisted.
// 100 only when the port admits (portAccess 100) and the KEK is well formed; 112 undeclared (decided
// first); 119 provider absent; 64 START_REFUSED_KEK_UNKNOWN for a missing or malformed KEK; 11 Unlisted.
// Zero-trust: rejected a generated fallback KEK, a plaintext .env fallback, a KEK cached across accesses
// and list-scoped access. The unit must CALL portAccess, not re-implement it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC } from "./harness.mjs";
import { grid } from "./common.mjs";

test("T8K-K5 a: declared secret, provider present, well-formed KEK starts", () => {
  grid("startupKek", (call) => {
    assert.equal(call([1, 1, 2]), 100);
  });
});

test("T8K-K5 b: undeclared 112 before provider presence; absent provider 119", () => {
  grid("startupKek", (call) => {
    for (const a of [[0, 1, 2], [0, 0, 2], [0, 0, 0], [0, 1, 1]]) {
      assert.equal(call(a), 112, "startupKek(" + a.join(",") + ")");
    }
    for (const a of [[1, 0, 2], [1, 0, 0]]) {
      assert.equal(call(a), 119, "startupKek(" + a.join(",") + ")");
    }
  });
});

test("T8K-K5 c: missing or malformed KEK refuses start 64; unlisted 11", () => {
  grid("startupKek", (call) => {
    assert.equal(call([1, 1, 0]), 64);
    assert.equal(call([1, 1, 1]), 64);
    for (const a of [[2, 1, 2], [1, 2, 2], [1, 1, 3], [-1, 1, 2], [1, 1, -1]]) {
      assert.equal(call(a), 11, "startupKek(" + a.join(",") + ")");
    }
  });
});

test("T8K-K5 d: the unit reuses the per-secret port (calls portAccess)", () => {
  const t = readFileSync(join(SRC, "region-keys.fungi"), "utf8");
  assert.ok(/portAccess\s*\(/.test(t), "region-keys.fungi must call portAccess");
  assert.ok(/import\s+"\.\/secrets-provider-port\.fungi"/.test(t), "region-keys.fungi must import the port");
});
