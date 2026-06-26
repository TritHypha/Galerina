# Galerina Framework Layer — Design & Scope Decision

**Status:** DRAFT for approval · **Created:** 2026-06-14 · **Owner directive:** user
**Umbrella:** [Zero Trust Framework](architecture-charter.md#umbrella-zero-trust-framework-governing-security-bar)
**Supersedes/contains:** the per-package specs
`galerina-framework-api-server-v02.md`, `galerina-framework-api-server-implementation.md`
(this doc is the *layer-level* scope decision; those remain the detailed REST/HTTP specs).

> This is a **design document**, authored *before* any build, at the user's request
> ("design doc first"). It records **what the framework layer is, what it is explicitly
> NOT, how it routes multiple protocols, and the build order** — so implementation cannot
> drift into the discarded "Citadel" material from `notes/30-notes*.md`.

---

## 0. Provenance & guardrail (read first)

The `notes/30-notes*.md` files are **discussion-only** AI conversations. Their "Citadel /
Fused Compilation Layer / photonic CPU / remove-middleware-via-AST-fusion / Galerina++ /
Zig" ideas are **NOT adopted** and must not leak into this layer. The only real user
directives this doc honours are:

1. A **light framework layer in the existing repo** (already present as scaffolds).
2. **Support multiple route protocols via packages** — REST now; SOAP, gRPC, GraphQL,
   etc. later — *each as its own package*.
3. **No middleware** (in the Express/NestJS chained-closure sense).
4. **Galerina stays a TypeScript-like `flow` + `contract` language** — the framework does
   not change the language, add keywords, or compile differently.

Every decision below is measured against the Zero Trust Framework bar (deny-by-default,
no ambient authority, least capability, fail-closed, actor-aware audit, explicit data
exposure, OS/HW-as-compromised posture, AI-proposes/compiler-verifies/runtime-authorizes/
human-approves).

---

## 1. What "framework layer" means here

Galerina already separates concerns cleanly:

```text
Galerina Core            language: types, flows, contracts, effects, memory safety, diagnostics
        ↓
Galerina Core Runtime    safe execution of compiled flows (limits, effects, permissions)
        ↓
┌──────────────────────────────── FRAMEWORK LAYER ────────────────────────────────┐
│ App Kernel            the ONE secure application boundary (protocol-agnostic)     │
│ Protocol Adapters     REST / SOAP / gRPC / GraphQL / … → map wire → contract      │
│ Host Adapters         Node / Express / Fastify / Lambda / Cloudflare / native     │
└──────────────────────────────────────────────────────────────────────────────────┘
        ↓
User application flows  (typed `flow` + `contract` Galerina)
```

The framework layer makes Galerina **practical to run as a service without making the
language heavy**. It is opinion-light, replaceable, and adapter-friendly. It is *not* a
web framework, CMS, ORM, or frontend system.

### 1.1 Current state (AS-IS, verified 2026-06-14)

| Package | State | Contents |
|---|---|---|
| `galerina-framework-app-kernel` | **Spec only, 0 `.ts`** | README + ARCHITECTURE + REQUIREMENTS + TODO; 5 `.spore` fixtures run through the interpreter |
| `galerina-framework-api-server` | **Spec only, 0 `.ts`** | Full v0.2 README spec + TODO; KB docs `…-v02.md`, `…-implementation.md` |
| `galerina-framework-example-app` | **Empty placeholder** | `.gitkeep` + README + TODO |
| `galerina-web-router` / `galerina-web-*` | **Separate (frontend)** | Browser route/render contracts — out of scope for this doc |
| `galerina-api-adapters` | **Planned, not created** | Host adapters (Express/Fastify/Lambda/…) |

So the layer is **100% scaffold/spec** today — consistent with ledger #154 ("framework
packages stay scaffolds / templates"). This design doc decides how to make *some* of it
real, safely.

---

## 2. The core idea: one boundary, many protocols

The single most important decision, and the one that satisfies "support REST, SOAP, etc.
via packages":

> **There is exactly ONE secure boundary — the App Kernel.** Every protocol adapter
> translates its wire format into the *same* typed `(route, request) → contract → flow`
> shape and hands it to the App Kernel. The App Kernel never knows or cares which
> protocol it came from.

```text
   REST/HTTP  ─┐
   SOAP/XML   ─┤
   gRPC       ─┼─►  Protocol Adapter (per package)  ─►  App Kernel  ─►  typed Galerina flow
   GraphQL    ─┤        (wire → LogicnKernelRequest)     (one secure      (contract-governed)
   Webhooks   ─┘                                          pipeline)
```

Why this matters:

- **Security is written once.** Auth, validation, effects, rate limits, idempotency,
  replay, audit, secret policy, fail-closed errors live in the App Kernel — not duplicated
  per protocol. A new protocol cannot accidentally bypass a control.
- **Adding a protocol is additive** (Architectural Stability principle): a new package,
  no change to the kernel, no change to the language.
- **No impedance mismatch.** The contract validated at the wire boundary *is* the contract
  the flow executes against — there is no second interpretation step.

### 2.1 Protocol roadmap (each its own package, later)

| Protocol | Package (proposed) | Status | Notes |
|---|---|---|---|
| REST / HTTP+JSON | `galerina-framework-api-server` (a.k.a. `galerina-api-protocol-rest`) | **First target** | v0.2 spec already written |
| Webhooks (HMAC) | (within api-server) | Part of REST target | HMAC-before-decode, replay store |
| SOAP / XML | `galerina-api-protocol-soap` | Later | WSDL → contract; XML decode → typed request |
| gRPC / protobuf | `galerina-api-protocol-grpc` | Later | `.proto` ↔ Galerina contract mapping |
| GraphQL | `galerina-api-protocol-graphql` | Later | schema → contract; resolver → flow |

All map to the **same** `LogicnAppKernel.handleApiRequest(...)` contract. **Naming DECIDED
(user, 2026-06-14):** protocol-adapter packages use **`galerina-api-protocol-<name>`**
(e.g. `galerina-api-protocol-soap`) — clearer to developers than `galerina-protocol-*` or
`galerina-framework-*`. The existing REST package keeps its name `galerina-framework-api-server`
and is the `rest` protocol adapter.

---

## 3. "No middleware" — what it means precisely

The user directive "no middleware" is honoured as follows (and is already baked into the
existing specs, which reject "full middleware system" / "large middleware ecosystem"):

- **NO** user-chained middleware closures (`app.use(a); app.use(b); …`) where ordering
  bugs cause auth-bypass (the ServiceNow/Tchap failure class). Galerina forbids this.
- **YES** a single, fixed, compiler-known **secure pipeline** inside the App Kernel. The
  steps always run, always in the same order, and cannot be reordered or skipped:

```text
normalise → transport limits → (webhook verify) → security policy → auth →
content-type/body limits → typed decode + validate → idempotency/replay →
workload limits → request await scope → typed flow handler → typed response encode →
reports + audit
```

This is the existing App Kernel pipeline (ARCHITECTURE.md). It is a **property of the
kernel**, not a list the developer assembles. That is the anti-middleware stance: the
order is guaranteed, not user-configurable.

> **Explicitly NOT doing:** the notes' "fused compilation layer that welds the router into
> WASM bytecode / removes middleware via AST fusion." We get the *safety* goal (no
> bypassable ordering) from a fixed kernel pipeline — no compiler/bytecode changes.

---

## 4. Scope guardrails (IS / IS NOT)

### The framework layer IS
- A protocol-agnostic **secure App Kernel** boundary.
- A set of **protocol adapters** (REST first) that map wire → typed contract.
- A set of **host adapters** (Node first) that bind the kernel to a runtime.
- **Report- and audit-generating**: every request produces reportable governance facts.
- **Deny-by-default and fail-closed** at every step.
- Built from **plain typed TypeScript** for the host/transport plumbing, calling
  **typed Galerina flows** for application logic. (The transport layer is infrastructure;
  the *governed* logic is Galerina.)

### The framework layer IS NOT
- ❌ A web framework / CMS / admin panel / template engine / theme system.
- ❌ An ORM / migrations / query builder.
- ❌ A frontend / SPA / component system (that's `galerina-web-*`).
- ❌ A user-chained middleware system or plugin marketplace.
- ❌ **Anything from the discarded notes:** Citadel substrate, Single-Shot Arenas,
  enclave warm pools, photonic/ternary CPU, in-enclave AI matrix, homomorphic GPU
  shielding, fused-compilation middleware removal, Galerina++, bare-metal driver/OS target,
  Zig. None of these are built here.
- ❌ A change to the Galerina language, grammar, keywords, or compilation model.

---

## 5. Zero Trust Framework compliance map

| ZTF bar | How the framework layer meets it |
|---|---|
| Deny by default | Unknown route/method/effect/network → reject; missing manifest → fail startup |
| No ambient authority | Auth/scopes/effects declared per route contract; kernel passes capabilities explicitly |
| Least capability | Route declares only the effects it needs; runtime denies the rest |
| Fail closed | Any uncertainty/error → safe error response, never an allow; production hides detail |
| Actor-aware audit | Every request emits audit/report facts (who/what/route/decision) |
| Explicit data exposure | Response shape is a typed contract; field filtering; secret redaction in logs |
| OS/HW-as-compromised | Inherits posture `off\|auto\|on` (#195); transport never trusts host for auth facts |
| AI proposes / compiler verifies / runtime authorizes / human approves | Route contracts are compiler-checked; kernel authorizes at runtime; humans own policy |

The OS/HW posture (#195) and evaluator caching (#194) are **cross-cutting** and land in
the runtime/kernel, not re-implemented per protocol.

---

## 6. Proposed build order (pick a starting phase)

Each phase is independently shippable and gated by the standard phase-close cadence
(graph + full tests + audit). Nothing here changes the language.

- **P1 — App Kernel skeleton (protocol-agnostic core).** ✅ **DONE + verified (2026-06-14).**
  `galerina-framework-app-kernel` is now real TS: `src/types.ts` (`RouteDeclaration`/`EffectiveRoutePolicy`
  + Auth/Body/Idempotency/Limits/Audit policy types), `src/route-defaults.ts` (the secure-default route
  resolver, §10), and `src/kernel.ts` (`createAppKernel` — the **FIXED, non-bypassable 12-step pipeline**:
  normalise → route-match (404/405) → resolve policy → body-size (413) → content-type (415) → auth (401)
  → typed decode (422) → idempotency (409) → concurrency (429) → handler → encode → **async audit**; every
  step **fail-closed**, order fixed in code = anti-middleware). Consumes **#195 posture** (posture `on`
  tightens ceilings) and emits audit via an injectable **async sink** (Tri-Pipe principle: audit never
  blocks the response). **26/26 tests.** The keystone for B2/B3 and every protocol adapter.

- **P2 — REST/HTTP transport adapter (`galerina-framework-api-server`).**
  Implement the v0.2 spec's 10-step pipeline *on top of* the P1 kernel: manifest load,
  route table, streaming body limit, webhook HMAC-before-decode, safe response/error
  mapping, OpenAPI export, redaction. Wire `galerina serve`.

- **P3 — Manifest emission from Galerina source.**
  Compiler/CLI emits `galerina-api-manifest.json` from `api { … }` / `route { … }`
  declarations so the manifest is *generated*, not hand-written. (Decide whether `api`/
  `route` are real grammar or a devtool over existing `contract` — language stays stable.)

- **P4 — Second protocol adapter (proves the abstraction).**
  Add one of SOAP/gRPC/GraphQL as a separate package mapping wire → the *same* kernel
  contract. Success = zero kernel changes required.

- **P5 — Host adapters (`galerina-api-adapters`).**
  Express / Fastify / Lambda / Cloudflare adapters that reuse `createLoApiHandler` without
  the built-in listener.

- **P6 — Example app + golden e2e** in `galerina-framework-example-app`.

Cross-cutting (can interleave): **#194** GateCache (cache *compiled* evaluators used by
the kernel, never decisions) and **#195** OS/HW posture surface in the kernel config.

---

## 7. Open questions for the user (decide before/along P1)

1. ~~**Naming:** protocol packages as `galerina-protocol-soap` vs `galerina-framework-soap`?~~
   **RESOLVED (user, 2026-06-14): `galerina-api-protocol-<name>`** (e.g. `galerina-api-protocol-soap`).
2. **Manifest source:** are `api {}` / `route {}` real Galerina grammar (additive, P3) or a
   devtool that compiles existing `contract {}` blocks into a manifest? (Default lean:
   devtool first, to keep the language frozen.)
3. **Transport language:** confirm transport/host plumbing is plain typed TS (calling
   Galerina flows for logic), not Galerina-compiled WASM, for the first cut. (Default: TS
   plumbing — matches the existing v0.2 spec and avoids notes' WASM-everything stance.)

---

## 8. Decision record

- The framework layer stays **scaffolds until a phase is explicitly built**; this doc
  unblocks P1 when approved.
- **One secure App Kernel boundary; many protocol adapters** is the locked architecture.
- "No middleware" = **fixed compiler-known secure pipeline**, not user-chained closures.
- **No notes-derived "Citadel/photonic/Zig/middleware-fusion" content** enters this layer.
- Galerina the language is **unchanged**.

---

## 9. Audit 2026-06-14 — "remove middleware / fuse framework" ground truth

A repo audit (workflow `reinstate-audit`) confirmed:

- **No middleware exists anywhere — grep-verified** across `*.ts` and `*.md` (2026-06-14). The word
  `middleware` appears ONLY in the discussion-only `notes/30-notes*.md` and one unrelated bundled
  plugin — **never** in Galerina source, `syntax.md`, or any Galerina doc. (The earlier sub-audit's claim
  that `syntax.md` carries a `middleware []` property was a hallucination; **there is nothing to
  remove**.) Galerina has no runtime middleware chain and never did — the concept is structurally absent.
- **Governance is already fused at compile time:** governance-verifier (Pass 7) → `GovernanceFlagsMask`
  + `RuntimeManifest`; GIR emitter (Pass 8) → effects/intent/proofs/capabilities in IR; signed
  `.lmanifest` (CBOR RFC 8949 + ML-DSA-65); `fused-pass.ts` skeleton; per-flow execution plans; effects
  as **bitmasks**. So *"policy is not middleware, policy is part of execution"* is **already true**.

**Therefore #198 ("remove middleware / fuse the framework") is GOAL-MET.** Completing it =
1. ✅ **Middleware removal** — nothing to remove (grep-verified absent).
2. ✅ **Fusion** — already done at compile time (Pass 7/8 + signed manifest).
3. ⏭ **Make the fused model usable + easier** — the **secure-by-default route policy** (§10), so a
   minimal route is automatically safe, enforced by the fixed App Kernel pipeline (built in **P1**, #172).
   No bytecode-welding, no photonic enclaves.

---

## 10. Secure-by-default route policy (developer ergonomics)

Per user direction (2026-06-14): make `auth` / `body` / `idempotency` / `limits` **auto/default** so a
developer writes less and still gets a secure route. This inverts the Express model:

> **A minimal route declaration is a maximally secure route.** Omitting a policy block = `auto` = the
> secure default. To *relax* a default you must be explicit — and every relaxation is recorded in the
> signed manifest and flagged in the security report.

The compiler resolves the **effective** policy (defaults + explicit overrides) at compile time, writes
it into the route manifest (no hidden runtime behavior), and the build emits a `defaults-applied`
report. The fixed App Kernel pipeline (P1) enforces the resolved policy.

| Block | Default when omitted (`auto`) | ZTF rationale |
|---|---|---|
| `auth` | **required** — route is non-public unless it declares `auth { public }` | deny-by-default; no accidental public endpoint |
| `body` | `content_type "application/json"`, `max_size 256kb`, `unknown_fields "deny"`, `duplicate_keys "deny"` | bounded + strict; blocks oversized / prototype-pollution payloads |
| `idempotency` | `auto`: **on** for POST/PUT/PATCH/DELETE (`Idempotency-Key`, ttl `24h`, `payload_mismatch "reject"`); **off** for GET/HEAD/OPTIONS | safe retries on mutations, zero boilerplate |
| `limits` | `rate "60/minute"`, `max_concurrent 10`, `memory 32mb`, `timeout 10s` | no unbounded route; predictable ceilings |
| `effects` | inherited from the handler flow's `contract { effects {} }` | single source of truth; deny-by-default |
| `audit` | `require runtime report` | actor-aware audit always on |

**Minimal example — secure with almost no policy:**

```galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder
    auth { scopes ["orders.write"] }   // auth-required is already default; just name the scope
    // body / idempotency / limits OMITTED → secure auto-defaults applied + recorded in the manifest
  }
}
```

At build time this resolves to the full policy (JSON body ≤256kb strict; idempotency on with
`Idempotency-Key`/24h because POST is mutating; rate 60/min; etc.), all visible in
`galerina-api-manifest.json` and the `defaults-applied` report. **Relaxing** a default is explicit and
audited:

```galerina
  GET "/health" { handler health   auth { public }   limits { rate "1000/minute" } }
  // `auth { public }` + the raised rate are recorded as explicit relaxations in the security report.
```

**Net effect:** less to type, safer by omission, fully auditable. **Implementation** of default
resolution + the report lands in the manifest generator / App Kernel (framework **P1**, #172); this
section is the spec P1 builds to.

---

## 11. Package build & fusion — `/src` → `.wasm` → fused governed component

**User clarification (2026-06-14):** "fuse" is concrete and developer-facing. A developer authors
their own package — e.g. a custom protocol adapter `my-custom-api-rest` (the Galerina replacement for
"middleware") — and the toolchain must **compile that package's `/src` into a governed `.wasm` shipped
inside the package, ready to be fused** into a host app's App Kernel pipeline. This means #198 is **not**
goal-met: middleware-absence + compile-time governance fusion are done, but the *package build + fusion*
capability is real remaining work.

### What exists today (verified)
`galerina build <file.spore>` → `build/<name>.wasm` + `.wat` + signed `.lmanifest` (CBOR/Ed25519→ML-DSA-65)
+ `governance-impact.json`. **Single-file → governed signed `.wasm` works** (P9). `import ./path.spore`
DAG merge exists (#94). Admission gate that verifies a signed `.wasm` exists (#105).

### The two gaps

**(A) Package build** — `galerina build --package <dir>` (proposed):
1. Read a package descriptor (entry + metadata).
2. Resolve + DAG-merge the entry's `import ./*.spore` graph (#94) into one module.
3. Compile → WAT → wabt → `.wasm`.
4. Generate + sign the `.lmanifest` — which declares the package's **capabilities/effects + fusion
   seam** (the fusion contract).
5. Write the artifacts **into the package** (`<pkg>/dist/`), not the repo-root `build/`.

```text
my-custom-api-rest/
  package.spore.json     # { name, kind:"api-protocol"|"extension", provides:"rest",
                       #   entry:"src/index.spore", seam:"protocol.inbound", capabilities:[...] }
  src/ index.spore ...   # Galerina flows + contracts; imports merged via #94 DAG
  dist/                # GENERATED by `galerina build --package`
    my-custom-api-rest.wasm
    my-custom-api-rest.lmanifest        # CBOR, signed — the fusion contract
    my-custom-api-rest.lmanifest.json
```

**(B) Fusion (App Kernel, P1+ / component model #103)** — the host app declares which packages to fuse
and at which seam; the App Kernel:
1. Loads each package `.wasm`; the **admission gate verifies signature + manifest** (#105) — fail-closed.
2. Instantiates it as a **governed WASM component**, capability-bounded by its `.lmanifest`
   (deny-by-default; it gets only what it declared).
3. Wires it into the **fixed, non-bypassable pipeline at its declared seam**.

A fused component **cannot exceed its declared capabilities**, bypass auth, escalate effects, or touch
another domain's memory — enforced by the host, not by convention. *That* is "fusion, not middleware":
a signed component at a fixed seam, never a user-ordered chain of closures (no Express/ServiceNow
ordering-bypass class).

### Build order
- **B1 — `galerina build --package`**: ✅ **DONE + verified (2026-06-14).** Reads `<dir>/package.spore.json`
  (`name`/`entry`/`kind`/`provides`/`seam`/`capabilities`), compiles the entry (with its #94 import DAG)
  via the existing single-file pipeline, and writes **into `<dir>/dist/`**: `<name>.wasm`, `<name>.wat`,
  signed `<name>.lmanifest` (+ `.json`), `<name>.governance-impact.json`, and the **fusion descriptor
  `<name>.fuse.json`** (schema `spore.fuse.v1` — kind/provides/seam/capabilities/artifacts/wasmSha256).
  Demo package `examples/fuse-demo/my-custom-api-rest/` builds clean; normal single-file `build` is
  unaffected (regression verified). The `/src` stays in the package repo; only `dist/` is pulled into a
  consuming app. Implemented in `galerina.mjs` (build branch, `packageBuild`/`outDir`).
- **B2 — App Kernel fusion/load**: ✅ **DONE + verified (2026-06-14).** `galerina-framework-app-kernel/
  src/fuse-loader.ts` `fusePackage(dir, opts)`: verifies the `.wasm` sha256 matches the descriptor
  (mismatch → fail-closed), verifies the signed-manifest signature where a public key exists (unsigned
  allowed only with explicit `allowUnsigned`), and `WebAssembly.instantiate`s the component providing
  **only** the host imports its manifest capabilities permit (deny-by-default). **Net-a signed
  descriptor:** `galerina build --package` now embeds the fuse block (kind/provides/seam/capabilities +
  wasm sha256) **inside the signed CBOR `.lmanifest`** (tamper-evident); `.fuse.json` is a convenience
  copy. **33/33** app-kernel tests (incl. tampered-wasm rejected, undeclared-capability absent).
- **B3 — `galerina-api-protocol-rest`** ✅ **DONE + verified (2026-06-14):** real fusable reference adapter
  package — `/src` governed flow → `galerina build --package` → fused via the B2 loader → invoked
  end-to-end; `tests/e2e-fuse.test.mjs` **4/4**. Proves the whole `/src` → `.wasm` → fused path.

**Fuse pipeline B1–B3 COMPLETE (#198 realised):** a developer authors a package, `galerina build
--package` emits a governed signed `.wasm` + signed fuse descriptor, and the App Kernel fuses it
capability-bounded at its seam. The production upgrade (#103 real wasmtime component model) remains
external/flagged.

---

## 12. App-layer reframe & workspace-default repoint — NOTE + PROPOSAL (#154, NOT applied)

**Status: PROPOSAL ONLY — nothing in this section has been applied.** Per ledger #154
("app-layer reframe"), this is the *docs-only* portion: the three framework packages
have been re-labelled as **app-layer templates/scaffolds** in their READMEs (done — see
each package `README.md` banner), and the *destructive* part (editing the workspace
default / `package.json`) is written here as a proposal to be approved before any code or
config changes.

### 12.1 Note — these three packages are app-layer templates, not language/core

The framework layer sits **above** Galerina-the-language and the core runtime. The three
packages below are **templates/scaffolds** a consumer copies/extends to run an app as a
governed service — they are **not** part of the compiler, the runtime, or the language,
and they must **never** be confused with the core build target:

| Package | App-layer role | State today |
|---|---|---|
| `galerina-framework-app-kernel` | Template: the one secure App-Kernel boundary (protocol-agnostic) | Scaffold + early `.ts` (P1 keystone, #172) + 5 `.spore` fixtures |
| `galerina-framework-api-server` | Template: REST/HTTP protocol-adapter (v0.2 spec) | Spec/scaffold; implementation is phase P2 |
| `galerina-framework-example-app` | Template: where a consumer's own app code lives | Empty placeholder (`.gitkeep` + README) |

> **Correction to §1.1:** the AS-IS table said app-kernel was "Spec only, 0 `.ts`". As of
> the #172 P1 work it now carries `src/`, `dist/`, `tests/`, `package.json`, `tsconfig.json`.
> It remains a **template/scaffold** (P1 keystone, not a finished package). §1.1 should be
> refreshed when P1 closes; this note records the drift without rewriting the AS-IS audit.

### 12.2 Problem — what "workspace default" means here (verified 2026-06-14)

The repo root `package.json` is the **`@galerina/cli`** package. Verified ground truth:

```jsonc
// /package.json (root) — relevant fields, AS-IS
{
  "name": "@galerina/cli",
  "type": "module",
  "bin":  { "galerina": "./galerina.mjs" },   // ← the de-facto "default": the compiler/runtime CLI
  "scripts": { "test": "node scripts/run-all-tests.cjs", ... }
  // NOTE: there is NO `workspaces` array. This is NOT an npm-workspaces monorepo (yet — see #155).
}
```

So the "default" a developer hits today is **the Galerina CLI** (`galerina` → `./galerina.mjs`:
compile/run/check `.spore`), which is **correct** — the language+core is the front door.
There is **no** misconfiguration pointing the default at a framework/app package. The risk
#154 guards against is *documentation/onboarding drift*: a reader landing in
`packages-galerina/galerina-framework-*` could mistake an app-layer template for the project's
primary build target. The fix is **pointer hygiene**, not a `package.json` rewrite.

### 12.3 PROPOSAL (NOT applied) — repoint the default to this design doc

When approved, apply the *smallest* change that makes the language/core the unambiguous
default and routes framework-layer questions to **this** doc
(`docs/Knowledge-Bases/galerina-framework-layer-design.md`). Proposed, in priority order:

1. **Docs pointer (safe, do first).** From the root `README` / onboarding and the
   KB index, state explicitly: *"Default build target = the Galerina CLI (`galerina`,
   `./galerina.mjs`). The `galerina-framework-*` packages are optional app-layer templates;
   see `galerina-framework-layer-design.md`."* Add a one-line link from each framework
   README back to this doc — **already done** in the three README banners (#154).
2. **If/when npm workspaces land (#155):** when a root `workspaces` array is introduced,
   it MUST list the **core** packages (`galerina-core*`, `galerina-core-compiler`,
   `galerina-core-runtime`, `galerina-core-network`) as first-class, and either omit the
   `galerina-framework-*` templates or group them under a clearly-labelled
   `"templates"`/`"examples"` glob so tooling never treats them as the default target.
   The root `bin`/default script stays the **CLI**, never a framework package.
3. **Do NOT** add a root `"main"`/default `"start"` that resolves to any
   `galerina-framework-*` package. Do NOT change `bin.galerina`. Do NOT delete or move the
   framework packages. (These are the "destructive workspace/package.json edits" #154
   explicitly defers.)

**Acceptance for the eventual (separate) apply task:** root default still launches the
CLI; root README + KB index name the CLI as default and link this doc; framework READMEs
carry the template banner (✅ done); no framework package is reachable as the default
build/run target. **Compliance:** deny-by-default / least-surprise — a new contributor
cannot accidentally treat an app-layer template as the core; the language stays unchanged.

---

## Appendix A — Worked example: one governed flow over REST + SOAP

Real Galerina syntax (modelled on `examples/auth-service/createSession.spore` and
`galerina-framework-app-kernel/examples/typed-api-boundary.spore`). The SOAP form is
**proposed** (phase P4); the `secure flow` handler is what runs today.

```galerina
// orders/createOrder.spore — the governed handler (real, compiler-checked)
type CreateOrderResult   = Result<CreateOrderResponse, OrderError>
type CreateOrderRequest  { readonly sku: Sku; readonly quantity: Int }
type CreateOrderResponse { readonly orderId: OrderId; readonly status: OrderStatus }
type Sku = Brand<String, "Sku">;  type OrderId = Brand<String, "OrderId">
type StockLevel  = enum { InStock LowStock NoStock }
type OrderStatus = enum { Accepted Backordered Rejected }
type OrderError  = enum { InvalidSku OutOfStock QuotaExceeded }

secure flow createOrder(readonly request: CreateOrderRequest) -> CreateOrderResult
contract {
  intent  { "Create an order for an authenticated, scoped caller." }
  effects { database.write audit.write }
  privacy { pii orderId require redaction before audit.write }
  audit   { require runtime report }
}
{
  let stock = Inventory.check(request.sku)?
  let status = match stock {
    InStock  => OrderStatus.Accepted
    LowStock => OrderStatus.Accepted
    NoStock  => OrderStatus.Backordered
    _        => OrderStatus.Rejected      // mandatory `_ =>` wildcard
  }
  let order = Orders.create(request.sku, request.quantity, status)?
  AuditLog.write({ event: "OrderCreated", orderId: redact(order.orderId), status: status })
  return Ok(CreateOrderResponse { orderId: order.orderId, status: status })
}
```

```galerina
// orders/rest.spore — REST surface (galerina-framework-api-server)
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest; response CreateOrderResponse; handler createOrder
    auth   { bearer required; scopes ["orders.write"] }
    body   { content_type "application/json"; max_size 256kb; unknown_fields "deny" }
    idempotency { key header "Idempotency-Key"; ttl 24h; payload_mismatch "reject" }
    limits { rate "30/minute"; max_concurrent 5; memory 32mb }
  }
}
```

```galerina
// orders/soap.spore — PROPOSED galerina-api-protocol-soap (phase P4)
protocol soap OrdersService {
  operation "CreateOrder" {
    request CreateOrderRequest; response CreateOrderResponse; handler createOrder
    soap_action "urn:orders:CreateOrder"
    auth   { bearer required; scopes ["orders.write"] }      // identical kernel policy
    body   { content_type "application/soap+xml"; max_size 256kb; unknown_fields "deny" }
    limits { rate "30/minute"; max_concurrent 5; memory 32mb }
  }
}
```

Both protocol declarations name the **same** `createOrder` handler and the **same**
security/limit policy; only the envelope differs. The App Kernel runs **one** fixed
pipeline for both. Adding SOAP = one `galerina-api-protocol-soap` package, zero changes to
the handler, the kernel, or the language.
