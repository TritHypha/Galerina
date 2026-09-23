import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { nativeCompileSpawnSpec } from "../src/build-native.mjs";

test("native compile spawn uses an argv vector with shell disabled", () => {
  const out = join("C:\\bench\\ok", "bench-native-rust.exe");
  const src = join("C:\\bench\\ok", "bench.rs");
  const spec = nativeCompileSpawnSpec("rustc", ["-O", "-o", out, src]);
  assert.equal(spec.options.shell, false);
  assert.deepEqual([...spec.args], ["-O", "-o", out, src]);
  assert.equal(spec.file, "rustc");
});

test("hostile: metacharacters in a repository path stay one argv element", () => {
  const hostileDir = 'bench"; calc.exe &';
  const out = join(hostileDir, "bench-native-rust.exe");
  const spec = nativeCompileSpawnSpec("rustc", ["-O", "-o", out, join(hostileDir, "bench.rs")]);
  assert.equal(spec.options.shell, false);
  assert.equal(spec.args[2], out);
  assert.equal(spec.args.includes("calc.exe"), false);
});

test("empty compiler or argv is refused", () => {
  assert.throws(() => nativeCompileSpawnSpec("", ["-O"]), /REFUSED/);
  assert.throws(() => nativeCompileSpawnSpec("rustc", []), /REFUSED/);
});
