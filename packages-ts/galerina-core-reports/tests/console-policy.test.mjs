import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONSOLE_DUMP_LIMITS,
  CONSOLE_REDACTED,
  CONSOLE_REPORT_SCHEMA,
  consolePolicy,
  createConsoleRecorder,
  renderConsoleScope,
  renderConsoleValue,
  summarizeLargeJson,
} from "../dist/index.js";

describe("console policy (W01 G4, owner may revisit)", () => {
  it("L835 production allows only warn and error; unknown modes fail closed", () => {
    assert.deepEqual(consolePolicy("production").allowed, ["warn", "error"]);
    assert.deepEqual(consolePolicy("debug").allowed.length, 8);
    assert.equal(consolePolicy("staging").mode, "production");
  });

  it("L833 SecureString and secret-named fields are always redacted", () => {
    const secret = { kind: "SecureString", label: "APP_SECRET" };
    assert.equal(renderConsoleValue(secret).text, CONSOLE_REDACTED);
    assert.equal(renderConsoleValue(secret).redacted, 1);
    const r = renderConsoleValue({ password: "hunter2", id: 7 });
    assert.match(r.text, /"password":"\[REDACTED\]"/);
    assert.match(r.text, /"id":7/);
    assert.equal(r.text.includes("hunter2"), false);
    assert.equal(renderConsoleValue({ pin: 1234 }).text.includes("1234"), false);
    assert.match(renderConsoleValue({ secretary: "office" }).text, /"secretary":"office"/);
    assert.equal(renderConsoleValue({ encryptionKey: "must-not-leak" }).text.includes("must-not-leak"), false);
    assert.equal(renderConsoleValue({ connectionString: "must-not-leak" }).text.includes("must-not-leak"), false);
  });

  it("L832 dump respects byte, depth and key caps", () => {
    const deep = { a: { b: { c: { d: { e: "x" } } } } };
    assert.match(renderConsoleValue(deep).text, /\[depth\]/);
    const many = Object.fromEntries(Array.from({ length: CONSOLE_DUMP_LIMITS.maxKeys + 5 }, (_, i) => [`k${i}`, i]));
    assert.match(renderConsoleValue(many).text, /\+5 more/);
    const big = "x".repeat(CONSOLE_DUMP_LIMITS.maxBytes + 200);
    assert.match(renderConsoleValue(big).text, /truncated/);
  });

  it("L834 large JSON is summarised as key paths and types, never values", () => {
    const value = { user: { id: 1, password: "hunter2", tags: ["a", "b"] }, note: "x".repeat(5000) };
    const s = summarizeLargeJson(value);
    assert.match(s.text, /\$\.user: object/);
    assert.match(s.text, /\$\.user\.password: string/);
    assert.equal(s.text.includes("hunter2"), false);
    assert.equal(s.text.includes("xxxx"), false);
  });

  it("L831 scope/vars lists names and type tags; values only for safe primitives", () => {
    const r = renderConsoleScope({
      count: 3,
      ok: true,
      name: "orders",
      password: "sekrit",
      nested: { a: 1 },
      token: { kind: "SecureString" },
    });
    assert.match(r.text, /count: number = 3/);
    assert.match(r.text, /ok: boolean = true/);
    assert.match(r.text, /name: string = "orders"/);
    assert.match(r.text, /password: string = \[REDACTED\]/);
    assert.match(r.text, /token: SecureString = \[REDACTED\]/);
    assert.match(r.text, /nested: object$/m);
    assert.equal(r.text.includes("sekrit"), false);
    assert.ok(r.redacted >= 2);
  });

  it("recorder drops disallowed levels and builds the L836 report schema", () => {
    const rec = createConsoleRecorder("production");
    assert.equal(rec.emit("log", "hello"), "");
    assert.equal(rec.emit("info", "hello"), "");
    assert.match(rec.emit("warn", "C:\\Users\\alex\\x.fungi"), /\[warn\]/); // path-leak-audit:allow
    assert.equal(rec.emit("warn", "C:\\Users\\alex\\x.fungi").includes("alex"), false); // path-leak-audit:allow
    assert.match(rec.emit("error", "password=hunter2"), /password=<redacted>/);
    const report = rec.report();
    assert.equal(report.schemaVersion, CONSOLE_REPORT_SCHEMA);
    assert.equal(report.mode, "production");
    assert.equal(report.levels.log.dropped, 1);
    assert.equal(report.levels.info.dropped, 1);
    assert.equal(report.levels.warn.emitted, 2);
    assert.equal(report.levels.error.emitted, 1);
    assert.equal(Object.hasOwn(report.levels, "dump"), true);
  });

  it("debug mode emits dump and scope", () => {
    const rec = createConsoleRecorder("debug");
    assert.match(rec.emit("dump", { a: 1 }), /\[dump\]/);
    assert.match(rec.emit("scope", { n: 1 }), /\[scope\]/);
    assert.equal(rec.report().levels.dump.emitted, 1);
    assert.equal(rec.report().levels.scope.emitted, 1);
  });

  it("never invents null/undefined values in rendered output", () => {
    const r = renderConsoleValue({ a: 1 });
    assert.equal(r.text.includes("undefined"), false);
    assert.equal(r.text.includes("null"), false);
    assert.match(r.text, /"a":1/);
  });

  it("refuses accessor properties without invoking getters in dumps, scopes, or summaries", () => {
    let getterCalls = 0;
    const hostile = Object.defineProperty({}, "password", {
      enumerable: true,
      get() {
        getterCalls++;
        return "must-not-be-read";
      },
    });

    const dump = renderConsoleValue(hostile);
    const scope = renderConsoleScope(hostile);
    const summary = summarizeLargeJson(hostile);
    const emitted = createConsoleRecorder("debug").emit("dump", hostile);

    assert.equal(getterCalls, 0);
    assert.equal(dump.text.includes("must-not-be-read"), false);
    assert.equal(scope.text.includes("must-not-be-read"), false);
    assert.equal(summary.text.includes("must-not-be-read"), false);
    assert.equal(emitted.includes("must-not-be-read"), false);
    assert.match(dump.text, /inspection refused/);
    assert.match(scope.text, /inspection refused/);
    assert.match(summary.text, /inspection refused/);
    assert.match(emitted, /inspection refused/);
  });

  it("keeps summary and complete emitted lines within the UTF-8 byte ceiling", () => {
    const wide = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field-${i}-with-a-long-name`, { value: "😀".repeat(40) }]));
    const summary = summarizeLargeJson(wide);
    const emitted = createConsoleRecorder("debug").emit("dump", wide);

    assert.ok(Buffer.byteLength(summary.text, "utf8") <= CONSOLE_DUMP_LIMITS.maxBytes);
    assert.ok(Buffer.byteLength(emitted, "utf8") <= CONSOLE_DUMP_LIMITS.maxBytes);
  });

  it("counts unpaired surrogates in raw scope names as UTF-8 replacement bytes", () => {
    const malformedName = "\uD800\uD800x".repeat(650);
    const scope = renderConsoleScope({ [malformedName]: { value: 1 } });

    assert.ok(Buffer.byteLength(scope.text, "utf8") <= CONSOLE_DUMP_LIMITS.maxBytes);
  });

  it("returns a refusal marker when proxy inspection throws", () => {
    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error("inspection trap");
      },
    });

    assert.match(renderConsoleValue(hostile).text, /inspection refused/);
    assert.match(summarizeLargeJson(hostile).text, /inspection refused/);
    assert.match(renderConsoleScope(hostile).text, /inspection refused/);
  });

  it("marks cyclic values without recursing indefinitely", () => {
    const cyclic = {};
    cyclic.self = cyclic;

    assert.match(renderConsoleValue(cyclic).text, /\[circular\]/);
    assert.match(summarizeLargeJson(cyclic).text, /\$\.self: object/);
  });

  it("bounds total summary traversal instead of walking every nested branch", () => {
    const wide = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`branch-${i}`, { leaf: i }]));
    const summary = summarizeLargeJson(wide);

    assert.ok(summary.paths <= CONSOLE_DUMP_LIMITS.maxKeys);
    assert.ok(summary.truncated > 0);
    assert.match(summary.text, /more path branches/);
  });
});
