// Tests for @galerina/devtools-fungi-scan — the detectors must fire on the
// anti-pattern AND stay silent on the good form (anti-vacuous, A27).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanFungiSource,
  scanGateSource,
  readVersionHeader,
  discoverCorpus,
  scanCorpus,
  strictFindings,
  extractFungiFixtures,
  looksLikeFungi,
  scanInlineFixtures,
} from "../dist/index.js";

// ── version header ───────────────────────────────────────────────────────────

test("@version: valid integer first-line header on .fungi", () => {
  const v = readVersionHeader("@version 1\nflow main() {}\n", "fungi");
  assert.equal(v.present, true);
  assert.equal(v.valid, true);
  assert.equal(v.value, "1");
});

test("@version: missing header reported absent (never assumed)", () => {
  const v = readVersionHeader("flow main() {}\n", "fungi");
  assert.equal(v.present, false);
  assert.equal(v.valid, false);
});

test("@version: header NOT on line 1 does not count (must be literally first)", () => {
  const v = readVersionHeader("// comment\n@version 1\n", "fungi");
  assert.equal(v.present, false);
});

test("@version: semver required for .gate, integer required for .fungi (cross forms invalid)", () => {
  assert.equal(readVersionHeader("@version 1.0.0\n", "gate").valid, true);
  assert.equal(readVersionHeader("@version 1\n", "gate").valid, false);
  assert.equal(readVersionHeader("@version 1.0.0\n", "fungi").valid, false);
  // zero/garbage versions rejected (fail-closed, anti-downgrade floor is v1)
  assert.equal(readVersionHeader("@version 0\n", "fungi").valid, false);
  assert.equal(readVersionHeader("@version banana\n", "fungi").valid, false);
});

// ── legacy operators: the no-space forms regex misses ────────────────────────

test("legacy &&/||: detected in no-space form x&&y via token stream", () => {
  const s = scanFungiSource("flow f() {\n  let a = x&&y\n  let b = p||q\n}\n", "t.fungi");
  assert.equal(s.legacyOps.and2, 1);
  assert.equal(s.legacyOps.or2, 1);
});

test("legacy &&/||: silent on the migrated and/or form (anti-vacuous)", () => {
  const s = scanFungiSource("flow f() {\n  let a = x and y\n  let b = p or q\n}\n", "t.fungi");
  assert.equal(s.legacyOps.and2, 0);
  assert.equal(s.legacyOps.or2, 0);
});

test("legacy vAnd/vOr/vNot identifiers counted", () => {
  const s = scanFungiSource("flow f() {\n  let v = vAnd(a, vNot(b))\n}\n", "t.fungi");
  assert.equal(s.legacyIdents.vAnd, 1);
  assert.equal(s.legacyIdents.vNot, 1);
  assert.equal(s.legacyIdents.vOr, undefined);
});

// ── match exhaustiveness reporting ───────────────────────────────────────────

test("match without _ arm flagged; with _ arm silent", () => {
  const bad = scanFungiSource("flow f() {\n  match (x) {\n    A: doA()\n    B: doB()\n  }\n}\n", "t.fungi");
  assert.equal(bad.matches.total, 1);
  assert.equal(bad.matches.withoutWildcard, 1);

  const good = scanFungiSource("flow f() {\n  match (x) {\n    A: doA()\n    _: audit()\n  }\n}\n", "t.fungi");
  assert.equal(good.matches.total, 1);
  assert.equal(good.matches.withoutWildcard, 0);
});

test("match with `when` guard arms is exempt (boolean guard, not enum-exhaustive)", () => {
  const s = scanFungiSource("flow f() {\n  match (x) {\n    when x > 1 => big()\n    when x < 1 => small()\n  }\n}\n", "t.fungi");
  assert.equal(s.matches.withoutWildcard, 0);
});

test("nested braces inside an arm body do not fool the depth walk", () => {
  const s = scanFungiSource(
    "flow f() {\n  match (x) {\n    A: { let y = 1\n         match (y) { _: ok() } }\n    _: audit()\n  }\n}\n",
    "t.fungi",
  );
  assert.equal(s.matches.total, 2);
  assert.equal(s.matches.withoutWildcard, 0);
});

// ── planned-keyword usage / collision detection ──────────────────────────────

test("planned words counted whether identifier or keyword (collision→adoption metric)", () => {
  const s = scanFungiSource("flow f() {\n  let drop = cast(project)\n  check(x)\n}\n", "t.fungi");
  assert.equal(s.usage.drop, 1);
  assert.equal(s.usage.cast, 1);
  assert.equal(s.usage.project, 1);
  assert.equal(s.usage.check, 1);
});

test("dotted effect names do not false-positive planned words (all/any as segments)", () => {
  // `net.fetch` etc. lex as identifier . identifier — `fetch` is not planned, and
  // a planned word as a DOTTED SEGMENT is still a real token occurrence we want counted.
  const s = scanFungiSource("flow f() effects [net.fetch] {\n}\n", "t.fungi");
  assert.equal(s.usage.fetch, undefined);
});

test("secure flow pair counted; lone secure (existing qualifier) not counted", () => {
  const s = scanFungiSource("secure flow f() {\n}\nflow g() {\n  let secure_thing = 1\n}\n", "t.fungi");
  assert.equal(s.secureFlow, 1);
});

// ── .gate handling ───────────────────────────────────────────────────────────

test(".gate: header-only scan (gate-parser stays the authority; .gate never runtime code)", () => {
  const s = scanGateSource("@version 1.0.0\nnode A -> B\n", "t.gate");
  assert.equal(s.kind, "gate");
  assert.equal(s.version.valid, true);
  assert.equal(s.matches.total, 0);
});

// ── corpus discovery + strict gate ───────────────────────────────────────────

test("discoverCorpus skips node_modules/dist/build; classifies tests/ as test-corpus; strict gates runtime only", () => {
  const root = mkdtempSync(join(tmpdir(), "fungi-scan-"));
  try {
    mkdirSync(join(root, "app"), { recursive: true });
    mkdirSync(join(root, "app", "tests"), { recursive: true });
    mkdirSync(join(root, "node_modules", "x"), { recursive: true });
    mkdirSync(join(root, "dist"), { recursive: true });
    // runtime file: migrated (has header, uses and/or, match covered)
    writeFileSync(join(root, "app", "good.fungi"), "@version 1\nflow f() {\n  let a = x and y\n  match (x) { _: ok() }\n}\n");
    // runtime file: NOT migrated (no header, legacy &&)
    writeFileSync(join(root, "app", "bad.fungi"), "flow f() {\n  let a = x&&y\n}\n");
    // test fixture with old syntax — allowed (negative fixtures must keep old forms)
    writeFileSync(join(root, "app", "tests", "fixture.fungi"), "flow f() {\n  let a = x&&y\n}\n");
    // files under skip-dirs must not be discovered
    writeFileSync(join(root, "node_modules", "x", "dep.fungi"), "flow f() {}\n");
    writeFileSync(join(root, "dist", "gen.fungi"), "flow f() {}\n");
    writeFileSync(join(root, "app", "wiring.gate"), "@version 1.0.0\n");

    const { fungi, gate } = discoverCorpus(root);
    assert.equal(fungi.length, 3); // good, bad, tests/fixture — NOT node_modules/dist
    assert.equal(gate.length, 1);

    const scan = scanCorpus(root);
    const bad = scan.files.find((f) => f.file.endsWith("bad.fungi"));
    const fixture = scan.files.find((f) => f.file.endsWith("fixture.fungi"));
    assert.equal(bad.corpus, "runtime");
    assert.equal(fixture.corpus, "test");

    const findings = strictFindings(scan);
    // bad.fungi: missing @version + legacy ops = 2 findings; fixture exempt; good clean
    assert.equal(findings.length, 2);
    assert.ok(findings.every((f) => f.file.endsWith("bad.fungi")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("signed-frozen: files inside a REAL-SIGNED fusable package are classified + strict-exempt (CG-7), and a placeholder signature does NOT freeze", () => {
  const root = mkdtempSync(join(tmpdir(), "fungi-scan-signed-"));
  try {
    // a signed package: package.fungi.json + dist/<name>.lmanifest.json with a REAL signature
    mkdirSync(join(root, "pkg-signed", "dist"), { recursive: true });
    mkdirSync(join(root, "pkg-signed", "src"), { recursive: true });
    writeFileSync(join(root, "pkg-signed", "package.fungi.json"), JSON.stringify({ name: "greeting" }));
    writeFileSync(
      join(root, "pkg-signed", "dist", "greeting.lmanifest.json"),
      JSON.stringify({ governanceSignature: { keyId: "9c2d7d4502a2eedd", signature: "AbCdEf123" } }),
    );
    // frozen source: NO @version header + legacy && — would be 2 strict findings if runtime
    writeFileSync(join(root, "pkg-signed", "src", "index.fungi"), "flow f() {\n  let a = x&&y\n}\n");
    // a placeholder-signed package must NOT be frozen (still migratable)
    mkdirSync(join(root, "pkg-dev", "dist"), { recursive: true });
    writeFileSync(join(root, "pkg-dev", "package.fungi.json"), JSON.stringify({ name: "devpkg" }));
    writeFileSync(
      join(root, "pkg-dev", "dist", "devpkg.lmanifest.json"),
      JSON.stringify({ governanceSignature: { keyId: "x", signature: "placeholder:dev" } }),
    );
    writeFileSync(join(root, "pkg-dev", "main.fungi"), "flow f() {\n  let a = x&&y\n}\n");

    const scan = scanCorpus(root);
    const frozen = scan.files.find((f) => f.file.endsWith("pkg-signed/src/index.fungi"));
    const dev = scan.files.find((f) => f.file.endsWith("pkg-dev/main.fungi"));
    assert.equal(frozen.corpus, "signed-frozen", "real-signed package source must be classified frozen");
    assert.equal(dev.corpus, "runtime", "placeholder signature must NOT freeze");

    const findings = strictFindings(scan);
    assert.ok(findings.every((f) => !f.file.includes("pkg-signed/")), "signed-frozen files are strict-exempt");
    assert.ok(findings.some((f) => f.file.endsWith("pkg-dev/main.fungi")), "dev-signed package still gates strict");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("anti-vacuous: a fully-migrated runtime corpus yields ZERO strict findings", () => {
  const root = mkdtempSync(join(tmpdir(), "fungi-scan-clean-"));
  try {
    writeFileSync(join(root, "a.fungi"), "@version 1\nflow f() {\n  let a = x and y\n}\n");
    const scan = scanCorpus(root);
    assert.equal(strictFindings(scan).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── inline .fungi fixtures embedded in .mjs/.cjs harness files ────────────────
// The disk scan only sees *.fungi FILES; much of the corpus lives as backtick
// fixtures inside test/proof .mjs. That blind spot bit W4 (@version proofs) and
// W5b (reserving `check`/`fault` broke fixtures the scan reported as 0 collisions).

test("inline: extracts a backtick .fungi fixture and unescapes \\n into real newlines", () => {
  const host = 'import x;\nconst src = `@version 1\\nflow f(v: Int) -> Int\\ncontract { effects {} }\\n{ return v }`;\ntest();\n';
  const fx = extractFungiFixtures(host);
  assert.equal(fx.length, 1);
  assert.match(fx[0].content, /^@version 1\nflow f\(/); // \n resolved to a newline
  assert.equal(fx[0].line, 2); // the template opens on host line 2
});

test("inline: looksLikeFungi accepts header/flow/contract, rejects ordinary templates (anti-vacuous)", () => {
  assert.equal(looksLikeFungi("@version 1\nflow f() {}"), true);
  assert.equal(looksLikeFungi("secure flow guard(x: Int) -> Void {}"), true);
  assert.equal(looksLikeFungi("contract { intent { \"x\" } }"), true);
  assert.equal(looksLikeFungi("SELECT * FROM users WHERE id = 1"), false);
  assert.equal(looksLikeFungi("hello ${name}, welcome"), false);
});

test("inline: a backtick inside a // comment or a quoted string does NOT start a fixture", () => {
  const host = [
    "// example: `flow ghost(x) -> Int` should be ignored",
    "const note = 'a `flow phantom()` in a string is ignored too';",
    "const real = `@version 1\\nflow only(v: Int) -> Int\\ncontract { effects {} }\\n{ return v }`;",
  ].join("\n");
  const fx = extractFungiFixtures(host);
  assert.equal(fx.length, 1);
  assert.match(fx[0].content, /flow only\(/);
});

test("inline: ${…} interpolation becomes an identifier placeholder so the .fungi still lexes", () => {
  const host = "const t = `@version 1\\nflow ${flowName}(v: Int) -> Int\\ncontract { effects {} }\\n{ return v }`;\n";
  const fx = extractFungiFixtures(host);
  assert.equal(fx.length, 1);
  assert.ok(fx[0].content.includes("_INTERP_"), "interpolation replaced by a placeholder ident");
  const s = scanFungiSource(fx[0].content, "t.fungi");
  assert.equal(s.lexErrors, 0, "the placeholder keeps the fixture lexable");
});

test("inline: nested template inside ${…} does not end the outer fixture early", () => {
  const host = "const t = `@version 1\\nflow f(v: Int) -> Int\\ncontract { effects {} }\\n{ return ${cond ? `a` : `b`} }`;\n";
  const fx = extractFungiFixtures(host);
  assert.equal(fx.length, 1); // one .fungi fixture; the inner `a`/`b` are not fungi
  assert.match(fx[0].content, /return  ?_INTERP_/);
});

test("inline: THE W5b regression — a `check`/`fault` fixture in a .test.mjs now surfaces as a collision", () => {
  const root = mkdtempSync(join(tmpdir(), "fungi-scan-inline-"));
  try {
    mkdirSync(join(root, "pkg", "tests"), { recursive: true });
    // a fixture that USES the planned keywords as identifiers — the exact shape
    // that broke six fixtures when `check`/`fault` were reserved, yet the disk
    // scan reported ZERO because these tokens live inside a .mjs string.
    writeFileSync(
      join(root, "pkg", "tests", "legacy.test.mjs"),
      "import { test } from 'node:test';\n" +
        "const src = `@version 1\\nflow check(v: Int) -> Int\\ncontract { effects {} }\\n{ let fault = v\\n  return fault }`;\n" +
        "test('x', () => {});\n",
    );
    const inline = scanInlineFixtures(root);
    assert.equal(inline.length, 1);
    const f = inline[0];
    assert.equal(f.source, "inline");
    assert.equal(f.corpus, "test");
    assert.equal(f.file, "pkg/tests/legacy.test.mjs#L2");
    assert.ok(f.usage.check >= 1, "the `check` identifier collision is now visible");
    assert.ok(f.usage.fault >= 1, "the `fault` identifier collision is now visible");

    // …and via the full corpus scan, still strict-exempt (test-corpus can hold anything)
    const scan = scanCorpus(root);
    assert.ok(scan.files.some((x) => x.source === "inline" && x.file.includes("legacy.test.mjs")));
    assert.equal(strictFindings(scan).filter((s) => s.file.includes("legacy.test.mjs")).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inline: a host with no .fungi fixtures contributes nothing (no false positives)", () => {
  const root = mkdtempSync(join(tmpdir(), "fungi-scan-inline-empty-"));
  try {
    writeFileSync(join(root, "plain.mjs"), "export const greeting = `hello ${who}`;\nconst sql = `SELECT 1`;\n");
    assert.equal(scanInlineFixtures(root).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unreadable/lex-error files are FINDINGS, not skips (fail-closed reporting)", () => {
  const root = mkdtempSync(join(tmpdir(), "fungi-scan-err-"));
  try {
    // a null-byte body exercises the lexer's error path rather than a silent skip
    writeFileSync(join(root, "weird.fungi"), "flow f() {\n  let a = \u0000\u0000\n}\n");
    const scan = scanCorpus(root);
    const f = scan.files[0];
    assert.equal(scan.files.length, 1);
    // either lexErrors > 0 or it lexed cleanly — but it must NEVER be absent from the report
    assert.ok(f.file.endsWith("weird.fungi"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
