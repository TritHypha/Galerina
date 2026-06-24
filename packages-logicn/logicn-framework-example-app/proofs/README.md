# proofs/ — contract-driven test obligations

LogicN derives test obligations from each flow's `contract {}` (intent,
pre/post-conditions, effects, fail-closed branches). Generate them for this app:

```sh
node ../../logicn.mjs generate tests src/App.lln           # human-readable obligations
node ../../logicn.mjs generate tests src/App.lln --tap     # TAP plan for CI
```

Commit the generated proofs here so the governance surface of the app is checked on
every change. They are *obligations the contract implies*, not hand-written
assertions — which is why they belong with the app, under version control.

The runnable end-to-end proof (scaffold → fuse → kernel → serve) lives in
[`tests/e2e.test.mjs`](../tests/e2e.test.mjs); run it with `npm test`.
