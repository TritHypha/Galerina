/**
 * galerina-ext-secrets-vault — Core types
 *
 * Non-authorizing Component Model WIT contract candidate. No WIT toolchain,
 * generated binding, loaded Fungi runtime, or application caller consumes it
 * yet. In this contract, "host" means the trusted secret-realm provider host,
 * never the application host, client, or relay. The realm authenticates the
 * peer itself or cryptographically verifies identity/Signet assertions from
 * separately trusted issuers; client/relay claims cannot assert identity or
 * create authority. Bytes remain realm-host-owned: guest calls can request a
 * scoped verification result but cannot request the secret buffer. The realm
 * host mints request resources only after authentication and canonical parsing. Each
 * opaque request is bound host-side to its caller, route/operation, exact
 * credential object/version/content and provider owner, lease generation,
 * permitted recipient/output, and release commit point. Guest code cannot
 * choose or override those fields. A Signet grant is minted from that request
 * binding; every operation rechecks the same binding and revocation state.
 * Sensitive request and provider bytes remain host-owned. Cleanup and release
 * are enforced independently of guest calls. Verification and cleanup results are
 * host-minted opaque resources: the guest cannot forge a Boolean or cleanup
 * acknowledgement. Lifecycle status is a closed enum; memory charge buckets
 * remain distinct host accounting, not authority.
 */
export const SECRETS_GATEWAY_WIT = `
package galerina:secrets-vault@0.1.0;

interface secrets-gateway {
  /// The secret-realm host is the sole authority for transport identity and request binding.
  /// Client/relay assertions cannot establish identity or create authority.
  enum lifecycle-state {
    admitted,
    active,
    cleanup-pending,
    cleanup-failed,
    retired,
    invalid,
  }

  enum refusal {
    unauthenticated,
    unauthorized,
    stale-grant,
    stale-object-version,
    provider-unavailable,
    invalid-accounting,
    cleanup-incomplete,
    cancelled,
  }

  enum accounting-state {
    accounted,
    unknown,
    inconsistent,
    invalid,
  }

  /// Report-only gauges; they are distinct and may overlap, not additive partitions.
  /// A reserved charge is not released until cleanup has a complete terminal receipt.
  /// A block stays quarantined until a complete full-extent wipe is proven by a terminal cleanup receipt.
  record memory-accounting {
    state: accounting-state,
    reserved-bytes: u64,
    allocated-bytes: u64,
    retained-bytes: u64,
    unresolved-bytes: u64,
  }

  enum release-state {
    released,
    delivery-unknown,
  }

  /// Secret-realm-host-minted only after the release commit point; callers cannot forge a
  /// serializable released record and mistake it for completed delivery.
  resource release-receipt {
    state: func() -> release-state;
  }

  /// Secret-realm-host-minted after authenticated transport and canonical request parsing.
  /// Its private immutable binding covers caller, route/operation, exact
  /// credential object/version/content, provider owner, lease generation,
  /// permitted recipient/output, and release commit point. Sensitive input
  /// bytes and this binding are never returned to guest memory.
  resource authenticated-request;

  /// Opaque secret-realm grant created only after verifying a Signet/Wax-Seal
  /// from a separately trusted issuer and current key/revocation epochs. The
  /// realm privately binds issuer/key epoch, revocation epoch, operation,
  /// exact object/version/content, provider owner, recipient, and expiry.
  resource signet-grant;
  resource cleanup-receipt;

  /// Opaque to guest code. The host may apply the result only during the
  /// cleanup-gated release operation; no match state is exposed beforehand.
  resource verification-result;

  resource secret-lease {
    state: func() -> lifecycle-state;
    accounting: func() -> memory-accounting;
    /// Recheck this same request and grant; read sensitive values only inside
    /// the secret-realm boundary and return an opaque result, never bytes or match state.
    verify-password: func(
      request: borrow<authenticated-request>,
      grant: borrow<signet-grant>,
    ) -> result<verification-result, refusal>;
  }

  /// Select credential and version only from the secret-realm-authenticated,
  /// route-bound request; guest-supplied object selectors are not accepted.
  issue-password-verification-grant: func(
    request: borrow<authenticated-request>,
  ) -> result<signet-grant, refusal>;

  acquire-password-lease: func(
    request: borrow<authenticated-request>,
    grant: borrow<signet-grant>,
  ) -> result<secret-lease, refusal>;

  /// Consume the unique owning lease handle. A resource method would borrow
  /// self, so cleanup is deliberately an interface function that takes the
  /// owned secret-lease. Failure keeps its backing extent quarantined.
  close-secret-lease: func(
    lease: secret-lease,
  ) -> result<cleanup-receipt, refusal>;

  /// Revalidate the same request/grant, current revocation and completed
  /// cleanup at commit. Recipient/output come only from the secret-realm-minted
  /// request binding, never from guest arguments.
  release-verification-result: func(
    request: borrow<authenticated-request>,
    grant: borrow<signet-grant>,
    proof: verification-result,
    cleanup: cleanup-receipt,
  ) -> result<release-receipt, refusal>;
}

world auth-service {
  import secrets-gateway;
  use secrets-gateway.{authenticated-request, release-receipt, refusal};
  export handle: func(
    request: authenticated-request,
  ) -> result<release-receipt, refusal>;
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
  faulted?: boolean;             // true = rotation faulted under quarantine; useActive() fails closed
};

/** Redacted, immutable view safe to expose outside the rotation manager. */
export interface SecretHandleStatus {
  readonly id: string;
  readonly version: number;
  readonly faulted: boolean;
}
