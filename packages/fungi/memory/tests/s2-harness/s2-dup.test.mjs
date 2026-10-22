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
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "src");
const REPO = join(HERE, "..", "..", "..", "..", "..");
const GALERINA = join(REPO, "galerina.mjs");
// Registered clashes: name -> why the duplicate is tolerated. Anything else fails.
const REGISTERED = new Map([["finish", "identical refusal/wipe packer in body-reader, release-commit-point, serve-gate, cleanup-evidence"],
  ["applyConsume", "identical in kernel and auth-verify-route"],
  ["recoverLease", "identical in kernel and auth-verify-route"]]);
// S2 round 3 (2026-10-22): DECLARED DIVERGENT clashes. kernel.fungi and auth-verify-route.fungi each define
// mintOperation, applyClock and httpStatusFor with DIFFERENT bodies (different refusal codes and branches), so
// any program composing both (47b's auth-verify-e2e) must say which copy it binds. Zero-trust choice: a divergent
// clash is tolerated only when declared here with (a) exactly the units that define it, (b) the sha256 of each
// reviewed normalised body (any edit goes red until re-reviewed), and (c) the bound copy, or "none" meaning no
// composing root may call it. Rejected: registering by name only (lets a body divergence through), first- or
// last-occurrence binding (silent substitution), renaming now (flow renames wait on Phillip's naming decisions).
// Intent text and comments are ignored by the comparison and recorded in the round notes instead.
const DIVERGENT = new Map([
  ["mintOperation", { units: ["auth-verify-route.fungi", "kernel.fungi"], bound: "none", sha: { "auth-verify-route.fungi": "514c4beb500566a85faaf48c257f83c1564766bf8f8770f5e763c4fb809a42d2", "kernel.fungi": "81c4c5f892613fe715ceb44d858d47e3ae1ebc1767a04818f121d17f6b188e48" }, why: "kernel and route mint with different refusal codes; 47b strips both and its root never calls it" }],
  ["applyClock", { units: ["auth-verify-route.fungi", "kernel.fungi"], bound: "kernel.fungi", sha: { "auth-verify-route.fungi": "0c238a28b58969388547dda6fdd8e7237c77e17d17e6345bac5f5588a6ffac31", "kernel.fungi": "90f558d0c6dfd19ab4329ef5b70f58c925aca54722538186b3c45d329ed13565" }, why: "route adds a budget > 5000 refusal and other codes; 47b keeps the kernel copy" }],
  ["httpStatusFor", { units: ["auth-verify-route.fungi", "kernel.fungi"], bound: "auth-verify-route.fungi", sha: { "auth-verify-route.fungi": "7b62b5b046a4917ac0a9ab2ad3ca0e7ca0f0327e7bea3d7ce5b287b092b4970e", "kernel.fungi": "bc5681e36cdcaf745a94d7c169cf09baab35a7d2b5f1d70afb34f121c36ad589" }, why: "route maps 112-120 to 400 and 140 to 499; 47b keeps the route copy, which its root calls" }],
]);
const sha = (t) => createHash("sha256").update(t).digest("hex");

export function clashProblems(name, defs, rootSrc, where, tables = { REGISTERED, DIVERGENT }) {
  if (tables.REGISTERED.has(name)) {
    return defs.filter((d) => d.body !== defs[0].body).map((d) => "clash '" + name + "' in " + where + ": " + d.file + " differs from " + defs[0].file);
  }
  const decl = tables.DIVERGENT.get(name);
  if (decl === undefined) {
    return ["unregistered clash '" + name + "' in " + where + ": " + defs.map((d) => d.file).join(", ")];
  }
  const out = [];
  const files = defs.map((d) => d.file).sort().join(",");
  if (files !== [...decl.units].sort().join(",")) {
    out.push("divergent clash '" + name + "' in " + where + " spans " + files + " but is declared for " + decl.units.join(","));
  }
  for (const d of defs) {
    if (decl.sha[d.file] !== sha(d.body)) {
      out.push("divergent clash '" + name + "' in " + where + ": " + d.file + " body is not the reviewed one (pinned sha256 mismatch)");
    }
  }
  if (decl.bound !== "none" && decl.units.includes(decl.bound) !== true) {
    out.push("divergent clash '" + name + "' binds " + decl.bound + ", which is not one of its units");
  }
  if (decl.bound === "none" && typeof rootSrc === "string") {
    const calls = rootSrc.split("\n").filter((l) => DECL.test(l) !== true && /^\s*\/\//.test(l) !== true);
    if (calls.some((l) => new RegExp("\\b" + name + "\\s*\\(").test(l))) {
      out.push("root " + where + " calls '" + name + "', a divergent clash bound to no unit");
    }
  }
  return out;
}

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
  return clashesOfSet(closure(root, new Set()));
}

function clashesOfSet(files) {
  const where = new Map();
  for (const f of files) {
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
      assert.deepEqual(clashProblems(name, defs, readFileSync(u, "utf8"), "closure of " + basename(u)), []);
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
// Any two memory units may be composed later (47b composes kernel + auth-verify-route). Every clash such a
// composition would carry must already be registered same-code or declared divergent, so the second of two
// branches to merge cannot turn main red on an undeclared clash.
test("S2-DUP-05 any two memory units composed together carry only registered same-code or declared divergent clashes", () => {
  let pairs = 0;
  const problems = new Set();
  for (let i = 0; i < UNITS.length; i++) {
    for (let j = i + 1; j < UNITS.length; j++) {
      const seen = closure(UNITS[i], new Set());
      closure(UNITS[j], seen);
      for (const [name, defs] of clashesOfSet(seen)) {
        for (const p of clashProblems(name, defs, null, basename(UNITS[i]) + " + " + basename(UNITS[j]))) {
          problems.add(p.replace(/ in [^:]*:/, ":"));
        }
      }
      pairs++;
    }
  }
  assert.notEqual(pairs, 0);
  assert.deepEqual([...problems], []);
});

test("S2-DUP-06 clash rule refuses: unregistered, tampered body, extra unit, foreign binding, unbound call", () => {
  const D = (file, body) => ({ file, body });
  const decl = { units: ["a.fungi", "b.fungi"], sha: { "a.fungi": sha("x"), "b.fungi": sha("y") }, bound: "none" };
  const T = (d) => ({ REGISTERED: new Map(), DIVERGENT: new Map([["zeta", d]]) });
  const ok = [D("a.fungi", "x"), D("b.fungi", "y")];
  assert.deepEqual(clashProblems("zeta", ok, "flow r() -> Int\n{\n  return 1\n}", "r", T(decl)), []);
  assert.equal(clashProblems("zeta", ok, null, "r", { REGISTERED: new Map(), DIVERGENT: new Map() }).length, 1);
  assert.match(clashProblems("zeta", [D("a.fungi", "x"), D("b.fungi", "y2")], null, "r", T(decl)).join(), /pinned sha256 mismatch/);
  assert.match(clashProblems("zeta", [...ok, D("c.fungi", "x")], null, "r", T(decl)).join(), /spans/);
  assert.match(clashProblems("zeta", ok, null, "r", T({ ...decl, bound: "c.fungi" })).join(), /not one of its units/);
  assert.match(clashProblems("zeta", ok, "flow r() -> Int\n{\n  return zeta(1)\n}", "r", T(decl)).join(), /bound to no unit/);
  assert.deepEqual(clashProblems("zeta", ok, "flow r() -> Int\n{\n  return zeta(1)\n}", "r", T({ ...decl, bound: "a.fungi" })), []);
  assert.match(clashProblems("finish", [D("a.fungi", "x"), D("b.fungi", "y")], null, "r", { REGISTERED: new Map([["finish", "t"]]), DIVERGENT: new Map() }).join(), /differs/);
});
