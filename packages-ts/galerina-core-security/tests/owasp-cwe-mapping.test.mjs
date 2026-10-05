import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FUNGI_SEC_OWC_001,
  FUNGI_SEC_OWC_002,
  FUNGI_SEC_OWC_003,
  FUNGI_SEC_OWC_005,
  OWASP_CWE_MAPPING_SCHEMA,
  OWASP_TOP10_EDITION,
  OWASP_CWE_BASELINE_MAPPING,
  readOwaspCweMapping,
  lookupOwaspCweBaseline,
} from "../dist/index.js";

const goodEntry = Object.freeze({
  code: "Galerina_SECURITY_CRYPTO_KEY_TOO_SMALL",
  status: "mapped",
  owasp: Object.freeze(["A02:2021"]),
  cwe: Object.freeze(["CWE-326"]),
});

const mapping = (entries) => ({
  schema: OWASP_CWE_MAPPING_SCHEMA,
  owaspEdition: OWASP_TOP10_EDITION,
  entries,
  complete: true,
  diagnostics: [],
});

test("baseline mapping round-trips and covers exactly the in-package Galerina_SECURITY_* codes", () => {
  const r = readOwaspCweMapping(OWASP_CWE_BASELINE_MAPPING);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.complete, true);
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const codes = [...new Set(src.match(/Galerina_SECURITY_[A-Z_]+/g) ?? [])].sort();
  assert.equal(codes.length > 0, true);
  assert.deepEqual(r.value.entries.map((e) => e.code), codes);
  for (const e of r.value.entries) {
    if (e.status === "mapped") assert.equal(e.cwe.length > 0, true);
    else assert.equal(e.owasp.length + e.cwe.length, 0);
  }
  assert.equal(Object.isFrozen(OWASP_CWE_BASELINE_MAPPING.entries), true);
});

test("lookupOwaspCweBaseline returns known entries and refuses unknown / non-string without echo", () => {
  const r1 = lookupOwaspCweBaseline("Galerina_SECURITY_WEAK_CRYPTO_ALLOWED");
  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.deepEqual(r1.value.cwe, ["CWE-327", "CWE-328"]);
    assert.deepEqual(r1.value.owasp, ["A02:2021"]);
  }
  const r2 = lookupOwaspCweBaseline("Galerina_SECURITY_SECRET_TOKEN_XYZ");
  assert.equal(r2.ok, false);
  if (!r2.ok) {
    assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_OWC_005);
    assert.equal(r2.diagnostics.map((d) => d.message).join(" ").includes("XYZ"), false);
  }
  for (const bad of [Number.NaN, null, undefined, 42, {}, "has space", ""]) {
    const r = lookupOwaspCweBaseline(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.diagnostics[0]?.code, FUNGI_SEC_OWC_002);
  }
});

test("mapped without CWE / unmapped with ids refuse", () => {
  const r1 = readOwaspCweMapping(mapping([{ ...goodEntry, cwe: [] }]));
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_OWC_003);

  const r2 = readOwaspCweMapping(mapping([{ ...goodEntry, status: "unmapped" }]));
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_OWC_003);

  const r3 = readOwaspCweMapping(mapping([{ ...goodEntry, status: "unmapped", cwe: [] }]));
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.diagnostics[0]?.code, FUNGI_SEC_OWC_003);
});

test("unknown OWASP id / malformed CWE / wrong edition / unknown status refuse", () => {
  for (const owasp of [["A11:2021"], ["A01:2025"], ["a01:2021"]]) {
    const r = readOwaspCweMapping(mapping([{ ...goodEntry, owasp }]));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.diagnostics[0]?.code, FUNGI_SEC_OWC_002);
  }
  for (const cwe of [["CWE-0"], ["CWE-01"], ["cwe-79"], ["CWE-1234567"], [79], [Number.NaN]]) {
    const r = readOwaspCweMapping(mapping([{ ...goodEntry, cwe }]));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.diagnostics[0]?.code, FUNGI_SEC_OWC_002);
  }
  const r1 = readOwaspCweMapping({ ...mapping([goodEntry]), owaspEdition: "2025" });
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_OWC_002);
  const r2 = readOwaspCweMapping(mapping([{ ...goodEntry, status: "partial" }]));
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_OWC_002);
});

test("duplicate / out-of-order entries and ids refuse", () => {
  const other = { ...goodEntry, code: "Galerina_SECURITY_AUTHENTICATED_ENCRYPTION_REQUIRED" };
  const r1 = readOwaspCweMapping(mapping([goodEntry, other]));
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_OWC_003);
  const r2 = readOwaspCweMapping(mapping([goodEntry, goodEntry]));
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_OWC_003);
  const r3 = readOwaspCweMapping(mapping([{ ...goodEntry, cwe: ["CWE-1333", "CWE-400"] }]));
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.diagnostics[0]?.code, FUNGI_SEC_OWC_003);
  const r4 = readOwaspCweMapping(mapping([{ ...goodEntry, owasp: ["A02:2021", "A01:2021"] }]));
  assert.equal(r4.ok, false);
  if (!r4.ok) assert.equal(r4.diagnostics[0]?.code, FUNGI_SEC_OWC_003);
  const r5 = readOwaspCweMapping(mapping([other, goodEntry]));
  assert.equal(r5.ok, true);
});

test("hostile getter / proxy / unknown key refuse without echo", () => {
  const hostile = { ...goodEntry };
  Object.defineProperty(hostile, "code", {
    get() {
      throw new Error("getter-ran");
    },
    enumerable: true,
  });
  const r1 = readOwaspCweMapping(mapping([hostile]));
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics.map((d) => d.message).join(" ").includes("getter-ran"), false);

  const proxy = new Proxy(mapping([goodEntry]), {
    ownKeys() {
      throw new Error("trap-ran");
    },
  });
  const r2 = readOwaspCweMapping(proxy);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_OWC_001);

  const r3 = readOwaspCweMapping({ ...mapping([goodEntry]), evil: "SECRET_TOKEN" });
  assert.equal(r3.ok, false);
  if (!r3.ok) {
    assert.equal(r3.diagnostics[0]?.code, FUNGI_SEC_OWC_001);
    assert.equal(r3.diagnostics.map((d) => d.message).join(" ").includes("SECRET_TOKEN"), false);
  }
  const r4 = readOwaspCweMapping(mapping([{ ...goodEntry, code: "bad code SECRET" }]));
  assert.equal(r4.ok, false);
  if (!r4.ok) assert.equal(r4.diagnostics.map((d) => d.message).join(" ").includes("SECRET"), false);
});
