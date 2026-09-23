import assert from "node:assert/strict";
import { test } from "node:test";
import { admitPromoteCandidate } from "./cec-do-promote.mjs";

test("admitPromoteCandidate accepts a single relative example id", () => {
  assert.equal(admitPromoteCandidate("hello-world"), true);
});

test("hostile: traversal and absolute candidates are refused", () => {
  assert.equal(admitPromoteCandidate("../outside"), false);
  assert.equal(admitPromoteCandidate("foo/../../etc"), false);
  assert.equal(admitPromoteCandidate("/tmp/x"), false);
  assert.equal(admitPromoteCandidate("C:/Windows"), false);
  assert.equal(admitPromoteCandidate(""), false);
});
