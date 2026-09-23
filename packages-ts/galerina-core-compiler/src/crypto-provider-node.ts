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
export const BCRYPT_MIN_ROUNDS = 10;
export const BCRYPT_MAX_ROUNDS = 12;

type BcryptJs = {
  hash: (data: string, rounds: number, cb: (err: Error | undefined, hashed: string) => void) => void;
  compare: (data: string, hash: string, cb: (err: Error | undefined, same: boolean) => void) => void;
};

function bcryptHashAsync(bcrypt: BcryptJs, plaintext: string, rounds: number): Promise<string> {
  return new Promise((resolve, reject) => {
    bcrypt.hash(plaintext, rounds, (err, hashed) => {
      if (err !== undefined && err !== null) reject(err);
      else resolve(hashed);
    });
  });
}

function bcryptCompareAsync(bcrypt: BcryptJs, plaintext: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    bcrypt.compare(plaintext, hash, (err, same) => {
      if (err !== undefined && err !== null) reject(err);
      else resolve(same);
    });
  });
}

export function createNodePasswordKdfProvider(): CryptoProvider {
  return {
    schema: CRYPTO_PROVIDER_SCHEMA,
    async invoke(request: CryptoProviderRequest): Promise<CryptoProviderResult> {
      if (request.algorithm === "bcrypt") {
        const bcryptMod = await import("bcryptjs");
        const bcrypt = (bcryptMod.default ?? bcryptMod) as BcryptJs;
        if (request.op === "password-hash") {
          const rounds = request.rounds ?? BCRYPT_MIN_ROUNDS;
          if (!Number.isSafeInteger(rounds) || rounds < BCRYPT_MIN_ROUNDS || rounds > BCRYPT_MAX_ROUNDS) {
            throw new RangeError("bcrypt rounds must be a safe integer in 10..12");
          }
          return hashResult("bcrypt", await bcryptHashAsync(bcrypt, request.plaintext, rounds));
        }
        try {
          return verifyResult(await bcryptCompareAsync(bcrypt, request.plaintext, request.hash));
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
