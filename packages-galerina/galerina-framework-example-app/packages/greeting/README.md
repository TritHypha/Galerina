# greeting — the app's governed compute package

The fusable, signed compute for the example app. `flow main()` returns the HTTP
status (200) that `GET /hello` serves. The host (`../../host/server.ts`) admits this
package at the fuse border (sha256 pin → Ed25519 signature → revocation) and calls
`main()` through the App Kernel.

## Build

```sh
node ../../../../galerina.mjs build --package .   # or, from the app root: npm run build:greeting
# → dist/greeting.wasm + dist/greeting.lmanifest.json (signed)
```

## Security posture

- **Deny-by-default.** `package.spore.json` declares `"capabilities": []`. The entry is
  `pure` with no `effects {}`, so it cannot reach the network, storage, secrets, the
  database, or inference. Grant a capability only by adding it to both a flow's
  `effects {}` and this descriptor's `capabilities`.
- **Fail-closed.** The `match` ends with the mandatory `_ =>` wildcard (SPORE-TYPE-023):
  an unexpected state returns 500 instead of falling through.
