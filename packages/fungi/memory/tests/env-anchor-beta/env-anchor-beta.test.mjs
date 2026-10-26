// ENV-ANCHOR-BETA red tests, native decision half (RD-1413 critical path). RED FIRST (gcw-k3u106, 2026-10-26):
// red on base 5d4d21d86 because packages/fungi/memory/src/env-anchor-beta.fungi does not exist yet.
// Beta secrets (Phillip 2026-10-25 14:06 GMT): one plain deployment .env, read ONCE at startup through the
// SecretsProvider port; .env.spore is post-beta. The host parses the synthetic .env once and maps per-key facts
// onto Int tags; this native unit decides. No bytes, names or values in the .fungi file.
// Packed codes (block 175-184, collision-checked gcw-k3u104/k3u105; register in the .fungi registry before the
// round check): 175 Missing, 176 Empty, 177 Malformed, 178 Duplicate, 179 UnknownKey, 180 ModeOpen,
// 181 ModeUnknown, 182 ArgvSource, 183 AadMismatch, 184 ProviderFaulted; 100 Admit; 110 ForeignRaw;
// 111 Unlisted (the fail-closed default).
// Zero-trust choices pinned here (rejected options are recorded in ENVANCHOR-redtest-plan-469e6f49-20261025.md):
//  - an unlisted token on ANY input refuses 111 before a specific code is chosen (rejected: decide on the first
//    listed fact, which lets a junk later fact ride along).
//  - argv as a source is refused before the file is looked at; file mode UNKNOWN refuses (181), never admits.
//  - duplicate keys refuse (no last-wins); unknown keys refuse (never ignored); missing beats every other key fault.
//  - post-boot access composes the existing per-secret portAccess (no second port); an undeclared name is decided
//    before provider fault, so a fault is never revealed for an undeclared name.
// Host half still owed (separate red tests with the host loader): EA-R6 no value in errors/stderr/audit,
// EA-R7 no process.env read after boot, EA-R11 revocationEpoch advance.
// Synthetic data only. Never reads a real .env. NON_AUTHORIZING.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const SRC = join(MEM, "src");
const GALERINA = join(REPO, "galerina.mjs");
const UNIT = join(SRC, "env-anchor-beta.fungi");
const UNITS = ["c-boundary", "release-commit-point", "secrets-provider-port", "env-anchor-beta"];
const FLOWS = ["envFileAdmit", "envKeyAdmit", "envAadAdmit", "envSecretAccess"];
const CLOSED = new Set([100, 110, 111, 112, 119, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184]);

function unitText(name) {
  return readFileSync(join(SRC, name + ".fungi"), "utf8");
}

// Flatten in order: drop import lines and every @version header except the first (same as the T8K harness).
function flatten() {
  assert.equal(existsSync(UNIT), true, "env-anchor-beta.fungi missing: " + UNIT);
  let out = "";
  let i = 0;
  while (i < UNITS.length) {
    let t = unitText(UNITS[i]).split("\n").filter((l) => /^import\s+"/.test(l) === false).join("\n");
    if (i > 0) {
      t = t.replace(/^@version 1\s*$/m, "");
    }
    out = out + t + "\n";
    i = i + 1;
  }
  return out;
}

function parseValue(text) {
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/^(-?\d+)\s*$/m);
  if (!m) {
    return null;
  }
  const v = Number(m[1]);
  return Number.isSafeInteger(v) ? v : null;
}

// One flattened unit per test, unique dir and unique build name (X-H1). Every value must be in the closed set.
function grid(fn) {
  const text = flatten();
  const dir = mkdtempSync(join(tmpdir(), "eab-"));
  const file = join(dir, "eab" + randomBytes(6).toString("hex") + ".fungi");
  try {
    writeFileSync(file, text);
    return fn((flow, args) => {
      const r = spawnSync(process.execPath, [GALERINA, "run", file, "--invoke", flow, ...args.map(String)], { encoding: "utf8", cwd: dir, timeout: 180000 });
      const out = (r.stdout || "") + (r.stderr || "");
      assert.equal(r.status, 0, flow + "(" + args.join(",") + ") status " + out);
      const v = parseValue(out);
      assert.notEqual(v, null, flow + "(" + args.join(",") + ") no value " + out);
      assert.ok(CLOSED.has(v), flow + "(" + args.join(",") + ") returned " + v + " outside the closed set");
      return v;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------- oracles (the spec) ----------------
// envFileAdmit(sourceClass, source, modeClass, mode, unknownClass, unknownCount)
//   source: 0 file, 1 argv.  mode: 0 owner-only, 1 group/world-readable, 2 UNKNOWN.  unknownCount >= 0.
function fileOracle(s, m, u) {
  if ((s !== 0 && s !== 1) || (m !== 0 && m !== 1 && m !== 2) || u < 0) return 111;
  if (s === 1) return 182;
  if (m === 1) return 180;
  if (m === 2) return 181;
  if (u > 0) return 179;
  return 100;
}
// envKeyAdmit(countClass, count, emptyClass, empty, formatClass, formatOk)
//   count = occurrences of the required key (0 missing, 1 ok, >= 2 duplicate). empty: 0 no, 1 yes. formatOk: 1 ok, 0 bad.
function keyOracle(c, e, f) {
  if (c < 0 || (e !== 0 && e !== 1) || (f !== 0 && f !== 1)) return 111;
  if (c === 0) return 175;
  if (c >= 2) return 178;
  if (e === 1) return 176;
  if (f === 0) return 177;
  return 100;
}
// envAadAdmit(purposeClass, purposeMatch, rootClass, rootMatch): 1 match, 0 mismatch.
function aadOracle(p, r) {
  if ((p !== 0 && p !== 1) || (r !== 0 && r !== 1)) return 111;
  if (p === 0 || r === 0) return 183;
  return 100;
}
// envSecretAccess(faultClass, faulted, declaredClass, declared, providerClass, providerPresent)
//   faulted: 0 healthy, 1 faulted after boot. Name first (portAccess), then fault.
function accessOracle(fa, d, p) {
  if ((fa !== 0 && fa !== 1) || (d !== 0 && d !== 1) || (p !== 0 && p !== 1)) return 111;
  if (d === 0) return 112;
  if (p === 0) return 119;
  if (fa === 1) return 184;
  return 100;
}

// ---------------- EA-R1..R5: per-key boot admission ----------------
test("EA-R1..R5 envKeyAdmit: missing, empty, malformed, duplicate refuse; only one well-formed value admits", () => {
  grid((run) => {
    for (const c of [-1, 0, 1, 2, 3]) for (const e of [0, 1, 2]) for (const f of [0, 1, -1]) {
      assert.equal(run("envKeyAdmit", [0, c, 0, e, 0, f]), keyOracle(c, e, f), "envKeyAdmit count " + c + " empty " + e + " format " + f);
    }
    assert.equal(run("envKeyAdmit", [0, 0, 0, 0, 0, 1]), 175, "EA-R1 missing key refuses 175");
    assert.equal(run("envKeyAdmit", [0, 1, 0, 1, 0, 1]), 176, "EA-R2 empty value refuses 176");
    assert.equal(run("envKeyAdmit", [0, 1, 0, 0, 0, 0]), 177, "EA-R3 malformed refuses 177");
    assert.equal(run("envKeyAdmit", [0, 2, 0, 0, 0, 1]), 178, "EA-R4 duplicate refuses 178 (no last-wins)");
    assert.equal(run("envKeyAdmit", [0, 1, 0, 0, 0, 1]), 100, "one well-formed value admits");
  });
});

test("EA-R5/R8/R9 envFileAdmit: unknown keys, open or UNKNOWN mode, argv source refuse", () => {
  grid((run) => {
    for (const s of [0, 1, 2]) for (const m of [0, 1, 2, 3]) for (const u of [-1, 0, 1, 4]) {
      assert.equal(run("envFileAdmit", [0, s, 0, m, 0, u]), fileOracle(s, m, u), "envFileAdmit source " + s + " mode " + m + " unknown " + u);
    }
    assert.equal(run("envFileAdmit", [0, 0, 0, 0, 0, 1]), 179, "EA-R5 unknown extra key refuses 179");
    assert.equal(run("envFileAdmit", [0, 0, 0, 1, 0, 0]), 180, "EA-R8 group/world-readable refuses 180");
    assert.equal(run("envFileAdmit", [0, 0, 0, 2, 0, 0]), 181, "EA-R8 mode UNKNOWN refuses 181");
    assert.equal(run("envFileAdmit", [0, 1, 0, 0, 0, 0]), 182, "EA-R9 argv source refuses 182");
  });
});

test("EA-R10 envAadAdmit: AAD must bind purpose AND root", () => {
  grid((run) => {
    for (const p of [0, 1, 2]) for (const r of [0, 1, -1]) {
      assert.equal(run("envAadAdmit", [0, p, 0, r]), aadOracle(p, r), "envAadAdmit purpose " + p + " root " + r);
    }
  });
});

test("EA-R11 envSecretAccess: composes portAccess; undeclared hides fault; fault after boot refuses 184", () => {
  grid((run) => {
    for (const fa of [0, 1, 2]) for (const d of [0, 1, 2]) for (const p of [0, 1]) {
      assert.equal(run("envSecretAccess", [0, fa, 0, d, 0, p]), accessOracle(fa, d, p), "envSecretAccess faulted " + fa + " declared " + d + " provider " + p);
    }
    assert.equal(run("envSecretAccess", [0, 1, 0, 0, 0, 1]), 112, "an undeclared name never reveals a provider fault");
  });
});

test("EA-R1..R11 foreign classes: class 3 refuses 110, class 11 refuses 111, on every input of every flow", () => {
  const ok = { envFileAdmit: [0, 0, 0, 0, 0, 0], envKeyAdmit: [0, 1, 0, 0, 0, 1], envAadAdmit: [0, 1, 0, 1], envSecretAccess: [0, 0, 0, 1, 0, 1] };
  grid((run) => {
    for (const flow of FLOWS) {
      assert.equal(run(flow, ok[flow]), 100, flow + " baseline admits");
      for (let i = 0; i < ok[flow].length; i = i + 2) {
        for (const [cls, want] of [[3, 110], [11, 111]]) {
          const args = ok[flow].slice();
          args[i] = cls;
          assert.equal(run(flow, args), want, flow + " class " + cls + " at arg " + i);
        }
      }
    }
  });
});

// ---------------- EA-R6 (static half) / EA-R12: shape of the native unit ----------------
function codeLines(text) {
  return text.split("\n").filter((l) => /^\s*\/\/\//.test(l) === false && /^\s*\/\//.test(l) === false);
}

test("EA-R12 every flow ends in a fail-closed Unlisted return; typed UNKNOWN only", () => {
  assert.equal(existsSync(UNIT), true, "env-anchor-beta.fungi missing: " + UNIT);
  const src = readFileSync(UNIT, "utf8");
  assert.ok(src.startsWith("@version 1"), "@version 1 header");
  for (const imp of ["./c-boundary.fungi", "./release-commit-point.fungi", "./secrets-provider-port.fungi"]) {
    assert.equal(src.split("import \"" + imp + "\"").length, 2, "imports " + imp + " exactly once");
  }
  assert.equal(/\bflow\s+portAccess\s*\(/.test(src), false, "must not re-implement portAccess (no second port)");
  const flows = [...src.matchAll(/^pure flow (\w+)\(/gm)].map((m) => m[1]);
  assert.deepEqual(flows.slice().sort(), FLOWS.slice().sort(), "exactly the four pure flows");
  const bodies = src.split(/^pure flow /m).slice(1);
  for (const b of bodies) {
    const name = b.slice(0, b.indexOf("("));
    const lines = b.trimEnd().split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    assert.equal(lines[lines.length - 1], "}", name + " closes");
    assert.equal(lines[lines.length - 2], "return finish(11, true)", name + " last statement is the fail-closed Unlisted return");
  }
  const code = codeLines(src).join("\n");
  assert.equal(/\b(null|NaN|undefined|Infinity)\b/.test(code), false, "typed UNKNOWN only (no null/NaN/undefined)");
});

test("EA-R6 static half: the native unit carries no strings, names, values, env or argv access", () => {
  assert.equal(existsSync(UNIT), true, "env-anchor-beta.fungi missing: " + UNIT);
  const src = readFileSync(UNIT, "utf8");
  for (const l of codeLines(src)) {
    if (/^\s*import\s+"/.test(l) || /^\s*intent\s*\{\s*"[^"]*"\s*\}\s*$/.test(l)) continue;
    assert.equal(l.includes("\""), false, "string literal outside import/intent: " + l.trim());
  }
  const code = codeLines(src).join("\n");
  assert.equal(/process|\benv\s*\.|argv|readFile|clock|now\(/i.test(code.replace(/\benv[A-Z]\w*/g, "")), false, "no ambient env, argv, file or clock access");
});