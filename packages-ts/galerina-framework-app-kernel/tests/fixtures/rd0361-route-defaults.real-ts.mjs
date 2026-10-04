// rd0361-route-defaults.real-ts.mjs: RD-0361 S6b real-.ts adapters for the route-defaults frozen set.
// Drives the REAL resolveEffectiveRoutePolicy (package dist) and reads the ceilings / relaxation markers
// off the resolved EffectiveRoutePolicy. Values the real assertRouteDeclaration REFUSES outright (an
// unknown unknownFields / auth mode / HTTP method, or a negative size) are fail-closed refusals of the whole
// route, not relaxation verdicts, so they are outside the realisable domain. NON_AUTHORIZING.
import { resolveEffectiveRoutePolicy } from "../../dist/index.js";

export const source = "packages-ts/galerina-framework-app-kernel/src/route-defaults.ts";
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const route = (extra) => ({ method: "GET", path: "/x", handler: "h", ...extra });
const resolve = (r, postureOn) => resolveEffectiveRoutePolicy(r, { posture: postureOn ? "on" : "off" });
export const adapters = {
  secureMaxBodyBytes: { covers: () => true, run: (p) => resolve(route({}), p).body.maxSizeBytes },
  secureMaxConcurrent: { covers: () => true, run: (p) => resolve(route({}), p).limits.maxConcurrent },
  isBodySizeRelaxation: {
    covers: (n) => Number.isSafeInteger(n) && n >= 0,
    run: (n, p) => resolve(route({ body: { maxSizeBytes: n } }), p).relaxations.some((x) => x.startsWith("body.maxSize:")),
  },
  isFieldPolicyRelaxation: {
    covers: (s) => s === "deny" || s === "allow",
    run: (s) => resolve(route({ body: { unknownFields: s } }), false).relaxations.some((x) => x.startsWith("body.unknownFields:")),
  },
  isAuthRelaxation: {
    covers: (m) => m === "required" || m === "public",
    run: (m) => resolve(route({ auth: { mode: m } }), false).relaxations.includes("auth:public"),
  },
  idempotentByDefault: {
    covers: (m) => METHODS.has(m),
    run: (m) => resolve(route({ method: m }), false).idempotency.enabled,
  },
  isIdempotencyRelaxation: {
    covers: (m) => METHODS.has(m),
    run: (m, en) => resolve(route({ method: m, idempotency: { enabled: en } }), false).relaxations.includes("idempotency:disabled-on-mutating"),
  },
};
export const uncovered = {};
export const gaps = [
  "isBodySizeRelaxation: negative sizes are refused by assertRouteDeclaration (route rejected)",
  "isFieldPolicyRelaxation: settings other than deny/allow are refused by assertRouteDeclaration",
  "isAuthRelaxation: modes other than required/public are refused by assertRouteDeclaration",
  "idempotentByDefault / isIdempotencyRelaxation: non-canonical methods (e.g. lower-case) are refused",
];
