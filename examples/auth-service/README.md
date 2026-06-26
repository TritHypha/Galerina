# auth-service example

> **✍️ Writing or AI-generating contracts? Follow the [Contract Authoring Guide](../../docs/Knowledge-Bases/galerina-contract-authoring-guide.md).**
> These route services correctly put `request`/`response` on the **secure route flow** (external
> ingress/egress) while their `pure` helper flows omit them. `effects` is deny-by-default. An AI
> may only **propose** widening `authority`/`effects`/`secrets`, never apply it.

This example demonstrates a `secure flow` that verifies user credentials and
issues a short-lived authentication token. It covers Phase 25A of the Galerina
roadmap: the full pipeline from `.spore` source through WAT emission to a
`.wasm` binary executed inside Node.js via `WebAssembly.instantiate`.

## Files

| File | Purpose |
|------|---------|
| `verifyPassword.spore` | Galerina source — the canonical auth flow |

## What the example shows

### Governed security boundary

The flow is declared `secure`, which means:

- All untrusted input must enter via `unsafe let` bindings.
- A validation gate (`validate.email`) must transition the binding from
  `unsafe String` to `protected Email` before any governed sink can consume it.
- The `?` operator propagates errors at the boundary; callers receive a typed
  `Result<AuthToken, AuthError>` — never a raw exception.

### Contract block

```
contract {
  effects    { database.read  crypto.verify  audit.write }
  privacy    { pii email; deny protected Email to response.body }
  audit      { require runtime report }
}
```

- **effects** — every external capability is declared up-front and
  statically verified by the effect checker.
- **privacy** — `email` is tagged as PII; the `deny` rule prevents the raw
  email address from appearing in the HTTP response body.
- **audit** — the runtime is required to attach an audit report to every
  execution.

### WAT / WASM pipeline (Phase 25)

```
verifyPassword.spore
  → lexer / parser          (galerina-core-compiler)
  → effect checker          (SPORE-STDLIB-001 / SPORE-EFFECT-*)
  → GIR emitter             (Governed Intermediate Representation)
  → WAT emitter             (.wat text)
  → wat-assembler stub      (.wasm binary — Phase 25B: real assembly)
  → Node.js WebAssembly.instantiate
  → governed HTTP response + audit trail
```

### Audit trail

`AuditLog.write` is called unconditionally with:

- `event: "AuthAttempt"` — fixed event name.
- `email: redact(email)` — the `redact()` call strips the actual address;
  only a stable, non-reversible hash is stored.
- `success: valid` — boolean outcome; allows anomaly detection without
  storing credentials.

## Running

```bash
# Build the compiler package
cd packages-galerina/galerina-core-compiler
npm run build

# Parse and check the example (Phase 25A)
node --input-type=module <<'EOF'
import { readFileSync } from "node:fs";
import { lex, parseProgram, checkEffects } from "./dist/index.js";

const src = readFileSync("../../examples/auth-service/verifyPassword.spore", "utf8");
const { tokens } = lex(src);
const { ast, diagnostics, flows } = parseProgram(tokens, src);

console.log("Parse diagnostics:", diagnostics.length);
console.log("Flows:", flows.map(f => `${f.qualifier} flow ${f.name}`));
console.log("Effects:", flows[0]?.declaredEffects);
EOF
```

## Phase 25B (planned)

- Wire `assembleWAT` to the real `wabt` npm package for binary emission.
- Instantiate the `.wasm` module in Node.js and invoke `verifyPassword`
  through the governed HTTP runtime.
- Attach the runtime audit report to the response as a signed header.
