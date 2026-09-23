import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "galerina.mjs");

test("verify success banner is after the signature and revocation gate", () => {
  const src = readFileSync(CLI, "utf8");
  const verify = src.indexOf('if (command === "verify")');
  const requireSigned = src.indexOf("const requireSigned = resolveSigningProfileWarned()", verify);
  const banner = src.indexOf("manifest verified", requireSigned);
  const tamper = src.indexOf("FUNGI-MANIFEST-TAMPER: Signature verification FAILED", verify);
  const revoked = src.indexOf("FUNGI-MANIFEST-REVOKED-KEY", verify);
  assert.ok(verify >= 0 && requireSigned > verify);
  assert.ok(banner > requireSigned, "success banner must follow profile-gated signature admission");
  assert.ok(tamper > requireSigned && tamper < banner);
  assert.ok(revoked > requireSigned && revoked < banner);
  assert.doesNotMatch(
    src.slice(verify, requireSigned),
    /manifest verified/,
  );
});
