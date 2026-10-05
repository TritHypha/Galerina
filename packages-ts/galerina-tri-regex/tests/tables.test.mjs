// tables(): a frozen, non-aliasing snapshot of the compiled automaton, for
// ahead-of-time lowering. A Boolean re-simulation from the snapshot alone must
// equal test().verdict === 1 on every row (the contract a lowering relies on).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, NO_CHAR_RANGES } from "../dist/index.js";

function bit(bits, s) { return ((bits[s >> 5] >>> (s & 31)) & 1) === 1; }

function inRanges(cp, ranges) {
  for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
  return false;
}

function simulate(t, input) {
  let cur = [...t.initStart.bits];
  let matched = t.initStart.matched;
  let pos = 0;
  for (const ch of input) {
    if (matched) break;
    const cp = ch.codePointAt(0);
    if (pos > 0 && !t.anchoredStart) {
      cur = cur.map((w, i) => (w | t.initMid.bits[i]) >>> 0);
      if (t.initMid.matched) matched = true;
    }
    const nxt = new Array(t.words).fill(0);
    for (let s = 0; s < t.slots; s++) {
      if (!bit(cur, s) || !inRanges(cp, t.charRanges[s])) continue;
      for (let w = 0; w < t.words; w++) nxt[w] = (nxt[w] | t.rows[s][w]) >>> 0;
      if (t.matchOnConsume[s]) matched = true;
    }
    cur = nxt;
    pos++;
  }
  if (!matched) {
    for (let s = 0; s < t.slots; s++) if (bit(cur, s) && t.eolSlot[s] && t.eolResolves[s]) matched = true;
  }
  if (!matched && (pos === 0 || !t.anchoredStart) && t.endFreshMatches[pos === 0 ? 1 : 0]) matched = true;
  return matched;
}

const PATTERNS = ["^[a-z]+$", "abc", "a+b", "^$", "", "x*", "colou?r", "^(?:ab|cd)+$", "foo$", "^foo", ".", "a.c", "[^a]", "a$|^b", "(?:a|b)*c", "a{0,5}b"];
const SUBJECTS = ["", "a", "abc", "xabcx", "Hello", "hello", "aab", "colour", "color", "foo", "barfoo", "foobar", "a\nc", "a\u{1F600}c", "\u{1F600}", "abab", "ba", "ab", "bbbc", "aaaaab", "aaaaaab"];

test("tables() Boolean re-simulation equals test() verdict", () => {
  let rows = 0;
  for (const p of PATTERNS) {
    const r = compile(p);
    assert.equal(r.ok, true, p);
    const t = r.matcher.tables();
    for (const s of SUBJECTS) {
      assert.equal(simulate(t, s), r.matcher.test(s).verdict === 1, `${p} ${JSON.stringify(s)}`);
      rows++;
    }
  }
  assert.equal(rows, PATTERNS.length * SUBJECTS.length);
});

test("tables() is frozen and never aliases the matcher", () => {
  const r = compile("^[a-z]+$");
  assert.equal(r.ok, true);
  const t = r.matcher.tables();
  assert.equal(Object.isFrozen(t), true);
  for (const k of ["charRanges", "eolSlot", "rows", "matchOnConsume", "eolResolves", "endFreshMatches"]) {
    assert.equal(Object.isFrozen(t[k]), true, k);
  }
  assert.throws(() => { t.rows[0][0] = 0xffffffff; }, TypeError);
  assert.notEqual(r.matcher.tables(), t, "each call returns a fresh copy");
  assert.equal(r.matcher.test("hello").verdict, 1);
  assert.equal(r.matcher.test("Hello").verdict, -1);
});

test("charRanges is never null: non-consuming slots carry the frozen NO_CHAR_RANGES sentinel", () => {
  assert.equal(Object.isFrozen(NO_CHAR_RANGES), true);
  assert.equal(NO_CHAR_RANGES.length, 0);
  for (const pattern of ["^[a-z]+$", "a|b$", "^(ab)*c", "x$", "[0-9]+"]) {
    const r = compile(pattern);
    assert.equal(r.ok, true, pattern);
    const t = r.matcher.tables();
    assert.equal(t.charRanges.length, t.slots, pattern);
    for (let s = 0; s < t.slots; s++) {
      const ranges = t.charRanges[s];
      assert.ok(Array.isArray(ranges), `${pattern} slot ${s} is an array`);
      assert.equal(Object.isFrozen(ranges), true);
      if (t.eolSlot[s]) assert.equal(ranges, NO_CHAR_RANGES, `${pattern} eol slot ${s} uses the sentinel`);
      if (ranges.length === 0) assert.equal(ranges, NO_CHAR_RANGES, `${pattern} empty slot ${s} is the shared sentinel`);
    }
  }
});
