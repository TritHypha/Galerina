// #38 — pre-governance import-path traversal + read-size guard (FUNGI-IMPORT-005 / -006).
// Import resolution reads .fungi files DURING COMPILATION, before governance applies. A malicious
// `import "../../../../etc/secret.fungi"` must not read outside the project root, and an oversize
// import must not be slurped into memory. Both are now closed, fail-closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { resolveFileImports, isWithinRoot, MAX_IMPORT_BYTES } from "../dist/module-registry.js";

const ROOT = process.cwd(); // the import containment root (GALERINA_FS_ROOT ?? cwd)
const importDecl = (p) => ({ kind: "importDecl", value: `"${p}"` });
const diagCodes = (mods) => mods.flatMap((m) => m.diagnostics.map((d) => d.code));

// ── FUNGI-IMPORT-005: path traversal ──
test("a ../-escaping import is REJECTED before any read (FUNGI-IMPORT-005)", () => {
  const src = join(ROOT, "some", "dir", "entry.fungi");
  const mods = resolveFileImports(src, [importDecl("../../../../../../../../etc/passwd.fungi")]);
  assert.deepEqual(diagCodes(mods), ["FUNGI-IMPORT-005"]);
});

test("an absolute-escape via deep ../ to another drive/root is REJECTED", () => {
  const src = join(ROOT, "a", "entry.fungi");
  // climbs above ROOT then back down to a sibling outside the project
  const mods = resolveFileImports(src, [importDecl("../".repeat(40) + "tmp/evil.fungi")]);
  assert.deepEqual(diagCodes(mods), ["FUNGI-IMPORT-005"]);
});

test("a WITHIN-root import is NOT a traversal — it proceeds to the normal not-found path (FUNGI-IMPORT-001)", () => {
  // proves the guard does not false-reject legitimate relative imports inside the project.
  const src = join(ROOT, "sub", "entry.fungi");
  const mods = resolveFileImports(src, [importDecl("./sibling-does-not-exist.fungi")]);
  assert.deepEqual(diagCodes(mods), ["FUNGI-IMPORT-001"]);
});

test("an OUT-OF-CWD source importing a SIBLING is allowed (own-dir subtree), not a traversal", () => {
  // a file compiled from outside cwd (one-off file, or a temp-dir fixture) may import its neighbours.
  // ROOT/.. is an existing dir outside cwd, so the realpath containment layer resolves (no fail-closed).
  const src = join(ROOT, "..", "main.fungi"); // sourceDir = ROOT/.. (exists), outside cwd
  const mods = resolveFileImports(src, [importDecl("./lib-does-not-exist.fungi")]);
  assert.deepEqual(diagCodes(mods), ["FUNGI-IMPORT-001"], "sibling import passes containment → normal not-found");
});

test("an OUT-OF-CWD source ESCAPING its own dir is STILL blocked (FUNGI-IMPORT-005)", () => {
  const src = join(ROOT, "..", "main.fungi");
  const mods = resolveFileImports(src, [importDecl("../".repeat(30) + "etc/passwd.fungi")]);
  assert.deepEqual(diagCodes(mods), ["FUNGI-IMPORT-005"], "climbing above both cwd and the source dir fails closed");
});

// ── isWithinRoot unit (the two-layer containment primitive) ──
test("isWithinRoot: contained paths pass, escaping paths fail", () => {
  assert.equal(isWithinRoot(resolve(ROOT, "examples/a/b.fungi"), ROOT), true);
  assert.equal(isWithinRoot(ROOT, ROOT), true, "the root itself is contained");
  assert.equal(isWithinRoot(resolve(ROOT, "../../etc/passwd"), ROOT), false);
});

test("isWithinRoot: sibling-prefix bypass is blocked (/root-evil vs /root)", () => {
  // A naive startsWith(root) check would admit `${ROOT}-evil`; the segment-safe relative() check rejects it.
  assert.equal(isWithinRoot(ROOT + "-evil" + sep + "x.fungi", ROOT), false);
});

// ── FUNGI-IMPORT-006: size guard ──
test("an oversize within-root import is REJECTED by stat before the read (FUNGI-IMPORT-006)", () => {
  const dir = join(ROOT, ".h38-tmp");
  try {
    mkdirSync(dir, { recursive: true });
    const big = join(dir, "big.fungi");
    writeFileSync(big, "x".repeat(MAX_IMPORT_BYTES + 1)); // one byte over the ceiling
    const src = join(dir, "entry.fungi");
    const mods = resolveFileImports(src, [importDecl("./big.fungi")]);
    assert.deepEqual(diagCodes(mods), ["FUNGI-IMPORT-006"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a small within-root import passes the size guard (reaches parse, no IMPORT-006)", () => {
  const dir = join(ROOT, ".h38-tmp-ok");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ok.fungi"), "pure flow f() -> Int { 1 }\n");
    const src = join(dir, "entry.fungi");
    const mods = resolveFileImports(src, [importDecl("./ok.fungi")]);
    assert.equal(diagCodes(mods).includes("FUNGI-IMPORT-006"), false);
    assert.equal(diagCodes(mods).includes("FUNGI-IMPORT-005"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a double import of the same file reuses the completed-module cache", () => {
  const dir = join(ROOT, ".h38-tmp-memo");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "leaf.fungi"), "pure flow leaf() -> Int { 1 }\n");
    writeFileSync(
      join(dir, "mid.fungi"),
      'import "./leaf.fungi"\npure flow mid() -> Int { 1 }\n',
    );
    const src = join(dir, "entry.fungi");
    const mods = resolveFileImports(src, [importDecl("./mid.fungi"), importDecl("./mid.fungi")]);
    assert.equal(mods.length, 2);
    assert.equal(mods[0], mods[1], "second import must be the same completed module object");
    assert.equal(diagCodes(mods).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an acyclic double-import chain does not re-expand descendants exponentially", () => {
  const dir = join(ROOT, ".h38-tmp-exp");
  const depth = 12;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `L${depth}.fungi`), "pure flow leaf() -> Int { 1 }\n");
    for (let i = depth - 1; i >= 0; i--) {
      writeFileSync(
        join(dir, `L${i}.fungi`),
        `import "./L${i + 1}.fungi"\nimport "./L${i + 1}.fungi"\npure flow f${i}() -> Int { 1 }\n`,
      );
    }
    const src = join(dir, "L0.fungi");
    const started = Date.now();
    const mods = resolveFileImports(src, [importDecl("./L1.fungi"), importDecl("./L1.fungi")]);
    const elapsed = Date.now() - started;
    assert.equal(mods.length, 2);
    assert.equal(mods[0], mods[1]);
    assert.equal(diagCodes(mods).length, 0);
    assert.ok(elapsed < 2000, `memoized resolution must finish quickly, took ${elapsed}ms`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
