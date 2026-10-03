// =============================================================================
// TriRegex engine — non-backtracking streaming state-set simulation.
//   * Per-char work is a fixed bitset-union bound (the certificate's unit) —
//     input content can change WHICH states are active, never HOW MUCH work a
//     character may cost. That is the ReDoS immunity, by construction.
//   * Verdicts are ternary: feed() returns +1 (proven match, latched),
//     0 (indeterminate — not yet decidable), or -1 (proven impossible).
//     end() COLLAPSES indeterminate to -1 — fail-closed at the boundary.
//   * No rewind: each code point is examined once; memory is the fixed
//     state arrays regardless of stream length.
// Contact hello@trithypha.dev · Apache-2.0.
// =============================================================================
import type { Compiled } from "./compile.ts";
import { inRangesWithCost } from "./compile.ts";
import type { EngineStats, MatchOutcome, TriVerdict } from "./types.ts";

const INF = 0x7fffffff;

export interface TriStream {
  /** Feed a chunk; returns the latched verdict so far: +1 / 0 / -1. */
  feed(chunk: string): TriVerdict;
  /** End of stream: 0 collapses — the result is +1 or -1, never indeterminate. */
  end(): MatchOutcome;
  stats(): EngineStats;
}

/**
 * Read-only snapshot of a compiled automaton, for ahead-of-time lowering
 * (e.g. a bounded in-Wasm Boolean matcher). Every array is a fresh frozen
 * copy: the matcher's own tables are never exposed or aliased, and the
 * snapshot carries no input, span or capture data.
 */
export interface AutomatonTables {
  readonly slots: number;
  readonly words: number;
  /** per resting slot: the char ranges if the slot consumes a char, else null */
  readonly charRanges: readonly (readonly (readonly [number, number])[] | null)[];
  /** per resting slot: true for an end-of-line assertion slot */
  readonly eolSlot: readonly boolean[];
  /** per resting slot: closure row after consuming (u32 words; empty for eol slots) */
  readonly rows: readonly (readonly number[])[];
  readonly matchOnConsume: readonly boolean[];
  readonly initStart: { readonly bits: readonly number[]; readonly matched: boolean };
  readonly initMid: { readonly bits: readonly number[]; readonly matched: boolean };
  readonly anchoredStart: boolean;
  readonly eolResolves: readonly boolean[];
  readonly endFreshMatches: readonly [boolean, boolean];
}

export class TriMatcher {
  private readonly c: Compiled;
  private readonly uniformScan: boolean;
  constructor(c: Compiled, uniformScan: boolean) {
    this.c = c;
    this.uniformScan = uniformScan;
  }

  /** Whole-input convenience — literally stream + end (chunk-invariance by construction). */
  test(input: string): MatchOutcome & { stats: EngineStats } {
    const s = this.stream();
    s.feed(input);
    const out = s.end();
    return { ...out, stats: s.stats() };
  }

  /** Frozen copy of the automaton tables (see AutomatonTables). */
  tables(): AutomatonTables {
    const c = this.c;
    const charRanges: (readonly (readonly [number, number])[] | null)[] = [];
    const eolSlot: boolean[] = [];
    const rows: (readonly number[])[] = [];
    const matchOnConsume: boolean[] = [];
    const eolResolves: boolean[] = [];
    for (let s = 0; s < c.slots; s++) {
      const instr = c.prog[c.slotToInstr[s]!]!;
      charRanges.push(
        instr.op === "char"
          ? Object.freeze(instr.ranges.map((r) => Object.freeze([r[0], r[1]] as const)))
          : null,
      );
      eolSlot.push(instr.op === "eol");
      rows.push(Object.freeze(Array.from(c.rows[s] ?? new Uint32Array(0))));
      matchOnConsume.push((c.matchOnConsume[s] ?? 0) !== 0);
      eolResolves.push((c.eolResolves[s] ?? 0) !== 0);
    }
    return Object.freeze({
      slots: c.slots,
      words: c.words,
      charRanges: Object.freeze(charRanges),
      eolSlot: Object.freeze(eolSlot),
      rows: Object.freeze(rows),
      matchOnConsume: Object.freeze(matchOnConsume),
      initStart: Object.freeze({ bits: Object.freeze(Array.from(c.initStart.bits)), matched: c.initStart.matched }),
      initMid: Object.freeze({ bits: Object.freeze(Array.from(c.initMid.bits)), matched: c.initMid.matched }),
      anchoredStart: c.anchoredStart,
      eolResolves: Object.freeze(eolResolves),
      endFreshMatches: Object.freeze([c.endFreshMatches[0], c.endFreshMatches[1]] as const),
    });
  }

  stream(): TriStream {
    const c = this.c;
    const words = c.words;
    let cur = new Uint32Array(words);
    let nxt = new Uint32Array(words);
    let curStart = new Int32Array(c.slots).fill(INF);
    let nxtStart = new Int32Array(c.slots).fill(INF);
    let pos = 0;
    let matched = false;
    let matchStart = INF;
    let matchEnd = -1;
    let curMinStart = INF;
    let impossible = false;
    const stats: EngineStats = { chars: 0, steps: 0, maxActive: 0 };
    let ended: MatchOutcome | undefined;

    // position 0: the atStart closure
    cur.set(c.initStart.bits);
    stats.steps += words;
    for (let s = 0; s < c.slots; s++) {
      stats.steps++;
      if ((cur[s >> 5]! >>> (s & 31)) & 1) { curStart[s] = 0; curMinStart = 0; }
    }
    if (c.initStart.matched) { matched = true; matchStart = 0; matchEnd = 0; }

    // leftmost-longest: an earlier start always wins; at the same start, the
    // longer end wins. (Declared span semantics — matches user expectation.)
    const latch = (st: number, en: number): void => {
      if (!matched || st < matchStart || (st === matchStart && en > matchEnd)) {
        matched = true; matchStart = st; matchEnd = en;
      }
    };

    const feedChar = (cp: number): void => {
      // early exit: a held match is FINAL once no active thread can beat it
      // (all remaining starts are later; fresh starts would be later still)
      if (matched && !this.uniformScan && curMinStart > matchStart) { pos++; stats.chars++; return; }
      // fresh unanchored start for a match beginning AT this position (pos>0;
      // position 0 is covered by the initStart closure). Once matched, a fresh
      // start is strictly later than matchStart and can never win — skip.
      if (pos > 0 && !c.anchoredStart && !matched) {
        const im = c.initMid;
        for (let w = 0; w < words; w++) {
          cur[w] = (cur[w]! | im.bits[w]!) >>> 0;
          stats.steps++;
        }
        for (let s = 0; s < c.slots; s++) {
          stats.steps++;
          if ((im.bits[s >> 5]! >>> (s & 31)) & 1 && curStart[s]! > pos) curStart[s] = pos;
        }
        if (im.matched) latch(pos, pos); // pattern matches empty at this position
      }
      nxt.fill(0);
      nxtStart.fill(INF);
      let active = 0;
      let minNext = INF;
      for (let s = 0; s < c.slots; s++) {
        stats.steps++;
        if (!((cur[s >> 5]! >>> (s & 31)) & 1)) continue;
        active++;
        const instr = c.prog[c.slotToInstr[s]!]!;
        if (instr.op !== "char") continue; // an eol assertion dies on a consumed char
        const rangeResult = inRangesWithCost(cp, instr.ranges);
        stats.steps += rangeResult.comparisons;
        if (!rangeResult.matched) continue;
        const row = c.rows[s]!;
        for (let w = 0; w < words; w++) {
          nxt[w] = (nxt[w]! | row[w]!) >>> 0;
          stats.steps++;
        }
        const st = curStart[s]!;
        for (let t = 0; t < c.slots; t++) {
          stats.steps++;
          if ((row[t >> 5]! >>> (t & 31)) & 1 && nxtStart[t]! > st) nxtStart[t] = st;
        }
        if (st < minNext) minNext = st;
        if (c.matchOnConsume[s]) latch(st, pos + 1);
      }
      if (active > stats.maxActive) stats.maxActive = active;
      const t1 = cur; cur = nxt; nxt = t1;
      const t2 = curStart; curStart = nxtStart; nxtStart = t2;
      curMinStart = minNext;
      pos++;
      stats.chars++;
      if (!matched && c.anchoredStart && cur.every((w) => w === 0)) impossible = true;
    };

    return {
      feed: (chunk: string): TriVerdict => {
        if (ended !== undefined) {
          throw new Error("TPRX-STREAM: feed() called after end()");
        }
        for (const ch of chunk) feedChar(ch.codePointAt(0)!);
        return matched ? 1 : impossible ? -1 : 0;
      },
      end: (): MatchOutcome => {
        if (ended !== undefined) return ended;
        // resolve parked end-of-line assertions at the true boundary
        for (let s = 0; s < c.slots; s++) {
          stats.steps++;
          if (!((cur[s >> 5]! >>> (s & 31)) & 1)) continue;
          const instr = c.prog[c.slotToInstr[s]!]!;
          if (instr.op === "eol" && c.eolResolves[s]) latch(curStart[s]!, pos);
        }
        // a fresh empty match AT end-of-input (e.g. `$`, `a*$` tails)
        if (
          !matched &&
          (pos === 0 || !c.anchoredStart) &&
          c.endFreshMatches[pos === 0 ? 1 : 0]
        ) latch(pos, pos);
        // K3 collapse at the boundary: indeterminate becomes refuse
        ended = matched ? { verdict: 1, span: [matchStart, matchEnd] } : { verdict: -1 };
        return ended;
      },
      stats: () => ({ ...stats }),
    };
  }
}
