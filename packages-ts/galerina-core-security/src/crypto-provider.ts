export const CRYPTO_PROVIDER_SCHEMA = "fungi.security.crypto-provider.v1";
export const CRYPTO_PROVIDER_V2_SCHEMA = "fungi.security.crypto-provider.v2";
export const MAX_BCRYPT_PASSWORD_BYTES = 72;

const FUNGI_CRYPTO_BCRYPT_INPUT_TOO_LONG = "FUNGI_CRYPTO_BCRYPT_INPUT_TOO_LONG";
const BCRYPT_INPUT_TOO_LONG_MESSAGE = "bcrypt input exceeds 72 UTF-8 bytes and is refused.";

export type PasswordKdfAlgorithm = "bcrypt" | "argon2id";

export type CryptoProviderRequest =
  | {
      readonly op: "password-hash";
      readonly algorithm: PasswordKdfAlgorithm;
      readonly plaintext: string;
      readonly rounds?: number;
    }
  | {
      readonly op: "password-verify";
      readonly algorithm: PasswordKdfAlgorithm;
      readonly plaintext: string;
      readonly hash: string;
    };

export type CryptoProviderV2Request = CryptoProviderRequest | {
  /** Byte-preserving verification path; providers must not decode bytes as text implicitly. */
  readonly op: "password-verify-bytes";
  readonly algorithm: PasswordKdfAlgorithm;
  readonly plaintextBytes: Uint8Array;
  readonly hash: string;
};

export type CryptoProviderResult =
  | {
      readonly ok: true;
      readonly kind: "hash";
      readonly algorithm: PasswordKdfAlgorithm;
      readonly hash: string;
    }
  | {
      readonly ok: true;
      readonly kind: "verify";
      readonly matches: boolean;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    };

export interface CryptoProvider {
  readonly schema: typeof CRYPTO_PROVIDER_SCHEMA;
  invoke(request: CryptoProviderRequest): Promise<CryptoProviderResult>;
}

export interface CryptoProviderV2 {
  readonly schema: typeof CRYPTO_PROVIDER_V2_SCHEMA;
  invoke(request: CryptoProviderV2Request): Promise<CryptoProviderResult>;
}

export const FUNGI_CRYPTO_PROVIDER_REQUIRED = "FUNGI-CRYPTO-001";
export const FUNGI_CRYPTO_PROVIDER_THREW = "FUNGI-CRYPTO-002";
export const FUNGI_CRYPTO_PROVIDER_MALFORMED = "FUNGI-CRYPTO-003";
export const FUNGI_CRYPTO_PROVIDER_SCHEMA = "FUNGI-CRYPTO-004";

function refused(code: string, message: string): CryptoProviderResult {
  return { ok: false, code, message };
}

export function isBcryptInputWithinLimit(input: string | Uint8Array): boolean {
  if (typeof input !== "string") return input.byteLength <= MAX_BCRYPT_PASSWORD_BYTES;

  let bytes = 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    } else {
      // Includes ordinary BMP characters and unpaired low surrogates, which
      // TextEncoder represents as the three-byte UTF-8 replacement character.
      bytes += 3;
    }
    if (bytes > MAX_BCRYPT_PASSWORD_BYTES) return false;
  }
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isClosedResult(value: unknown): value is CryptoProviderResult {
  if (!isObject(value) || value.ok !== true && value.ok !== false) return false;
  if (value.ok === false) {
    return typeof value.code === "string" && value.code !== "" &&
      typeof value.message === "string";
  }
  if (value.kind === "hash") {
    return (value.algorithm === "bcrypt" || value.algorithm === "argon2id") &&
      typeof value.hash === "string" && value.hash !== "";
  }
  if (value.kind === "verify") {
    return value.matches === true || value.matches === false;
  }
  return false;
}

function hashPrefixOk(algorithm: PasswordKdfAlgorithm, hash: string): boolean {
  if (algorithm === "bcrypt") return hash.startsWith("$2");
  return hash.startsWith("$argon2");
}

async function invokeCryptoProviderWithSchema<TRequest extends CryptoProviderV2Request>(
  provider: { readonly schema: string; invoke(request: TRequest): Promise<unknown> } | undefined,
  request: TRequest,
  expectedSchema: string,
): Promise<CryptoProviderResult> {
  if (
    request.algorithm === "bcrypt" &&
    !isBcryptInputWithinLimit(
      request.op === "password-verify-bytes" ? request.plaintextBytes : request.plaintext,
    )
  ) {
    return refused(FUNGI_CRYPTO_BCRYPT_INPUT_TOO_LONG, BCRYPT_INPUT_TOO_LONG_MESSAGE);
  }
  if (provider === undefined) {
    return refused(
      FUNGI_CRYPTO_PROVIDER_REQUIRED,
      "Password/BCrypt/Argon2 calls require an injected CryptoProvider.",
    );
  }
  if (!isObject(provider) || provider.schema !== expectedSchema ||
      typeof provider.invoke !== "function") {
    return refused(
      FUNGI_CRYPTO_PROVIDER_SCHEMA,
      `CryptoProvider schema must be ${expectedSchema}.`,
    );
  }
  let raw: unknown;
  try {
    raw = await provider.invoke(request);
  } catch {
    return refused(
      FUNGI_CRYPTO_PROVIDER_THREW,
      "CryptoProvider threw; the call is refused closed.",
    );
  }
  if (!isClosedResult(raw)) {
    return refused(
      FUNGI_CRYPTO_PROVIDER_MALFORMED,
      "CryptoProvider returned a result outside the closed set.",
    );
  }
  if (raw.ok === true && raw.kind === "hash" && !hashPrefixOk(raw.algorithm, raw.hash)) {
    return refused(
      FUNGI_CRYPTO_PROVIDER_MALFORMED,
      "CryptoProvider hash does not match the requested algorithm prefix.",
    );
  }
  if (raw.ok === true && raw.kind === "hash" && raw.algorithm !== request.algorithm) {
    return refused(
      FUNGI_CRYPTO_PROVIDER_MALFORMED,
      "CryptoProvider hash algorithm does not match the request.",
    );
  }
  if (raw.ok === true && request.op === "password-hash" && raw.kind !== "hash") {
    return refused(
      FUNGI_CRYPTO_PROVIDER_MALFORMED,
      "CryptoProvider hash request did not return a hash.",
    );
  }
  if (raw.ok === true && request.op !== "password-hash" && raw.kind !== "verify") {
    return refused(
      FUNGI_CRYPTO_PROVIDER_MALFORMED,
      "CryptoProvider verify request did not return a verify result.",
    );
  }
  return raw;
}

export function invokeCryptoProvider(
  provider: CryptoProvider | undefined,
  request: CryptoProviderRequest,
): Promise<CryptoProviderResult> {
  return invokeCryptoProviderWithSchema(provider, request, CRYPTO_PROVIDER_SCHEMA);
}

export function invokeCryptoProviderV2(
  provider: CryptoProviderV2 | undefined,
  request: CryptoProviderV2Request,
): Promise<CryptoProviderResult> {
  return invokeCryptoProviderWithSchema(provider, request, CRYPTO_PROVIDER_V2_SCHEMA);
}
