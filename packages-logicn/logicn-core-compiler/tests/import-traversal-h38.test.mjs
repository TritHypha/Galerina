// #38 — pre-governance import-path traversal + read-size guard (LLN-IMPORT-005 / -006).
// Import resolution reads .lln files DURING COMPILATION, before governance applies. A malicious
// `import "../../../../etc/secret.lln"` must not read outside the project root, and an oversize
// import must not be slurped into memory. Both are now closed, fail-closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { resolveFileImports, isWithinRoot, MAX_IMPORT_BYTES } from "../dist/module-registry.js";

const ROOT = process.cwd(); // the import containment root (LOGICN_FS_ROOT ?? cwd)
const importDecl = (p) => ({ kind: "importDecl", value: `"${p}"` });
const diagCodes = (mods) => mods.flatMap((m) => m.diagnostics.map((d) => d.code));

// ── LLN-IMPORT-005: path traversal ──
test("a ../-escaping import is REJECTED before any read (LLN-IMPORT-005)", () => {
  const src = join(ROOT, "some", "dir", "entry.lln");
  const mods = resolveFileImports(src, [importDecl("../../../../../../../../etc/passwd.lln")]);
  assert.deepEqual(diagCodes(mods), ["LLN-IMPORT-005"]);
});

test("an absolute-escape via deep ../ to another drive/root is REJECTED", () => {
  const src = join(ROOT, "a", "entry.lln");
  // climbs above ROOT then back down to a sibling outside the project
  const mods = resolveFileImports(src, [importDecl("../".repeat(40) + "tmp/evil.lln")]);
  assert.deepEqual(diagCodes(mods), ["LLN-IMPORT-005"]);
});

test("a WITHIN-root import is NOT a traversal — it proceeds to the normal not-found path (LLN-IMPORT-001)", () => {
  // proves the guard does not false-reject legitimate relative imports inside the project.
  const src = join(ROOT, "sub", "entry.lln");
  const mods = resolveFileImports(src, [importDecl("./sibling-does-not-exist.lln")]);
  assert.deepEqual(diagCodes(mods), ["LLN-IMPORT-001"]);
});

// ── isWithinRoot unit (the two-layer containment primitive) ──
test("isWithinRoot: contained paths pass, escaping paths fail", () => {
  assert.equal(isWithinRoot(resolve(ROOT, "examples/a/b.lln"), ROOT), true);
  assert.equal(isWithinRoot(ROOT, ROOT), true, "the root itself is contained");
  assert.equal(isWithinRoot(resolve(ROOT, "../../etc/passwd"), ROOT), false);
});

test("isWithinRoot: sibling-prefix bypass is blocked (/root-evil vs /root)", () => {
  // A naive startsWith(root) check would admit `${ROOT}-evil`; the segment-safe relative() check rejects it.
  assert.equal(isWithinRoot(ROOT + "-evil" + sep + "x.lln", ROOT), false);
});

// ── LLN-IMPORT-006: size guard ──
test("an oversize within-root import is REJECTED by stat before the read (LLN-IMPORT-006)", () => {
  const dir = join(ROOT, ".h38-tmp");
  try {
    mkdirSync(dir, { recursive: true });
    const big = join(dir, "big.lln");
    writeFileSync(big, "x".repeat(MAX_IMPORT_BYTES + 1)); // one byte over the ceiling
    const src = join(dir, "entry.lln");
    const mods = resolveFileImports(src, [importDecl("./big.lln")]);
    assert.deepEqual(diagCodes(mods), ["LLN-IMPORT-006"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a small within-root import passes the size guard (reaches parse, no IMPORT-006)", () => {
  const dir = join(ROOT, ".h38-tmp-ok");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ok.lln"), "pure flow f() -> Int { 1 }\n");
    const src = join(dir, "entry.lln");
    const mods = resolveFileImports(src, [importDecl("./ok.lln")]);
    assert.equal(diagCodes(mods).includes("LLN-IMPORT-006"), false);
    assert.equal(diagCodes(mods).includes("LLN-IMPORT-005"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
