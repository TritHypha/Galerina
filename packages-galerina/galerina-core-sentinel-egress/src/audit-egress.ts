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
}

/** True if a key is missing or all bytes are zero (the non-secret dev key). */
function isWeakKey(key: Uint8Array | undefined): boolean {
  if (!key || key.length === 0) return true;
  for (const b of key) if (b !== 0) return false;
  return true;
}

/**
 * Compute the keyed batch hash for a chain link.
 * `HMAC-SHA256-hex(prevHash + "\n" + records.join("\n"))`.
 */
function computeBatchHash(
  hmacKey: Uint8Array,
  prevHash: string,
  records: readonly string[],
): string {
  const h = createHmac("sha256", hmacKey);
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
  readonly #hmacKey: Uint8Array;
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
    const ringCapacity = opts.ringCapacity ?? opts.batchSize * 4;
    this.#dir = opts.dir;
    this.#ledgerPath = join(opts.dir, LEDGER_FILE);
    this.#batchSize = opts.batchSize;
    this.#hmacKey = opts.hmacKey ?? ZERO_KEY;
    this.#ring = new RingBuffer<string>(ringCapacity);
    mkdirSync(opts.dir, { recursive: true });
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
    const batchHash = computeBatchHash(this.#hmacKey, prevHash, records);
    const batch: AuditBatch = {
      seq: this.#seq,
      count: records.length,
      prevHash,
      batchHash,
      records,
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
      const recomputed = computeBatchHash(key, b.prevHash, b.records);
      if (recomputed !== b.batchHash) {
        return false;
      }
      expectedPrev = b.batchHash;
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
    out.push(JSON.parse(trimmed) as AuditBatch);
  }
  return out;
}
