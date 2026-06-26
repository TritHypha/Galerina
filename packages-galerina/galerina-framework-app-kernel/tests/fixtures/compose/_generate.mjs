// One-off generator for the multi-module composition fixtures (R&D 0052 Phase A Slice 2).
//
// Produces two tiny, hand-authored packages that exercise a REAL cross-module wasm→wasm call:
//   clockprovider  — provides capability "clock.read"; exports __clock_now_ms() -> 42
//   clockconsumer  — declares capability "clock.read"; imports clock.__clock_now_ms;
//                    exports main() -> (call the imported clock) so a fused call returns 42.
//
// The import shape (module "clock", function "__clock_now_ms") MUST match the fuse-loader's
// built-in capability host-import shape for "clock.read". When clockconsumer is fused WITH
// clockprovider, makeProviderFactory routes clock.__clock_now_ms → clockprovider.invoke(...),
// so consumer.invoke("main") === 42 proves the boundary call.
//
// Re-run from the app-kernel package dir:
//   node tests/fixtures/compose/_generate.mjs
// It uses the core-compiler's wabt-backed assembleWAT (resolved via its dist).
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { assembleWAT } = await import(
  new URL("../../../../galerina-core-compiler/dist/wat-assembler.js", import.meta.url).href
);

const PROVIDER_WAT = `(module
  ;; clock.read provider — exports the capability's shaped function.
  (func (export "__clock_now_ms") (result i32)
    i32.const 42))`;

const CONSUMER_WAT = `(module
  ;; clock.read consumer — imports the capability host-import shape and calls it from main.
  (import "clock" "__clock_now_ms" (func $now (result i32)))
  (func (export "main") (result i32)
    call $now))`;

function manifest(fuse) {
  // Minimal signed-shape manifest: only the embedded fuse block + (absent) signature matter
  // to the loader. No governanceSignature => treated as unsigned (tests pass allowUnsigned).
  return {
    schemaVersion: "spore.manifest.v1",
    flowCount: 1,
    fuse: {
      schemaVersion: "spore.fuse.v1",
      version: "0.0.0",
      kind: "capability",
      seam: null,
      ...fuse,
    },
  };
}

async function emit(name, wat, fuse) {
  const res = await assembleWAT(wat);
  if (!res.valid) throw new Error(`${name}: WAT did not assemble: ${JSON.stringify(res.diagnostics)}`);
  const wasm = res.wasm;
  const sha = "sha256:" + createHash("sha256").update(wasm).digest("hex");
  const dir = join(here, name);
  const dist = join(dir, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dir, "package.spore.json"), JSON.stringify({ name }, null, 2) + "\n");
  writeFileSync(join(dist, `${name}.wasm`), Buffer.from(wasm));
  writeFileSync(
    join(dist, `${name}.lmanifest.json`),
    JSON.stringify(manifest({ name, wasmSha256: sha, ...fuse }), null, 2) + "\n",
  );
  console.log(`wrote ${name}: ${wasm.length} bytes, ${sha}`);
}

await emit("clockprovider", PROVIDER_WAT, { provides: "clock.read", capabilities: [] });
await emit("clockconsumer", CONSUMER_WAT, { provides: null, capabilities: ["clock.read"] });
console.log("done.");
