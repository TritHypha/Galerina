// rounding-drift — the rounding vocabulary and the Money minor-unit table have ONE meaning everywhere
// (Grok Bot rounding work, 2026-09-30). A mode accepted by one layer and refused by another, or a host
// currency whose scale differs from the generated ISO registry, is exactly the drift this pins.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUND_MODES as COMPILER_MODES, isRoundMode } from "../dist/decimal-arith.js";
import { MONEY_MINOR_UNITS } from "../dist/unit-registry.generated.js";
import { ROUND_MODES as HOST_MODES, HOST_MONEY_MINOR_UNITS, checkRoundMode } from "@galerina/core-runtime-wasm";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGES = join(HERE, "..", "..");
const CANONICAL = ["halfEven", "halfUp", "halfDown", "up", "down", "ceiling", "floor"];

function findRoundModeFungi() {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 6 || !existsSync(d)) return;
    for (const e of readdirSync(d)) {
      if (e === "node_modules" || e === "dist" || e.startsWith(".")) continue;
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, depth + 1);
      else if (e === "decimal-round-mode.fungi") out.push(p);
    }
  };
  for (const pkg of readdirSync(PACKAGES)) walk(join(PACKAGES, pkg, "src"), 0);
  return out;
}

describe("rounding-mode vocabulary drift", () => {
  it("the compiler core and the WASM host export the SAME closed mode list", () => {
    assert.deepEqual([...COMPILER_MODES], CANONICAL);
    assert.deepEqual([...HOST_MODES], CANONICAL);
  });
  it("isRoundMode / checkRoundMode agree and have no default", () => {
    for (const m of CANONICAL) {
      assert.equal(isRoundMode(m), true, m);
      assert.deepEqual(checkRoundMode(m), { ok: true, mode: m });
    }
    assert.deepEqual(checkRoundMode(""), { ok: false, trap: "MissingRoundMode" });
    assert.deepEqual(checkRoundMode("nearest"), { ok: false, trap: "UnknownRoundMode" });
  });
  it("every self-hosted decimal-round-mode.fungi admits exactly the canonical modes", () => {
    const files = findRoundModeFungi();
    assert.ok(files.length >= 1, "expected at least the compiler's self-hosted decimal-round-mode.fungi");
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const admitted = [...src.matchAll(/^\s*"([^"]*)"\s*=>\s*return\s+true\s*$/gmu)].map((m) => m[1]);
      assert.deepEqual([...admitted].sort(), [...CANONICAL].sort(), `${f} drifted from the canonical mode list`);
    }
  });
});

describe("Money minor-unit drift", () => {
  it("every host-constructible currency has the generated ISO registry's scale", () => {
    assert.ok(HOST_MONEY_MINOR_UNITS.size >= 1);
    for (const [code, dp] of HOST_MONEY_MINOR_UNITS) {
      assert.equal(MONEY_MINOR_UNITS.get(code), dp, `${code}: host ${dp} vs registry ${MONEY_MINOR_UNITS.get(code)}`);
    }
  });
  it("the host table carries the well-known anchors (GBP 2, JPY 0)", () => {
    assert.equal(HOST_MONEY_MINOR_UNITS.get("GBP"), 2);
    assert.equal(HOST_MONEY_MINOR_UNITS.get("JPY"), 0);
  });
});

describe("R1 — dispatch keys: Decimal and Char no longer share the tag-0 wildcard", async () => {
  const { dispatchKey, dispatchTagId, BINARY_DISPATCH } = await import("../dist/interpreter.js");
  it("each concrete scalar tag has its own non-zero id", () => {
    const tags = ["int", "float", "string", "bool", "int64", "uint64", "decimal", "char"];
    const ids = tags.map((t) => dispatchTagId(t));
    assert.ok(ids.every((id) => id !== 0), JSON.stringify(ids));
    assert.equal(new Set(ids).size, tags.length, "ids must be unique");
  });
  it("decimal and char operators have their own entries (decimal == is by value)", () => {
    assert.notEqual(dispatchKey("decimal", "==", "decimal"), dispatchKey("verdict", "==", "verdict"));
    assert.ok(BINARY_DISPATCH.has(dispatchKey("decimal", "==", "decimal")));
    assert.ok(BINARY_DISPATCH.has(dispatchKey("char", "==", "char")));
    const eq = BINARY_DISPATCH.get(dispatchKey("decimal", "==", "decimal"));
    assert.deepEqual(eq({ __tag: "decimal", value: "0.10" }, { __tag: "decimal", value: "0.1" }), { __tag: "bool", value: true });
  });
});
