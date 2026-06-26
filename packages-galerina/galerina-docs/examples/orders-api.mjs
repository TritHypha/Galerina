/**
 * Example: generate an OpenAPI 3.1 document for a small Orders API from the
 * App Kernel's route declarations.
 *
 * Run (after `node ../galerina-tower-citizen/node_modules/typescript/lib/tsc.js -p tsconfig.json`):
 *   node examples/orders-api.mjs
 *
 * Each operation in the output reflects exactly what the kernel enforces for that
 * route — the auth requirement, body limits, idempotency contract, rate limits,
 * and the precise error statuses — because the document is generated FROM the
 * governed route table, not hand-written.
 */
import { generateOpenApi } from "../dist/index.js";

const doc = generateOpenApi({
  info: { title: "Orders API", version: "1.0.0", description: "A governed Galerina order service." },
  servers: [{ url: "https://api.example.com", description: "production" }],
  routes: [
    // Auth-required, scoped, mutating → security + 401/403/409/413/415/422/429/500.
    {
      method: "POST",
      path: "/orders",
      handler: "createOrder",
      requestType: "CreateOrderRequest",
      responseType: "OrderResponse",
      auth: { scopes: ["orders.write"] },
    },
    // Public read with a path parameter → security:[] and a required {id} param.
    {
      method: "GET",
      path: "/orders/:id",
      handler: "getOrder",
      responseType: "OrderResponse",
      auth: { mode: "public" },
    },
  ],
});

console.log(JSON.stringify(doc, null, 2));
