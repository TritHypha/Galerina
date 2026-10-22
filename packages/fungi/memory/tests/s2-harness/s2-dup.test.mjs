// S2 X-DUP (closure path): duplicate flow names inside a real import closure.
// The suites only run flattened copies, which strip one `finish` and bind every caller to the other.
// Zero-trust choice: a clash inside one import closure is allowed only when it is registered here AND the
// competing definitions are the same code (signature + body, intent text and comments ignored); and the
// import-composed build must refuse fail-closed rather than pick one. Rejected: last-wins resolution
// (silent substitution), renaming now (flow renames wait on Phillip's naming decisions 2-4).
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { readFileSync, readdirSync, mkdtempSync, rmSync, copyFileSync, existsSync } from "node:fs";
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

test("S2-DUP-02 import-composed build of a clashing closure refuses fail-closed (no artifact)", () => {
  const roots = UNITS.filter((u) => clashesOf(u).length > 0);
  assert.notEqual(roots.length, 0);
  for (const u of roots) {
    const dir = mkdtempSync(join(tmpdir(), "s2-dup-"));
    const tag = "s2dup" + basename(dir).replace(/[^A-Za-z0-9]/g, "x");
    try {
      for (const f of closure(u, new Set())) {
        copyFileSync(f, join(dir, f === u ? tag + ".fungi" : basename(f)));
      }
      const r = spawnSync(process.execPath, [GALERINA, "build", join(dir, tag + ".fungi")], { encoding: "utf8", cwd: REPO });
      const text = (r.stdout || "") + (r.stderr || "");
      assert.notEqual(r.status, 0, basename(u) + " import-composed build must not succeed: " + text.slice(-400));
      assert.match(text, /FAILED \(fail-closed\)|FUNGI-NAME-00[12]/, basename(u) + " must refuse with a typed code");
      assert.equal(existsSync(join(REPO, "build", tag + ".wasm")), false, basename(u) + " left a WebAssembly artifact");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      for (const ext of [".wasm", ".wat", ".lmanifest", ".lmanifest.json"]) {
        rmSync(join(REPO, "build", tag + ext), { force: true });
      }
    }
  }
});