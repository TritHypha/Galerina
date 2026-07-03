/**
 * Secret Gate — the per-request fail-closed seam the kernel runs at "gate 9.5"
 * (after concurrency, before dispatch). See kernel.ts pipeline.
 *
 * A route DECLARES the secrets it needs via `policy.secrets.require` (contract, not ad-hoc
 * config — it travels with the signed route surface). Before the handler is reached, the gate
 * verifies every required secret is present-and-not-faulted in the boot-resolved provider. If
 * ANY is absent, faulted, the provider is missing, or the backing store has been disposed, the
 * request is REFUSED (503 `secret_unavailable`) and the handler NEVER runs. This is the same
 * enumerate-the-SAFE-set, deny-everything-else discipline the rest of the kernel uses.
 *
 * The seam is SYNCHRONOUS — a membership check (`has`) plus a scoped view (`use`); it adds no
 * `await`, no I/O, and no network (there is no secret read-back endpoint by design). Boot-time
 * resolution of the provider is async but happens ONCE, off the request path.
 *
 * The kernel deliberately depends only on the STRUCTURAL `SecretsProvider` shape below — not on
 * `@galerina/ext-secrets-tmf` — so it takes no hard compile dependency across packages. The
 * ext-secrets-tmf `SealArena` satisfies this interface by shape (has/use), so a boot-resolved
 * arena can be passed straight in as the provider.
 */

/**
 * The boot-resolved secrets provider the kernel owns for the process lifetime. Structurally
 * satisfied by the ext-secrets-tmf `SealArena` (arena.ts has/use). Fail-closed by contract:
 * `has` is false for an absent OR faulted secret; `use` yields `undefined` (and never calls `fn`)
 * for an absent/faulted secret and otherwise hands `fn` a short-lived plaintext view that never
 * escapes via the return path.
 */
export interface SecretsProvider {
  /** True only if a non-faulted value is present. (May throw if the backing store is disposed.) */
  has(name: string): boolean;
  /** Run `fn` with a short-lived view; `undefined` (fn NOT called) for an absent/faulted secret. */
  use<T>(name: string, fn: (value: Uint8Array) => T): T | undefined;
}

/** The per-request seam built once at construction and referenced at gate 9.5. */
export interface SecretGate {
  /**
   * Precondition run at gate 9.5. Returns `null` to ADMIT, or a `KernelErrorCode` string to
   * REFUSE (the kernel maps it to a 503). Refuses when the provider is absent, when any required
   * secret is absent/faulted, or when reading membership throws (disposed store) — all fail-closed.
   */
  admit(required: readonly string[]): "secret_unavailable" | null;
  /**
   * Handed to the handler as `ctx.getSecret`. Fail-closed: `undefined` for an absent/faulted
   * secret (or absent provider). The value is only ever exposed to `fn` as a short-lived view.
   */
  getSecret(name: string, fn: (value: Uint8Array) => unknown): unknown;
}

/**
 * Build the secret gate over the boot-resolved provider. When `provider` is `undefined` (boot
 * never resolved the anchor/arena), `admit` refuses ANY required secret — but is a strict no-op
 * for a route whose `require` list is empty, which is why every secret-free route is unaffected.
 */
export function createSecretGate(provider: SecretsProvider | undefined): SecretGate {
  // ── admit: verbatim fail-closed logic (RED-bench-secrets-context.mjs:40-48). ──
  function admit(required: readonly string[]): "secret_unavailable" | null {
    // Provider absent = boot never resolved the anchor/arena → fail closed for any required secret.
    if (provider === undefined || provider === null) {
      // A route that requires nothing must still admit even with no provider (the non-breaking no-op).
      return required.length === 0 ? null : "secret_unavailable";
    }
    for (const name of required) {
      let present = false;
      try {
        present = provider.has(name);
      } catch {
        // A disposed store THROWS from `has` (assertLive) — catch → refuse, never a raw throw to the client.
        return "secret_unavailable";
      }
      // `has` is false for an absent OR faulted secret → refuse (stale/quarantined is never served).
      if (!present) return "secret_unavailable";
    }
    return null; // every required secret present-and-not-faulted → admit.
  }

  // ── getSecret: hands the handler a short-lived view; value never leaves via the return path. ──
  function getSecret(name: string, fn: (value: Uint8Array) => unknown): unknown {
    return provider?.use(name, fn);
  }

  return { admit, getSecret };
}
