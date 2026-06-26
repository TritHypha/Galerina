// governance/profile.mjs — the single, FAIL-SECURE resolver for GALERINA_PROFILE.
//
// WHY THIS EXISTS (audit, 2026-06-20):
//   The signing/admission gates (build signing key policy, `galerina verify`, `galerina run`) all key their
//   STRICT behaviour on "is this production?". Resolving that as `=== "production" ? "production" : "dev"`
//   is FAIL-OPEN: any value other than the exact string "production" (a typo like "prod" or "Production ",
//   "PRODUCTION", a stray space) silently resolves to dev — silently DISABLING every production gate. So an
//   operator who *intends* production but mis-spells the value gets throwaway-key dev signing with no error.
//
//   This resolver is FAIL-SECURE, mirroring core-config posture.ts (deriveImportProfile): only an UNSET/empty
//   value or an explicitly RECOGNIZED dev/test token relaxes to dev. Anything set-but-unrecognized resolves
//   to production (`failSecure: true`) so a malformed profile can never quietly turn enforcement off.
//
//   UNSET stays dev on purpose — that is the zero-touch local-development case (key-lifecycle auto-provisions
//   a dev key). The hazard being closed is a *set-but-wrong* value, not the absence of one.

// Explicitly-recognized dev/test tokens (plus unset/empty) that relax to the dev profile. Everything
// NOT in this set resolves to production; only the exact canonical "production" does so cleanly (without
// a fail-secure warning). A near-miss like "prod" / "staging" / a typo still resolves STRICT (production)
// but is flagged so the operator spells out the canonical value — strictness without silent surprises.
const DEV_TOKENS = new Set(["", "dev", "develop", "development", "test", "testing", "local"]);

/**
 * Resolve the raw GALERINA_PROFILE value to a signing/admission profile, fail-secure.
 * @param {string|undefined} raw  defaults to process.env.GALERINA_PROFILE
 * @returns {{ profile: "dev"|"production", failSecure: boolean, raw: string|undefined }}
 *   `failSecure` is true ONLY when the value was set to something other than a recognized dev token or the
 *   exact canonical "production" (resolved strict as a precaution; the caller should surface a warning).
 */
export function resolveSigningProfile(raw = process.env.GALERINA_PROFILE) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (DEV_TOKENS.has(v)) return { profile: "dev", failSecure: false, raw };
  if (v === "production") return { profile: "production", failSecure: false, raw };
  // Set-but-not-the-canonical-"production" (a typo, "prod", "staging", "live", …) → fail-secure to
  // production: the strict outcome, but flagged so a malformed value never silently relaxes enforcement.
  return { profile: "production", failSecure: true, raw };
}

/** True iff the resolved profile is production (the strict signing/admission gate). */
export function isProductionProfile(raw = process.env.GALERINA_PROFILE) {
  return resolveSigningProfile(raw).profile === "production";
}

/**
 * Resolve, and emit a one-line warning via `warn` when the value was set-but-unrecognized (fail-secured).
 * Surfaces the misconfiguration instead of letting it pass silently. Returns the same object as resolveSigningProfile.
 * @param {(msg: string) => void} warn
 * @param {string|undefined} raw
 */
export function resolveSigningProfileWarned(warn = console.warn, raw = process.env.GALERINA_PROFILE) {
  const res = resolveSigningProfile(raw);
  if (res.failSecure) {
    warn(`⚠️  SPORE-PROFILE-UNRECOGNIZED: GALERINA_PROFILE='${res.raw}' is not a recognized profile — fail-securing to 'production' (signing/admission enforcement ON). Set it explicitly to 'dev' or 'production'.`);
  }
  return res;
}
