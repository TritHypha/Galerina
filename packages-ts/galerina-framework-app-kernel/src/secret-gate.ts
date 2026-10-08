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
 * `@galerina/ext-secrets-spore` — so it takes no hard compile dependency across packages. The
 * ext-secrets-spore `SealArena` satisfies this interface by shape (has/use), so a boot-resolved
 * arena can be passed straight in as the provider.
 */

/**
 * The boot-resolved secrets provider the kernel owns for the process lifetime. Structurally
 * satisfied by the ext-secrets-spore `SealArena` (arena.ts has/use). Fail-closed by contract:
 * `has` is false for an absent OR faulted secret; `use` never calls `fn` for an
 * absent/faulted secret and otherwise hands `fn` a short-lived plaintext view.
 * Providers must expose no callback return channel.
 */
export interface SecretsProvider {
  /** True only if a non-faulted value is present. (May throw if the backing store is disposed.) */
  has(name: string): boolean;
  /** Run `fn` with a short-lived view; fn is not called for an absent/faulted secret. */
  use(name: string, fn: (value: Uint8Array) => void): void;
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
   * Handed to the handler as `ctx.getSecret`. Returns `undefined` for an undeclared name. For a
   * declared name, throws if the provider is unavailable, fails to invoke the callback, invokes
   * it more than once, or the callback returns a value/thenable. The kernel latches such failures
   * so handler code cannot catch one and return success. The value is only exposed to `fn` as a
   * short-lived view; this does not prevent handler-created copies.
   */
  getSecret(
    required: readonly string[],
    name: string,
    fn: (value: Uint8Array) => unknown,
    onViolation?: (error: unknown) => void,
  ): undefined;
}

// Capture the built-ins before any provider/handler callback can shadow a staged view's `fill`
// property or replace the global Reflect.apply lookup used for cleanup.
const intrinsicApply = Reflect.apply;
const intrinsicUint8Array = Uint8Array;
const intrinsicUint8ArrayFill = Uint8Array.prototype.fill;
const intrinsicTypedArrayPrototype = Object.getPrototypeOf(intrinsicUint8Array.prototype);
const intrinsicTypedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  "byteLength",
)?.get;
const intrinsicTypedArrayNameGetter = Object.getOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  Symbol.toStringTag,
)?.get;

function requiresName(required: readonly string[], name: string): boolean {
  // Do not dispatch through Array.prototype: same-realm handler code can replace `includes`
  // while retaining a reference to the authorization array's shared prototype.
  for (let index = 0; index < required.length; index += 1) {
    if (required[index] === name) return true;
  }
  return false;
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
    for (let index = 0; index < required.length; index += 1) {
      const name = required[index];
      if (name === undefined) return "secret_unavailable";
      let present = false;
      try {
        present = provider.has(name);
      } catch {
        // A disposed store THROWS from `has` (assertLive) — catch → refuse, never a raw throw to the client.
        return "secret_unavailable";
      }
      // This is a runtime trust boundary: foreign JS/provider code can violate the TS boolean
      // annotation. Admit only the literal `true`; null, NaN, numbers, strings, and objects refuse.
      if (present !== true) return "secret_unavailable";
    }
    return null; // every required secret present-and-not-faulted → admit.
  }

  // ── getSecret: hands the handler a short-lived view; value never leaves via the return path. ──
  function getSecret(
    required: readonly string[],
    name: string,
    fn: (value: Uint8Array) => unknown,
    onViolation?: (error: unknown) => void,
  ): undefined {
    if (!requiresName(required, name)) return undefined;
    if (provider === undefined) {
      throw new Error("SecretGate: required secret provider is unavailable");
    }
    let callbackInvoked = false;
    let callbackActive = true;
    let callbackFailed = false;
    let callbackFailure: unknown;
    let stagedView: Uint8Array | undefined;
    const failCallback = (error: unknown): never => {
      if (!callbackFailed) {
        callbackFailed = true;
        callbackFailure = error;
        // A provider may invoke this callback after `use` returned and catch the refusal.
        // Notify the request owner immediately so the terminal request latch observes that
        // asynchronous violation before the handler can return a successful result.
        try {
          onViolation?.(error);
        } catch {
          // Notification is best-effort; the gate still preserves and throws its own failure.
        }
      }
      throw error;
    };
    let providerResult: unknown;
    try {
      try {
        providerResult = provider.use(name, (value) => {
          if (!callbackActive) {
            return failCallback(new Error("SecretGate: provider invoked secret callback after use returned"));
          }
          if (callbackInvoked) {
            return failCallback(new Error("SecretGate: provider invoked secret callback more than once"));
          }
          callbackInvoked = true;
          let typedArrayName: unknown;
          try {
            if (intrinsicTypedArrayNameGetter === undefined) {
              return failCallback(new Error("SecretGate: typed-array brand validation is unavailable"));
            }
            typedArrayName = intrinsicApply(intrinsicTypedArrayNameGetter, value, []);
          } catch (error) {
            return failCallback(error);
          }
          if (typedArrayName !== "Uint8Array") {
            return failCallback(new TypeError("SecretGate: provider must supply a Uint8Array"));
          }
          let byteLength: unknown;
          try {
            if (intrinsicTypedArrayByteLengthGetter === undefined) {
              return failCallback(new Error("SecretGate: Uint8Array byte-length validation is unavailable"));
            }
            byteLength = intrinsicApply(intrinsicTypedArrayByteLengthGetter, value, []);
          } catch (error) {
            return failCallback(error);
          }
          if (typeof byteLength !== "number" || !(byteLength > 0)) {
            return failCallback(new TypeError("SecretGate: provider must supply a non-empty Uint8Array"));
          }
          try {
            // Do not let consumer code run until the provider has returned and its synchronous,
            // void-only contract has been checked. Otherwise a provider can deliver bytes, trigger
            // consumer side effects, then reveal its invalid async return channel too late.
            stagedView = new intrinsicUint8Array(value);
          } catch (error) {
            return failCallback(error);
          }
          return undefined;
        });
      } catch (error) {
        // A provider may swallow callback exceptions. Preserve the original failure across that
        // boundary so it cannot rehabilitate this invocation by returning normally.
        if (!callbackFailed) {
          callbackFailed = true;
          callbackFailure = error;
        }
        throw error;
      } finally {
        callbackActive = false;
      }

      if (providerResult !== undefined) {
        // `use` is synchronous and has no return channel. Observe foreign thenables before refusing
        // so a rejected Promise cannot escape as an unhandled rejection.
        void Promise.resolve(providerResult).catch(() => undefined);
        return failCallback(new Error("SecretGate: provider use return/async channel is forbidden"));
      }
      if (callbackFailed) throw callbackFailure;
      if (!callbackInvoked || stagedView === undefined) {
        throw new Error("SecretGate: required secret was not supplied by provider");
      }
      let stillPresent: unknown;
      try {
        stillPresent = provider.has(name);
      } catch {
        throw new Error("SecretGate: provider validity check failed before secret delivery");
      }
      // `has` is provider-controlled too. It may re-enter a saved callback, swallow the duplicate-
      // use exception, and still report `true`; do not deliver staged bytes after that violation.
      if (callbackFailed) throw callbackFailure;
      if (stillPresent !== true) {
        throw new Error("SecretGate: secret was revoked before staged delivery");
      }

      let callbackResult: unknown;
      try {
        callbackResult = fn(stagedView);
      } catch (error) {
        throw error;
      }
      if (callbackResult !== undefined) {
        // A rejected Promise returned through the forbidden channel must not become a detached
        // unhandled rejection; it is observed and suppressed while the synchronous gate refuses.
        void Promise.resolve(callbackResult).catch(() => undefined);
        // Preserve a provider-callback violation too, but only after observing a forbidden returned
        // Promise so the earlier refusal cannot strand a rejected thenable.
        if (callbackFailed) throw callbackFailure;
        return failCallback(new Error("SecretGate: callback return/async escape channel is forbidden"));
      }
      // The consumer can indirectly trigger a provider-retained callback and swallow its error;
      // preserve that violation before treating this consumer call as successful.
      if (callbackFailed) throw callbackFailure;
      return undefined;
    } finally {
      // This outer cleanup also covers a provider that throws after staging but before returning.
      if (stagedView !== undefined) intrinsicApply(intrinsicUint8ArrayFill, stagedView, [0]);
    }
  }

  return { admit, getSecret };
}
