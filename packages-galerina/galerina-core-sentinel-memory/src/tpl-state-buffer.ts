// tpl-state-buffer.ts — ternary packed-trit buffer (the tri-logic core).
//
// This is where "tri-logic is built into memory": the staging buffer natively
// stores and validates ternary state {-1, 0, +1}. Packing mirrors BitNet I2_S —
// 2 bits per trit, 16 trits per i32 word. The 4th 2-bit code (0b11 = 3) is a
// CORRUPTION SENTINEL that is never written by this class; reading it back means
// the underlying memory was tampered with, and we trap (LSM-TRIT-CORRUPT).
//
// Encoding map:  -1 -> 0 (0b00),  0 -> 1 (0b01),  +1 -> 2 (0b10),  corrupt -> 3.
//
// Bit layout for trit index i:
//   word     = floor(i / 16)
//   local    = i % 16
//   byteIdx  = floor(local / 4)
//   posInByte= local % 4
//   shift    = byteIdx * 8 + (3 - posInByte) * 2
//   enc      = (word >>> shift) & 0x3

import { SecurityTrap } from "./errors.js";
import { MemoryValidator } from "./memory-validator.js";
import type { Block, StaticMemoryPool } from "./static-memory-pool.js";

const TRITS_PER_WORD = 16;
const ENC_FROM_TRIT: Record<number, number> = { [-1]: 0, [0]: 1, [1]: 2 };
const TRIT_FROM_ENC: ReadonlyArray<-1 | 0 | 1 | null> = [-1, 0, 1, null];

export class TPLStateBuffer {
  readonly tritCount: number;

  private readonly pool: StaticMemoryPool;
  private readonly _block: Block;
  private readonly view: Int32Array;

  constructor(pool: StaticMemoryPool, tritCount: number) {
    if (tritCount < 0) {
      throw new SecurityTrap("LSM-TRIT-INDEX", `tritCount ${tritCount} is negative`);
    }
    this.pool = pool;
    this.tritCount = tritCount;
    const words = Math.ceil(tritCount / TRITS_PER_WORD);
    const bytes = MemoryValidator.alignUp(words * 4);
    this._block = pool.allocate(bytes, "compute");
    this.view = pool.i32(this._block);
  }

  private locate(i: number): { word: number; shift: number } {
    const word = Math.floor(i / TRITS_PER_WORD);
    const local = i % TRITS_PER_WORD;
    const byteIdx = Math.floor(local / 4);
    const posInByte = local % 4;
    const shift = byteIdx * 8 + (3 - posInByte) * 2;
    return { word, shift };
  }

  setTrit(i: number, value: -1 | 0 | 1): void {
    if (value !== -1 && value !== 0 && value !== 1) {
      throw new SecurityTrap("LSM-TRIT-RANGE", `trit value ${value} is not in {-1,0,1}`);
    }
    if (i < 0 || i >= this.tritCount) {
      throw new SecurityTrap("LSM-TRIT-INDEX", `trit index ${i} out of range [0, ${this.tritCount})`);
    }
    const { word, shift } = this.locate(i);
    const enc = ENC_FROM_TRIT[value]!;
    const cleared = this.view[word]! & ~(0x3 << shift);
    this.view[word] = cleared | (enc << shift);
  }

  getTrit(i: number): -1 | 0 | 1 {
    if (i < 0 || i >= this.tritCount) {
      throw new SecurityTrap("LSM-TRIT-INDEX", `trit index ${i} out of range [0, ${this.tritCount})`);
    }
    const { word, shift } = this.locate(i);
    const enc = (this.view[word]! >>> shift) & 0x3;
    const trit = TRIT_FROM_ENC[enc];
    if (trit === null || trit === undefined) {
      throw new SecurityTrap("LSM-TRIT-CORRUPT", `corruption sentinel read at trit ${i}`);
    }
    return trit;
  }

  loadTrits(values: readonly number[]): void {
    for (let i = 0; i < values.length; i++) {
      this.setTrit(i, values[i] as -1 | 0 | 1);
    }
  }

  toArray(): number[] {
    const out: number[] = new Array(this.tritCount);
    for (let i = 0; i < this.tritCount; i++) out[i] = this.getTrit(i);
    return out;
  }

  get block(): Block {
    return this._block;
  }

  get byteLength(): number {
    return this._block.bytes;
  }
}
