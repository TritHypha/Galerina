import assert from "node:assert/strict";
import { test } from "node:test";
import { sourcePresenceText } from "./conformance-scan.mjs";

test("hostile: comment-only construction text is stripped before presence checks", () => {
  const commented = "// crypto.verify(null, bytes, pub, sig)\nconst x = 1;\n";
  const live = "const valid = crypto.verify(null, bytes, pub, sig);\n";
  assert.equal(sourcePresenceText(commented).includes("crypto.verify(null,"), false);
  assert.equal(sourcePresenceText(live).includes("crypto.verify(null,"), true);
});
