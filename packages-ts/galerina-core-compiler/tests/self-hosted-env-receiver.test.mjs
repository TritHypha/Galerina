/**
 * Self-hosted env receiver guard (slide-r1-selfhost-k3 root cause, 2026-10-28).
 *
 * The production interpreter classifies any call whose receiver path starts
 * with `Env.`, `env.`, `vault.` or `Secrets.` as the capability effect
 * `secret.read` (resolveCapabilityEffect). Without a capability host such a
 * call returns `CapabilityError: environment reads require a capability host`.
 *
 * runtime.fungi and type-checker.fungi used a local parameter named `env` for
 * plain lookup tables. Every `env.count()` / `env.get(i)` / `env.append(...)`
 * was therefore refused as a secret read, so envLookup always returned the
 * unbound sentinel Int 0 and envBind never bound. That is what made
 * slide-r1-selfhost-k3 fail with ERR_K3_SUBJECT_TYPE (a bound Verdict looked
 * up as Int 0).
 *
 * The fix lives in .fungi (TypeScript is frozen reference): the lookup tables
 * are renamed so no local receiver collides with a capability prefix. The
 * capability gate itself is NOT weakened, and SHR-07 pins that.
 *
 * SHR-01  static: no self-hosted compiler .fungi source uses a receiver that
 *         the interpreter would classify as secret.read.
 * SHR-02  envBind + envLookup round-trip a bound value.
 * SHR-03  unbound lookup still returns the documented Int 0 sentinel.
 * SHR-04  later bindings shadow earlier ones.
 * SHR-05  envBind returns the appended table (count grows by one).
 * SHR-06  type-checker resolveStatic / resolveBitfieldAccess find entries and
 *         keep their documented not-found results ("" and -1).
 * SHR-07  the interpreter still refuses a real `env.` receiver read without a
 *         capability host (gate unchanged, fail closed).
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { executeFlow, parseProgram } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF_HOSTED = join(HERE, "..", "src", "self-hosted");

const vStr = (value) => ({ __tag: "string", value });
const vInt = (value) => ({ __tag: "int", value });
const vBool = (value) => ({ __tag: "bool", value });
const vList = (items) => ({ __tag: "list", items });
const vRecord = (entries) => ({ __tag: "record", fields: new Map(entries) });

const emptyList = vList([]);
const rtValue = (ty, { i = 0, b = false, s = "" } = {}) =>
  vRecord([
    ["ty", vStr(ty)],
    ["i", vInt(i)],
    ["b", vBool(b)],
    ["s", vStr(s)],
    ["tag", vStr("")],
    ["payload", emptyList],
    ["fields", emptyList],
  ]);
const binding = (name, val) => vRecord([["name", vStr(name)], ["val", val]]);

// Mirrors the prefixes resolveCapabilityEffect maps to "secret.read".
const SECRET_READ_RECEIVER = /(^|[^A-Za-z0-9_.])(Env|env|vault|Secrets)\.[A-Za-z_]/;

function stripComments(line) {
  const slash = line.indexOf("//");
  const semi = line.indexOf(";;");
  const cut = [slash, semi].filter((n) => n >= 0);
  const noComment = cut.length > 0 ? line.slice(0, Math.min(...cut)) : line;
  // String literals (e.g. effect names like "vault.read") are data, not receivers.
  return noComment.replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

function load(filename) {
  const source = readFileSync(join(SELF_HOSTED, filename), "utf8");
  const parsed = parseProgram(source, filename);
  const errors = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.deepEqual(errors, [], `${filename}: ${JSON.stringify(errors)}`);
  return parsed;
}

async function call(stage, flowName, args) {
  const result = await executeFlow(
    flowName,
    new Map(args),
    stage.ast,
    stage.flows,
    undefined,
    undefined,
    { pureFastPath: false },
  );
  return result.value ?? result;
}

function assertNotCapabilityError(value, label) {
  const text = JSON.stringify(value, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v));
  assert.ok(!/CapabilityError/.test(text), `${label} hit the secret.read capability gate: ${text}`);
}

describe("self-hosted env receiver guard", () => {
  it("SHR-01 no self-hosted compiler source uses a secret.read receiver", () => {
    const hits = [];
    for (const name of readdirSync(SELF_HOSTED).filter((f) => f.endsWith(".fungi")).sort()) {
      const lines = readFileSync(join(SELF_HOSTED, name), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (SECRET_READ_RECEIVER.test(stripComments(line))) hits.push(`${name}:${index + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(hits, [], "rename the receiver; do not weaken the capability gate");
  });

  describe("runtime.fungi binding table", () => {
    const runtime = load("runtime.fungi");

    it("SHR-02 envBind then envLookup returns the bound value", async () => {
      const table = await call(runtime, "envBind", [
        ["bindings", emptyList],
        ["name", vStr("x")],
        ["v", rtValue("Verdict", { i: -128 })],
      ]);
      assertNotCapabilityError(table, "envBind");
      const got = await call(runtime, "envLookup", [["bindings", table], ["name", vStr("x")]]);
      assertNotCapabilityError(got, "envLookup");
      assert.equal(got.fields.get("ty").value, "Verdict");
      assert.equal(got.fields.get("i").value, -128);
    });

    it("SHR-03 unbound lookup returns the Int 0 sentinel", async () => {
      const got = await call(runtime, "envLookup", [
        ["bindings", vList([binding("y", rtValue("Bool", { b: true }))])],
        ["name", vStr("missing")],
      ]);
      assertNotCapabilityError(got, "envLookup");
      assert.equal(got.fields.get("ty").value, "Int");
      assert.equal(got.fields.get("i").value, 0);
    });

    it("SHR-04 later bindings shadow earlier ones", async () => {
      const got = await call(runtime, "envLookup", [
        ["bindings", vList([binding("x", rtValue("Int", { i: 1 })), binding("x", rtValue("Int", { i: 2 }))])],
        ["name", vStr("x")],
      ]);
      assertNotCapabilityError(got, "envLookup");
      assert.equal(got.fields.get("i").value, 2);
    });

    it("SHR-05 envBind appends exactly one binding", async () => {
      const start = vList([binding("a", rtValue("Int", { i: 7 }))]);
      const table = await call(runtime, "envBind", [["bindings", start], ["name", vStr("b")], ["v", rtValue("Int", { i: 8 })]]);
      assertNotCapabilityError(table, "envBind");
      assert.equal(table.__tag, "list");
      assert.equal(table.items.length, 2);
      assert.equal(table.items[1].fields.get("name").value, "b");
    });
  });

  describe("type-checker.fungi static and bitfield tables", () => {
    const tc = load("type-checker.fungi");
    const statics = vRecord([["entries", vList([
      vRecord([["name", vStr("MAX")], ["value", vStr("64")], ["typeName", vStr("Int")]]),
    ])]]);
    const bitfields = vRecord([["entries", vList([
      vRecord([["register", vStr("GOV")], ["field", vStr("audit")], ["mask", vInt(4)]]),
    ])]]);

    it("SHR-06a resolveStatic finds a constant and keeps '' for a miss", async () => {
      const hit = await call(tc, "resolveStatic", [["statics", statics], ["name", vStr("MAX")]]);
      assertNotCapabilityError(hit, "resolveStatic");
      assert.equal(hit.value, "64");
      const miss = await call(tc, "resolveStatic", [["statics", statics], ["name", vStr("MIN")]]);
      assert.equal(miss.value, "");
    });

    it("SHR-06b resolveBitfieldAccess finds a mask and keeps -1 for a miss", async () => {
      const hit = await call(tc, "resolveBitfieldAccess", [
        ["bitfields", bitfields], ["register", vStr("GOV")], ["field", vStr("audit")],
      ]);
      assertNotCapabilityError(hit, "resolveBitfieldAccess");
      assert.equal(hit.value, 4);
      const miss = await call(tc, "resolveBitfieldAccess", [
        ["bitfields", bitfields], ["register", vStr("GOV")], ["field", vStr("nope")],
      ]);
      assert.equal(miss.value, -1);
    });
  });

  it("SHR-07 the interpreter still refuses an env. receiver without a capability host", async () => {
    const source = [
      "pure flow probe(env: Array<Int>) -> Int",
      "contract { intent { \"probe the secret.read gate\" } }",
      "{",
      "  return env.count()",
      "}",
      "",
    ].join("\n");
    const parsed = parseProgram(source, "shr07-probe.fungi");
    const result = await executeFlow(
      "probe",
      new Map([["env", vList([vInt(1)])]]),
      parsed.ast,
      parsed.flows,
      undefined,
      undefined,
      { pureFastPath: false },
    );
    const text = JSON.stringify(result, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v));
    assert.match(text, /CapabilityError: environment reads require a capability host/);
  });
});
