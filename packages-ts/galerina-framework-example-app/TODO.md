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
[HOLD] Add more routes/flows and grant only the capabilities they need (effects {} + App.manifest) -- SuperGrok 2026-10-08 (zero-trust default, owner may revisit): golden `galerina new app` template stays one GET /hello greeting route with empty grants. Do not widen the scaffolder. tests/route-capability-grants.test.mjs pins App.manifest / galerina-package.json / greeting package+fuse+lmanifest capabilities [], src/flows = greeting.fungi only, pure fungi with no effects {}, exactly one host route, and absence of unlisted capability names from the empty structural grant set; it does not prove runtime refusal. A second route stays empty-grant until a flow actually needs an effect; then effects {} AND App.manifest must list the same name.
[HOLD] Wire a revocation registry + central package registry into the fuse border -- BLOCKED 2026-10-05 / SuperGrok 2026-10-08 (zero-trust default, owner may revisit): fuse-border admission path is framework-app-kernel src/kernel.ts (Codex RD-1413). Example-app host already injects loadRevocationGate into fusePackage (Gate 2b) and does not import src/kernel.ts. Do not edit kernel.ts in this package.
[x] Commit contract-driven proofs (node ../../galerina.mjs generate tests src/App.fungi) -- proofs/App.obligations.tap + proofs/greeting.obligations.tap (both flows pure, no effects: 0 obligations); drift-checked by tests/proofs.test.mjs (Grok 2026-10-05)
```
