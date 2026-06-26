// =============================================================================
// Phase 25 — WASM Auth Service Scaffold + STDLIB_CAPABILITY_MAP Import Wiring
//
// Tests:
//   25A. getWATImportsForEffects populates imports from STDLIB_CAPABILITY_MAP
//   25A. buildWATModule: effectful flows produce correct host:* WAT imports
//   25A. database.read + audit.write effects → host:db.* + host:audit.write imports
//   25B. verifyPassword.spore: parses with 0 errors
//   25B. verifyPassword.spore: emitGIR produces correct declared effects
//   25B. verifyPassword.spore: buildWATModule produces WAT with host:* imports
//   25B. crypto.verify effect added to STDLIB_CAPABILITY_MAP (host:crypto.verify)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
  parseProgram,
  checkEffects,
  emitGIR,
  buildWATModule,
  renderWAT,
  getWATImportsForEffects,
  STDLIB_CAPABILITY_MAP,
} from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const VERIFY_PASSWORD_PATH = join(__dir, "../../../examples/auth-service/verifyPassword.spore");

// ---------------------------------------------------------------------------
// 25A — getWATImportsForEffects: STDLIB_CAPABILITY_MAP wiring
// ---------------------------------------------------------------------------

describe("Phase 25A: getWATImportsForEffects populates imports from STDLIB_CAPABILITY_MAP", () => {
  it("returns WATImport entries for database.read effect", () => {
    const imports = getWATImportsForEffects(["database.read"]);
    assert.ok(imports.length > 0, "Expected at least one import for database.read");
    const names = imports.map((i) => i.name);
    const hasDbImport = names.some((n) => n.startsWith("db."));
    assert.ok(
      hasDbImport,
      `Expected a db.* import for database.read, got: ${names.join(", ")}`,
    );
  });

  it("returns WATImport entries for audit.write effect", () => {
    const imports = getWATImportsForEffects(["audit.write"]);
    assert.ok(imports.length > 0, "Expected at least one import for audit.write");
    const names = imports.map((i) => i.name);
    const hasAuditImport = names.some((n) => n.startsWith("audit."));
    assert.ok(
      hasAuditImport,
      `Expected an audit.* import for audit.write, got: ${names.join(", ")}`,
    );
  });

  it("returns WATImport entries for crypto.verify effect (Phase 25 addition)", () => {
    const imports = getWATImportsForEffects(["crypto.verify"]);
    assert.ok(imports.length > 0, "Expected at least one import for crypto.verify");
    const names = imports.map((i) => i.name);
    const hasCryptoImport = names.some((n) => n.includes("crypto.verify"));
    assert.ok(
      hasCryptoImport,
      `Expected crypto.verify import, got: ${names.join(", ")}`,
    );
  });

  it("deduplicates imports when multiple effects map to the same wasmImport", () => {
    // audit.write is covered by both "AuditLog.write" and "audit.write" entries
    // but should only appear once in the output
    const imports = getWATImportsForEffects(["audit.write"]);
    const auditWriteImports = imports.filter((i) => i.name === "audit.write");
    assert.ok(
      auditWriteImports.length <= 1,
      `Expected at most 1 audit.write import (dedup), got ${auditWriteImports.length}`,
    );
  });

  it("combines imports for database.read + audit.write + crypto.verify (verifyPassword effects)", () => {
    const effects = ["database.read", "secret.read", "crypto.verify", "audit.write"];
    const imports = getWATImportsForEffects(effects);
    const names = imports.map((i) => i.name);

    // Must have at least one db.* import
    assert.ok(names.some((n) => n.startsWith("db.")), `Expected db.* import, got: ${names.join(", ")}`);
    // Must have at least one audit.* import
    assert.ok(names.some((n) => n.startsWith("audit.")), `Expected audit.* import, got: ${names.join(", ")}`);
    // Must have at least one secret.* or env.* import
    assert.ok(
      names.some((n) => n.includes("secret") || n.includes("vault") || n.includes("env")),
      `Expected secret.* import, got: ${names.join(", ")}`,
    );
    // Must have crypto.verify import
    assert.ok(names.some((n) => n.includes("crypto.verify")), `Expected crypto.verify import, got: ${names.join(", ")}`);

    console.log(`  [25A] Combined imports for verifyPassword effects: ${names.join(", ")}`);
  });

  it("all imports have 'host' as module (WASM standalone target)", () => {
    const effects = ["database.read", "audit.write", "crypto.verify", "secret.read"];
    const imports = getWATImportsForEffects(effects);
    for (const imp of imports) {
      assert.equal(
        imp.module,
        "host",
        `Import '${imp.name}' should have module='host', got '${imp.module}'`,
      );
    }
  });

  it("all imports carry the correct effect name in the .effect field", () => {
    const imports = getWATImportsForEffects(["database.read"]);
    for (const imp of imports) {
      assert.equal(
        imp.effect,
        "database.read",
        `Import ${imp.name} should have effect='database.read', got '${imp.effect}'`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 25A — buildWATModule: effectful flows produce correct host:* WAT imports
// ---------------------------------------------------------------------------

describe("Phase 25A: buildWATModule emits correct host:* imports for effectful flows", () => {
  it("secure flow with database.read + audit.write → WAT imports include host:db.* and host:audit.*", () => {
    const src = [
      "secure flow verify(readonly request: Request) -> Response",
      "contract { effects { database.read audit.write } }",
      "{ return Response.ok({}) }",
    ].join("\n");

    const p = parseProgram(src, "t.spore");
    const eff = checkEffects(p.flows, p.ast);
    const gir = emitGIR(p.ast, p.flows, eff);
    const mod = buildWATModule(gir.gir, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    const importLines = wat.split("\n").filter((l) => l.includes("import"));
    assert.ok(
      importLines.length > 0,
      `Expected WAT import lines for effectful flow, got WAT:\n${wat}`,
    );

    const hasDbImport = importLines.some((l) => l.includes("db."));
    const hasAuditImport = importLines.some((l) => l.includes("audit."));

    assert.ok(hasDbImport, `Expected host:db.* import line, got:\n${importLines.join("\n")}`);
    assert.ok(hasAuditImport, `Expected host:audit.* import line, got:\n${importLines.join("\n")}`);

    console.log(`  [25A] WAT import lines for verify flow:`);
    for (const line of importLines) {
      console.log(`    ${line.trim()}`);
    }
  });

  it("pure flow with no effects → WAT has no import lines", () => {
    const src = "pure flow add(a: Int, b: Int) -> Int { return a }";
    const p = parseProgram(src, "t.spore");
    const eff = checkEffects(p.flows, p.ast);
    const gir = emitGIR(p.ast, p.flows, eff);
    const mod = buildWATModule(gir.gir, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    const importLines = wat.split("\n").filter((l) => l.trim().startsWith("(import"));
    assert.equal(
      importLines.length,
      0,
      `Expected no imports for pure flow, got:\n${importLines.join("\n")}`,
    );
  });
});

// ---------------------------------------------------------------------------
// 25B — verifyPassword.spore: parse + GIR effects + WAT imports
// ---------------------------------------------------------------------------

describe("Phase 25B: verifyPassword.spore parses and emits correct GIR + WAT", () => {
  let vpSource;
  try {
    vpSource = readFileSync(VERIFY_PASSWORD_PATH, "utf8");
    if (vpSource.charCodeAt(0) === 0xFEFF) vpSource = vpSource.slice(1);
  } catch (e) {
    // File not present — skip gracefully
    vpSource = null;
  }

  it("verifyPassword.spore file exists and is readable", () => {
    assert.ok(
      vpSource !== null,
      `verifyPassword.spore not found at: ${VERIFY_PASSWORD_PATH}`,
    );
  });

  it("verifyPassword.spore parses with 0 errors", () => {
    if (!vpSource) return assert.ok(true, "skipped — file missing");
    const parsed = parseProgram(vpSource, "verifyPassword.spore");
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `verifyPassword.spore parse errors (${errors.length}):\n${errors.map((e) => e.message).join("\n")}`,
    );
  });

  it("verifyPassword.spore emitGIR: declares database.read effect", () => {
    if (!vpSource) return assert.ok(true, "skipped — file missing");
    const parsed = parseProgram(vpSource, "verifyPassword.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    const flow = gir.gir.flows.find((f) => f.name === "verifyPassword");
    assert.ok(flow, "Expected verifyPassword flow in GIR");
    const declared = flow.effects.declared;
    assert.ok(
      declared.includes("database.read"),
      `Expected database.read in declared effects, got: ${declared.join(", ")}`,
    );
  });

  it("verifyPassword.spore emitGIR: declares crypto.verify effect", () => {
    if (!vpSource) return assert.ok(true, "skipped — file missing");
    const parsed = parseProgram(vpSource, "verifyPassword.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    const flow = gir.gir.flows.find((f) => f.name === "verifyPassword");
    assert.ok(flow, "Expected verifyPassword flow in GIR");
    const declared = flow.effects.declared;
    assert.ok(
      declared.includes("crypto.verify"),
      `Expected crypto.verify in declared effects, got: ${declared.join(", ")}`,
    );
  });

  it("verifyPassword.spore emitGIR: declares audit.write effect", () => {
    if (!vpSource) return assert.ok(true, "skipped — file missing");
    const parsed = parseProgram(vpSource, "verifyPassword.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    const flow = gir.gir.flows.find((f) => f.name === "verifyPassword");
    assert.ok(flow, "Expected verifyPassword flow in GIR");
    const declared = flow.effects.declared;
    assert.ok(
      declared.includes("audit.write"),
      `Expected audit.write in declared effects, got: ${declared.join(", ")}`,
    );
  });

  it("verifyPassword.spore buildWATModule: WAT contains host:* imports", () => {
    if (!vpSource) return assert.ok(true, "skipped — file missing");
    const parsed = parseProgram(vpSource, "verifyPassword.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    const mod = buildWATModule(gir.gir, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    const hasImports = wat.includes("(import");
    assert.ok(hasImports, `Expected WAT imports for verifyPassword, WAT:\n${wat.slice(0, 500)}`);

    const importLines = wat.split("\n").filter((l) => l.includes("(import"));
    console.log(`  [25B] verifyPassword WAT imports (${importLines.length}):`);
    for (const line of importLines) {
      console.log(`    ${line.trim()}`);
    }
  });

  it("verifyPassword.spore buildWATModule: WAT includes host:audit.write import", () => {
    if (!vpSource) return assert.ok(true, "skipped — file missing");
    const parsed = parseProgram(vpSource, "verifyPassword.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    const mod = buildWATModule(gir.gir, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    assert.ok(
      wat.includes("audit.write"),
      `Expected host:audit.write import in WAT, got:\n${wat.slice(0, 800)}`,
    );
  });

  it("verifyPassword.spore buildWATModule: WAT includes host:db.* import", () => {
    if (!vpSource) return assert.ok(true, "skipped — file missing");
    const parsed = parseProgram(vpSource, "verifyPassword.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    const mod = buildWATModule(gir.gir, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    const hasDbImport = wat.split("\n").some((l) => l.includes("db."));
    assert.ok(
      hasDbImport,
      `Expected host:db.* import in WAT, got:\n${wat.slice(0, 800)}`,
    );
  });

  it("verifyPassword.spore buildWATModule: WAT includes host:crypto.verify import", () => {
    if (!vpSource) return assert.ok(true, "skipped — file missing");
    const parsed = parseProgram(vpSource, "verifyPassword.spore");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    const mod = buildWATModule(gir.gir, STDLIB_CAPABILITY_MAP);
    const wat = renderWAT(mod);

    assert.ok(
      wat.includes("crypto.verify"),
      `Expected host:crypto.verify import in WAT, got:\n${wat.slice(0, 800)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// 25B — STDLIB_CAPABILITY_MAP: crypto.verify and crypto.sign entries
// ---------------------------------------------------------------------------

describe("Phase 25B: STDLIB_CAPABILITY_MAP crypto entries (Phase 25 additions)", () => {
  it("STDLIB_CAPABILITY_MAP has Crypto.verify entry with crypto.verify effect", () => {
    const entry = STDLIB_CAPABILITY_MAP.get("Crypto.verify");
    assert.ok(entry, "Expected Crypto.verify in STDLIB_CAPABILITY_MAP");
    assert.ok(
      entry.requiredEffects.includes("crypto.verify"),
      `Expected crypto.verify effect, got: ${entry.requiredEffects.join(", ")}`,
    );
    assert.ok(
      entry.wasmImport !== undefined,
      "Expected wasmImport field on Crypto.verify entry",
    );
    assert.ok(
      entry.wasmImport.startsWith("host:crypto.verify"),
      `Expected host:crypto.verify wasmImport, got: ${entry.wasmImport}`,
    );
  });

  it("STDLIB_CAPABILITY_MAP has crypto.verify (lowercase) entry", () => {
    const entry = STDLIB_CAPABILITY_MAP.get("crypto.verify");
    assert.ok(entry, "Expected crypto.verify in STDLIB_CAPABILITY_MAP");
    assert.ok(
      entry.requiredEffects.includes("crypto.verify"),
      `Expected crypto.verify effect, got: ${entry.requiredEffects.join(", ")}`,
    );
  });

  it("getWATImportsForEffects: crypto.verify effect resolves to wasmImport", () => {
    const imports = getWATImportsForEffects(["crypto.verify"]);
    assert.ok(
      imports.length > 0,
      "Expected at least one WATImport for crypto.verify effect",
    );
    const imp = imports[0];
    assert.equal(imp.module, "host");
    assert.ok(
      imp.name.includes("crypto.verify"),
      `Expected import name to contain 'crypto.verify', got: ${imp.name}`,
    );
  });
});
