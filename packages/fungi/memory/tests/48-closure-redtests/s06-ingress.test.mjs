// S6 (1413-KG01, KG05, KG06): ingress trust seams on POST /auth/verify.
// KG-06: readForeignSafeInteger must read the integer, not trust the host tag.
// KG-05: 64-bit values cross as a tagged length-prefixed buffer (0x01 i64 / 0x02 u64, length 8, LE);
//        the legacy i32 --invoke path refuses |x| > 2147483647, never truncates or wraps.
// KG-01: RFC 3986 host normaliser contract with closed output tags; refusals map to UNKNOWN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { red, flatten, withUnit, invoke, unitText, evidence } from "./harness.mjs";

test("S6 guard (green today): classTag outside 0..10 returns 11 Unlisted", () => {
  withUnit(flatten(["c-boundary"]), (f) => {
    for (const tag of [-1, 11, 12, 2147483647]) {
      assert.equal(invoke(f, "readForeignSafeInteger", [tag, 5]).value, 11, "tag " + tag);
    }
  });
});

test("S6 KG-06: readForeignSafeInteger reads its integer argument", red("S6", "KG-06 readForeignSafeInteger must read the integer"), () => {
  const t = unitText("c-boundary");
  const start = t.indexOf("pure flow readForeignSafeInteger");
  const open = t.indexOf("\n}\n{\n", start);
  const close = t.indexOf("\n}\n", open + 4);
  assert.ok(start >= 0 && open > start && close > open, "flow body located");
  const flowBody = t.slice(open + 4, close);
  assert.match(flowBody, /\binteger\b/, "the flow body never reads `integer`");
});

test("S6 KG-06: a bounded helper admits tag 0 only inside the declared call-site domain", red("S6", "KG-06 tag must agree with the value"), () => {
  assert.match(unitText("c-boundary"), /pure flow readForeignBoundedInteger\(\s*classTag: Int,\s*integer: Int,\s*lo: Int,\s*hi: Int/, "readForeignBoundedInteger(classTag, integer, lo, hi) missing");
  withUnit(flatten(["c-boundary"]), (f) => {
    const lo = 0;
    const hi = 16384;
    assert.equal(invoke(f, "readForeignBoundedInteger", [0, lo, lo, hi]).value, 0, "lo admitted");
    assert.equal(invoke(f, "readForeignBoundedInteger", [0, hi, lo, hi]).value, 0, "hi admitted");
    assert.equal(invoke(f, "readForeignBoundedInteger", [0, hi + 1, lo, hi]).value, 8, "hi+1 refuses 8");
    assert.equal(invoke(f, "readForeignBoundedInteger", [0, -1, lo, hi]).value !== 0, true, "lo-1 refuses");
    assert.equal(invoke(f, "readForeignBoundedInteger", [8, 5, lo, hi]).value, 8, "tag 8 with in-range value is never upgraded to Ok");
    assert.equal(invoke(f, "readForeignBoundedInteger", [0, -2147483648, lo, hi]).value !== 0, true, "i32 min refuses");
  });
});

test("S6 KG-06: classTag 0 with i32 min (outside the symmetric documented domain) refuses", red("S6", "KG-06 range check"), () => {
  withUnit(flatten(["c-boundary"]), (f) => {
    assert.notEqual(invoke(f, "readForeignSafeInteger", [0, -2147483648]).value, 0);
  });
});

test("S6 KG-05: the legacy i32 --invoke path refuses values wider than 32 bits instead of truncating", red("S6", "KG-05 64-bit refusal, never a wrapped value"), () => {
  withUnit(flatten(["c-boundary"]), (f) => {
    for (const wide of ["4294967296", "4294967297", "9007199254740993", "9223372036854775807", "-9223372036854775808", "2147483648"]) {
      const r = invoke(f, "readForeignLength", [0, wide]);
      const refusedAtHost = r.status !== 0;
      const typed8 = r.status === 0 && r.value === 8;
      assert.equal(refusedAtHost || typed8, true, wide + " gave status " + r.status + " value " + r.value + " (must refuse or classTag 8)");
    }
  });
});

test("S6 KG-05: non-integer CLI values refuse instead of truncating", red("S6", "KG-05 never materialise a truncated intermediate"), () => {
  withUnit(flatten(["c-boundary"]), (f) => {
    const r = invoke(f, "readForeignLength", [0, "1.5"]);
    assert.equal(r.status !== 0 || r.value === 7, true, "1.5 gave " + r.value);
  });
});

test("S6 KG-05: a tagged length-prefixed 64-bit buffer decoder exists and refuses malformed buffers before conversion", red("S6", "KG-05 tagged buffer 0x01/0x02, length 8, LE"), () => {
  const all = ["c-boundary", "body-reader", "release-commit-point", "monotonic-time", "secret-arena"].map(unitText).join("\n");
  assert.match(all, /pure flow readForeignWide[A-Za-z]*\(/, "no tagged-buffer decode flow (readForeignWide*) in the ingress units");
  const ev = evidence("kg05/decision.md");
  assert.notEqual(ev, null, "evidence/kg05/decision.md missing");
  for (const r of ["R5a", "R5b"]) assert.ok(ev.includes(r), "rejected option " + r + " recorded");
});

const KG01_REFUSE = [
  "/auth//verify/../verify%2F?x=1", "/auth/verify%2f", "/auth/verify%2F", "/auth\\verify", "/../auth/verify",
  "/auth/verify%00", "/auth/v%C3%A9rify", "/auth/v\u00e9rify", "/auth/verify%C0%AF", "/auth/verify%zz",
  "/auth/verify%5C", "/auth/verify%3F", "/auth/verify%23", "/auth/verify%26", "/auth/verify?v=1&v=2",
];

test("S6 KG-01: the host normaliser contract maps every RFC 3986 refusal vector to UNKNOWN", red("S6", "KG-01 path-normalisation refusals (RFC 3986)"), () => {
  const t = evidence("kg01/host-contract.md");
  assert.notEqual(t, null, "evidence/kg01/host-contract.md missing");
  assert.match(t, /RFC 3986/);
  assert.match(t, /5\.2\.4/);
  for (const v of KG01_REFUSE) {
    const row = t.split("\n").find((l) => l.startsWith("|") && l.includes("`" + v + "`"));
    assert.ok(row, "vector row missing: " + v);
    assert.match(row, /UNKNOWN/, "vector must be UNKNOWN: " + v);
  }
  const rows = t.split("\n").filter((l) => /^\|\s*`/.test(l));
  assert.ok(rows.length >= 40, "at least 40 vectors, found " + rows.length);
  for (const r of rows) {
    if (/UNKNOWN/.test(r)) assert.equal(/\b(PUBLIC|tag [7-9])\b/.test(r), false, "a refusing vector can never be public: " + r);
  }
});

test("S6 guard (green today): serve-gate keeps unnormalisable (6) and unlisted path tags protected", () => {
  withUnit(flatten(["c-boundary", "serve-gate"]), (f) => {
    const six = invoke(f, "pathProtection", [6]);
    const unl = invoke(f, "pathProtection", [99]);
    const pub = invoke(f, "pathProtection", [7]);
    assert.equal(six.status, 0);
    assert.notEqual(six.value, pub.value, "tag 6 must not classify like public tag 7");
    assert.notEqual(unl.value, pub.value, "unlisted tag must not classify like public tag 7");
  });
});