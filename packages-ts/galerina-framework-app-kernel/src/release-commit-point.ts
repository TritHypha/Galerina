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

/** Bound on live lease records. Oldest terminal entries evict first. */
export const RELEASE_LEASE_CAP = 1024;

export class ReleaseCommitAuthority {
  readonly #leases = new Map<string, LeaseRecord>();
  readonly #retired = new Set<string>();
  #seq = 0;

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
      this.#retired.add(victim);
    }
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
