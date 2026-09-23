import { test } from "node:test";
import assert from "node:assert/strict";
import { admitDocWatSource } from "../emit-doc-wat.mjs";

test("admitDocWatSource accepts a repository-relative fungi path", () => {
  assert.equal(admitDocWatSource("examples/wasm-hello-world/greet.fungi"), true);
});

test("hostile: traversal and absolute markers cannot become source paths", () => {
  assert.equal(admitDocWatSource("../secret.fungi"), false);
  assert.equal(admitDocWatSource("docs/../../etc/passwd"), false);
  assert.equal(admitDocWatSource("/etc/passwd"), false);
  assert.equal(admitDocWatSource("C:/Windows/a.fungi"), false);
  assert.equal(admitDocWatSource("\\\\server\\share\\a.fungi"), false);
  assert.equal(admitDocWatSource(""), false);
});
