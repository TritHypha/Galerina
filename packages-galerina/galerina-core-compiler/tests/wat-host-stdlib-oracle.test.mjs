/**
 * #185 — direct truth-table oracle for the #160 type-directed WASM host functions.
 *
 * The P9 parity tests assert interpreter == WASM (differential), so a bug present in
 * BOTH backends would pass silently. These tests pin each host function's truth table
 * directly against `createHostRuntime`, independent of the interpreter — a real oracle.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function host() {
  const rt = L.createHostRuntime();
  return { rt, fn: rt.imports.host };
}

describe("#185 host stdlib oracle: string equality (__str_eq)", () => {
  it("equal VALUES at distinct handles → 1; unequal → 0", () => {
    const { rt, fn } = host();
    const a = rt.internString("abc");
    const b = rt.internString("abc");   // same value, DIFFERENT handle
    const c = rt.internString("xyz");
    assert.notEqual(a, b, "interning does not dedupe — handles differ");
    assert.equal(fn.__str_eq(a, b), 1, "equal values compare equal by value");
    assert.equal(fn.__str_eq(a, c), 0, "unequal values compare unequal");
    assert.equal(fn.__str_eq(a, a), 1, "reflexive");
  });
});

describe("#185 host stdlib oracle: Option unwrap (__unwrap_or)", () => {
  it("Some(v>=0) → v; None(-1) → default", () => {
    const { fn } = host();
    assert.equal(fn.__unwrap_or(5, 99), 5, "Some keeps the value");
    assert.equal(fn.__unwrap_or(0, 99), 0, "Some(0) is still Some");
    assert.equal(fn.__unwrap_or(-1, 99), 99, "None falls back to the default");
  });
});

describe("#185 host stdlib oracle: char→string (__char_to_string)", () => {
  it("code point → interned single-char string; negative → empty", () => {
    const { rt, fn } = host();
    const hA = fn.__char_to_string(65);
    assert.equal(rt.readString(hA), "A");
    const hZ = fn.__char_to_string(122);
    assert.equal(rt.readString(hZ), "z");
    const hNone = fn.__char_to_string(-1);
    assert.equal(rt.readString(hNone), "", "the None sentinel yields the empty string");
  });
});

describe("#185 host stdlib oracle: string concat (__str_concat)", () => {
  it("concatenates VALUES into a fresh interned handle", () => {
    const { rt, fn } = host();
    const a = rt.internString("foo");
    const b = rt.internString("bar");
    const h = fn.__str_concat(a, b);
    assert.equal(rt.readString(h), "foobar");
  });
});

describe("#185 host stdlib oracle: Array<String> membership (__array_contains_str)", () => {
  it("by-value membership over interned string handles", () => {
    const { rt, fn } = host();
    const arr = fn.__array_create();
    fn.__array_append(arr, rt.internString("let"));
    fn.__array_append(arr, rt.internString("flow"));
    fn.__array_append(arr, rt.internString("pure"));
    // A needle with the SAME value but a fresh handle must still be found.
    assert.equal(fn.__array_contains_str(arr, rt.internString("flow")), 1, "found by value");
    assert.equal(fn.__array_contains_str(arr, rt.internString("xyz")), 0, "absent");
  });
});

describe("#185 host stdlib oracle: Array length/count (__array_length)", () => {
  it("counts appended elements (#161 Array.count routes here)", () => {
    const { fn } = host();
    const arr = fn.__array_create();
    assert.equal(fn.__array_length(arr), 0);
    fn.__array_append(arr, 10);
    fn.__array_append(arr, 20);
    assert.equal(fn.__array_length(arr), 2);
  });
});

describe("#170 host stdlib oracle: code-point indexing/length (non-BMP)", () => {
  it("__str_count/__str_char_at index by code point, not UTF-16 unit", () => {
    const { rt, fn } = host();
    const h = rt.internString("a\u{1F600}b"); // 'a', 😀 (U+1F600, surrogate pair), 'b'
    assert.equal(fn.__str_count(h), 3, "3 code points, not 4 UTF-16 units");
    assert.equal(fn.__str_length(h), 3, "length agrees with count");
    assert.equal(fn.__str_char_at(h, 0), 0x61, "index 0 → 'a'");
    assert.equal(fn.__str_char_at(h, 1), 0x1F600, "index 1 → 😀 full code point (not a lone surrogate)");
    assert.equal(fn.__str_char_at(h, 2), 0x62, "index 2 → 'b'");
    assert.equal(fn.__str_char_at(h, 3), -1, "out of range → None sentinel");
  });
});

describe("#185 host stdlib oracle: char classifiers (#169)", () => {
  it("isUpper / isLower / isWhitespace / isLetter / isDigit truth tables", () => {
    const { fn } = host();
    assert.equal(fn.__char_is_upper(65), 1, "'A' is upper");
    assert.equal(fn.__char_is_upper(97), 0, "'a' is not upper");
    assert.equal(fn.__char_is_lower(97), 1, "'a' is lower");
    assert.equal(fn.__char_is_lower(65), 0, "'A' is not lower");
    assert.equal(fn.__char_is_whitespace(32), 1, "space is whitespace");
    assert.equal(fn.__char_is_whitespace(65), 0, "'A' is not whitespace");
    assert.equal(fn.__char_is_letter(65), 1, "'A' is a letter");
    assert.equal(fn.__char_is_digit(53), 1, "'5' is a digit");
    assert.equal(fn.__char_is_digit(65), 0, "'A' is not a digit");
    // digit is not a letter and vice versa
    assert.equal(fn.__char_is_letter(53), 0, "'5' is not a letter");
  });
});
