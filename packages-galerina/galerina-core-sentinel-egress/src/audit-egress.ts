import { createHmac } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SecurityTrap } from "./errors.js";
import { RingBuffer } from "./ring-buffer.js";

/** Genesis chain head: 64 hex zeros (SHA-256 width). */
const GENESIS = "0".repeat(64);

/** Default HMAC key when none is injected: an all-zero 32-byte key. */
const ZERO_KEY = new Uint8Array(32);

/** Ledger file name written under the configured egress directory. */
const LEDGER_FILE = "audit-egress.jsonl";

/**
 * One flushed, HMAC-chained batch of audit records.
 *
 * The `batchHash` is `HMAC-SHA256-hex(prevHash + "\n" + records.join("\n"))`,
 * keyed by the egress HMAC key. `prevHash` is the previous batch's `batchHash`
 * (or {@link GENESIS} for the first batch), so the whole ledger forms a single
 * tamper-evident hash chain: altering any record, reordering any batch, or
 * splicing the chain changes a downstream hash and fails {@link AuditEgress.verifyChain}.
 */
export interface AuditBatch {
  readonly seq: number;
  readonly count: number;
  readonly prevHash: string;
  readonly batchHash: string;
  readonly records: readonly string[];
  /**
   * Key-rotation epoch that sealed this batch (#28/D2 step 4). When present it
   * is BOUND INTO the MAC (an attacker cannot relabel a batch's epoch), and
   * verification selects the key by epoch via {@link AuditEgress.verifyChainEpochAware}.
   * Absent on legacy batches — whose hash input is byte-identical to before.
   */
  readonly epochId?: number;
}

export interface AuditEgressOptions {
  /** Directory the ledger is written to. Created (recursively) if absent. */
  dir: string;
  /** Auto-flush threshold: flush once the ring holds this many records. */
  batchSize: number;
  /** Fixed ring capacity. Defaults to `batchSize * 4`. */
  ringCapacity?: number;
  /**
   * HMAC key for the chain. PRODUCTION MUST INJECT A REAL KEY — if omitted, a
   * fixed all-zero 32-byte key is used, which is attestable but not secret.
   */
  hmacKey?: Uint8Array;
  /**
   * Certified/P9 strictness. When true, the constructor FAILS CLOSED if the HMAC
   * key is absent or all-zero (the development key) — a zero audit key is a
   * certification blocker. Default false.
   */
  strictKey?: boolean;
  /**
   * Key-rotation epoch this writer seals batches under (#28/D2). Positive
   * integer; stamped on and MAC-bound into every flushed batch. Omit for the
   * legacy single-key ledger.
   */
  epochId?: number;
}

/** True if a key is missing or all bytes are zero (the non-secret dev key). */
function isWeakKey(key: Uint8Array | undefined): boolean {
  if (!key || key.length === 0) return true;
  for (const b of key) if (b !== 0) return false;
  return true;
}

/**
 * Compute the keyed batch hash for a chain link.
 * Legacy (no epoch): `HMAC-SHA256-hex(prevHash + "\n" + records.join("\n"))` — unchanged bytes.
 * Epoch-stamped:     the input is prefixed with `epoch:<id>\n`, binding the epoch
 * into the MAC so a batch cannot be relabelled to verify under a different epoch's key.
 */
function computeBatchHash(
  hmacKey: Uint8Array,
  prevHash: string,
  records: readonly string[],
  epochId?: number,
): string {
  const h = createHmac("sha256", hmacKey);
  if (epochId !== undefined) h.update(`epoch:${epochId}\n`);
  h.update(prevHash + "\n" + records.join("\n"));
  return h.digest("hex");
}

/**
 * The governed write path for the audit ledger.
 *
 * Records are staged in a fixed-capacity {@link RingBuffer} and egressed in
 * batches: each flush makes exactly ONE `appendFileSync` of one JSON line. This
 * replaces ad-hoc `fs.appendFileSync` per event — which is both a Hardened-Border
 * leak (every event an unbatched, unchained syscall) and a ~1000x perf sink.
 *
 * The batch hash chain makes the on-disk ledger tamper-evident: see
 * {@link AuditEgress.verifyChain}.
 */
export class AuditEgress {
  readonly #dir: string;
  readonly #ledgerPath: string;
  readonly #batchSize: number;
  #hmacKey: Uint8Array;
  #epochId: number | undefined;
  readonly #ring: RingBuffer<string>;
  #seq = 0;
  #prevHash: string = GENESIS;

  constructor(opts: AuditEgressOptions) {
    if (!Number.isInteger(opts.batchSize) || opts.batchSize <= 0) {
      throw new SecurityTrap(
        "EGR-CFG-001",
        `AuditEgress batchSize must be a positive integer, got ${String(opts.batchSize)}`,
      );
    }
    if (opts.strictKey && isWeakKey(opts.hmacKey)) {
      throw new SecurityTrap(
        "EGR-KEY-001",
        "AuditEgress strictKey: a real (non-zero) HMAC key is required — the all-zero development key is a certification blocker",
      );
    }
    if (opts.epochId !== undefined && (!Number.isInteger(opts.epochId) || opts.epochId < 1)) {
      throw new SecurityTrap(
        "EGR-EPOCH-001",
        `AuditEgress epochId must be a positive integer, got ${String(opts.epochId)}`,
      );
    }
    const ringCapacity = opts.ringCapacity ?? opts.batchSize * 4;
    this.#dir = opts.dir;
    this.#ledgerPath = join(opts.dir, LEDGER_FILE);
    this.#batchSize = opts.batchSize;
    this.#hmacKey = opts.hmacKey ?? ZERO_KEY;
    this.#epochId = opts.epochId;
    this.#ring = new RingBuffer<string>(ringCapacity);
    mkdirSync(opts.dir, { recursive: true });
  }

  /**
   * The Phase-2 SWITCH on the write side (#28/D2): seal all future batches under
   * a new epoch's key. Fail-closed and forward-only:
   *  - the new epoch must be a positive integer STRICTLY greater than the current
   *    one (no rollback, no replay; adopting an epoch on a legacy writer requires
   *    epoch ≥ 1);
   *  - the new key must be real (non-zero) — rotating TO the development key is
   *    never legal, regardless of `strictKey`;
   *  - staged records are flushed under the OLD key first, so no record ever
   *    straddles the boundary (the drain gate's no-in-flight guarantee, enforced
   *    mechanically here too).
   * The decision to call this belongs to the triple-lock phase machine
   * (tower-citizen key-rotation); this is only the mechanism.
   */
  adoptEpoch(epochId: number, hmacKey: Uint8Array): void {
    if (!Number.isInteger(epochId) || epochId < 1 || (this.#epochId !== undefined && epochId <= this.#epochId)) {
      throw new SecurityTrap(
        "EGR-EPOCH-002",
        `adoptEpoch: epoch must be a positive integer greater than the current epoch (${String(this.#epochId)}), got ${String(epochId)}`,
      );
    }
    if (isWeakKey(hmacKey)) {
      throw new SecurityTrap(
        "EGR-EPOCH-003",
        "adoptEpoch: a real (non-zero) HMAC key is required — rotating to the development key is denied",
      );
    }
    this.flush(); // seal everything staged under the OLD epoch's key first
    this.#epochId = epochId;
    this.#hmacKey = hmacKey;
  }

  /** The epoch this writer currently seals under (undefined = legacy single-key). */
  get epochId(): number | undefined {
    return this.#epochId;
  }

  /**
   * Stage an audit record for egress.
   *
   * Pushes to the ring, then auto-{@link AuditEgress.flush | flushes} if the ring
   * is now full OR the staged count has reached the batch size. If the ring was
   * already full (push rejected) we flush first and then push — an audit record
   * is NEVER dropped.
   */
  push(record: string): void {
    if (!this.#ring.push(record)) {
      // Ring was full: drain it to disk, then the record fits.
      this.flush();
      this.#ring.push(record);
    }
    if (this.#ring.isFull || this.#ring.size >= this.#batchSize) {
      this.flush();
    }
  }

  /**
   * Egress all staged records as one chained batch (ONE disk write).
   *
   * @returns the written {@link AuditBatch}, or `null` if nothing was buffered.
   */
  flush(): AuditBatch | null {
    const records = this.#ring.drain();
    if (records.length === 0) {
      return null;
    }
    const prevHash = this.#prevHash;
    const batchHash = computeBatchHash(this.#hmacKey, prevHash, records, this.#epochId);
    const batch: AuditBatch = {
      seq: this.#seq,
      count: records.length,
      prevHash,
      batchHash,
      records,
      ...(this.#epochId !== undefined ? { epochId: this.#epochId } : {}),
    };
    // ONE disk write per batch — the whole point.
    appendFileSync(this.#ledgerPath, JSON.stringify(batch) + "\n");
    this.#prevHash = batchHash;
    this.#seq++;
    return batch;
  }

  /** Number of records staged but not yet flushed. */
  pendingCount(): number {
    return this.#ring.size;
  }

  /** Current chain head: last `batchHash`, or {@link GENESIS} before any flush. */
  get chainHead(): string {
    return this.#prevHash;
  }

  /** The egress directory this sink writes to. */
  get dir(): string {
    return this.#dir;
  }

  /**
   * Recompute and verify a full chain of batches.
   *
   * For each batch: recompute `batchHash` from its `prevHash + records` and
   * confirm it matches the stored hash, and confirm the link to the previous
   * batch (`batch[0].prevHash === GENESIS`, then each `prevHash === prior batchHash`,
   * with monotonically increasing `seq`). Any mismatch returns `false`.
   *
   * @returns `true` iff the chain is intact (tamper-evident).
   */
  static verifyChain(batches: AuditBatch[], hmacKey?: Uint8Array): boolean {
    const key = hmacKey ?? ZERO_KEY;
    let expectedPrev = GENESIS;
    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];
      if (b === undefined) {
        return false;
      }
      if (b.prevHash !== expectedPrev) {
        return false;
      }
      if (b.seq !== i) {
        return false;
      }
      if (b.count !== b.records.length) {
        return false;
      }
      const recomputed = computeBatchHash(key, b.prevHash, b.records, b.epochId);
      if (recomputed !== b.batchHash) {
        return false;
      }
      expectedPrev = b.batchHash;
    }
    return true;
  }

  /**
   * Epoch-aware chain verification (#28/D2 step 4): each batch's key is selected
   * by ITS epoch via `keyForEpoch` — the seam to the key ring + custody
   * (tower-citizen `epochForVerification` refuses unknown/revoked epochs by
   * returning null; custody maps the epoch's keyId to bytes).
   *
   * Fail-closed, all of:
   *  - every batch MUST carry a positive-integer `epochId` (a legacy batch in an
   *    epoch-aware ledger is a refusal, not a fallback);
   *  - epochs must be NON-DECREASING along the chain (a newer batch under an
   *    older epoch is a rollback → false);
   *  - `keyForEpoch` returning null/undefined (unknown, future, or REVOKED
   *    epoch) → false — revocation refuses even cryptographically valid MACs;
   *  - the usual chain integrity: genesis link, seq monotone, count match, and
   *    the epoch-bound MAC recomputed under that epoch's key.
   *
   * Old epochs' batches verify forever — the ring never deletes an epoch; only
   * REVOKED epochs are refused, and that refusal is deliberate.
   */
  static verifyChainEpochAware(
    batches: AuditBatch[],
    keyForEpoch: (epochId: number) => Uint8Array | null | undefined,
  ): boolean {
    let expectedPrev = GENESIS;
    let lastEpoch = 0;
    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];
      if (b === undefined) {
        return false;
      }
      if (b.epochId === undefined || !Number.isInteger(b.epochId) || b.epochId < 1) {
        return false; // epoch-aware ledgers carry epochs on EVERY batch — no silent legacy fallback
      }
      if (b.epochId < lastEpoch) {
        return false; // epoch regression = rollback
      }
      if (b.prevHash !== expectedPrev || b.seq !== i || b.count !== b.records.length) {
        return false;
      }
      let key: Uint8Array | null | undefined;
      try {
        key = keyForEpoch(b.epochId);
      } catch {
        return false; // a crashing key lookup is a refusal, not an exception path
      }
      if (!key || isWeakKey(key)) {
        return false; // unknown / future / revoked epoch, or a weak key → fail-closed
      }
      if (computeBatchHash(key, b.prevHash, b.records, b.epochId) !== b.batchHash) {
        return false;
      }
      expectedPrev = b.batchHash;
      lastEpoch = b.epochId;
    }
    return true;
  }
}

/**
 * Read and parse the egress ledger under `dir`.
 *
 * Parses each non-blank line of `<dir>/audit-egress.jsonl` into an
 * {@link AuditBatch}. Returns `[]` if the ledger file does not exist.
 */
export function readEgressLedger(dir: string): AuditBatch[] {
  const path = join(dir, LEDGER_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const out: AuditBatch[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    out.push(JSON.parse(trimmed) as AuditBatch); // perf-allow: loop-json-parse — HMAC-chained audit-ledger replay; each line is distinct, no behavior-change refactor
  }
  return out;
}
