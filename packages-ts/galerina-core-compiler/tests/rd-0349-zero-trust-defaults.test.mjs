// rd-0349-zero-trust-defaults.test.mjs — RD-0349 open owner decisions, each pinned to its
// zero-trust, security-first default (owner request 2026-10-04: "get them done").
// Every default below is labelled: zero-trust default, owner may revisit.
//
//   D1 metals     — precious metals (XAU/XAG/XPT/XPD) are NEVER Money. They wait for Commodity<U>
//                   with a SOURCED scale policy; until then they refuse everywhere (compile + runtime).
//   D2 crypto     — the curated crypto set is EMPTY: no ticker (BTC/ETH/USDT/USDC) is admitted as
//                   Money, and Crypto<T> does not exist until a pinned, DTI-carrying registry snapshot
//                   is admitted by the owner.
//   D3 rounding   — no default mode and no per-contract override: every inexact Money step names its
//                   mode at the call site; aliases ("HALF_EVEN", "bankers") refuse rather than guess.
//   D4 ISIN       — no Security<ISIN> (track, don't build); an ISIN is never a currency tag.
//   D5 names      — the names of the planned value-unit authority types (Commodity, Crypto, Security)
//                   are reserved NOW, so a user record cannot pose as the governed type before it ships.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const errors = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "rd-0349-zero-trust.fungi");
  const parseErrors = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (parseErrors.length > 0) return parseErrors;
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};
const codes = (src) => errors(src).map((d) => d.code);
const param = (type) => `pure flow f(x: ${type}) -> Int contract { effects {} } { return 0 }`;

const run = (body, returnType = "Money") => {
  const prog = L.parseProgram(`@version 1\npure flow probe() -> ${returnType} contract { effects {} } {\n${body}\n}`, "rd-0349-zero-trust-run.fungi");
  L.resolveSymbols(prog.ast);
  return L.executeFlow("probe", new Map(), prog.ast, prog.flows);
};
const trap = async (body) => {
  const result = await run(body);
  assert.equal(result.value.__tag, "runtimeError", JSON.stringify(result.value));
  return result.value.message;
};

describe("RD-0349 D1 metals — never Money (zero-trust default, owner may revisit)", () => {
  for (const metal of ["XAU", "XAG", "XPT", "XPD"]) {
    it(`Money<${metal}> is refused at compile time (FUNGI-TYPE-032)`, () => {
      assert.ok(codes(param(`Money<${metal}>`)).includes("FUNGI-TYPE-032"));
    });
    it(`Money.of("1", "${metal}") is refused at runtime`, async () => {
      assert.match(await trap(`  return Money.of("1", "${metal}")`), /unknown currency code/);
    });
  }
  it("control: an ISO-4217 fiat currency is still admitted", () => {
    assert.deepEqual(codes(param("Money<GBP>")), []);
  });
});

describe("RD-0349 D2 crypto — curated set is EMPTY (zero-trust default, owner may revisit)", () => {
  for (const ticker of ["BTC", "ETH", "USDT", "USDC"]) {
    it(`Money<${ticker}> is refused at compile time and Money.of refuses it at runtime`, async () => {
      assert.ok(codes(param(`Money<${ticker}>`)).includes("FUNGI-TYPE-032"));
      assert.match(await trap(`  return Money.of("1", "${ticker}")`), /unknown currency code/);
    });
  }
  it("Crypto<T> is not a type (no admitted registry)", () => {
    assert.ok(codes(param("Crypto<BTC>")).includes("FUNGI-TYPE-001"));
  });
});

describe("RD-0349 D3 rounding — explicit per call, no default, no override (zero-trust default, owner may revisit)", () => {
  it("a Money multiply without a mode refuses (MissingRoundMode)", async () => {
    assert.equal(await trap('  return Money.gbp("1.00").multiply(Decimal("1.5"))'), "MissingRoundMode");
  });
  it("a Money divideBy without a mode refuses (MissingRoundMode)", async () => {
    assert.equal(await trap('  return Money.gbp("1.00").divideBy(Decimal("3"))'), "MissingRoundMode");
  });
  for (const alias of ["HALF_EVEN", "bankers", "round", "default"]) {
    it(`an unrecognised mode alias '${alias}' refuses instead of being guessed (UnknownRoundMode)`, async () => {
      assert.equal(await trap(`  return Money.gbp("1.00").multiply(Decimal("1.5"), "${alias}")`), "UnknownRoundMode");
    });
  }
  it("control: an explicitly named mode rounds to the currency's minor units", async () => {
    const result = await run('  return Money.gbp("1.00").multiply(Decimal("1.125"), "halfEven").toString()', "String");
    assert.equal(result.value.value, "GBP 1.12");
  });
});

describe("RD-0349 D4 ISIN — no Security<ISIN>; an ISIN is never a currency (zero-trust default, owner may revisit)", () => {
  it("Money<ISIN> is refused at compile time and Money.of refuses it at runtime", async () => {
    assert.ok(codes(param("Money<US0378331005>")).includes("FUNGI-TYPE-032"));
    assert.match(await trap('  return Money.of("1", "US0378331005")'), /unknown currency code/);
  });
  it("Security<ISIN> is not a type (tracked, not built)", () => {
    assert.ok(codes(param("Security<US0378331005>")).includes("FUNGI-TYPE-001"));
  });
});

describe("RD-0349 D5 — planned value-unit authority names are reserved now (zero-trust default, owner may revisit)", () => {
  for (const [kind, name] of [["record", "Commodity"], ["type", "Crypto"], ["enum", "Security"], ["record", "Crypto"], ["record", "Security"], ["enum", "Commodity"]]) {
    const src = kind === "record" ? `record ${name} { x: Int }` : kind === "enum" ? `enum ${name} { A }` : `type ${name} = Int`;
    it(`${kind} ${name} → FUNGI-NAME-002 'cannot shadow' (a user type may not pose as the governed one)`, () => {
      const found = errors(src).find((d) => d.code === "FUNGI-NAME-002");
      assert.ok(found, `expected FUNGI-NAME-002 for '${src}', got ${JSON.stringify(codes(src))}`);
      assert.match(found.message, /cannot shadow/);
    });
  }
  for (const name of ["Commodity", "Crypto", "Security"]) {
    it(`hallmark ${name} → FUNGI-HALLMARK-001 (the mint path is closed too)`, () => {
      assert.ok(codes(`hallmark ${name} of Decimal { gate: flow g }`).includes("FUNGI-HALLMARK-001"));
    });
  }
  it("control: names that merely CONTAIN the words stay free to declare (the reservation is exact, not a prefix ban)", () => {
    for (const src of ["record CommodityOrder { x: Int }", "record CryptoWallet { x: Int }", "enum SecurityLevel { A }", "record Securities { x: Int }"]) {
      assert.deepEqual(codes(src), [], src);
    }
  });
});
