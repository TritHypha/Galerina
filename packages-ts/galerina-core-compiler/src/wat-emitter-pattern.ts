// =============================================================================
// D4 (Codex GO 2026-10-02, relatedCommit 0d06d6c1): deterministic, bounded,
// pure in-Wasm lowering of `s.matchesPattern("<literal>")`.
//
// Scope (closed):
//   * ONLY a compile-time string literal that fungi.pattern.capability.v1 admits
//     (admitPatternCapability: tri-regex, maxPatternLength 500, captures refused,
//     word boundaries refused). Dynamic patterns, non-admitted literals,
//     extractGroups and replacePattern keep FUNGI-WAT-PATTERN-001.
//   * The helper is the tri-regex Boolean verdict (verdict === 1) recomputed
//     from a frozen copy of the admitted automaton tables: a fixed bitset NFA
//     simulation, one host code-point read per character, no backtracking, no
//     linear memory, no allocation, no new host import (only the established
//     __str_length / __str_char_at code-point bridge).
//   * Limits mirror stdlib.ts matchesPattern: UTF-16 subject length > 4096 and
//     certified work (code points x perCharWorkBound + boundaryWorkBound) above
//     1_000_000 are refused. The interpreter returns a RegexError value there;
//     the Wasm helper traps (unreachable). Both are fail-closed; neither yields
//     a Boolean. This divergence is declared, not hidden.
//   * Automaton size is bounded at emit (slots, total ranges); a larger
//     admitted automaton is refused at build, never emitted unbounded.
// =============================================================================
import { createHash } from "node:crypto";
import { admitPatternCapability } from "./pattern-capability.js";

/** Mirrors stdlib.ts MAX_REGEX_SUBJECT_CHARS (UTF-16 code units). */
export const WAT_PATTERN_MAX_SUBJECT_UTF16 = 4_096;
/** Mirrors stdlib.ts MAX_REGEX_CERTIFIED_WORK_UNITS. */
export const WAT_PATTERN_MAX_CERTIFIED_WORK = 1_000_000;
/** Emit-time automaton bounds for the in-Wasm matcher. */
export const WAT_PATTERN_MAX_SLOTS = 256;
export const WAT_PATTERN_MAX_RANGES = 1_024;

export interface WatPatternHelper {
  readonly helperName: string;
  readonly body: string;
}

export type WatPatternPlan =
  | { readonly ok: true; readonly helper: WatPatternHelper }
  | { readonly ok: false; readonly reason: string };

/** Same quote rule as interpreter stripStringQuotes / wat-emitter-intern. */
function literalText(raw: string): string {
  return raw.length >= 2 && raw.startsWith("\"") && raw.endsWith("\"") ? raw.slice(1, -1) : raw;
}

function i32c(v: number): string {
  return `(i32.const ${v | 0})`;
}

function bitTest(slot: number): string {
  return `(i32.ne (i32.and (local.get $c${slot >> 5}) ${i32c(1 << (slot & 31))}) (i32.const 0))`;
}

function rangeTest(ranges: readonly (readonly [number, number])[]): string {
  const terms = ranges.map(([lo, hi]) =>
    lo === hi
      ? `(i32.eq (local.get $cp) ${i32c(lo)})`
      : `(i32.and (i32.ge_u (local.get $cp) ${i32c(lo)}) (i32.le_u (local.get $cp) ${i32c(hi)}))`,
  );
  let out = terms[0]!;
  for (let i = 1; i < terms.length; i++) out = `(i32.or ${out} ${terms[i]!})`;
  return out;
}

/**
 * Plan the bounded in-Wasm Boolean matcher for a literal pattern node value.
 * Never throws; a refusal is a value carrying the reason.
 */
export function planPatternMatchWat(rawLiteral: string): WatPatternPlan {
  const pattern = literalText(rawLiteral);
  const admitted = admitPatternCapability(pattern);
  if (!admitted.ok) {
    return { ok: false, reason: `literal pattern not admitted: ${admitted.code}: ${admitted.message}` };
  }
  const t = admitted.matcher.tables();
  if (t.slots > WAT_PATTERN_MAX_SLOTS) {
    return { ok: false, reason: `automaton has ${t.slots} slots; the in-Wasm bound is ${WAT_PATTERN_MAX_SLOTS}` };
  }
  let totalRanges = 0;
  for (const r of t.charRanges) totalRanges += r === null ? 0 : r.length;
  if (totalRanges > WAT_PATTERN_MAX_RANGES) {
    return { ok: false, reason: `automaton has ${totalRanges} char ranges; the in-Wasm bound is ${WAT_PATTERN_MAX_RANGES}` };
  }
  const perChar = admitted.capability.certificate.perCharWorkBound;
  const boundary = admitted.capability.certificate.boundaryWorkBound;
  if (!Number.isSafeInteger(perChar) || perChar < 0 || !Number.isSafeInteger(boundary) || boundary < 0) {
    return { ok: false, reason: "pattern certificate work bounds are not finite non-negative integers" };
  }
  if (boundary > WAT_PATTERN_MAX_CERTIFIED_WORK) {
    return { ok: false, reason: "boundary work exceeds the runtime policy budget" };
  }
  // Largest code-point count whose certified work stays within the budget.
  const maxCodePoints = perChar === 0
    ? Number.MAX_SAFE_INTEGER
    : Math.floor((WAT_PATTERN_MAX_CERTIFIED_WORK - boundary) / perChar);

  const W = t.words;
  const digest = createHash("sha256").update(pattern, "utf8").digest("hex").slice(0, 16);
  const helperName = `fungi_pattern_match_${digest}`;
  const L: string[] = [];
  L.push(`(local $n i32)`, `(local $i i32)`, `(local $u i32)`, `(local $cp i32)`, `(local $m i32)`);
  for (let w = 0; w < W; w++) L.push(`(local $c${w} i32)`);
  for (let w = 0; w < W; w++) L.push(`(local $x${w} i32)`);
  L.push(`;; D4 bounded in-Wasm matchesPattern (tri-regex Boolean verdict); pattern sha256 prefix ${digest}`);
  L.push(`(local.set $n (call $host___str_length (local.get $s)))`);
  // UTF-16 length >= code-point count, so n > 4096 already exceeds the subject bound.
  L.push(`(if (i32.gt_u (local.get $n) ${i32c(WAT_PATTERN_MAX_SUBJECT_UTF16)}) (then (unreachable)))`);
  L.push(
    `(block $u16done`,
    `  (loop $u16`,
    `    (br_if $u16done (i32.ge_s (local.get $i) (local.get $n)))`,
    `    (local.set $u (i32.add (local.get $u) (select (i32.const 2) (i32.const 1) (i32.gt_u (call $host___str_char_at (local.get $s) (local.get $i)) (i32.const 65535)))))`,
    `    (local.set $i (i32.add (local.get $i) (i32.const 1)))`,
    `    (br $u16)))`,
  );
  L.push(`(if (i32.gt_u (local.get $u) ${i32c(WAT_PATTERN_MAX_SUBJECT_UTF16)}) (then (unreachable)))`);
  if (maxCodePoints < WAT_PATTERN_MAX_SUBJECT_UTF16) {
    L.push(`(if (i32.gt_u (local.get $n) ${i32c(maxCodePoints)}) (then (unreachable)))`);
  }
  L.push(`(local.set $i (i32.const 0))`);
  L.push(`(local.set $m ${i32c(t.initStart.matched ? 1 : 0)})`);
  for (let w = 0; w < W; w++) L.push(`(local.set $c${w} ${i32c(t.initStart.bits[w] ?? 0)})`);
  L.push(`(block $done`, `  (loop $scan`);
  L.push(`    (br_if $done (local.get $m))`);
  L.push(`    (br_if $done (i32.ge_s (local.get $i) (local.get $n)))`);
  L.push(`    (local.set $cp (call $host___str_char_at (local.get $s) (local.get $i)))`);
  if (!t.anchoredStart) {
    const mid: string[] = [];
    for (let w = 0; w < W; w++) {
      const b = t.initMid.bits[w] ?? 0;
      if (b !== 0) mid.push(`(local.set $c${w} (i32.or (local.get $c${w}) ${i32c(b)}))`);
    }
    if (t.initMid.matched) mid.push(`(local.set $m (i32.const 1))`);
    if (mid.length > 0) {
      L.push(`    (if (i32.gt_s (local.get $i) (i32.const 0)) (then ${mid.join(" ")}))`);
    }
  }
  for (let w = 0; w < W; w++) L.push(`    (local.set $x${w} (i32.const 0))`);
  for (let s = 0; s < t.slots; s++) {
    const ranges = t.charRanges[s];
    if (ranges === null || ranges === undefined || ranges.length === 0) continue;
    const row = t.rows[s] ?? [];
    const acts: string[] = [];
    for (let w = 0; w < W; w++) {
      const b = row[w] ?? 0;
      if (b !== 0) acts.push(`(local.set $x${w} (i32.or (local.get $x${w}) ${i32c(b)}))`);
    }
    if (t.matchOnConsume[s] === true) acts.push(`(local.set $m (i32.const 1))`);
    if (acts.length === 0) continue;
    L.push(`    (if (i32.and ${bitTest(s)} ${rangeTest(ranges)}) (then ${acts.join(" ")}))`);
  }
  for (let w = 0; w < W; w++) L.push(`    (local.set $c${w} (local.get $x${w}))`);
  L.push(`    (local.set $i (i32.add (local.get $i) (i32.const 1)))`);
  L.push(`    (br $scan)))`);
  // End of input: resolve parked end-of-line assertions.
  const eolActs: string[] = [];
  for (let s = 0; s < t.slots; s++) {
    if (t.eolSlot[s] === true && t.eolResolves[s] === true) {
      eolActs.push(`(if ${bitTest(s)} (then (local.set $m (i32.const 1))))`);
    }
  }
  if (eolActs.length > 0) L.push(`(if (i32.eqz (local.get $m)) (then ${eolActs.join(" ")}))`);
  // Fresh empty match at end of input: index 0 = mid-input, 1 = at start.
  const [freshMid, freshStart] = t.endFreshMatches;
  if (freshStart) {
    L.push(`(if (i32.and (i32.eqz (local.get $m)) (i32.eqz (local.get $i))) (then (local.set $m (i32.const 1))))`);
  }
  if (freshMid && !t.anchoredStart) {
    L.push(`(if (i32.and (i32.eqz (local.get $m)) (i32.gt_s (local.get $i) (i32.const 0))) (then (local.set $m (i32.const 1))))`);
  }
  L.push(`(local.get $m)`);
  return { ok: true, helper: { helperName, body: L.join("\n") } };
}
