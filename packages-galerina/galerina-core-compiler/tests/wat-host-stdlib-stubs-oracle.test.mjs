/**
 * Targeted oracle for the type-directed host stubs added with the stdlib→WASM lowering:
 * Money currency constructors (__money_*), print/println I/O, redact, and range. Complements
 * wat-host-stdlib-oracle.test.mjs (#185) and wat-host-runtime-completeness.test.mjs (#169).
 *
 * WHY a direct oracle: the P9 parity tests are DIFFERENTIAL (interpreter == WASM), so a bug
 * present in BOTH backends passes silently. These pin each new host function's truth table
 * directly against `createHostRuntime`, independent of any backend — a real oracle.
 *
 * Tri-Pipe verdict: Binary-only (host stdlib bridge; no Hybrid/Photonic facet).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function host(observe) {
  const rt = L.createHostRuntime(observe);
  return { rt, fn: rt.imports.host };
}

// ── Money currency constructors (ISO 4217) ───────────────────────────────────
describe("host stub oracle: Money currency constructors (__money_*)", () => {
  // host import name → the ISO code it must tag. Mirrors STDLIB_HOST_CALL_MAP in wat-emitter.ts;
  // a drift between the emitter map and this table is exactly the bug this guards.
  const CASES = [
    ["__money_gbp", "GBP"], ["__money_eur", "EUR"], ["__money_usd", "USD"],
    ["__money_chf", "CHF"], ["__money_jpy", "JPY"], ["__money_cad", "CAD"],
    ["__money_aud", "AUD"], ["__money_nzd", "NZD"], ["__money_sgd", "SGD"],
    ["__money_hkd", "HKD"],
  ];

  it("each constructor tags its exact ISO code and carries the amount string", () => {
    for (const [name, code] of CASES) {
      const { rt, fn } = host();
      const amt = rt.internString("12.34");
      const h = fn[name](amt);
      assert.ok(h >= 0, `${name} must return a non-negative Money handle, got ${h}`);
      assert.deepEqual(rt.readMoney(h), { currency: code, amountStr: "12.34" },
        `${name} must store { ${code}, "12.34" }`);
    }
  });

  it("handles are fresh and distinct across constructions (registry indices)", () => {
    const { rt, fn } = host();
    const a = fn.__money_gbp(rt.internString("1.00"));
    const b = fn.__money_eur(rt.internString("2.00"));
    const c = fn.__money_gbp(rt.internString("3.00")); // same currency, DIFFERENT handle
    assert.equal(new Set([a, b, c]).size, 3, "each construction yields a distinct handle");
    assert.deepEqual(rt.readMoney(a), { currency: "GBP", amountStr: "1.00" });
    assert.deepEqual(rt.readMoney(b), { currency: "EUR", amountStr: "2.00" });
    assert.deepEqual(rt.readMoney(c), { currency: "GBP", amountStr: "3.00" });
  });

  it("fail-safe: an unknown amount handle yields '0.00', never a crash", () => {
    const { rt, fn } = host();
    const h = fn.__money_usd(9999); // no such string handle
    assert.deepEqual(rt.readMoney(h), { currency: "USD", amountStr: "0.00" });
  });
});

// ── I/O: print / println route through the observer (governed, auditable sink) ─
describe("host stub oracle: print/println (__print/__println)", () => {
  it("print emits the interned line to onOutput and returns 0", () => {
    const lines = [];
    const { rt, fn } = host({ onOutput: (s) => lines.push(s) });
    const h = rt.internString("hello");
    assert.equal(fn.__print(h), 0, "print returns 0 (void)");
    assert.deepEqual(lines, ["hello"], "the exact line reaches the governed sink, not the ambient console");
  });

  it("println appends a newline", () => {
    const lines = [];
    const { rt, fn } = host({ onOutput: (s) => lines.push(s) });
    fn.__println(rt.internString("world"));
    assert.deepEqual(lines, ["world\n"]);
  });

  it("fail-safe: an unknown handle emits the empty string, still returns 0", () => {
    const lines = [];
    const { fn } = host({ onOutput: (s) => lines.push(s) });
    assert.equal(fn.__print(4242), 0);
    assert.deepEqual(lines, [""]);
  });
});

// ── Privacy: redact ───────────────────────────────────────────────────────────
describe("host stub oracle: redact (__redact)", () => {
  it("redact(h) is -2 — distinct from -1 (None) and from any ≥0 handle", () => {
    const { rt, fn } = host();
    const h = rt.internString("secret");
    assert.ok(h >= 0, "a real string handle is non-negative");
    assert.equal(fn.__redact(h), -2, "redacted sentinel is -2");
    assert.notEqual(fn.__redact(h), -1, "not the None sentinel");
  });
});

// ── Collections: range ────────────────────────────────────────────────────────
describe("host stub oracle: range (__range)", () => {
  it("range(2,7) → [2,3,4,5,6] with length 5 (exclusive upper bound, step 1)", () => {
    const { rt, fn } = host();
    const h = fn.__range(2, 7);
    assert.deepEqual([...rt.readArray(h)], [2, 3, 4, 5, 6]);
    assert.equal(fn.__array_length(h), 5, "length agrees with contents");
  });

  it("empty when lo >= hi (no negative-length array)", () => {
    const { rt, fn } = host();
    assert.deepEqual([...rt.readArray(fn.__range(5, 5))], [], "lo == hi → empty");
    assert.deepEqual([...rt.readArray(fn.__range(7, 2))], [], "lo > hi → empty, not reversed");
  });
});

// ── Map ↔ host completeness for the new names (the #169 class, direct) ─────────
describe("host stub oracle: createHostRuntime provides every new stdlib host import", () => {
  it("all Money/print/redact/range host functions exist", () => {
    const { fn } = host();
    const required = [
      "__money_gbp", "__money_eur", "__money_usd", "__money_chf", "__money_jpy",
      "__money_cad", "__money_aud", "__money_nzd", "__money_sgd", "__money_hkd",
      "__print", "__println", "__redact", "__range",
    ];
    const missing = required.filter((n) => typeof fn[n] !== "function");
    assert.deepEqual(missing, [], `createHostRuntime is missing host imports: ${missing.join(", ")}`);
  });
});
