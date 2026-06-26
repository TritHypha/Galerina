# Galerina Example App — "hello, governed world"

> **The canonical runnable starter** for a governed Galerina application, and the golden
> template `galerina new app` emits. It sits **above** the Galerina language + core runtime
> (it is not part of the language or compiler) and is **not** the workspace default
> build target. Copy it, rename it, and grow it. For what the framework layer is — and
> is explicitly NOT — see
> [`docs/Knowledge-Bases/galerina-framework-layer-design.md`](../../docs/Knowledge-Bases/galerina-framework-layer-design.md).

This app is the smallest **complete** governed service: a real governed flow, compiled
to a **signed** `.wasm`, **fused** into the App Kernel at a route, and **served** over
HTTP — with a test that drives the whole chain end to end.

## The four stages

```text
scaffold ─▶ fuse ──────────▶ kernel ──────────▶ serve
src/      packages/greeting   galerina-framework-   galerina-framework-
flows/    (signed .wasm)      app-kernel          api-server
```

1. **scaffold** — `galerina new app` lays out this exact structure (see below).
2. **fuse** — the host admits the signed `packages/greeting` component fail-closed
   (sha256 pin → Ed25519 signature → revocation), then instantiates it with a closed,
   capability-bounded import object. A tampered or unsigned binary is refused.
3. **kernel** — the App Kernel runs its fixed, non-bypassable gate pipeline and only
   then dispatches `GET /hello` to the fused compute, whose `i32` result is the HTTP
   status.
4. **serve** — the API-server adapter funnels real HTTP requests through the kernel.

## Run it

```sh
# 1. Build the governed compute package → signed packages/greeting/dist/greeting.wasm
npm run build:greeting        # = node ../../galerina.mjs build --package packages/greeting --no-refresh

# 2. Typecheck + build the host, then run the end-to-end test (scaffold→fuse→kernel→serve)
npm test
```

The in-repo copy ships `packages/greeting/dist/` pre-built and signed, so `npm test`
passes immediately. A fresh copy created with `galerina new app` builds it in step 1.

## Layout

```text
src/App.spore                 composition-root flow main() — the entry the App Kernel boots
src/flows/greeting.spore      the app's governed greeting flow (human-authored source)
App.manifest                declarative descriptor: entry, capabilities [], deps[] (hash+signer pin)
config/app.config.json      typed runtime config: env, posture, http host/port, greeting
host/config.ts              fail-closed loader/validator for config/app.config.json
host/server.ts              fuse greeting → createAppKernel(route) → createApiServer → listen
packages/greeting/          the app's OWN governed, fusable package (the compiled compute)
  src/index.spore               pure flow main() -> Int (returns 200)
  dist/                        signed greeting.wasm + greeting.lmanifest.json (committed here)
deps/README.md              where THIRD-PARTY signed components are vendored
proofs/README.md            contract-driven test obligations (generate tests)
tests/e2e.test.mjs          the scaffold→fuse→kernel→serve proof
```

## Where the governance is

- **Deny-by-default.** `App.manifest` and `packages/greeting/package.spore.json` both
  declare `"capabilities": []`. The greeting is `pure` — it needs no network, storage,
  secrets, database, or inference. That is the strongest posture a useful endpoint can
  have: a working route that grants nothing.
- **Least-capability, opt-in.** To let a flow reach a capability, add an `effects { … }`
  clause to its contract **and** the matching name to `App.manifest`'s `capabilities` —
  never one without the other. The build folds the grant into the **signed `.lmanifest`
  fuse{} block** (never a `.tmf`, which carries integrity/confidentiality only).
- **Fail-closed.** Every `match` keeps its mandatory `_ =>` wildcard (SPORE-TYPE-023). The
  kernel's secure defaults 404 an unknown path and 401 an auth-required route that has no
  channel/identity verdict — the `GET /hello` route is `public` only as an **explicit,
  audited** relaxation (recorded as `auth:public`), appropriate for a hello-world.
- **Signed admission.** The fuse border verifies the component's Ed25519 signature and
  sha256 against `App.manifest` before the kernel will run it. `tests/e2e.test.mjs`
  admits it with **no** `allowUnsigned`, proving the signature really verifies.
- **Secrets are runtime-only.** `.env` is git-ignored and never compiled in; in
  production secrets come from a vault/KMS, not the binary.
