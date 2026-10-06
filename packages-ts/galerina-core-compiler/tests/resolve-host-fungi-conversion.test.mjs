import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  canHonour,
  checkEffects,
  executeFlow,
  parseProgram,
  resolveHost,
} from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const SOURCE = join(PACKAGE_ROOT, "src", "self-hosted", "hardening-host-capability.fungi");
const PACKAGE = join(PACKAGE_ROOT, "package.json");
const VECTORS = Object.freeze([
  "mlock_posix",
  "register_pinned",
  "browser_secure_context",
  undefined,
  "",
  "unknown",
  "__proto__",
  "constructor",
  " mlock_posix",
  "mlock_posix ",
  "MLOCK_POSIX",
  "mlock_pos\u0131x",
  "mlock_posix\u0000tail",
]);
const CEILINGS = Object.freeze([
  "register_only",
  "no_dram_spill",
  "no_swap",
  "no_disk",
  "unrestricted",
]);
const HOSTILE_CEILINGS = Object.freeze([
  "",
  "unknown",
  "__proto__",
  "constructor",
  " no_swap",
  "no_swap ",
  "NO_SWAP",
  "n\u00f8_swap",
  "no_swap\u0000tail",
]);

function compileCandidate() {
  const source = readFileSync(SOURCE, "utf8").replace(/^\uFEFF/u, "");
  const program = parseProgram(source, "hardening-host-capability.fungi");
  assert.deepEqual(
    (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  assert.deepEqual(
    checkEffects(program.flows, program.ast)
      .flatMap((result) => result.diagnostics)
      .filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  return { program, source };
}

function unwrapRecord(value) {
  assert.equal(value.__tag, "record");
  assert.ok(value.fields instanceof Map);
  return Object.fromEntries(
    [...value.fields.entries()].map(([name, field]) => [name, field.value]),
  );
}

describe("compiler package-owned Fungi host resolution", () => {
  it("preserves declared profiles and fails closed for absent or hostile names", async () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE, "utf8"));
    assert.ok(
      packageJson.packageGraph.loadedAssets.includes(
        "src/self-hosted/hardening-host-capability.fungi",
      ),
      "the compiler package must own the Fungi host-capability module",
    );
    assert.ok(existsSync(SOURCE));

    const { program, source } = compileCandidate();
    assert.doesNotMatch(source, /^\s*(?:for|while|loop)\b/mu);
    assert.doesNotMatch(source, /\b(?:null|NaN|throw|try|catch)\b/u);
    assert.doesNotMatch(source, /\belse\s+if\b/u);
    assert.doesNotMatch(source, /\belse\b/u);

    for (const name of VECTORS) {
      const interpreted = await executeFlow(
        "resolveHostFungi",
        new Map([["name", { __tag: "string", value: name ?? "<undeclared>" }]]),
        program.ast,
        program.flows,
      );
      assert.deepEqual(
        unwrapRecord(interpreted.value),
        resolveHost(name),
        `resolveHost(${String(name)})`,
      );
      if (name === "mlock_posix") {
        assert.equal(
          unwrapRecord(interpreted.value).canNoSwap,
          false,
          "the Fungi host profile must not claim no-swap without runtime enforcement evidence",
        );
        assert.equal(
          unwrapRecord(interpreted.value).canNoDisk,
          false,
          "mlock alone must not claim no-disk without a separate persistence control",
        );
      }
    }
  });

  it("preserves the complete host honour decision and rejects hostile ceilings", async () => {
    const { program } = compileCandidate();
    for (const name of VECTORS) {
      const host = resolveHost(name);
      for (const ceiling of [...CEILINGS, ...HOSTILE_CEILINGS]) {
        const interpreted = await executeFlow(
          "canHonourFungi",
          new Map([
            ["ceiling", { __tag: "string", value: ceiling }],
            ["canRegisterPin", { __tag: "bool", value: host.canRegisterPin }],
            ["canNoDramSpill", { __tag: "bool", value: host.canNoDramSpill }],
            ["canNoSwap", { __tag: "bool", value: host.canNoSwap }],
            ["canNoDisk", { __tag: "bool", value: host.canNoDisk }],
          ]),
          program.ast,
          program.flows,
        );
        assert.deepEqual(
          interpreted.value,
          { __tag: "bool", value: canHonour(ceiling, host).ok },
          `${name ?? "<absent>"}:${ceiling}`,
        );
      }
    }
    const noSwap = await executeFlow(
      "canHonourFungi",
      new Map([
        ["ceiling", { __tag: "string", value: "no_swap" }],
        ["canRegisterPin", { __tag: "bool", value: false }],
        ["canNoDramSpill", { __tag: "bool", value: false }],
        ["canNoSwap", { __tag: "bool", value: false }],
        ["canNoDisk", { __tag: "bool", value: true }],
      ]),
      program.ast,
      program.flows,
    );
    assert.deepEqual(noSwap.value, { __tag: "bool", value: false });
  });
});
