import {
  CRYPTO_PROVIDER_SCHEMA,
  type CryptoProvider,
  type CryptoProviderRequest,
  type CryptoProviderResult,
} from "@galerina/core-security";

function hashResult(
  algorithm: "bcrypt" | "argon2id",
  hash: string,
): CryptoProviderResult {
  return { ok: true, kind: "hash", algorithm, hash };
}

function verifyResult(matches: boolean): CryptoProviderResult {
  return { ok: true, kind: "verify", matches };
}

/**
 * Host adapter that lazily loads bcryptjs / argon2 when invoked.
 * Importing this module does not load native C bindings; calling invoke does.
 * The compiler stdlib TCB does not import this file.
 */
export function createNodePasswordKdfProvider(): CryptoProvider {
  return {
    schema: CRYPTO_PROVIDER_SCHEMA,
    async invoke(request: CryptoProviderRequest): Promise<CryptoProviderResult> {
      if (request.algorithm === "bcrypt") {
        const bcryptMod = await import("bcryptjs");
        const bcrypt = bcryptMod.default ?? bcryptMod;
        if (request.op === "password-hash") {
          return hashResult("bcrypt", bcrypt.hashSync(request.plaintext, request.rounds ?? 10));
        }
        try {
          return verifyResult(bcrypt.compareSync(request.plaintext, request.hash));
        } catch {
          return verifyResult(false);
        }
      }
      const argon2 = await import("argon2");
      if (request.op === "password-hash") {
        return hashResult("argon2id", await argon2.hash(request.plaintext, { type: argon2.argon2id }));
      }
      try {
        return verifyResult(await argon2.verify(request.hash, request.plaintext));
      } catch {
        return verifyResult(false);
      }
    },
  };
}
