export const CRYPTO_PROVIDER_SCHEMA = "fungi.security.crypto-provider.v1";

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

export const FUNGI_CRYPTO_PROVIDER_REQUIRED = "FUNGI-CRYPTO-001";
export const FUNGI_CRYPTO_PROVIDER_THREW = "FUNGI-CRYPTO-002";
export const FUNGI_CRYPTO_PROVIDER_MALFORMED = "FUNGI-CRYPTO-003";
export const FUNGI_CRYPTO_PROVIDER_SCHEMA = "FUNGI-CRYPTO-004";

function refused(code: string, message: string): CryptoProviderResult {
  return { ok: false, code, message };
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

export async function invokeCryptoProvider(
  provider: CryptoProvider | undefined,
  request: CryptoProviderRequest,
): Promise<CryptoProviderResult> {
  if (provider === undefined) {
    return refused(
      FUNGI_CRYPTO_PROVIDER_REQUIRED,
      "Password/BCrypt/Argon2 calls require an injected CryptoProvider.",
    );
  }
  if (!isObject(provider) || provider.schema !== CRYPTO_PROVIDER_SCHEMA ||
      typeof provider.invoke !== "function") {
    return refused(
      FUNGI_CRYPTO_PROVIDER_SCHEMA,
      "CryptoProvider schema must be fungi.security.crypto-provider.v1.",
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
  if (raw.ok === true && request.op === "password-verify" && raw.kind !== "verify") {
    return refused(
      FUNGI_CRYPTO_PROVIDER_MALFORMED,
      "CryptoProvider verify request did not return a verify result.",
    );
  }
  return raw;
}
