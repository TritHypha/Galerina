// =============================================================================
// Module Registry — import "./path.spore" DAG Merge Tests (task #94)
//
// Tests for file-based import resolution using the module registry.
// The `gatherFileImports` function is available in dist/module-registry.js.
//
// Covers:
//   - SPORE-IMPORT-001: file not found at the resolved path
//   - SPORE-IMPORT-003: circular import detected (A imports B imports A)
//   - SPORE-IMPORT-004: symbol collision warning (local + imported same name)
//   - Valid import resolves symbols from the imported file
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseProgram } from "../../dist/index.js";
import {
  gatherFileImports,
  resolveFileImports,
  checkFileSymbolCollisions,
} from "../../dist/module-registry.js";

// ---------------------------------------------------------------------------
// Temp file helpers
// ---------------------------------------------------------------------------

function createTempDir() {
  const dir = join(tmpdir(), `galerina-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeTempFile(dir, name, content) {
  const p = join(dir, name);
  writeFileSync(p, content, "utf8");
  return p;
}

function cleanDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

// ---------------------------------------------------------------------------
// Valid import resolves symbols
// ---------------------------------------------------------------------------

describe("import './path.spore': valid import resolves symbols", () => {
  it("importing a file with a pure flow exposes it as a 'flow' symbol", () => {
    const dir = createTempDir();
    try {
      const libPath = writeTempFile(dir, "lib.spore", `
pure flow addTwo(n: Int) -> Int
contract { effects {} }
{ return n }
`);

      const mainSrc = `import "./lib.spore"\n`;
      const { ast } = parseProgram(mainSrc, join(dir, "main.spore"));
      const result = gatherFileImports(ast, join(dir, "main.spore"));

      assert.equal(
        result.diagnostics.length,
        0,
        `Expected 0 diagnostics for valid import, got: ${result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
      );
      assert.ok(result.symbols.length > 0, "Expected at least one imported symbol");
      const sym = result.symbols.find((s) => s.name === "addTwo");
      assert.ok(sym !== undefined, `Expected 'addTwo' in imported symbols, got: ${result.symbols.map((s) => s.name).join(", ")}`);
      assert.equal(sym.kind, "flow", "addTwo must be classified as a 'flow' symbol");
    } finally {
      cleanDir(dir);
    }
  });

  it("importing a file with a guard exposes it as a 'guard' symbol", () => {
    const dir = createTempDir();
    try {
      const libPath = writeTempFile(dir, "guards.spore", `
guard PayGuard {
  permitted_effects {
    gateway.charge
  }
}
`);

      const mainSrc = `import "./guards.spore"\n`;
      const { ast } = parseProgram(mainSrc, join(dir, "main.spore"));
      const result = gatherFileImports(ast, join(dir, "main.spore"));

      assert.equal(
        result.diagnostics.length,
        0,
        `Expected 0 diagnostics, got: ${result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
      );
      const sym = result.symbols.find((s) => s.name === "PayGuard");
      assert.ok(sym !== undefined, `Expected 'PayGuard' in symbols, got: ${result.symbols.map((s) => s.name).join(", ")}`);
      assert.equal(sym.kind, "guard", "PayGuard must be classified as a 'guard' symbol");
    } finally {
      cleanDir(dir);
    }
  });

  it("resolved paths list includes the imported file path", () => {
    const dir = createTempDir();
    try {
      const libPath = writeTempFile(dir, "utils.spore", `
pure flow identity(x: Int) -> Int
contract { effects {} }
{ return x }
`);

      const mainSrc = `import "./utils.spore"\n`;
      const { ast } = parseProgram(mainSrc, join(dir, "main.spore"));
      const result = gatherFileImports(ast, join(dir, "main.spore"));

      assert.ok(
        result.resolvedPaths.length > 0,
        "resolvedPaths must contain at least the imported file",
      );
      assert.ok(
        result.resolvedPaths.some((p) => p.endsWith("utils.spore")),
        `Expected utils.spore in resolvedPaths, got: ${result.resolvedPaths.join(", ")}`,
      );
    } finally {
      cleanDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// SPORE-IMPORT-001: file not found
// ---------------------------------------------------------------------------

describe("SPORE-IMPORT-001: import of non-existent file", () => {
  it("import './nonexistent.spore' produces SPORE-IMPORT-001 diagnostic", () => {
    const dir = createTempDir();
    try {
      const mainSrc = `import "./nonexistent.spore"\n`;
      const { ast } = parseProgram(mainSrc, join(dir, "main.spore"));
      const result = gatherFileImports(ast, join(dir, "main.spore"));

      const imp001 = result.diagnostics.filter((d) => d.code === "SPORE-IMPORT-001");
      assert.ok(
        imp001.length >= 1,
        `Expected SPORE-IMPORT-001 for missing file, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
      );
      assert.equal(
        imp001[0].severity,
        "error",
        "SPORE-IMPORT-001 must be an error",
      );
      assert.ok(
        imp001[0].message.includes("nonexistent.spore") || imp001[0].importedFrom?.includes("nonexistent"),
        `SPORE-IMPORT-001 message must mention the missing file, got: ${imp001[0].message}`,
      );
    } finally {
      cleanDir(dir);
    }
  });

  it("import with valid package name (not relative) does not trigger SPORE-IMPORT-001", () => {
    // Package imports like `import Email from "@galerina/core-types"` are handled
    // by resolveImports, not gatherFileImports. Non-relative imports return no results.
    const dir = createTempDir();
    try {
      const mainSrc = `import Email from "@galerina/core-types"\n`;
      const { ast } = parseProgram(mainSrc, join(dir, "main.spore"));
      const result = gatherFileImports(ast, join(dir, "main.spore"));

      const imp001 = result.diagnostics.filter((d) => d.code === "SPORE-IMPORT-001");
      assert.equal(
        imp001.length,
        0,
        `Non-relative package import must not trigger SPORE-IMPORT-001`,
      );
    } finally {
      cleanDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// SPORE-IMPORT-003: circular import
// ---------------------------------------------------------------------------

describe("SPORE-IMPORT-003: circular import detected", () => {
  it("file A imports file B which imports file A — SPORE-IMPORT-003", () => {
    const dir = createTempDir();
    try {
      // Write file B first (it imports A)
      writeTempFile(dir, "b.spore", `import "./a.spore"\n\npure flow fromB() -> Int\ncontract { effects {} }\n{ return 1 }\n`);
      // Write file A (it imports B)
      writeTempFile(dir, "a.spore", `import "./b.spore"\n\npure flow fromA() -> Int\ncontract { effects {} }\n{ return 2 }\n`);

      // Parse the main entry point (a.spore imports b.spore imports a.spore → cycle)
      const mainSrc = `import "./a.spore"\n`;
      const { ast } = parseProgram(mainSrc, join(dir, "main.spore"));
      const result = gatherFileImports(ast, join(dir, "main.spore"));

      const imp003 = result.diagnostics.filter((d) => d.code === "SPORE-IMPORT-003");
      assert.ok(
        imp003.length >= 1,
        `Expected SPORE-IMPORT-003 for circular import, got: ${result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
      );
      assert.equal(
        imp003[0].severity,
        "error",
        "SPORE-IMPORT-003 must be an error",
      );
    } finally {
      cleanDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// SPORE-IMPORT-004: symbol collision warning
// ---------------------------------------------------------------------------

describe("SPORE-IMPORT-004: symbol collision between imports", () => {
  it("two imported files with the same flow name — SPORE-IMPORT-004 warning", () => {
    // SPORE-IMPORT-004 is emitted by checkFileSymbolCollisions, not gatherFileImports.
    // gatherFileImports returns all symbols; the collision check is a separate step.
    const dir = createTempDir();
    try {
      writeTempFile(dir, "lib1.spore", `pure flow helper() -> Int\ncontract { effects {} }\n{ return 1 }\n`);
      writeTempFile(dir, "lib2.spore", `pure flow helper() -> Int\ncontract { effects {} }\n{ return 2 }\n`);

      const mainSrc = `import "./lib1.spore"\nimport "./lib2.spore"\n`;
      const { ast } = parseProgram(mainSrc, join(dir, "main.spore"));
      const importResult = gatherFileImports(ast, join(dir, "main.spore"));

      // Run the symbol collision check with an empty local-name set
      const collisions = checkFileSymbolCollisions(
        importResult.symbols,
        new Set(),
        join(dir, "main.spore"),
      );

      const imp004 = collisions.filter((d) => d.code === "SPORE-IMPORT-004");
      assert.ok(
        imp004.length >= 1,
        `Expected SPORE-IMPORT-004 for symbol collision on 'helper', got: ${collisions.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
      );
      assert.equal(
        imp004[0].severity,
        "warning",
        "SPORE-IMPORT-004 must be a warning (not a hard error)",
      );
    } finally {
      cleanDir(dir);
    }
  });

  it("two imports with distinct symbol names — no SPORE-IMPORT-004", () => {
    const dir = createTempDir();
    try {
      writeTempFile(dir, "libA.spore", `pure flow alpha() -> Int\ncontract { effects {} }\n{ return 1 }\n`);
      writeTempFile(dir, "libB.spore", `pure flow beta() -> Int\ncontract { effects {} }\n{ return 2 }\n`);

      const mainSrc = `import "./libA.spore"\nimport "./libB.spore"\n`;
      const { ast } = parseProgram(mainSrc, join(dir, "main.spore"));
      const importResult = gatherFileImports(ast, join(dir, "main.spore"));

      const collisions = checkFileSymbolCollisions(
        importResult.symbols,
        new Set(),
        join(dir, "main.spore"),
      );

      const imp004 = collisions.filter((d) => d.code === "SPORE-IMPORT-004");
      assert.equal(
        imp004.length,
        0,
        `Expected no SPORE-IMPORT-004 for distinct symbol names, got: ${imp004.map((d) => d.message).join("; ")}`,
      );
    } finally {
      cleanDir(dir);
    }
  });
});
