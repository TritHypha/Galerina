/**
 * Operation-wide one-use release authority (bootstrap).
 *
 * Consumption of a (lease, ordering-token, epoch) triple is the result-sink
 * commit point D. Provider open is not D. This TypeScript Map CAS is process-local
 * bootstrap evidence only: it cannot order a remote revocation authority.
 */

export type ReleaseOutcome =
  | "released"
  | "acknowledged"
  | "fenced"
  | "replay"
  | "stale"
  | "missing"
  | "delivery-unknown";

export type ReleaseLeaseState =
  | "unused"
  | "released"
  | "acknowledged"
  | "fenced"
  | "delivery-unknown";

/** Dead alias. `status()` returns `OperationRecoveryStatus`. Kept so existing type imports compile. */
export type ReleaseStatusState = ReleaseLeaseState | "retired" | "missing";

export type OperationRecoveryKind =
  | "RELEASED_ACKED"
  | "RELEASED_UNACKED"
  | "REFUSED"
  | "DELIVERY_UNKNOWN"
  | "NOT_FOUND";

export type OperationRecoveryStatus = {
  readonly kind: OperationRecoveryKind;
  readonly operationId: string;
};

export type ReleaseAuditEvent = {
  readonly operationId: string;
  readonly outcome: ReleaseOutcome | "retired";
};

export type ReleaseStatus = OperationRecoveryStatus;

export class SecretReleaseRefused extends Error {
  readonly code = "secret_unavailable" as const;
  readonly outcome: ReleaseOutcome;

  constructor(outcome: ReleaseOutcome, message: string) {
    super(message);
    this.name = "SecretReleaseRefused";
    this.outcome = outcome;
  }
}

interface LeaseRecord {
  token: string;
  epoch: number;
  state: ReleaseLeaseState;
}

/** Bound on live lease records. Oldest terminal entries evict first. */
export const RELEASE_LEASE_CAP = 1024;
/** Bound on the process-local audit log. Oldest events drop first. */
export const RELEASE_AUDIT_CAP = 1024;
/** Bound on retired tombstones. Oldest ids drop first. */
export const RELEASE_RETIRED_CAP = 1024;

function operationIdOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export class ReleaseCommitAuthority {
  readonly #leases = new Map<string, LeaseRecord>();
  readonly #retired = new Set<string>();
  readonly #audit: ReleaseAuditEvent[] = [];
  #seq = 0;

  #record(operationId: unknown, outcome: ReleaseAuditEvent["outcome"]): void {
    const id = operationIdOf(operationId);
    this.#audit.push(Object.freeze({ operationId: id, outcome }));
    if (this.#audit.length > RELEASE_AUDIT_CAP) {
      this.#audit.splice(0, this.#audit.length - RELEASE_AUDIT_CAP);
    }
  }

  #retire(operationId: string): void {
    if (this.#retired.size >= RELEASE_RETIRED_CAP) {
      const oldest = this.#retired.values().next().value;
      if (typeof oldest === "string") this.#retired.delete(oldest);
    }
    this.#retired.add(operationId);
  }

  /** Live map size (unused + terminal). Does not include retired tombstones. */
  get size(): number {
    return this.#leases.size;
  }

  mint(operationId: string, epoch: number): { readonly leaseId: string; readonly token: string; readonly epoch: number } {
    if (typeof operationId !== "string" || operationId.length === 0) {
      throw new SecretReleaseRefused("missing", "Release operation id is required.");
    }
    if (!Number.isSafeInteger(epoch) || epoch < 0) {
      throw new SecretReleaseRefused("stale", "Release epoch is unavailable.");
    }
    if (this.#retired.has(operationId)) {
      throw new SecretReleaseRefused("replay", "Release lease was retired.");
    }
    const existing = this.#leases.get(operationId);
    if (existing !== undefined) {
      if (existing.state === "unused") {
        throw new SecretReleaseRefused("replay", "Release lease is already in flight.");
      }
      return { leaseId: operationId, token: existing.token, epoch: existing.epoch };
    }
    this.#evictOldestTerminal();
    if (this.#leases.size >= RELEASE_LEASE_CAP) {
      throw new SecretReleaseRefused("fenced", "Release lease map is at capacity.");
    }
    this.#seq += 1;
    const token = `${operationId}\u0000${epoch}\u0000${this.#seq}`;
    this.#leases.set(operationId, { token, epoch, state: "unused" });
    return { leaseId: operationId, token, epoch };
  }

  #evictOldestTerminal(): void {
    while (this.#leases.size >= RELEASE_LEASE_CAP) {
      let victim: string | undefined;
      for (const [leaseId, rec] of this.#leases) {
        if (rec.state !== "unused") {
          victim = leaseId;
          break;
        }
      }
      if (victim === undefined) return;
      this.#leases.delete(victim);
      this.#retire(victim);
      this.#record(victim, "retired");
    }
  }

  stateOf(leaseId: string): ReleaseLeaseState | "missing" {
    return this.#leases.get(leaseId)?.state ?? "missing";
  }

  /**
   * Status-only recovery. Process-local. Never returns tokens, epochs, bytes,
   * lengths or digests, never opens a provider, and never consumes or
   * re-discloses. Retry needs a new operation id and fresh authority.
   */
  status(operationId: string): OperationRecoveryStatus {
    const id = operationIdOf(operationId);
    if (id.length === 0) {
      return Object.freeze({ kind: "NOT_FOUND", operationId: "" });
    }
    const rec = this.#leases.get(id);
    if (rec === undefined) {
      if (this.#retired.has(id)) {
        return Object.freeze({ kind: "DELIVERY_UNKNOWN", operationId: id });
      }
      return Object.freeze({ kind: "NOT_FOUND", operationId: id });
    }
    switch (rec.state) {
      case "acknowledged":
        return Object.freeze({ kind: "RELEASED_ACKED", operationId: id });
      case "released":
        return Object.freeze({ kind: "RELEASED_UNACKED", operationId: id });
      case "delivery-unknown":
        return Object.freeze({ kind: "DELIVERY_UNKNOWN", operationId: id });
      case "fenced":
        return Object.freeze({ kind: "REFUSED", operationId: id });
      case "unused":
      default: {
        const unusedOrUnknown: string = rec.state;
        void unusedOrUnknown;
        return Object.freeze({ kind: "DELIVERY_UNKNOWN", operationId: id });
      }
    }
  }

  auditEvents(): readonly ReleaseAuditEvent[] {
    return this.#audit.slice();
  }

  /**
   * Compare token and epoch, then consume, as one step. That consume is D.
   */
  consume(leaseId: string, token: string, observedEpoch: number): ReleaseOutcome {
    const rec = this.#leases.get(leaseId);
    if (rec === undefined) return "missing";
    if (typeof token !== "string" || token.length === 0 || rec.token !== token) {
      if (rec.state === "unused") rec.state = "fenced";
      return "stale";
    }
    if (rec.state === "released" || rec.state === "delivery-unknown" || rec.state === "acknowledged") {
      this.#record(leaseId, "replay");
      return "replay";
    }
    if (rec.state === "fenced") {
      this.#record(leaseId, "fenced");
      return "fenced";
    }
    if (!Number.isSafeInteger(observedEpoch) || observedEpoch !== rec.epoch) {
      rec.state = "fenced";
      this.#record(leaseId, "stale");
      return "stale";
    }
    rec.state = "released";
    this.#record(leaseId, "released");
    return "released";
  }

  /**
   * ACK of a released lease. Bound to operation id + token; epoch is optional
   * and compared when supplied. Wrong id/token/epoch or a non-released lease
   * refuses and changes nothing. A second ACK is a no-op that reports
   * acknowledged. Process-local; the authentic consumer is this authority.
   */
  ack(operationId: string, token: string, observedEpoch?: number): ReleaseOutcome {
    operationId = operationIdOf(operationId);
    if (operationId.length === 0) {
      this.#record("", "missing");
      return "missing";
    }
    if (this.#retired.has(operationId)) {
      this.#record(operationId, "replay");
      return "replay";
    }
    const rec = this.#leases.get(operationId);
    if (rec === undefined) {
      this.#record(operationId, "missing");
      return "missing";
    }
    if (typeof token !== "string" || token.length === 0 || rec.token !== token) {
      this.#record(operationId, "stale");
      return "stale";
    }
    if (observedEpoch !== undefined) {
      if (!Number.isSafeInteger(observedEpoch) || observedEpoch !== rec.epoch) {
        this.#record(operationId, "stale");
        return "stale";
      }
    }
    if (rec.state === "acknowledged") {
      this.#record(operationId, "acknowledged");
      return "acknowledged";
    }
    if (rec.state !== "released") {
      const outcome: ReleaseOutcome =
        rec.state === "fenced" ? "fenced" : rec.state === "delivery-unknown" ? "replay" : "stale";
      this.#record(operationId, outcome);
      return outcome;
    }
    rec.state = "acknowledged";
    this.#record(operationId, "acknowledged");
    return "acknowledged";
  }

  /** ACK using the token this authority minted. The authentic consumer path. */
  acknowledgeMinted(operationId: string): ReleaseOutcome {
    operationId = operationIdOf(operationId);
    if (operationId.length === 0) {
      this.#record("", "missing");
      return "missing";
    }
    if (this.#retired.has(operationId)) {
      this.#record(operationId, "replay");
      return "replay";
    }
    const rec = this.#leases.get(operationId);
    if (rec === undefined) {
      this.#record(operationId, "missing");
      return "missing";
    }
    return this.ack(operationId, rec.token, rec.epoch);
  }

  fence(leaseId: string): void {
    const rec = this.#leases.get(leaseId);
    if (rec !== undefined && rec.state === "unused") {
      rec.state = "fenced";
      this.#record(leaseId, "fenced");
    }
  }

  markUnknown(leaseId: string): void {
    const rec = this.#leases.get(leaseId);
    if (rec !== undefined && rec.state === "released") {
      rec.state = "delivery-unknown";
      this.#record(leaseId, "delivery-unknown");
    }
  }

  /**
   * Drop the unused lease this exact acquisition minted.
   * Match by lease identity and the mint token; never drop an outer in-flight lease.
   */
  dropIfUnused(leaseId: string, token: string): void {
    const rec = this.#leases.get(leaseId);
    if (rec !== undefined && rec.state === "unused" && rec.token === token) {
      this.#leases.delete(leaseId);
    }
  }
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined || right === undefined) return false;
    diff |= left ^ right;
  }
  return diff === 0;
}

export function wipeBytes(view: Uint8Array | undefined): void {
  if (view !== undefined) view.fill(0);
}
