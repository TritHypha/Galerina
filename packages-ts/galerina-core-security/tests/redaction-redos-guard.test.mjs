import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_REDACTION_RULES,
  MAX_REDACTION_PATTERN_LENGTH,
  findUnsafeRedactionPattern,
  redactText,
  validateRedactionRule,
} from "../dist/index.js";

const rule = (pattern) => ({
  name: "policy-rule",
  pattern,
  flags: "g",
  replacement: "SecureString(redacted)",
  classification: "secret",
});

describe("redaction rule ReDoS guard (owner may revisit)", () => {
  it("accepts every default redaction rule", () => {
    for (const r of DEFAULT_REDACTION_RULES) {
      assert.equal(findUnsafeRedactionPattern(r.pattern), "", r.name);
      assert.deepEqual(validateRedactionRule(r), [], r.name);
    }
  });

  it("refuses nested quantifiers, repeated alternation and backreferences", () => {
    const refused = {
      "(a+)+b": "nested quantifier",
      "(a*)*b": "nested quantifier",
      "(x{2,})*": "nested quantifier",
      "((ab)+)+": "nested quantifier",
      "(a|aa)+$": "repeated alternation",
      "(?:a|b)*c": "repeated alternation",
      "(a|b){2,}": "repeated alternation",
      "(a)\\1": "numeric backreference",
    };
    for (const [pattern, reason] of Object.entries(refused)) {
      assert.equal(findUnsafeRedactionPattern(pattern), reason, pattern);
      const codes = validateRedactionRule(rule(pattern)).map((d) => d.code);
      assert.ok(codes.includes("Galerina_SECURITY_REDACTION_RULE_UNSAFE_PATTERN"), pattern);
    }
  });

  it("refuses an oversized pattern", () => {
    const pattern = "a".repeat(MAX_REDACTION_PATTERN_LENGTH + 1);
    assert.match(findUnsafeRedactionPattern(pattern), /exceeds/);
    assert.equal(findUnsafeRedactionPattern("a".repeat(MAX_REDACTION_PATTERN_LENGTH)), "");
  });

  it("keeps ordinary bounded shapes allowed", () => {
    for (const pattern of ["^[a-z]+$", "a+b+", "(ab)?c", "[(+]+", "\\(a+\\)+", "(?:x|y)?z", "(a+)?b", "a{3}", "[\\d]{2,4}"]) {
      assert.equal(findUnsafeRedactionPattern(pattern), "", pattern);
    }
  });

  it("fails closed in redactText without running the unsafe pattern", () => {
    const evil = `${"a".repeat(24)}!`;
    const started = Date.now();
    const result = redactText(evil, [rule("(a+)+$")]);
    assert.ok(Date.now() - started < 1000);
    assert.equal(result.text, "SecureString(redacted-redaction-rule-error)");
    assert.equal(result.redacted, true);
    assert.ok(result.diagnostics.some((d) => d.code === "Galerina_SECURITY_REDACTION_RULE_UNSAFE_PATTERN"));
  });

  it("throws in throw mode and skips the rule in skip mode", () => {
    assert.throws(() => redactText("x", [rule("(a|b)*")], { onInvalidRule: "throw" }));
    const skipped = redactText("token=abc", [rule("(a|b)*"), DEFAULT_REDACTION_RULES[1]], { onInvalidRule: "skip" });
    assert.equal(skipped.text.includes("abc"), false);
  });
});
