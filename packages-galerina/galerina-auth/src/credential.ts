/**
 * credential.ts — the required-auth POSTURE factor: "header presence is NOT
 * authentication."
 *
 * This encodes the tightened required-auth posture the App Kernel adopted (owner
 * decision 2026-06-23, see galerina-framework-app-kernel/src/kernel.ts auth step and
 * `AuthPolicy.allowHeaderPresenceFallback`). The kernel previously admitted a
 * `required`-auth route on mere Authorization-HEADER PRESENCE — which is not a real
 * verification of the token: any non-empty header passed. That is now fail-closed by
 * default; the weaker behaviour survives only as an explicit per-route opt-in.
 *
 * `headerPresenceVerdict` lifts that posture into a reusable FACTOR:
 *
 *   - DEFAULT (allowHeaderPresenceFallback !== true) — header presence is NOT
 *     authentication. The factor is ALWAYS `0` (INDETERMINATE): it carries no
 *     positive proof and can never authorize on its own. Folded into a composed
 *     auth verdict it pulls the result to non-ALLOW, and the kernel collapses that
 *     to deny (audited FUNGI-GOV-3VL-001). This factor exists to make the posture
 *     explicit and to refuse presence-as-proof structurally, not by a flag check.
 *
 *   - LEGACY OPT-IN (allowHeaderPresenceFallback === true) — mirrors the kernel's
 *     escape hatch: a non-empty Authorization header maps to `+1` (ALLOW); a missing
 *     or empty header maps to `0` (deny). Use ONLY for a deployment whose real token
 *     validation genuinely lives upstream.
 *
 * Hardening note: this factor treats a present-but-EMPTY header value as NOT present
 * (→ `0`). The kernel's legacy opt-in branch was hardened to match (RD-0307/0309): it
 * now also denies an absent, empty, or whitespace-only `Authorization:` header, so the
 * two agree and neither admits presence-of-an-empty-value. A factor library must not
 * reproduce a latent weakness; this one keeps the strict definition of "present".
 *
 * This module performs no token parsing, signature checks, or secret handling — it
 * is a posture factor over header SHAPE only. Real credential verification belongs
 * to the channel/identity factor (channel.ts) or an upstream verifier; its OUTPUT
 * can be composed in as another K3 verdict.
 */

import { Verdict } from "../../galerina-tower-citizen/dist/index.js";

/** Options for the header-presence posture factor. */
export interface HeaderPresenceOptions {
  /**
   * Mirror of the kernel's `AuthPolicy.allowHeaderPresenceFallback`. Default `false`
   * (TIGHTENED / fail-closed). Set `true` ONLY to opt a route back into the weaker
   * presence-only behaviour. Deny-by-default; opt-in to relax.
   */
  readonly allowHeaderPresenceFallback?: boolean;
  /** Header to inspect (case-insensitive). Default `"authorization"`. */
  readonly header?: string;
}

/** Case-insensitive lookup over a frozen header record. Mirrors the kernel's `header()`. */
function header(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return undefined;
}

/**
 * The required-auth posture factor as a K3 verdict.
 *
 * By default it is INDETERMINATE (header presence is not authentication). With the
 * legacy opt-in it admits a non-empty header (`+1`) and denies otherwise (`0`).
 * Returns a VERDICT, never a decision — compose it and hand the result to the kernel.
 */
export function headerPresenceVerdict(
  headers: Readonly<Record<string, string>>,
  opts: HeaderPresenceOptions = {},
): Verdict {
  const name = opts.header ?? "authorization";
  const raw = header(headers, name);
  const present = raw !== undefined && raw.trim().length > 0;

  if (opts.allowHeaderPresenceFallback === true) {
    // Legacy opt-in: presence-as-proof. Weak, hence gated behind the explicit flag.
    return present ? Verdict.ALLOW : Verdict.INDETERMINATE;
  }

  // Tightened default: presence is NOT authentication — no positive proof, ever.
  return Verdict.INDETERMINATE;
}
