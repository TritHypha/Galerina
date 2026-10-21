// S5 (1414-TS, 1414-BOX, X-KG12): secret authority leaves TS. The live app-kernel decision path
// runs the Fungi secret-gate artifact through the typed SecretsProvider port.
import { test } from "node:test";
import assert from "node:assert/strict";
import { red, readRepo, flatten, withUnit, galerina } from "./harness.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const KERNEL = "packages-ts/galerina-framework-app-kernel/src/kernel.ts";

test("S5: kernel.ts decision path does not construct the TS createSecretGate", red("S5", "TS createSecretGate not on the decision path"), () => {
  const t = readRepo(KERNEL);
  assert.notEqual(t, null);
  assert.equal(/\bcreateSecretGate\s*\(/.test(t), false, "kernel.ts still calls createSecretGate(");
  assert.equal(/import\s*\{[^}]*\bcreateSecretGate\b[^}]*\}\s*from\s*["']\.\/secret-gate\.js["']/.test(t), false, "kernel.ts still imports the TS gate");
});

test("S5: kernel.ts loads the Fungi secret-gate artifact", red("S5", "loaded path executes the Fungi artifact"), () => {
  const t = readRepo(KERNEL);
  assert.match(t, /secret-gate\.(wasm|fungi)/, "kernel.ts must reference the built Fungi secret-gate artifact");
});

test("S5/KG-12: the built secret-gate module reaches secrets only through an imported typed SecretsProvider port", red("S5", "KG-12 typed per-secret capability-gated SecretsProvider port"), () => {
  withUnit(flatten(["c-boundary", "release-commit-point", "secret-gate"]), (f, dir) => {
    const b = galerina(["build", f], dir);
    assert.equal(b.status, 0, "build must succeed");
    const wasm = readdirSync(join(dir, "build")).find((n) => n.endsWith(".wasm"));
    const mod = new WebAssembly.Module(readFileSync(join(dir, "build", wasm)));
    const imports = WebAssembly.Module.imports(mod).map((i) => i.module + "." + i.name);
    assert.ok(imports.some((n) => /secrets?/i.test(n)), "no SecretsProvider port import; imports: " + imports.join(","));
  });
});