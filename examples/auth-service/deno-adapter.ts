// Galerina Deno Deploy Adapter — Phase 43
// Serves the verifyPasswordService.spore flow via Deno Deploy.
//
// Governance: the .spore file IS the service — this adapter is only
// the thin host shim that connects Deno's HTTP API to Galerina execution.
// All business logic, effects, and audit trail live in the .spore source.

// Phase 43 note: currently serves a static liveness response.
// Full integration (Stage B compiling .spore → WASM → Deno) is Phase 54.

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return new Response(JSON.stringify({
      status: "ok",
      service: "galerina-auth",
      phase: 43,
      governance: "verified",
      note: "Thin Deno adapter — governed .spore is the source of truth"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Galerina-Phase": "43" }
    });
  }

  if (url.pathname === "/auth/verify" && req.method === "POST") {
    // Phase 43: forward to Galerina runtime (Node.js subprocess in full deployment)
    // Phase 54: .spore → WASM → direct Deno execution (no subprocess)
    return new Response(JSON.stringify({
      error: "Service bridge pending Phase 54",
      note: "The .spore source is deployed — execution bridge is Phase 54"
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
});
