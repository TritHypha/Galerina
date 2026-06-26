// #38 — pre-governance import-path traversal + read-size guard (SPORE-IMPORT-005 / -006).
// Import resolution reads .spore files DURING COMPILATION, before governance applies. A malicious
// `import "../../../../etc/secret.spore"` must not read outside the project root, and an oversize
// import must not be slurped into memory. Both are now closed, fail-closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { resolveFileImports, isWithinRoot, MAX_IMPORT_BYTES } from "../dist/module-registry.js";

const ROOT = process.cwd(); // the import containment root (GALERINA_FS_ROOT ?? cwd)
const importDecl = (p) => ({ kind: "importDecl", value: `"${p}"` });
const diagCodes = (mods) => mods.flatMap((m) => m.diagnostics.map((d) => d.code));

// ── SPORE-IMPORT-005: path traversal ──
test("a ../-escaping import is REJECTED before any read (SPORE-IMPORT-005)", () => {
  const src = join(ROOT, "some", "dir", "entry.spore");
  const mods = resolveFileImports(src, [importDecl("../../../../../../../../etc/passwd.spore")]);
  assert.deepEqual(diagCodes(mods), ["SPORE-IMPORT-005"]);
});

test("an absolute-escape via deep ../ to another drive/root is REJECTED", () => {
  const src = join(ROOT, "a", "entry.spore");
  // climbs above ROOT then back down to a sibling outside the project
  const mods = resolveFileImports(src, [importDecl("../".repeat(40) + "tmp/evil.spore")]);
  assert.deepEqual(diagCodes(mods), ["SPORE-IMPORT-005"]);
});

test("a WITHIN-root import is NOT a traversal — it proceeds to the normal not-found path (SPORE-IMPORT-001)", () => {
  // proves the guard does not false-reject legitimate relative imports inside the project.
  const src = join(ROOT, "sub", "entry.spore");
  const mods = resolveFileImports(src, [importDecl("./sibling-does-not-exist.spore")]);
  assert.deepEqual(diagCodes(mods), ["SPORE-IMPORT-001"]);
});

test("an OUT-OF-CWD source importing a SIBLING is allowed (own-dir subtree), not a traversal", () => {
  // a file compiled from outside cwd (one-off file, or a temp-dir fixture) may import its neighbours.
  // ROOT/.. is an existing dir outside cwd, so the realpath containment layer resolves (no fail-closed).
  const src = join(ROOT, "..", "main.spore"); // sourceDir = ROOT/.. (exists), outside cwd
  const mods = resolveFileImports(src, [importDecl("./lib-does-not-exist.spore")]);
  assert.deepEqual(diagCodes(mods), ["SPORE-IMPORT-001"], "sibling import passes containment → normal not-found");
});

test("an OUT-OF-CWD source ESCAPING its own dir is STILL blocked (SPORE-IMPORT-005)", () => {
  const src = join(ROOT, "..", "main.spore");
  const mods = resolveFileImports(src, [importDecl("../".repeat(30) + "etc/passwd.spore")]);
  assert.deepEqual(diagCodes(mods), ["SPORE-IMPORT-005"], "climbing above both cwd and the source dir fails closed");
});

// ── isWithinRoot unit (the two-layer containment primitive) ──
test("isWithinRoot: contained paths pass, escaping paths fail", () => {
  assert.equal(isWithinRoot(resolve(ROOT, "examples/a/b.spore"), ROOT), true);
  assert.equal(isWithinRoot(ROOT, ROOT), true, "the root itself is contained");
  assert.equal(isWithinRoot(resolve(ROOT, "../../etc/passwd"), ROOT), false);
});

test("isWithinRoot: sibling-prefix bypass is blocked (/root-evil vs /root)", () => {
  // A naive startsWith(root) check would admit `${ROOT}-evil`; the segment-safe relative() check rejects it.
  assert.equal(isWithinRoot(ROOT + "-evil" + sep + "x.spore", ROOT), false);
});

// ── SPORE-IMPORT-006: size guard ──
test("an oversize within-root import is REJECTED by stat before the read (SPORE-IMPORT-006)", () => {
  const dir = join(ROOT, ".h38-tmp");
  try {
    mkdirSync(dir, { recursive: true });
    const big = join(dir, "big.spore");
    writeFileSync(big, "x".repeat(MAX_IMPORT_BYTES + 1)); // one byte over the ceiling
    const src = join(dir, "entry.spore");
    const mods = resolveFileImports(src, [importDecl("./big.spore")]);
    assert.deepEqual(diagCodes(mods), ["SPORE-IMPORT-006"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a small within-root import passes the size guard (reaches parse, no IMPORT-006)", () => {
  const dir = join(ROOT, ".h38-tmp-ok");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ok.spore"), "pure flow f() -> Int { 1 }\n");
    const src = join(dir, "entry.spore");
    const mods = resolveFileImports(src, [importDecl("./ok.spore")]);
    assert.equal(diagCodes(mods).includes("SPORE-IMPORT-006"), false);
    assert.equal(diagCodes(mods).includes("SPORE-IMPORT-005"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
