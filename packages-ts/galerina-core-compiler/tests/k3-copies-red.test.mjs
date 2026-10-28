import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const at = (...parts) => join(ROOT, ...parts);

it("K3-COPIES wat-emitter emits i32.const -128 for Verdict.Unknown", { todo: "K3C-2 waits for Phillip owner nod" }, () => {
  const src = readFileSync(at("packages-ts/galerina-core-compiler/src/wat-emitter.ts"), "utf8");
  assert.match(src, /\(i32\.const -128\) \(; Verdict\.Unknown ;\)/);
  assert.doesNotMatch(src, /\(i32\.const 0\) \(; Verdict\.Unknown ;\)/);
});

it("K3-COPIES interpreter Unknown messages use -128", { todo: "K3C-2 waits for Phillip owner nod" }, () => {
  const src = readFileSync(at("packages-ts/galerina-core-compiler/src/interpreter.ts"), "utf8");
  assert.match(src, /Unknown\(-128\)/);
  assert.doesNotMatch(src, /Unknown\(0\)/);
});

it("K3-COPIES hardening-residency UNKNOWN is -128", { todo: "K3C-2 waits for Phillip owner nod" }, () => {
  const src = readFileSync(at("packages-ts/galerina-core-compiler/src/hardening-residency.ts"), "utf8");
  assert.match(src, /UNKNOWN:\s*-128/);
  assert.doesNotMatch(src, /UNKNOWN:\s*0\s+as const/);
});

it("K3-COPIES inference-governance does not document INDETERMINATE = 0", { todo: "K3C-2 waits for Phillip owner nod" }, () => {
  const src = readFileSync(at("packages-ts/galerina-tower-citizen/src/self-hosted/inference-governance.fungi"), "utf8");
  assert.doesNotMatch(src, /INDETERMINATE\s*=\s*0/);
});
