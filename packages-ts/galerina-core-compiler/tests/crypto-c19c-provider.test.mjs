import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FUNGI_VOID, callStdlib } from "../dist/index.js";

const CRYPTO_PROVIDER_SCHEMA = "fungi.security.crypto-provider.v1";

function ctx(cryptoProvider) {
  return {
    recordEffect: () => {},
    resolveIdentifier: () => undefined,
    callFlow: async () => FUNGI_VOID,
    applyFn: async (_fn, arg) => arg,
    ...(cryptoProvider === undefined ? {} : { cryptoProvider }),
  };
}

describe("C19-C compiler Password/BCrypt/Argon2 injection", () => {
  it("refuses BCrypt.hash when no provider is injected", async () => {
    const result = await callStdlib(
      "BCrypt.hash",
      undefined,
      [{ __tag: "string", value: "secret" }],
      ctx(),
    );
    assert.equal(result?.__tag, "err");
    assert.match(result?.error.value, /injected CryptoProvider/);
  });

  it("refuses Argon2.verify when the provider throws", async () => {
    const result = await callStdlib(
      "Argon2.verify",
      undefined,
      [{ __tag: "string", value: "p" }, { __tag: "string", value: "$argon2id$x" }],
      ctx({
        schema: CRYPTO_PROVIDER_SCHEMA,
        invoke: async () => {
          throw new Error("native");
        },
      }),
    );
    assert.equal(result?.__tag, "err");
    assert.match(result?.error.value, /threw/);
  });

  it("hashes through an injected fake provider without native bindings", async () => {
    const result = await callStdlib(
      "Password.hash",
      undefined,
      [{ __tag: "string", value: "secret" }],
      ctx({
        schema: CRYPTO_PROVIDER_SCHEMA,
        invoke: async (request) => {
          assert.equal(request.algorithm, "argon2id");
          return {
            ok: true,
            kind: "hash",
            algorithm: "argon2id",
            hash: "$argon2id$v=19$m=16,t=2,p=1$injected",
          };
        },
      }),
    );
    assert.equal(result?.__tag, "string");
    assert.equal(result?.value, "$argon2id$v=19$m=16,t=2,p=1$injected");
  });

  it("Password.needsMigration does not require a provider", async () => {
    const bcrypt = await callStdlib(
      "Password.needsMigration",
      undefined,
      [{ __tag: "string", value: "$2b$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
      ctx(),
    );
    assert.deepEqual(bcrypt, { __tag: "bool", value: true });
  });
});
