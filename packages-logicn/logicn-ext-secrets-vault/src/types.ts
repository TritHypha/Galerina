/**
 * logicn-ext-secrets-vault — Core types
 *
 * WIT interface (stored as string constant; no WIT toolchain required yet).
 * This is the vendor-agnostic boundary the core-runtime exposes:
 *
 *   interface secrets-gateway {
 *     type secret-handle = u32;
 *     provide-secret-buffer: func(id: string, stage_slot: u32) -> list<u8>;
 *   }
 */
export const SECRETS_GATEWAY_WIT = `
interface secrets-gateway {
  type secret-handle = u32;
  provide-secret-buffer: func(id: string, stage_slot: u32) -> list<u8>;
}
`;

// ---------------------------------------------------------------------------
// Credential descriptor (mirrors the contract { secrets {} } AST node shape)
// ---------------------------------------------------------------------------

export interface SecretCredential {
  readonly id: string;             // credential name from contract e.g. "db_password"
  readonly provider: "hashicorp_vault";
  readonly path: string;           // vault KV path e.g. "secret/data/db"
  readonly mountPoint?: string;    // KV v2 mount; default "secret"
}

// ---------------------------------------------------------------------------
// Rotation policy
// ---------------------------------------------------------------------------

export interface RotationPolicy {
  readonly interval: number;                                 // ms between rotation sweeps
  readonly strategy: "smooth_handshake";
  readonly onRotationFault: "halt" | "quarantine" | "log";
}

// ---------------------------------------------------------------------------
// The full contract { secrets {} } block as consumed by this package
// ---------------------------------------------------------------------------

export interface SecretsContractBlock {
  readonly credentials: SecretCredential[];
  readonly rotation?: RotationPolicy;
}

// ---------------------------------------------------------------------------
// In-memory secret handle (runtime state — never serialised, never logged)
// ---------------------------------------------------------------------------

export type SecretHandle = {
  readonly id: string;
  activeValue: Buffer;
  stagingValue: Buffer | null;   // null = no rotation in progress
  readonly version: number;
  faulted?: boolean;             // true = rotation faulted under quarantine; getActive() fails closed
};
