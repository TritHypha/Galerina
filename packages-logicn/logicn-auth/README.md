# logicn-auth

A governed LogicN package scaffolded with `logicn new`.

## Build

```sh
node logicn.mjs build --package .
# → dist/logicn-auth.wasm  (+ .wat, .lmanifest, .fuse.json)
```

## Security posture

This package is **secure by default**:

- **Deny-by-default capabilities.** `package.lln.json` declares an empty
  `"capabilities": []` list. The entry flow is `pure` with no `effects {}`
  block, so it cannot reach the network, storage, secrets, the database, or
  inference. Grant a capability only by adding it to both the `effects {}`
  block of a flow and the descriptor's `capabilities` array.
- **Fail-closed control flow.** Every `match` ends with a mandatory `_ =>`
  wildcard (LLN-TYPE-023): an unrecognised input lands on a safe default
  instead of falling through.
- **Least capability.** Add only what the package provably needs, nothing more.

## Layout

```
package.lln.json   descriptor: name / kind / provides / entry / seam / capabilities
src/index.lln      governed `pure flow main() -> Int` entry
tests/             your .lln tests
README.md          this file
```
