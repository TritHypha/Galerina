# LSS — Known Architecture Gaps (Deferred)

These are intentional seams for the integrating session, not bugs.

1. **Encryption-at-rest.** `StateSerializer` has no development-key default: it
   requires an explicit `hmacKey` or an epoch `keyProvider` (LSS-KEY-001), stamps
   the non-secret `keyEpoch` / `keyId` into every snapshot, and refuses a key that
   is absent, shorter than 256 bits or all-zero on construction, serialize
   (LSS-KEY-002) and verify. Where the provider's key bytes live (custody) is the
   integrating host's concern. Snapshots are authenticated but not yet encrypted
   at rest — see `native/README.md`.

2. **Real engine-state snapshotting.** LSS serialises arbitrary `unknown`
   payloads via `JSON.stringify`. Snapshotting actual `HybridEngine` / LSM
   (Static Memory) live state — including non-JSON-safe structures like typed
   arrays and the flight-locked pool — is deferred to the integrating session,
   which will supply a state extractor/restorer pair.

3. **typeRoots coupling.** `tsconfig.json` points `typeRoots` at the sibling
   `galerina-tower-citizen/node_modules/@types` so `node:crypto` / `node:fs`
   resolve under the shared compiler (which ships no `@types`). If that sibling
   moves, this path must follow.
