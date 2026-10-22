// S2 X-DUP (closure path): duplicate flow names inside a real import closure.
// The suites only run flattened copies, which strip one `finish` and bind every caller to the other.
// Zero-trust choice: a clash inside one import closure is allowed only when it is registered here AND the
// competing definitions are the same code (signature + body, intent text and comments ignored); and any
// single program that carries two top-level flows of one name is refused by check AND build with the typed
// FUNGI-NAME-002, before the backend (it used to pass check and fall to a wabt "redefinition" error). Rejected: last-wins resolution
// (silent substitution), renaming now (flow renames wait on Phillip's naming decisions 2-4).
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "src");
const REPO = join(HERE, "..", "..", "..", "..", "..");
const GALERINA = join(REPO, "galerina.mjs");
// Registered clashes: name -> why the duplicate is tolerated. Anything else fails.
const REGISTERED = new Map([["finish", "identical refusal/wipe packer in body-reader, release-commit-point, serve-gate, cleanup-evidence"]]);

const DECL = /^[ \t]*(?:[a-z]+[ \t]+)*flow[ \t]+([A-Za-z_]\w*)[ \t]*\(/;
const TOP = /^(?:\S.*\bflow\s+[A-Za-z_]\w*\s*\(|\/\/\/|@|import\b|type\b|enum\b|record\b|const\b)/;

export function flowsOf(src) {
  const lines = src.split("\n");
  const out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = DECL.exec(lines[i]);
    if (m === null) {
      continue;
    }
    let j = i + 1;
    while (j < lines.length && TOP.test(lines[j]) !== true) {
      j++;
    }
    const norm = lines.slice(i, j)
      .filter((l) => /^\s*intent\s*\{/.test(l) !== true && /^\s*\/\//.test(l) !== true)
      .map((l) => l.trim()).filter((l) => l !== "").join("\n");
    const prior = out.get(m[1]);
    out.set(m[1], prior === undefined ? [norm] : [...prior, norm]);
  }
  return out;
}

function closure(file, seen) {
  if (seen.has(file)) {
    return seen;
  }
  seen.add(file);
  for (const m of readFileSync(file, "utf8").matchAll(/^import\s+"\.\/([^"]+\.fungi)"/gm)) {
    closure(join(dirname(file), m[1]), seen);
  }
  return seen;
}

function clashesOf(root) {
  const where = new Map();
  for (const f of closure(root, new Set())) {
    for (const [name, bodies] of flowsOf(readFileSync(f, "utf8"))) {
      for (const b of bodies) {
        const prior = where.get(name) ?? [];
        where.set(name, [...prior, { file: basename(f), body: b }]);
      }
    }
  }
  return [...where].filter(([, defs]) => defs.length > 1);
}

const UNITS = readdirSync(SRC).filter((n) => n.endsWith(".fungi")).map((n) => join(SRC, n));

test("S2-DUP-01 every flow-name clash inside an import closure is registered and the same code", () => {
  let seenClash = 0;
  for (const u of UNITS) {
    for (const [name, defs] of clashesOf(u)) {
      seenClash++;
      assert.equal(REGISTERED.has(name), true, "unregistered clash '" + name + "' in closure of " + basename(u) + ": " + defs.map((d) => d.file).join(", "));
      for (const d of defs) {
        assert.equal(d.body, defs[0].body, "clash '" + name + "' in closure of " + basename(u) + ": " + d.file + " differs from " + defs[0].file);
      }
    }
  }
  assert.notEqual(seenClash, 0, "probe found no clash at all; the closure walk is broken");
});

const FLAT_STRIP = /^(?:@version\b|import\s)/;

function flatten(root) {
  const parts = ["@version 1"];
  for (const f of closure(root, new Set())) {
    parts.push(readFileSync(f, "utf8").split("\n").filter((l) => FLAT_STRIP.test(l) !== true).join("\n"));
  }
  return parts.join("\n\n");
}

function inTmp(name, text, fn) {
  const dir = mkdtempSync(join(tmpdir(), "s2-dup-"));
  const tag = name + basename(dir).replace(/[^A-Za-z0-9]/g, "x");
  const file = join(dir, tag + ".fungi");
  writeFileSync(file, text);
  try {
    return fn(file, tag);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    for (const ext of [".wasm", ".wat", ".lmanifest", ".lmanifest.json"]) {
      rmSync(join(REPO, "build", tag + ext), { force: true });
    }
  }
}

function galerina(args) {
  const r = spawnSync(process.execPath, [GALERINA, ...args], { encoding: "utf8", cwd: REPO });
  return { status: r.status, text: (r.stdout || "") + (r.stderr || "") };
}

const CLASH_ROOTS = UNITS.filter((u) => clashesOf(u).length > 0);

// Import-composed build does not resolve imports at all (it refuses on FUNGI-NAME-001 before any clash can
// matter), so the real composition surface is the flattened copy the suites build. That copy, with EVERY
// clashing definition kept, must refuse with the typed duplicate code naming the clash, before the backend.
test("S2-DUP-02 flattened closure that keeps every clashing flow refuses build with FUNGI-NAME-002 (no artifact)", () => {
  assert.notEqual(CLASH_ROOTS.length, 0);
  for (const u of CLASH_ROOTS) {
    const names = clashesOf(u).map(([n]) => n);
    inTmp("s2dupb", flatten(u), (file, tag) => {
      const r = galerina(["build", file]);
      assert.notEqual(r.status, 0, basename(u) + " flattened build must not succeed: " + r.text.slice(-400));
      for (const n of names) {
        assert.match(r.text, new RegExp("FUNGI-NAME-002[^\\n]*'" + n + "'"), basename(u) + " must refuse clash '" + n + "' with FUNGI-NAME-002 before the backend: " + r.text.slice(-400));
      }
      assert.doesNotMatch(r.text, /wabt rejected/, basename(u) + " reached the backend; the clash was not refused by the front end");
      assert.equal(existsSync(join(REPO, "build", tag + ".wasm")), false, basename(u) + " left a WebAssembly artifact");
    });
  }
});

test("S2-DUP-03 check refuses a duplicate top-level flow with FUNGI-NAME-002 (it used to print 0 errors)", () => {
  assert.notEqual(CLASH_ROOTS.length, 0);
  for (const u of CLASH_ROOTS) {
    inTmp("s2dupc", flatten(u), (file) => {
      const r = galerina(["check", file]);
      assert.notEqual(r.status, 0, basename(u) + " flattened check must not pass: " + r.text.slice(-300));
      assert.match(r.text, /FUNGI-NAME-002/, basename(u) + " check must name FUNGI-NAME-002");
    });
  }
});

const FLOW = (n) => "pure flow " + n + "(a: Int) -> Int\ncontract {\n  intent { \"s2 dup control\" }\n}\n{\n  return a\n}\n";

test("S2-DUP-04 control: distinct names check clean; one renamed into a collision refuses", () => {
  inTmp("s2dupk", "@version 1\n\n" + FLOW("alpha") + "\n" + FLOW("beta"), (file) => {
    const r = galerina(["check", file]);
    assert.equal(r.status, 0, "distinct flows must check clean: " + r.text.slice(-300));
    assert.doesNotMatch(r.text, /FUNGI-NAME-002/);
  });
  inTmp("s2dupk", "@version 1\n\n" + FLOW("alpha") + "\n" + FLOW("alpha"), (file) => {
    const r = galerina(["check", file]);
    assert.notEqual(r.status, 0);
    assert.match(r.text, /FUNGI-NAME-002[^\n]*'alpha'/);
  });
});