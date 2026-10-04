// rd0361-cors-policy.real-ts.mjs: RD-0361 S6b real-.ts adapter for the cors-policy frozen set. Drives the
// REAL guardCorsRequest (package dist): each flag tuple is realised as a concrete request + policy.
// NON_AUTHORIZING.
import { guardCorsRequest } from "../../dist/index.js";

export const source = "packages-ts/galerina-core-network/src/cors-policy.ts";
const ORIGIN = "https://app.example";
function realCors(o, nullO, wild, creds, exact, pre, pm, ph) {
  const req = { method: "GET", isPreflight: pre, requestMethod: pm ? "GET" : "DELETE", requestHeaders: [ph ? "x-allowed" : "x-other"] };
  if (o) req.origin = nullO ? "null" : ORIGIN;
  const policy = {
    allowedOrigins: [...(exact ? [ORIGIN] : []), ...(wild ? ["*"] : [])],
    allowCredentials: creds,
    allowedMethods: ["GET", "HEAD", "POST"],
    allowedHeaders: ["x-allowed"],
  };
  return guardCorsRequest(req, policy).allowed ? 1 : -1;
}
export const adapters = { corsVerdict: { covers: () => true, run: realCors } };
export const uncovered = {
  admit: "constant +1 helper of the twin; no .ts counterpart",
  deny: "constant -1 helper of the twin; no .ts counterpart",
};
export const gaps = [];
