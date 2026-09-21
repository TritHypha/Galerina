// Verdict + span semantics over the certified subset. Spans are leftmost-earliest
// first-completion in CODE POINTS (declared — not POSIX-longest).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, compileCapability, findAll } from "../dist/index.js";

const m = (pattern) => {
  const r = compile(pattern);
  assert.equal(r.ok, true, `compile(${JSON.stringify(pattern)}): ${r.ok ? "" : r.reason}`);
  return r;
};
const hit = (pattern, input, span) => {
  const out = m(pattern).matcher.test(input);
  assert.equal(out.verdict, 1, `${JSON.stringify(pattern)} should match ${JSON.stringify(input)}`);
  if (span) assert.deepEqual([...out.span], span, `${JSON.stringify(pattern)} span on ${JSON.stringify(input)}`);
};
const miss = (pattern, input) => {
  const out = m(pattern).matcher.test(input);
  assert.equal(out.verdict, -1, `${JSON.stringify(pattern)} should NOT match ${JSON.stringify(input)}`);
};

test("literals + spans", () => {
  hit("abc", "abc", [0, 3]);
  hit("abc", "xxabcy", [2, 5]);
  miss("abc", "ab");
  miss("abc", "acb");
});

test("alternation + grouping + precedence", () => {
  hit("cat|dog", "hotdog", [3, 6]);
  hit("ab|cd", "cd", [0, 2]);
  hit("(a|b)c", "bc", [0, 2]);
  hit("a(b|)c", "ac", [0, 2]); // empty alt branch
  miss("cat|dog", "cow");
});

test("classes: ranges, negation, escapes-in-class", () => {
  hit("[a-c]+", "zzabca", [2, 6]);
  hit("[^a-c]", "a b", [1, 2]); // the space
  hit("[\\d]+", "ab123", [2, 5]);
  hit("[a\\-z]", "-", [0, 1]);  // escaped dash is a literal
  hit("[\\]]", "]", [0, 1]);    // escaped bracket
  miss("[a-c]", "d");
});

test("dot excludes newline", () => {
  hit("a.c", "abc", [0, 3]);
  miss("a.c", "a\nc");
});

test("anchors", () => {
  hit("^ab", "ab", [0, 2]);
  miss("^ab", "xab");
  hit("ab$", "xab", [1, 3]);
  miss("ab$", "abx");
  hit("^ab$", "ab", [0, 2]);
  miss("^ab$", "aab");
  hit("$", "abc", [3, 3]);
  hit("^$", "", [0, 0]);
  miss("^$", "a");
  miss("a$b", "ab"); // an eol mid-pattern can never be satisfied
});

test("quantifiers incl. bounded {n,m}", () => {
  hit("a*", "", [0, 0]);
  hit("a*", "bbb", [0, 0]); // empty match at 0 — standard semantics
  miss("a+", "");
  hit("a+", "baa", [1, 3]);
  hit("a?b", "b", [0, 1]);
  hit("a{2}", "aa", [0, 2]);
  miss("a{2}", "a");
  hit("a{2,}", "aaa", [0, 3]);
  miss("a{2,}", "a");
  hit("a{1,3}b", "aaab", [0, 4]);
  hit("(ab){2}", "abab", [0, 4]);
  miss("(ab){2}", "aba");
  hit("(a|b){3}", "aba", [0, 3]);
});

test("epsilon-loop shapes terminate", () => {
  hit("(a?)*", "b", [0, 0]);
  miss("(a?)*x", "aaab");
  hit("(a*)*x", "aax", [0, 3]);
});

test("unicode: astral code points are single units", () => {
  hit("\u{1F600}+", "\u{1F600}\u{1F600}", [0, 2]); // spans count CODE POINTS
  hit(".", "\u{1F600}", [0, 1]);
  hit("\\u{1F600}", "\u{1F600}", [0, 1]);
  hit("[\u{1F600}-\u{1F64F}]", "\u{1F60A}", [0, 1]);
  miss("A", "a"); // no flags in v0.1 — case-sensitive, by design
});

test("typed capability carries the certificate and bounded findAll refuses truncation", () => {
  const capability = compileCapability("a+");
  assert.equal(capability.ok, true);
  if (!capability.ok) return;
  assert.equal(capability.capability.kind, "triregex-pattern");
  assert.equal(capability.capability.engineVersion, "0.1.1");
  const found = findAll(capability.capability, "a ba aa", { maxMatches: 4 });
  assert.equal(found.ok, true);
  if (found.ok) assert.deepEqual(found.spans.map((span) => [...span]), [[0, 1], [3, 4], [5, 7]]);
  const refused = findAll(capability.capability, "a a a", { maxMatches: 1, maxCertifiedWorkUnits: 1_000_000 });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.code, "TPRX-BUDGET");
});

test("typed capability refuses invalid findAll budgets without running", () => {
  const capability = compileCapability("a");
  assert.equal(capability.ok, true);
  if (!capability.ok) return;
  for (const options of [{ maxMatches: 0 }, { maxSubjectCodePoints: Number.NaN }, { maxCertifiedWorkUnits: Number.POSITIVE_INFINITY }]) {
    const result = findAll(capability.capability, "a", options);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TPRX-BUDGET");
  }
});

test("escapes", () => {
  hit("\\n", "\n", [0, 1]);
  hit("\\t", "\t", [0, 1]);
  hit("\\x41", "A", [0, 1]);
  hit("\\u0041", "A", [0, 1]);
  hit("\\.", ".", [0, 1]);
  miss("\\.", "a");
  hit("\\d+", "x42", [1, 3]);
  hit("\\w+", "!ab_9!", [1, 5]);
  hit("\\s", " ", [0, 1]);
  hit("\\D", "a", [0, 1]);
  miss("\\D", "5");
});
