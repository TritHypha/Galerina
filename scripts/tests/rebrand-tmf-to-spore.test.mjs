import { test } from "node:test";
import assert from "node:assert/strict";
import { admitRebrandRel, gitMvArgs, rebrandContent } from "../rebrand-tmf-to-spore.mjs";

test("rebrandContent rewrites the three disjoint cases", () => {
  assert.equal(rebrandContent("tmf Tmf TMF tmx"), "spore Spore SPORE tmx");
});

test("hostile: option-like and escaping tracked names are refused", () => {
  assert.equal(admitRebrandRel("src/foo.tmf"), true);
  assert.equal(admitRebrandRel("--output=/tmp/pwn"), false);
  assert.equal(admitRebrandRel("-c"), false);
  assert.equal(admitRebrandRel("../secret"), false);
  assert.equal(admitRebrandRel("/etc/passwd"), false);
  assert.equal(admitRebrandRel("C:\\Windows\\system32"), false);
  assert.equal(admitRebrandRel("a/../b.tmf"), false);
  assert.equal(admitRebrandRel(""), false);
});

test("git mv argv is option-terminated admitted paths", () => {
  assert.deepEqual(gitMvArgs("docs/tmf.md", "docs/spore.md"), ["mv", "--", "docs/tmf.md", "docs/spore.md"]);
  assert.throws(() => gitMvArgs("--output=x", "docs/spore.md"), /ERR_REBRAND_PATH/);
  assert.throws(() => gitMvArgs("docs/tmf.md", "../escape"), /ERR_REBRAND_PATH/);
});
