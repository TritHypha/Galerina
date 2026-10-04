// rd0361-inbound-guard.real-ts.mjs: RD-0361 S6b real-.ts adapters for the inbound-guard frozen set.
// inboundVerdict drives the REAL guardInboundRequest; rateLimitVerdict drives a REAL RateLimiter.consume
// (second call of a key, after a first call at t=0). NON_AUTHORIZING.
import { RateLimiter, guardInboundRequest } from "../../dist/index.js";

export const source = "packages-ts/galerina-core-network/src/inbound-guard.ts";
function realInbound(portValid, denyMatch, allowMatch, defaultAllow) {
  const endpoints = [];
  if (denyMatch) endpoints.push({ direction: "inbound", protocol: "https", effect: "deny", ports: [443] });
  if (allowMatch) endpoints.push({ direction: "inbound", protocol: "https", effect: "allow", ports: [443] });
  const req = { port: portValid ? 443 : 70000, protocol: "https" };
  return guardInboundRequest(req, { defaultEffect: defaultAllow ? "allow" : "deny", endpoints }).allowed ? 1 : -1;
}
function realRate(parseable, windowExpired, countBelowLimit) {
  const rule = { name: "r", scope: "global", limit: parseable ? (countBelowLimit ? "2/s" : "1/s") : "lots" };
  const limiter = new RateLimiter();
  limiter.consume("k", rule, 0);
  return limiter.consume("k", rule, windowExpired ? 1000 : 10).allowed ? 1 : -1;
}
export const adapters = {
  inboundVerdict: { covers: () => true, run: realInbound },
  rateLimitVerdict: { covers: () => true, run: realRate },
};
export const uncovered = {
  admit: "constant +1 helper of the twin; no .ts counterpart",
  deny: "constant -1 helper of the twin; no .ts counterpart",
};
export const gaps = [];
