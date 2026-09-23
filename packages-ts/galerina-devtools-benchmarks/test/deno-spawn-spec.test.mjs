import assert from "node:assert/strict";
import { test } from "node:test";
import { denoWebGpuSpawnSpec } from "../src/runner.mjs";

test("deno WebGPU spawn uses an argv vector with shell disabled", () => {
  const spec = denoWebGpuSpawnSpec("C:\\deno\\deno.exe", "C:\\bench\\bench-deno-webgpu.ts");
  assert.equal(spec.options.shell, false);
  assert.deepEqual([...spec.args], ["run", "--unstable-webgpu", "C:\\bench\\bench-deno-webgpu.ts"]);
  assert.equal(spec.file, "C:\\deno\\deno.exe");
});

test("hostile: metacharacters in the runner path stay one argv element", () => {
  const hostile = 'bench-deno-webgpu.ts"; calc.exe &';
  const spec = denoWebGpuSpawnSpec("deno", hostile);
  assert.equal(spec.options.shell, false);
  assert.equal(spec.args[2], hostile);
  assert.equal(spec.args.join(" ").includes("calc.exe"), true);
  assert.equal(typeof spec.file === "string" && !spec.file.includes("calc.exe"), true);
});

test("empty deno or runner paths are refused", () => {
  assert.throws(() => denoWebGpuSpawnSpec("", "runner.ts"), /REFUSED/);
  assert.throws(() => denoWebGpuSpawnSpec("deno", ""), /REFUSED/);
});
