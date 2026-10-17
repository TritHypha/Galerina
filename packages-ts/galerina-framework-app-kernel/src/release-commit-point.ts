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

/**
 * Foreign number at a trust boundary. Null, NaN, Infinity, non-integers,
 * non-numbers, and unsafe integers refuse. The only success is a safe integer.
 */
export type ForeignNumberRead =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false };

export function readForeignSafeInteger(raw: unknown): ForeignNumberRead {
  if (typeof raw !== "number") return { ok: false };
  if (!Number.isSafeInteger(raw)) return { ok: false };
  return { ok: true, value: raw };
}

function operationIdOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

let authorityNonceFallback = 0;

function instanceNonce(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoRef !== undefined && typeof cryptoRef.randomUUID === "function") {
    try {
      const nonce = cryptoRef.randomUUID();
      if (typeof nonce === "string" && nonce.length > 0 && nonce.indexOf("\u0000") === -1) {
        return nonce;
      }
    } catch {
      // fall through to the process-local counter
    }
  }
  authorityNonceFallback += 1;
  const seq = readForeignSafeInteger(authorityNonceFallback);
  if (!seq.ok || seq.value < 1) {
    throw new SecretReleaseRefused("fenced", "Release authority nonce is unavailable.");
  }
  return `u4-auth-${seq.value}`;
}

function parseIssuedSeq(operationId: string, nonce: string): ForeignNumberRead {
  const prefix = `${nonce}\u0000`;
  if (operationId.length <= prefix.length) return { ok: false };
  for (let i = 0; i < prefix.length; i += 1) {
    if (operationId.charCodeAt(i) !== prefix.charCodeAt(i)) return { ok: false };
  }
  const rest = operationId.slice(prefix.length);
  if (rest.length === 0) return { ok: false };
  if (rest.charCodeAt(0) === 48) return { ok: false };
  for (let i = 0; i < rest.length; i += 1) {
    const code = rest.charCodeAt(i);
    if (code < 48 || code > 57) return { ok: false };
  }
  return readForeignSafeInteger(Number(rest));
}

export class ReleaseCommitAuthority {
  readonly #leases = new Map<string, LeaseRecord>();
  readonly #retired = new Set<string>();
  readonly #audit: ReleaseAuditEvent[] = [];
  readonly #nonce: string = instanceNonce();
  #seq = 0;
  #issuedSeq = 0;
  #tombstoneDropped = false;
  #maxDroppedIssuedSeq = 0;

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
      if (typeof oldest === "string") {
        this.#retired.delete(oldest);
        this.#tombstoneDropped = true;
        const droppedSeq = parseIssuedSeq(oldest, this.#nonce);
        if (droppedSeq.ok) {
          const prev = readForeignSafeInteger(this.#maxDroppedIssuedSeq);
          if (!prev.ok || droppedSeq.value > prev.value) {
            this.#maxDroppedIssuedSeq = droppedSeq.value;
          }
        }
      } else {
        this.#tombstoneDropped = true;
      }
    }
    this.#retired.add(operationId);
  }

  /** Authority-issued lease id: instance nonce + monotonic counter. Unique per authority. */
  issueLeaseId(): string {
    this.#issuedSeq += 1;
    const seq = readForeignSafeInteger(this.#issuedSeq);
    if (!seq.ok || seq.value < 1) {
      throw new SecretReleaseRefused("fenced", "Release id counter is unavailable.");
    }
    return `${this.#nonce}\u0000${seq.value}`;
  }

  #issuedByThis(operationId: string): boolean {
    const seq = parseIssuedSeq(operationId, this.#nonce);
    if (!seq.ok) return false;
    const issued = readForeignSafeInteger(this.#issuedSeq);
    if (!issued.ok) return false;
    return seq.value >= 1 && seq.value <= issued.value;
  }

  /** Live map size (unused + terminal). Does not include retired tombstones. */
  get size(): number {
    return this.#leases.size;
  }

  mint(operationId: string, epoch: number): { readonly leaseId: string; readonly token: string; readonly epoch: number } {
    if (typeof operationId !== "string" || operationId.length === 0) {
      throw new SecretReleaseRefused("missing", "Release operation id is required.");
    }
    const epochRead = readForeignSafeInteger(epoch);
    if (!epochRead.ok || epochRead.value < 0) {
      throw new SecretReleaseRefused("stale", "Release epoch is unavailable.");
    }
    const looksIssued = parseIssuedSeq(operationId, this.#nonce);
    if (looksIssued.ok && !this.#issuedByThis(operationId)) {
      throw new SecretReleaseRefused("missing", "Release lease id was not issued by this authority.");
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
    if (this.#issuedByThis(operationId)) {
      const issuedSeq = parseIssuedSeq(operationId, this.#nonce);
      const droppedMax = readForeignSafeInteger(this.#maxDroppedIssuedSeq);
      if (issuedSeq.ok && droppedMax.ok && issuedSeq.value <= droppedMax.value) {
        throw new SecretReleaseRefused("replay", "Release lease is not provably fresh.");
      }
    } else if (this.#tombstoneDropped) {
      throw new SecretReleaseRefused("replay", "Release lease is not provably fresh.");
    }
    this.#evictOldestTerminal();
    if (this.#leases.size >= RELEASE_LEASE_CAP) {
      throw new SecretReleaseRefused("fenced", "Release lease map is at capacity.");
    }
    this.#seq += 1;
    const seqRead = readForeignSafeInteger(this.#seq);
    if (!seqRead.ok || seqRead.value < 1) {
      throw new SecretReleaseRefused("fenced", "Release token counter is unavailable.");
    }
    const token = `${operationId}\u0000${epochRead.value}\u0000${seqRead.value}`;
    this.#leases.set(operationId, { token, epoch: epochRead.value, state: "unused" });
    return { leaseId: operationId, token, epoch: epochRead.value };
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
      if (this.#tombstoneDropped) {
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
        return Object.freeze({ kind: "DELIVERY_UNKNOWN", operationId: id });
      default: {
        const _exhaustive: never = rec.state;
        void _exhaustive;
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
    switch (rec.state) {
      case "released":
      case "delivery-unknown":
      case "acknowledged":
        this.#record(leaseId, "replay");
        return "replay";
      case "fenced":
        this.#record(leaseId, "fenced");
        return "fenced";
      case "unused":
        break;
      default: {
        const _exhaustive: never = rec.state;
        void _exhaustive;
        this.#record(leaseId, "replay");
        return "replay";
      }
    }
    const epochRead = readForeignSafeInteger(observedEpoch);
    if (!epochRead.ok || epochRead.value !== rec.epoch) {
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
      const epochRead = readForeignSafeInteger(observedEpoch);
      if (!epochRead.ok || epochRead.value !== rec.epoch) {
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
   * One-way acknowledged → delivery-unknown for this exact operation id.
   * Never upgrades, never re-discloses, never mints. Other states unchanged.
   */
  revokeDelivery(operationId: string): void {
    const id = operationIdOf(operationId);
    if (id.length === 0) {
      return;
    }
    const rec = this.#leases.get(id);
    if (rec === undefined) {
      return;
    }
    switch (rec.state) {
      case "acknowledged":
        rec.state = "delivery-unknown";
        this.#record(id, "delivery-unknown");
        return;
      case "unused":
      case "released":
      case "fenced":
      case "delivery-unknown":
        return;
      default: {
        const _exhaustive: never = rec.state;
        void _exhaustive;
        throw new Error("ReleaseCommitAuthority: revokeDelivery refused");
      }
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
