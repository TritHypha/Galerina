// Galerina Deno Deploy Adapter — Phase 43
// Serves the verifyPasswordService.fungi flow via Deno Deploy.
//
// Governance: the .fungi file IS the service — this adapter is only
// the thin host shim that connects Deno's HTTP API to Galerina execution.
// All business logic, effects, and audit trail live in the .fungi source.

// Phase 43 note: currently serves a static liveness response.
// Full integration (Stage B compiling .fungi → WASM → Deno) is Phase 54.

// Same typed boundary as readForeignSafeInteger in auth-verify-route.ts.
// This Deno shim cannot import the Node kernel module.
type ForeignNumberRead =
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "refused" };

function readForeignSafeInteger(raw: unknown): ForeignNumberRead {
  if (typeof raw === "number" && Number.isSafeInteger(raw) === true) {
    return { kind: "ok", value: raw };
  }
  return { kind: "refused" };
}

type CappedBodyRead =
  | { readonly kind: "ok"; readonly body: Uint8Array }
  | { readonly kind: "too_large" }
  | { readonly kind: "refused" };

async function readBodyCapped(req: Request, cap: number): Promise<CappedBodyRead> {
  const stream = req.body;
  if (stream === null) {
    return { kind: "ok", body: new Uint8Array(0) };
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const step = await reader.read();
      if (step.done === true) break;
      if (step.done !== false) {
        await reader.cancel();
        return { kind: "refused" };
      }
      const value = step.value;
      if (!(value instanceof Uint8Array)) {
        await reader.cancel();
        return { kind: "refused" };
      }
      const n = readForeignSafeInteger(value.byteLength);
      switch (n.kind) {
        case "ok":
          break;
        case "refused":
          await reader.cancel();
          return { kind: "refused" };
        default: {
          await reader.cancel();
          return { kind: "refused" };
        }
      }
      total += n.value;
      const totalRead = readForeignSafeInteger(total);
      if (totalRead.kind !== "ok" || total > cap) {
        await reader.cancel();
        return { kind: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // cancel is best-effort
    }
    return { kind: "refused" };
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
    chunk.fill(0);
  }
  return { kind: "ok", body };
}

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
    const declaredHeader = req.headers.get("content-length");
    type ContentLengthField =
      | { readonly kind: "absent" }
      | { readonly kind: "present"; readonly value: string };
    const declared: ContentLengthField = declaredHeader === null
      ? { kind: "absent" }
      : { kind: "present", value: declaredHeader };
    const cap = 16384;
    switch (declared.kind) {
      case "absent":
        break;
      case "present": {
        if (!/^[0-9]+$/.test(declared.value)) {
          return new Response(JSON.stringify({ error: "malformed_input" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
          });
        }
        const parsed = Number(declared.value);
        const n = readForeignSafeInteger(parsed);
        switch (n.kind) {
          case "ok":
            if (n.value < 0) {
              return new Response(JSON.stringify({ error: "malformed_input" }), {
                status: 400,
                headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
              });
            }
            if (n.value > cap) {
              return new Response(JSON.stringify({ error: "payload_too_large" }), {
                status: 413,
                headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
              });
            }
            break;
          case "refused":
            return new Response(JSON.stringify({ error: "malformed_input" }), {
              status: 400,
              headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
            });
          default: {
            return new Response(JSON.stringify({ error: "unknown_outcome" }), {
              status: 503,
              headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
            });
          }
        }
        break;
      }
      default: {
        return new Response(JSON.stringify({ error: "unknown_outcome" }), {
          status: 503,
          headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
        });
      }
    }
    const bodyRead = await readBodyCapped(req, cap);
    switch (bodyRead.kind) {
      case "ok":
        bodyRead.body.fill(0);
        break;
      case "too_large":
        return new Response(JSON.stringify({ error: "payload_too_large" }), {
          status: 413,
          headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
        });
      case "refused":
        return new Response(JSON.stringify({ error: "malformed_input" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
        });
      default: {
        return new Response(JSON.stringify({ error: "unknown_outcome" }), {
          status: 503,
          headers: { "Content-Type": "application/json", "X-Galerina-Authorizing": "false" },
        });
      }
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
