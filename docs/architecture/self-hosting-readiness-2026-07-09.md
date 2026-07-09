# Self-hosting readiness — can the runtime be "100% `.fungi`, no `.ts`"? (2026-07-09)

**Owner ask:** *"now that the kernel/GIR/Compiler allow full `.fungi` files, make tower-citizen and
tri-pipe 100% `.fungi` (no `.ts`, 100% complete); then from the start of the runtime down, every
component."* This document is the **evidence-backed answer**, produced by `scripts/audit-selfhost-readiness.mjs`
(re-runnable). Short version: **the direction is real and partly built, but "100% `.fungi`, no `.ts`" is
not achievable today for the crypto/host runtime — and converting those packages now would delete a working
TCB with no runnable `.fungi` replacement.** So this is a *map to drive the migration by*, not a green light
to delete `.ts`.

## What is TRUE about the premise
- There **is** a real `.fungi` → GIR → WASM → run pipeline (`galerina run <file>.fungi`, `galerina build
  --package <dir>`), sharing the backend `.gate` lowers through.
- The compiler is **actively being self-hosted**: `galerina-core-compiler/src/self-hosted/*.fungi`
  (lexer, parser, type-checker, effect-checker, governance-verifier, gir-emitter, runtime) and
  `galerina-core-security/src/dss/*.fungi` (the DSS is **93% `.fungi`** — the furthest-along runtime component).

## What BLOCKS "100% `.fungi`, no `.ts`" today (verified, not assumed)
1. **Crypto-primitive floor.** `tower-citizen` (bridge-attestation, hybrid-engine, plugin-manifest),
   `ext-spore`, `ext-secrets-spore`, `inference-bridge-contract` implement Ed25519 / ML-DSA-65 / AES-GCM /
   SHAKE via `node:crypto` + `@noble/*`. `.fungi` **consumes** crypto as *effects* (`crypto.verify`) — it does
   not (and cannot yet) **implement** the lattice/hash primitives in code that runs. No `.fungi` file
   implements ML-DSA/Ed25519/SHAKE (grep-confirmed). This is the explicitly-deferred `#34` PQ-custody / `#102-106`
   DSS.wasm-TCB work (~0–5% built).
2. **Incomplete `.fungi` → WASM lowering.** `audit-fungi-runtime.mjs` gates the self-hosted corpus on
   properties *"before they lower kernel → GIR → WASM"*: `?` error-prop does **not** lower (BK-3), a
   non-exhaustive `match` **traps** (RD-0240). Full `.fungi` runs on the `.ts` tree-walker; WASM is
   tokenize-byte-parity + partial. And the self-hosted `runtime.fungi` does not yet pass `check` (a
   `FUNGI-EFFECT-003` pure-flow/`secret.read` violation) — the corpus is in-progress.
3. **The interpreter is `.ts`.** `.fungi` executes by being interpreted/hosted by the `.ts` runtime. "No `.ts`"
   is circular until the self-hosted compiler+runtime fully lowers to WASM **and** a non-`.ts` WASM host runs it.
4. **Host-object interop floor.** `tri-pipe` is pure composition but *instantiates `.ts` runtime objects*
   (`createHybridEngine()` from `tower-citizen/dist`). `.fungi` has no mechanism to import and drive a `.ts`
   class instance; that bridge does not exist.

**Therefore:** `tower-citizen` (floor: crypto + host-io) and `tri-pipe` (floor: ts-interop) **cannot** be made
100% `.fungi` today. Deleting their `.ts` would remove the working governance TCB and the crypto it implements,
replacing it with `.fungi` that cannot run. Per the zero-trust standing rule, that action is refused; the map below drives the migration by evidence instead.

## The map (68 code packages · 24 `.fungi` / 388 `.ts` = 6% `.fungi` files)
- **FULLY-`.fungi` (2):** `api-protocol-rest`, `framework-example-app`.
- **Furthest real runtime component:** `core-security` (DSS) at **93% `.fungi`** (13 `.fungi` / 1 `.ts`).
- **Convertible-now (29):** packages whose *own* code is pure logic (no crypto/ffi/host/interop floor) — the
  real `.fungi` migration targets *once the systemic blockers (below) clear*: e.g. `core-logic` (21 `.ts`),
  `devtools-graph-algorithms` (15), `core-sentinel-{memory,power,time}`, `core-compute`, `core-vector`,
  `substrate-math`, the `target-*` shims. **Caveat:** "convertible-now" = *the code is pure logic*, NOT *swappable
  today* — a live swap still needs the WASM lowering complete AND a `.fungi`↔host consumption path, since every
  current caller is `.ts` importing `dist/*.js`.
- **Floored (36):** crypto / ffi / host-io / ts-interop — cannot go 100% `.fungi` until the floor is self-hosted.

Run `node scripts/audit-selfhost-readiness.mjs` for the full per-package table + floors.

## Honest staged path (the real order, "start of the runtime down")
1. **Complete `.fungi` → WASM lowering** — `?` error-prop + non-exhaustive-`match` (the two `audit-fungi-runtime`
   floors) + the W5b `check`/`fault`/`prefilter` lowering (currently trap-fail-closed). Until this, no `.fungi`
   component runs as standalone WASM.
2. **Green the self-hosted compiler corpus** — fix `runtime.fungi`'s `check` failure and get `src/self-hosted/*`
   to pass `check` + lower, so the compiler can run on its own `.fungi`.
3. **Self-host the crypto substrate** (`#102-106` DSS.wasm / `#34` PQ-custody) — a WASM implementation of the
   hash/signature primitives so `tower-citizen`/`ext-spore` have a non-`.ts` floor to stand on.
4. **Build the `.fungi`↔runtime consumption path** — so a compiled `.fungi` package can replace a `.ts` `dist/`
   at its call sites (unblocks the 29 convertible-now pure-logic packages + `tri-pipe`).
5. **Then** convert floor-by-floor, from `core-security` (already 93%) outward, verifying each by running.

Steps 1–3 are the gated `#102-106` / `#34` roadmap items — substantial, security-critical, and (rightly)
owner-sequenced. This document + the audit tool make each component's status visible so the migration is driven
by evidence, and so "is the runtime `.fungi` yet?" has a re-runnable, honest answer instead of a hopeful one.
