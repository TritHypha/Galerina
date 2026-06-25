// =============================================================================
// numeric-lowering.ts — shared numeric type/literal utilities (verified i64-lowering plan, Step 0).
//
// numericBaseType: the SINGLE annotation-base stripper consulted by the value-state gate + (soon) the
// emitter / interpreter / type-checker. parseI64Literal: the SINGLE exact-bigint literal parser, so the
// I64_MIN/I64_MAX edges can never diverge between tiers (a divergence = silent 64->32 truncation, CWE-704).
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { numericBaseType, parseI64Literal, isI64LiteralError } from "../dist/numeric-lowering.js";

describe("numericBaseType: annotation base extraction", () => {
  it("returns the bare type unchanged", () => {
    assert.equal(numericBaseType("Int64"), "Int64");
    assert.equal(numericBaseType("UInt64"), "UInt64");
    assert.equal(numericBaseType("Int"), "Int");
  });
  it("strips leading governance/safety qualifiers", () => {
    assert.equal(numericBaseType("protected Int64"), "Int64");
    assert.equal(numericBaseType("redacted UInt64"), "UInt64");
    assert.equal(numericBaseType("unsafe Int64"), "Int64");
    assert.equal(numericBaseType("safe Int64"), "Int64");
  });
  it("returns the GENERIC head, not the inner arg (Tensor<Int64> is an opaque handle, base 'Tensor')", () => {
    assert.equal(numericBaseType("Tensor<Int64,[4]>"), "Tensor");
    assert.equal(numericBaseType("Array<UInt64>"), "Array");
  });
  it("tolerates surrounding whitespace + degrades to empty on garbage", () => {
    assert.equal(numericBaseType("  Int64  "), "Int64");
    assert.equal(numericBaseType(""), "");
    assert.equal(numericBaseType("<<<"), "");
  });
});

describe("parseI64Literal: exact decimal parsing", () => {
  it("parses small + zero", () => {
    assert.equal(parseI64Literal("5"), 5n);
    assert.equal(parseI64Literal("0"), 0n);
  });
  it("is EXACT above 2^53 where a JS number would round", () => {
    // Number(9007199254740993) === 9007199254740992 (loses the low bit); BigInt keeps it.
    assert.equal(parseI64Literal("9007199254740993"), 9007199254740993n);
  });
  it("accepts I64_MAX and rejects one past it", () => {
    assert.equal(parseI64Literal("9223372036854775807"), 9223372036854775807n);
    assert.equal(parseI64Literal("9223372036854775808"), "OutOfRange"); // 2^63, one past max
  });
  it("accepts I64_MIN ONLY with its sign (magnitude 2^63 alone is OutOfRange)", () => {
    assert.equal(parseI64Literal("-9223372036854775808"), -9223372036854775808n);
    assert.equal(parseI64Literal("9223372036854775808"), "OutOfRange");
    assert.equal(parseI64Literal("-9223372036854775809"), "OutOfRange"); // one past min
  });
  it("handles an optional leading + sign", () => {
    assert.equal(parseI64Literal("+5"), 5n);
    assert.equal(parseI64Literal("-5"), -5n);
  });
});

describe("parseI64Literal: separators + radix prefixes", () => {
  it("strips _ digit-group separators", () => {
    assert.equal(parseI64Literal("1_000_000"), 1000000n);
    assert.equal(parseI64Literal("-9_223_372_036_854_775_808"), -9223372036854775808n);
  });
  it("honors 0x / 0o / 0b", () => {
    assert.equal(parseI64Literal("0xff"), 255n);
    assert.equal(parseI64Literal("0xFF"), 255n);
    assert.equal(parseI64Literal("0o17"), 15n);
    assert.equal(parseI64Literal("0b101"), 5n);
    assert.equal(parseI64Literal("-0x10"), -16n);
  });
});

describe("parseI64Literal: fail-closed on non-integers", () => {
  it("rejects fractional / scientific forms (an Int64 slot is not a Float slot)", () => {
    assert.equal(parseI64Literal("3.5"), "NotIntegral");
    assert.equal(parseI64Literal("1e5"), "NotIntegral");
    assert.equal(parseI64Literal("1.0"), "NotIntegral");
  });
  it("rejects garbage / empty / partial-radix", () => {
    assert.equal(parseI64Literal("abc"), "NotIntegral");
    assert.equal(parseI64Literal(""), "NotIntegral");
    assert.equal(parseI64Literal("   "), "NotIntegral");
    assert.equal(parseI64Literal("0x"), "NotIntegral");
    assert.equal(parseI64Literal("12x"), "NotIntegral");
    assert.equal(parseI64Literal("0b12"), "NotIntegral"); // 2 is not a binary digit
  });
  it("NEVER uses parseInt (which would accept a trailing-garbage prefix)", () => {
    // parseInt('123abc') === 123; parseI64Literal must REJECT it, not silently take the prefix.
    assert.equal(parseI64Literal("123abc"), "NotIntegral");
  });
});

describe("isI64LiteralError guard", () => {
  it("discriminates success from the two fail-closed reasons", () => {
    assert.equal(isI64LiteralError(parseI64Literal("5")), false);
    assert.equal(isI64LiteralError(parseI64Literal("3.5")), true);
    assert.equal(isI64LiteralError(parseI64Literal("9223372036854775808")), true);
  });
});
