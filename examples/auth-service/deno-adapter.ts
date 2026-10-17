// Galerina Deno Deploy Adapter — Phase 43
// Serves the verifyPasswordService.fungi flow via Deno Deploy.
//
// Governance: the .fungi file IS the service — this adapter is only
// the thin host shim that connects Deno's HTTP API to Galerina execution.
// All business logic, effects, and audit trail live in the .fungi source.

// Phase 43 note: currently serves a static liveness response.
// Full integration (Stage B compiling .fungi → WASM → Deno) is Phase 54.

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return new Response(JSON.stringify({
      status: "ok",
      service: "galerina-auth",
      phase: 43,
      governance: "verified",
      note: "Thin Deno adapter — governed .fungi is the source of truth"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Galerina-Phase": "43" }
    });
  }

  if (url.pathname === "/auth/verify" && req.method === "POST") {
    // Production POST /auth/verify: 16 KiB cap; no owner-named SLIDE record (Q2)
    // so disclosure refuses F-09. Kernel composition is createAuthVerifyRoute
    // in @galerina/framework-app-kernel (test mode uses the synthetic record).
    const declared = req.headers.get("content-length");
    const cap = 16384;
    if (declared !== null && Number(declared) > cap) {
      return new Response(JSON.stringify({ error: "payload_too_large" }), {
        status: 413,
        headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
      });
    }
    const body = new Uint8Array(await req.arrayBuffer());
    body.fill(0);
    if (body.byteLength > cap) {
      return new Response(JSON.stringify({ error: "payload_too_large" }), {
        status: 413,
        headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
      });
    }
    return new Response(JSON.stringify({ error: "slide_admission_refused" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
    });
  }

  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
});
