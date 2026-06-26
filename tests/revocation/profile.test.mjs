/**
 * FAIL-SECURE GALERINA_PROFILE resolution (audit 2026-06-20).
 *
 * The signing/admission gates key their strict behaviour on "is this production?". Resolving that
 * fail-OPEN (anything ≠ "production" ⇒ dev) lets a typo'd value silently disable enforcement. This
 * resolver is fail-SECURE: only unset/empty or an explicitly-recognized dev token relaxes to dev;
 * a set-but-unrecognized value resolves to production. Mirrors core-config posture.ts.
 *
 * (Run by the governance test step; the package suite covers the end-to-end behaviour in
 *  galerina-core-compiler/tests/cli-compatibility.test.mjs.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSigningProfile, isProductionProfile, resolveSigningProfileWarned } from "../../governance/profile.mjs";

test("unset / empty / recognized dev tokens resolve to dev (zero-touch), not fail-secure", () => {
  for (const v of [undefined, "", "  ", "dev", "DEV", "Development", "development", "test", "testing", "local"]) {
    const r = resolveSigningProfile(v);
    assert.equal(r.profile, "dev", `'${v}' should resolve to dev`);
    assert.equal(r.failSecure, false, `'${v}' is a recognized/relaxed value, not a fail-secure default`);
    assert.equal(isProductionProfile(v), false);
  }
});

test("the exact canonical 'production' resolves to production cleanly (not fail-secure)", () => {
  for (const v of ["production", "PRODUCTION", "  production  "]) {
    const r = resolveSigningProfile(v);
    assert.equal(r.profile, "production", `'${v}' should resolve to production`);
    assert.equal(r.failSecure, false, `the canonical 'production' is recognized cleanly`);
    assert.equal(isProductionProfile(v), true);
  }
});

test("any SET value that is neither a dev token nor exact 'production' fail-secures to production", () => {
  // Near-misses ("prod"/"staging") and outright junk both resolve STRICT, flagged — never silently dev.
  for (const v of ["prod", "prod ", "staging", "stage", "produciton", "live", "release", "yes", "1", "on", "p"]) {
    const r = resolveSigningProfile(v);
    assert.equal(r.profile, "production", `'${v}' must fail-secure to production`);
    assert.equal(r.failSecure, true, `'${v}' must be flagged failSecure (not a recognized clean value)`);
    assert.equal(r.raw, v, "the raw value is preserved for the diagnostic");
    assert.equal(isProductionProfile(v), true);
  }
});

test("resolveSigningProfileWarned surfaces a coded warning ONLY when it fail-secured", () => {
  // Recognized values → no warning.
  let warned = [];
  resolveSigningProfileWarned((m) => warned.push(m), "dev");
  resolveSigningProfileWarned((m) => warned.push(m), "production");
  assert.equal(warned.length, 0, "recognized profiles must not warn");

  // Unrecognized → exactly one SPORE-PROFILE-UNRECOGNIZED warning that names the bad value.
  warned = [];
  const r = resolveSigningProfileWarned((m) => warned.push(m), "prod ");
  assert.equal(r.profile, "production");
  assert.equal(warned.length, 1);
  assert.ok(warned[0].includes("SPORE-PROFILE-UNRECOGNIZED"), "warning must carry the code");
  assert.ok(warned[0].includes("prod "), "warning must name the offending value");
});
