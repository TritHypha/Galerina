import { SecurityTrap } from "./errors.js";

/**
 * A fixed-capacity FIFO ring buffer with deterministic memory.
 *
 * The backing store is allocated once at construction and never grows. When the
 * buffer is full, {@link RingBuffer.push} returns `false` (backpressure) rather
 * than reallocating — the caller is expected to {@link RingBuffer.drain} (flush)
 * and retry. This is what makes the egress path a bounded, non-leaking host seam:
 * an audit storm cannot drive unbounded heap growth.
 *
 * Implemented as a classic circular buffer over a fixed `Array<T | undefined>`
 * with `head` (read index), and `count` (live element count).
 */
export class RingBuffer<T> {
  readonly #store: (T | undefined)[];
  readonly #capacity: number;
  #head = 0;
  #count = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new SecurityTrap(
        "EGR-RING-001",
        `RingBuffer capacity must be a positive integer, got ${String(capacity)}`,
      );
    }
    this.#capacity = capacity;
    this.#store = new Array<T | undefined>(capacity).fill(undefined);
  }

  /**
   * Append `item` if the buffer is not full.
   *
   * @returns `true` if the item was stored; `false` if the buffer was full
   *   (BACKPRESSURE — the caller must drain/flush before retrying). Never grows.
   */
  push(item: T): boolean {
    if (this.#count >= this.#capacity) {
      return false;
    }
    const tail = (this.#head + this.#count) % this.#capacity;
    this.#store[tail] = item;
    this.#count++;
    return true;
  }

  /**
   * Return all buffered items in FIFO (insertion) order and clear the buffer.
   * The backing store slots are released for GC but the array itself is reused.
   */
  drain(): T[] {
    const out: T[] = new Array<T>(this.#count);
    for (let i = 0; i < this.#count; i++) {
      const idx = (this.#head + i) % this.#capacity;
      // Slot is guaranteed live for i < count.
      out[i] = this.#store[idx] as T;
      this.#store[idx] = undefined;
    }
    this.#head = 0;
    this.#count = 0;
    return out;
  }

  get size(): number {
    return this.#count;
  }

  get capacity(): number {
    return this.#capacity;
  }

  get isFull(): boolean {
    return this.#count >= this.#capacity;
  }
}
