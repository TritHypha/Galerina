# galerina-api-protocol-rest

Reference **REST protocol adapter** for the Galerina framework — a Level-3 *fusable*
package (Fuse B3, design-doc §11, task #175).

A developer authors this package; `galerina build --package` compiles its `/src` into
a governed, signed `.wasm` + `.lmanifest` (with an embedded, tamper-evident `fuse`
block) under `dist/`. A host **App Kernel** then *fuses* those `dist/` artifacts at
the `protocol.inbound` seam — capability-bounded to `network.inbound` and verified
by the admission gate — without ever pulling in this package's source.

## What it does

The adapter is a minimal but real REST dispatcher. It maps an `(HTTP method, path)`
request — encoded as two small `Int`s on the WASM ABI — to an HTTP route/status
code. It is **deny-by-default**: any verb or path that matches no declared route
falls through to `405`/`404`. Every `match` ends with the mandatory `_ =>` wildcard
(SPORE-TYPE-023). All `Int`/simple types, so the whole flow lowers cleanly to WASM.

### Wire ABI

| Method code | Verb   | &nbsp; | Path code | Path           |
| ----------- | ------ | ------ | --------- | -------------- |
| `1`         | GET    | &nbsp; | `1`       | `/health`      |
| `2`         | POST   | &nbsp; | `2`       | `/orders`      |
| `3`         | PUT    | &nbsp; | `3`       | `/orders/{id}` |
| `4`         | DELETE | &nbsp; |           |                |

### Routing matrix (`dispatch(method, path) -> status`)

| Request              | Status | Meaning                       |
| -------------------- | ------ | ----------------------------- |
| `GET /health`        | `200`  | OK (liveness)                 |
| `GET /orders`        | `200`  | OK (list)                     |
| `POST /orders`       | `201`  | Created                       |
| `GET /orders/{id}`   | `200`  | OK                            |
| `PUT /orders/{id}`   | `200`  | OK (replaced)                 |
| `DELETE /orders/{id}`| `204`  | No Content                    |
| any unmatched verb   | `405`  | Method Not Allowed            |
| any unmatched path   | `404`  | Not Found (deny-by-default)   |
| `method <= 0`        | `400`  | Bad Request                   |

Exported flows: `dispatch`, `routeHealth`, `routeOrders`, `routeOrderItem`, and the
zero-arg fusable entry `main()` (routes a representative `POST /orders` → `201`).

## Build

```sh
cd <repo root>
node galerina.mjs build --package packages-galerina/galerina-api-protocol-rest
```

Emits into `dist/`: `<name>.wasm`, `<name>.wat`, `<name>.lmanifest` (CBOR),
`<name>.lmanifest.json`, `<name>.governance-impact.json`, and `<name>.fuse.json`.

## Fuse + test (end-to-end)

`tests/e2e-fuse.test.mjs` imports the B2 governed component loader
(`../../galerina-framework-app-kernel/dist/fuse-loader.js`), **fuses** the built
`dist/` artifacts, and asserts the REST dispatch end-to-end (plus the fail-closed
hash-mismatch and unsigned gates):

```sh
node --test packages-galerina/galerina-api-protocol-rest/tests/*.test.mjs
```

> Note: the build ships a *placeholder* signature (`Ed25519+ML-DSA-65`), which the
> loader treats as unsigned. The test fuses with `allowUnsigned: true`; a real
> Ed25519 signing key makes the loader accept it with zero warnings.
