import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const EVIDENCE = join(MEM, "evidence", "47-auth-verify-e2e", "ts-differential.txt");

test("TS differential is typed UNKNOWN: no frozen e2e oracle on the base", () => {
  const note = readFileSync(EVIDENCE, "utf8");
  assert.equal(note.includes("TYPED_UNKNOWN"), true, "evidence records UNKNOWN");
  assert.equal(note.includes("AUTH_VERIFY_E2E"), true, "unit named");
  assert.equal(note.includes("POST_DISPATCH_SPENT_SUCCESS_ABI"), true, "spent success ABI");
  assert.equal(note.includes("H1_FIXED_FLAT_BUILD_NAME"), true, "H1 unknown");
  const oracle = join(REPO, "packages-ts", "galerina-framework-app-kernel", "src", "auth-verify-e2e.ts");
  assert.equal(existsSync(oracle), false, "no e2e TS oracle");
});
