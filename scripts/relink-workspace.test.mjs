import assert from "node:assert/strict";
import { test } from "node:test";
import { admitWorkspaceDepName } from "./relink-workspace.mjs";

test("admitWorkspaceDepName accepts unscoped and scoped npm names", () => {
  assert.equal(admitWorkspaceDepName("galerina-core"), true);
  assert.equal(admitWorkspaceDepName("@galerina/core-compiler"), true);
});

test("hostile: traversal and option-like names cannot become link paths", () => {
  assert.equal(admitWorkspaceDepName("../victim"), false);
  assert.equal(admitWorkspaceDepName("@galerina/../victim"), false);
  assert.equal(admitWorkspaceDepName("foo/../../etc"), false);
  assert.equal(admitWorkspaceDepName("foo\\..\\bar"), false);
  assert.equal(admitWorkspaceDepName(""), false);
  assert.equal(admitWorkspaceDepName("@scope/name/extra"), false);
});
