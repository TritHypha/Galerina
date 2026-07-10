/**
 * channel.ts — the TLSTP S1 channel/identity FACTOR.
 *
 * This is the auth factor that establishes WHO is on the other end of the
 * transport: the certificate/channel-validation verdict. It is the recently-shipped
 * cert-gate (@galerina/core-network, ../ZTF-Knowledge-Bases/galerina-tlstp-s1-cert-gate.md)
 * surfaced as a first-class authentication factor. We DELEGATE to that gate verbatim
 * — there is exactly one cert-gate implementation, and this module does not re-derive
 * a byte of it.
 *
 * What the gate does (recap): it takes the *outputs* of crypto/TLS validation (chain
 * path-validation, pin match, validity window, OCSP/CRL revocation freshness) as four
 * K3 sub-verdicts, folds them with the K3 conjunction (`min` over the trit), and
 * degrades-only with any side-signal. Its headline property: a revocation-UNKNOWN
 * factor collapses the channel to a non-ALLOW verdict (closing the public web's
 * soft-fail hole). Every missing / errored / un-provable factor defaults to `0`
 * (INDETERMINATE), never `+1` — that is the fail-closed seam.
 *
 * Binding posture: crypto / KDF / cipher / signature / key bytes stay Binary
 * (digital). The gate is a PURE governance fold over a TLS library's outputs; it
 * performs no ASN.1 parsing, path-building, or signature math itself. galerina-auth
 * adds no crypto of its own.
 *
 * IMPORTANT — factor, not decision. `channelIdentityVerdict` returns the folded K3
 * `Verdict`. That value is exactly what you hand the App Kernel as
 * `GalerinaKernelRequest.channelVerdict`; the KERNEL then collapses it fail-closed at
 * its admission gate (only an explicit `+1` admits). We stop at the verdict.
 */

import {
  certGate,
  certVerdict,
  toSubVerdicts,
  withSideSignal,
  type CertGateInput,
  type CertSubVerdicts,
  type ChainValidationOutcome,
  type RevocationOutcome,
} from "../../galerina-core-network/dist/index.js";
import type {
  Verdict,
  GovernanceDiagnostic,
} from "../../galerina-tower-citizen/dist/index.js";

// Re-export the cert-gate's raw-input/sub-verdict surface so callers can assemble a
// channel factor (and inspect the four sub-verdicts) without importing core-network
// directly. The K3 `Verdict` type itself is re-exported once, from verdict.ts.
export { certGate, certVerdict, toSubVerdicts, withSideSignal };
export type { CertGateInput, CertSubVerdicts, ChainValidationOutcome, RevocationOutcome };

/**
 * The channel/identity authentication factor as a single K3 verdict.
 *
 * Equivalent to `certGate(input).verdict`: it maps the TLS library's outputs to the
 * four sub-verdicts, folds them (conjunction = `min`), folds any degrade-only
 * side-signals, and returns the resulting trit — WITHOUT collapsing it to a decision.
 *
 * Hand the result to the App Kernel as `GalerinaKernelRequest.channelVerdict`. The
 * kernel's fixed auth gate collapses it fail-closed: only `+1` (every cert factor
 * proven) admits; `0` (e.g. revocation unknown) and `−1` (e.g. revoked, expired,
 * pin mismatch) refuse.
 *
 * `onDiagnostic` (optional) receives FUNGI-GOV-3VL-001 if an INDETERMINATE verdict is
 * surfaced through the gate's own boundary preview — it is never dropped silently.
 */
export function channelIdentityVerdict(
  input: CertGateInput,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): Verdict {
  return certGate(input, onDiagnostic).verdict;
}
