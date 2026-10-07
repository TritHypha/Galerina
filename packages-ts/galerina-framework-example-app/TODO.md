# Galerina Example App — status

Promoted from a doc-only scaffold to the **runnable golden template** (`galerina new app`).

```text
[x] App entry            src/App.fungi (composition-root flow main())
[x] App flow             src/flows/greeting.fungi (governed, contract{intent})
[x] Compute package      packages/greeting (pure flow -> signed, fusable .wasm)
[x] App descriptor       App.manifest (deny-by-default caps, deps[] hash+signer pin)
[x] Config               config/app.config.json + host/config.ts (typed, fail-closed)
[x] Route through kernel host/server.ts (fuse → createAppKernel → createApiServer)
[x] End-to-end test      tests/e2e.test.mjs (scaffold → fuse → kernel → serve)
[x] Build configuration  package.json + tsconfig.json
```

Next steps for a real app (not required for the template):

```text
[ ] Add more routes/flows and grant only the capabilities they need (effects {} + App.manifest)
      SuperGrok 2026-10-07 pin: row stays [ ]. Golden template still has one GET /hello greeting route with empty grants. tests/route-capability-grants.test.mjs (5 tests, 5/5 pass Docker node:24) pins App.manifest / galerina-package.json / greeting package+fuse+lmanifest capabilities [], pure fungi with no effects {}, exactly one host route, and refusal of unlisted capabilities against that closed empty set. L20-L21 stays HOLD (fuse-border is Codex RD-1413; framework-app-kernel not edited). PROPOSED (not claimed final): a second route stays empty-grant until a flow actually needs an effect; then effects {} AND App.manifest must list the same name. Do not widen the scaffolder golden layout in this slice.
[ ] Wire a revocation registry + central package registry into the fuse border
    BLOCKED 2026-10-05 (zero-trust default, owner may revisit): the fuse-border admission path (framework-app-kernel src/kernel.ts) is in Codex's uncommitted RD-1413 work; do not edit it in parallel.
[x] Commit contract-driven proofs (node ../../galerina.mjs generate tests src/App.fungi) -- proofs/App.obligations.tap + proofs/greeting.obligations.tap (both flows pure, no effects: 0 obligations); drift-checked by tests/proofs.test.mjs (Grok 2026-10-05)
```
