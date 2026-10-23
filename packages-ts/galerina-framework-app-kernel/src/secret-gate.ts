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

import {
  ReleaseCommitAuthority,
  SecretReleaseRefused,
  bytesEqual,
} from "./release-commit-point.js";
import type { ReleaseAuditEvent, ReleaseOutcome, ReleaseStatus } from "./release-commit-point.js";

export {
  ReleaseCommitAuthority,
  RELEASE_LEASE_CAP,
  RELEASE_AUDIT_CAP,
  RELEASE_RETIRED_CAP,
  SecretReleaseRefused,
  bytesEqual,
} from "./release-commit-point.js";
export type {
  ReleaseOutcome,
  ReleaseLeaseState,
  ReleaseStatusState,
  ReleaseAuditEvent,
  ReleaseStatus,
} from "./release-commit-point.js";

export const ERR_SECRET_GATE_WIPE_FAILED = "ERR_SECRET_GATE_WIPE_FAILED";

export class SecretGateWipeFailed extends Error {
  readonly code = ERR_SECRET_GATE_WIPE_FAILED;
  constructor(message = "SecretGate: staged secret wipe failed") {
    super(message);
    this.name = "SecretGateWipeFailed";
  }
}

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
  /** Monotonic epoch advanced by fault/remove/dispose. Optional on legacy has/use providers. */
  revocationEpoch?(): number;
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
   * short-lived delivery copy of gate-owned staged bytes. Gate-owned staged bytes are wiped on
   * every exit, including when the consumer transfers the handed view. Consumer-made copies,
   * including a transferred ArrayBuffer, are out of wipe scope.
   */
  getSecret(
    required: readonly string[],
    name: string,
    fn: (value: Uint8Array) => unknown,
    onViolation?: (error: unknown) => void,
    operationId?: string,
    /** S5: presence the caller's Fungi admission observed for this request; only literal true counts. */
    presenceObserved?: unknown,
  ): undefined;
  /** ACK the released lease this gate minted for `operationId`. Process-local. */
  acknowledge(operationId: string): ReleaseOutcome;
  /** Status-only recovery. Never opens the provider. */
  status(operationId: string): ReleaseStatus;
  /** Mark a released-but-unacked delivery as unknown (timeout, abort, handler throw after delivery). */
  noteUnknown(operationId: string): void;
  /** Transition audit: operation id + outcome only. */
  auditEvents(): readonly ReleaseAuditEvent[];
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
function readEpoch(provider: SecretsProvider, requireEpoch: boolean): number {
  if (typeof provider.revocationEpoch !== "function") {
    if (requireEpoch) {
      throw new SecretReleaseRefused("stale", "SecretGate: revocation epoch is unavailable");
    }
    return 0;
  }
  let epoch: unknown;
  try {
    epoch = provider.revocationEpoch();
  } catch {
    throw new SecretReleaseRefused("stale", "SecretGate: revocation epoch is unavailable");
  }
  if (typeof epoch !== "number" || !Number.isSafeInteger(epoch) || epoch < 0) {
    throw new SecretReleaseRefused("stale", "SecretGate: revocation epoch is unavailable");
  }
  return epoch;
}

export function createSecretGate(
  provider: SecretsProvider | undefined,
  options: {
    readonly authority?: ReleaseCommitAuthority;
    readonly requireBoundOperationId?: boolean;
    readonly requireRevocationEpoch?: boolean;
  } = {},
): SecretGate {
  return buildSecretGate(provider, options, undefined);
}

/** Host observations handed to the decider before any provider callback (S5-R7). */
interface ShellPreHandoffFacts {
  readonly declared: boolean;
  readonly providerPresent: boolean;
  readonly epochPresent: boolean;
  readonly epochMint: unknown;
  readonly epochUse: unknown;
  readonly epochMoved: boolean;
  readonly revoked: boolean;
  readonly currentlyValid: boolean;
}

function buildSecretGate(
  provider: SecretsProvider | undefined,
  options: {
    readonly authority?: ReleaseCommitAuthority;
    readonly requireBoundOperationId?: boolean;
    readonly requireRevocationEpoch?: boolean;
  },
  preHandoff: ((facts: ShellPreHandoffFacts) => unknown) | undefined,
): SecretGate {
  const authority = options.authority ?? new ReleaseCommitAuthority();
  const requireBoundOperationId = options.requireBoundOperationId === true;
  const requireRevocationEpoch = options.requireRevocationEpoch === true;
  let oneshot = 0;
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
    operationId?: string,
    presenceObserved?: unknown,
  ): undefined {
    if (!requiresName(required, name)) return undefined;
    if (provider === undefined) {
      throw new Error("SecretGate: required secret provider is unavailable");
    }
    if (typeof operationId === "string" && operationId.length === 0) {
      throw new SecretReleaseRefused("missing", "SecretGate: release operation id is required");
    }
    if (typeof operationId !== "string" && requireBoundOperationId) {
      throw new SecretReleaseRefused("missing", "SecretGate: release operation id is required");
    }
    const opId = typeof operationId === "string"
      ? operationId
      : `oneshot:${(oneshot += 1)}`;
    if (preHandoff !== undefined) {
      // S5-R7: the decider (the Fungi WebAssembly deliverPreHandoff in the kernel) rules BEFORE
      // any lease is minted or the provider is opened. TS only reports what it saw; an epoch read
      // that throws or is not a function is reported raw and the decider refuses it.
      let epochPresent = typeof provider.revocationEpoch === "function";
      let epochMint: unknown = "UNKNOWN";
      let epochUse: unknown = "UNKNOWN";
      if (epochPresent) {
        try {
          epochMint = provider.revocationEpoch?.();
          epochUse = provider.revocationEpoch?.();
        } catch {
          epochPresent = false;
        }
      }
      // S5h: validity is the presence the caller's Fungi admission observed for THIS request
      // (kernel gate 9.5 post-wait), passed as a fact; only the literal true counts, anything else
      // is unobserved = not valid. No extra provider.has() here: one presence call per acquisition
      // (the post-use recheck below) keeps a hostile provider's re-entry points fixed (pinned by
      // secret-gate.test.mjs call counts). Bytes still reach the consumer only after that recheck.
      // Rejected: a second pre-handoff has() (extra hostile re-entry; shifted the attack schedule so
      // a swallowed late callback violation went unseen, 200 instead of 500); loosening the pinned
      // call-count tests; dropping the post-use recheck.
      const currentlyValid = presenceObserved === true;
      let verdict: unknown;
      try {
        verdict = preHandoff(Object.freeze({
          declared: true,
          providerPresent: true,
          epochPresent,
          epochMint,
          epochUse,
          epochMoved: !Object.is(epochMint, epochUse),
          revoked: false,
          currentlyValid,
        }));
      } catch {
        verdict = "refuse";
      }
      if (verdict !== "admit") {
        throw new SecretReleaseRefused("fenced", "SecretGate: pre-handoff verdict refused");
      }
    }
    const epochAtMint = readEpoch(provider, requireRevocationEpoch);
    const lease = authority.mint(opId, epochAtMint);
    const prior = authority.stateOf(lease.leaseId);
    if (prior !== "unused") {
      const outcome: ReleaseOutcome =
        prior === "released" || prior === "delivery-unknown" || prior === "acknowledged"
          ? "replay"
          : prior === "fenced" ? "fenced" : "missing";
      throw new SecretReleaseRefused(outcome, `SecretGate: release lease is ${prior}`);
    }
    let callbackInvoked = false;
    let callbackActive = true;
    let callbackFailed = false;
    let callbackFailure: unknown;
    let stagedView: Uint8Array | undefined;
    let deliveredView: Uint8Array | undefined;
    let liveView: Uint8Array | undefined;
    let deliverySucceeded = false;
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
            // liveView is the provider's argument (may alias backing store). No deliverable copy
            // is taken until D marks the lease consumed.
            liveView = value;
            let observedEpoch: number;
            try {
              observedEpoch = readEpoch(provider, requireRevocationEpoch);
            } catch (error) {
              authority.fence(lease.leaseId);
              return failCallback(error);
            }
            const releaseOutcome = authority.consume(lease.leaseId, lease.token, observedEpoch);
            if (releaseOutcome !== "released") {
              return failCallback(
                new SecretReleaseRefused(releaseOutcome, `SecretGate: release refused (${releaseOutcome})`),
              );
            }
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
      // Alias survived `use` only if the provider's view still equals the staged copy after
      // `use` returned. SealArena wipes its transient in `use`'s finally, so this is false
      // there and the post-`use` `has()` boolean remains the presence check. A live backing
      // alias (the RD-1413 fixture) stays equal until `has()` mutates it.
      const aliasSurvivedOpen = liveView !== undefined && bytesEqual(liveView, stagedView);
      let stillPresent: unknown;
      const refuseStaging = (outcome: "stale" | "fenced", message: string): never => {
        // Consume (D) already ran inside `use` so the provider can wipe. fence() only
        // moves unused, so a post-consume staging refusal would otherwise stay released.
        authority.fence(lease.leaseId);
        authority.markUnknown(lease.leaseId);
        throw new SecretReleaseRefused(outcome, message);
      };
      try {
        stillPresent = provider.has(name);
      } catch {
        return refuseStaging("stale", "SecretGate: provider validity check failed before secret delivery");
      }
      // `has` is provider-controlled too. It may re-enter a saved callback, swallow the duplicate-
      // use exception, and still report `true`; do not deliver staged bytes after that violation.
      if (callbackFailed) throw callbackFailure;
      if (aliasSurvivedOpen && liveView !== undefined && !bytesEqual(liveView, stagedView)) {
        return refuseStaging("fenced", "SecretGate: live secret mutated after provider open");
      }
      if (stillPresent !== true) {
        return refuseStaging("fenced", "SecretGate: secret was revoked before staged delivery");
      }

      let callbackResult: unknown;
      try {
        // Hand a distinct copy so a consumer transfer cannot detach gate-owned staged bytes.
        deliveredView = new intrinsicUint8Array(stagedView.length);
        for (let i = 0; i < stagedView.length; i += 1) {
          const byte = stagedView[i];
          if (byte === undefined) {
            throw new Error("SecretGate: staged view is incomplete");
          }
          deliveredView[i] = byte;
        }
        callbackResult = fn(deliveredView);
      } catch (error) {
        authority.markUnknown(lease.leaseId);
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
      deliverySucceeded = true;
      return undefined;
    } finally {
      // Wipe must never replace the original consumer/provider error, and dropIfUnused must run.
      let stagedWipeFailed = false;
      try {
        if (stagedView !== undefined) intrinsicApply(intrinsicUint8ArrayFill, stagedView, [0]);
      } catch {
        stagedWipeFailed = true;
      }
      try {
        if (deliveredView !== undefined) intrinsicApply(intrinsicUint8ArrayFill, deliveredView, [0]);
      } catch {
        // The consumer may have transferred this view's buffer. That copy is out of wipe scope.
      }
      if (stagedWipeFailed) {
        try {
          authority.markUnknown(lease.leaseId);
        } catch {
          // lease may already be unknown, fenced, or missing
        }
      }
      authority.dropIfUnused(lease.leaseId, lease.token);
      if (stagedWipeFailed && deliverySucceeded) {
        throw new SecretGateWipeFailed();
      }
    }
  }

  function acknowledge(operationId: string): ReleaseOutcome {
    return authority.acknowledgeMinted(operationId);
  }

  function status(operationId: string): ReleaseStatus {
    return authority.status(operationId);
  }

  function noteUnknown(operationId: string): void {
    authority.markUnknown(operationId);
  }

  function auditEvents(): readonly ReleaseAuditEvent[] {
    return authority.auditEvents();
  }

  return { admit, getSecret, acknowledge, status, noteUnknown, auditEvents };
}

/** The decider a release shell obeys. In the kernel this is the pinned Fungi secret-gate WebAssembly. */
export interface SecretReleaseDecider {
  preHandoffVerdict(facts: unknown): unknown;
  noteUnknownVerdict(leaseState: unknown): unknown;
}

/** S5: getSecret/noteUnknown with every verdict taken from the decider. No admit, no acknowledge (MB-06). */
export interface SecretReleaseShell {
  getSecret: SecretGate["getSecret"];
  status: SecretGate["status"];
  noteUnknown: SecretGate["noteUnknown"];
  auditEvents: SecretGate["auditEvents"];
}

const SHELL_LEASE_INDEX: readonly string[] = ["unused", "released", "acknowledged", "fenced", "delivery-unknown"];

/**
 * S5 release shell: TS keeps the IO (provider calls, staging, wipe, lease records) and asks the
 * decider for every verdict. There is no default decider: construction without one throws.
 * A pre verdict other than the literal "admit" refuses before the provider is opened. A
 * noteUnknown verdict other than the literal "no-op" fails toward delivery-unknown.
 * Rejected: a TS fallback decider (two deciders = bypass); leaving a lease released on an
 * unlisted verdict; renaming createSecretGate (TS would still decide).
 */
export function createSecretReleaseShell(
  provider: SecretsProvider | undefined,
  options: {
    readonly decider: SecretReleaseDecider;
    readonly authority?: ReleaseCommitAuthority;
    readonly requireBoundOperationId?: boolean;
    readonly requireRevocationEpoch?: boolean;
  },
): SecretReleaseShell {
  const decider: unknown = options === null || typeof options !== "object" ? undefined : options.decider;
  if (decider === null || typeof decider !== "object") {
    throw new TypeError("SecretReleaseShell: a decider is required (there is no default)");
  }
  const preVerdict = (decider as { preHandoffVerdict?: unknown }).preHandoffVerdict;
  const unknownVerdict = (decider as { noteUnknownVerdict?: unknown }).noteUnknownVerdict;
  if (typeof preVerdict !== "function" || typeof unknownVerdict !== "function") {
    throw new TypeError("SecretReleaseShell: decider must expose preHandoffVerdict and noteUnknownVerdict");
  }
  const authority = options.authority ?? new ReleaseCommitAuthority();
  const inner = buildSecretGate(
    provider,
    {
      authority,
      requireBoundOperationId: options.requireBoundOperationId === true,
      requireRevocationEpoch: options.requireRevocationEpoch === true,
    },
    (facts) => intrinsicApply(preVerdict as (f: unknown) => unknown, decider, [facts]),
  );

  function noteUnknown(operationId: string): void {
    let lease: unknown = "UNKNOWN";
    try {
      const state = authority.status(operationId).state;
      for (let index = 0; index < SHELL_LEASE_INDEX.length; index += 1) {
        if (SHELL_LEASE_INDEX[index] === state) lease = index;
      }
    } catch {
      lease = "UNKNOWN";
    }
    let verdict: unknown;
    try {
      verdict = intrinsicApply(unknownVerdict as (l: unknown) => unknown, decider, [lease]);
    } catch {
      verdict = "UNKNOWN";
    }
    if (verdict === "no-op") return;
    // "delivery-unknown", UNKNOWN, a trap or anything unlisted: fail toward delivery-unknown.
    authority.markUnknown(operationId);
  }

  return Object.freeze({
    getSecret: inner.getSecret,
    status: inner.status,
    noteUnknown,
    auditEvents: inner.auditEvents,
  });
}
