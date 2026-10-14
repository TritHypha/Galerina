/**
 * Operation-wide one-use release authority (bootstrap).
 *
 * Consumption of a (lease, ordering-token, epoch) triple is the result-sink
 * commit point D. Provider open is not D. This TypeScript Map CAS is process-local
 * bootstrap evidence only: it cannot order a remote revocation authority.
 */

export type ReleaseOutcome =
  | "released"
  | "fenced"
  | "replay"
  | "stale"
  | "missing"
  | "delivery-unknown";

export type ReleaseLeaseState = "unused" | "released" | "fenced" | "delivery-unknown";

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

export class ReleaseCommitAuthority {
  readonly #leases = new Map<string, LeaseRecord>();
  #seq = 0;

  mint(operationId: string, epoch: number): { readonly leaseId: string; readonly token: string; readonly epoch: number } {
    if (typeof operationId !== "string" || operationId.length === 0) {
      throw new SecretReleaseRefused("missing", "Release operation id is required.");
    }
    if (!Number.isSafeInteger(epoch) || epoch < 0) {
      throw new SecretReleaseRefused("stale", "Release epoch is unavailable.");
    }
    const existing = this.#leases.get(operationId);
    if (existing !== undefined) {
      return { leaseId: operationId, token: existing.token, epoch: existing.epoch };
    }
    this.#seq += 1;
    const token = `${operationId}\u0000${epoch}\u0000${this.#seq}`;
    this.#leases.set(operationId, { token, epoch, state: "unused" });
    return { leaseId: operationId, token, epoch };
  }

  stateOf(leaseId: string): ReleaseLeaseState | "missing" {
    return this.#leases.get(leaseId)?.state ?? "missing";
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
    if (rec.state === "released" || rec.state === "delivery-unknown") return "replay";
    if (rec.state === "fenced") return "fenced";
    if (!Number.isSafeInteger(observedEpoch) || observedEpoch !== rec.epoch) {
      rec.state = "fenced";
      return "stale";
    }
    rec.state = "released";
    return "released";
  }

  fence(leaseId: string): void {
    const rec = this.#leases.get(leaseId);
    if (rec !== undefined && rec.state === "unused") rec.state = "fenced";
  }

  markUnknown(leaseId: string): void {
    const rec = this.#leases.get(leaseId);
    if (rec !== undefined && rec.state === "released") rec.state = "delivery-unknown";
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
