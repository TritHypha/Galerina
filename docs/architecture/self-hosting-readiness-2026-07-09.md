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
   tokenize-byte-parity + partial. ~~And the self-hosted `runtime.fungi` does not yet pass `check`~~
   **RESOLVED 2026-07-09 (late):** the whole self-hosted corpus is now **8/8 `check`-clean** and
   `audit-fungi-runtime` reports 0 findings — see the resolution note at the bottom of this doc.
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
2. **Green the self-hosted compiler corpus** — ✅ **`check`-clean 2026-07-09** (all 8 files;
   `runtime.fungi`'s false positive cured by the compiler fix below, `effect-checker.fungi`'s
   non-exhaustive `match` given its `_` arm). Remaining half: actually LOWER + run the compiler on
   its own `.fungi` (gated on step 1).
3. **Self-host the crypto substrate** (`#102-106` DSS.wasm / `#34` PQ-custody) — a WASM implementation of the
   hash/signature primitives so `tower-citizen`/`ext-spore` have a non-`.ts` floor to stand on.
4. **Build the `.fungi`↔runtime consumption path** — so a compiled `.fungi` package can replace a `.ts` `dist/`
   at its call sites (unblocks the 29 convertible-now pure-logic packages + `tri-pipe`).
5. **Then** convert floor-by-floor, from `core-security` (already 93%) outward, verifying each by running.

Steps 1–3 are the gated `#102-106` / `#34` roadmap items — substantial, security-critical, and (rightly)
owner-sequenced. This document + the audit tool make each component's status visible so the migration is driven
by evidence, and so "is the runtime `.fungi` yet?" has a re-runnable, honest answer instead of a hopeful one.

## Concrete blocker found (2026-07-09) — scope-unaware effect inference on a local `env`

Root-caused the self-hosted `runtime.fungi` `check` failure to a **precise, reproducible compiler bug**, and
— importantly — a naive fix would be a **fail-open**, so it is documented here rather than hastily patched.

**Repro (minimal):**
```fungi
pure flow lookupEnv(env: Array, name: String) -> Int { let x = env.get(0)  return 0 }   // ❌ FUNGI-EFFECT-003 secret.read
pure flow lookupBag(bag: Array, name: String) -> Int { let x = bag.get(0)  return 0 }   // ✅ clean
```
Identical bodies; only the one whose param is named `env` is flagged. Cause: effect inference is **text-regex**,
not scope-aware — `effect-checker.ts` maps `/\benv\.get\b/ → "secret.read"` (and `stdlib.ts environmentFn`
treats `env.get`/`Env.get` as a `process.env` read). The self-hosted interpreter names its variable-environment
`Array` `env` and calls the ordinary `.get(i)` Array method — syntactically identical to the stdlib env read.

**Why the naive fix is WRONG (fail-open).** Lowercase `env.get` is a *real* stdlib env-read function
(`stdlib.ts:1466-1473`, `process.env[key]`, records `secret.read`). Simply deleting the `env.get → secret.read`
heuristic would let a genuine `env.get("SECRET")` escape the pure-flow gate — a fail-open in a security checker.
So the heuristic must stay; the discrimination must improve.

**The two correct fixes (owner-sequenced; neither rushed autonomously):**
- **Compiler (the cure):** make module-prefixed effect inference **scope-aware** — skip the `env.*`/`Env.*`/
  `fs.*`/… heuristics when the leading identifier is a **locally-bound variable/param** (shadowing the stdlib
  module). Must be verified fail-closed: a real `Env.get`/`env.get` on the *unshadowed* stdlib module still
  flags `secret.read`. This threads scope/symbol-table info into the regex-inference pass.
- **Corpus (a safe band-aid, not the cure):** rename the self-hosted interpreter's local `env` `Array` to
  `bindings`/`scope` so it no longer collides with the stdlib `env` module. Unblocks `runtime.fungi` without
  touching the security checker — but every *user* naming a local `env` still hits the false positive until the
  compiler fix lands.

This turns "the self-hosted corpus isn't clean" into a one-line, correctly-scoped, fail-open-aware bug — the
kind of precise blocker that lets the owner sequence the fix safely rather than an AI loosening a security
checker unattended.

**RESOLUTION (2026-07-09, late — owner prioritised the self-hosting path):** the **compiler cure landed**,
not the band-aid. Effect inference is now scope-aware at all four attribution sites (regex walks ×3 +
`checkStdlibEffects`; also `inferDirectEffectsForFlow`): a local param/`let` that rebinds a stdlib module
name is treated as DATA, while module ALIASES (`let env = Env`), unshadowed `Env.get`/`env.get`, the
`\w+DB`-style convention receivers, and record-literal fields (which parse as `paramDecl` but bind nothing)
all still flag — each direction pinned by a test (`tests/effect-checker.test.mjs`, "scope-aware
stdlib-module shadowing"; suite 4,385/4,385). The fail-open concern was retired by **running** the governed
tree-walker: `env.get(0)` on a local Array value-dispatches (returns the element, records **no** effect),
so suppressing the static flag matches runtime truth. Corpus outcome: **8/8 `check`-clean**,
`audit-fungi-runtime` 0 findings; `runtime.fungi` keeps its natural `env` name — no rename needed.
