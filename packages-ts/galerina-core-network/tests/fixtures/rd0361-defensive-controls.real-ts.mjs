// rd0361-defensive-controls.real-ts.mjs: RD-0361 S6b real-.ts adapters for the defensive-controls frozen
// set. Drives the REAL proxyIsTrusted, resolveClientAddress, uniformResourceResponse, uniformAuthResponse,
// isOpaqueId and boundPageLimit (package dist). NON_AUTHORIZING.
import {
  boundPageLimit, isOpaqueId, proxyIsTrusted, resolveClientAddress, uniformAuthResponse, uniformResourceResponse,
} from "../../dist/index.js";

export const source = "packages-ts/galerina-core-network/src/defensive-controls.ts";
const TRUSTED = { method: "mtls", mtlsClientCertVerified: true, mtlsSubjectPinned: true };
const UNTRUSTED = { method: "none" };
// Realised identifiers. A pure-numeric id is always URL-safe, so (notPureNumeric=false, urlSafe=false)
// has no realisation.
function opaqueSample(longEnough, notPureNumeric, urlSafe) {
  if (longEnough) return notPureNumeric ? (urlSafe ? "abcdEFGH_ijk-1234" : "abcdEFGH ijk!1234") : "12345678901234567";
  return notPureNumeric ? (urlSafe ? "abc_1" : "a!c 1") : "12345";
}
export const adapters = {
  proxyTrustVerdict: {
    covers: () => true,
    run: (isMtls, mv, mp, isTok, tv) => (proxyIsTrusted({
      method: isMtls ? "mtls" : isTok ? "gateway-token" : "none",
      mtlsClientCertVerified: mv, mtlsSubjectPinned: mp, gatewayTokenVerified: tv,
    }) ? 1 : -1),
  },
  useForwardedAddress: {
    covers: () => true,
    run: (trusted, nonBlank) => (resolveClientAddress({
      socketPeer: "198.51.100.7", forwardedFor: nonBlank ? "203.0.113.9" : "   ", proxy: trusted ? TRUSTED : UNTRUSTED,
    }).source === "forwarded" ? 1 : 0),
  },
  uniformResourceAuthorized: { covers: () => true, run: (ok) => (uniformResourceResponse(ok ? "ok" : "forbidden").authorized ? 1 : -1) },
  uniformAuthAuthenticated: { covers: () => true, run: (ok) => (uniformAuthResponse(ok ? "ok" : "bad-credentials").authenticated ? 1 : -1) },
  opaqueIdVerdict: {
    covers: (le, nn, us) => nn || us,
    run: (le, nn, us) => (isOpaqueId(opaqueSample(le, nn, us)) ? 1 : -1),
  },
  pageLimitBranch: {
    covers: () => true,
    run: (valid, exceeds) => {
      const reason = boundPageLimit(valid ? (exceeds ? 500 : 50) : 0).reason;
      return reason === "absent-or-invalid-defaulted" ? -1 : reason === "exceeds-max-capped" ? 1 : 0;
    },
  },
};
export const uncovered = {};
export const gaps = ["opaqueIdVerdict: notPureNumeric=false with urlSafe=false is unrealisable (digits are URL-safe)"];
