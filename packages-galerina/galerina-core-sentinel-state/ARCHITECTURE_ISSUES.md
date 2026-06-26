# LSS — Known Architecture Gaps (Deferred)

These are intentional seams for the integrating session, not bugs.

1. **Encryption-at-rest + rotating GovernanceKey.** `StateSerializer` currently
   accepts a single `hmacKey` and defaults to a fixed all-zero 32-byte
   development key. Production MUST inject a real GovernanceKey, and key
   *rotation* (re-MAC / re-encrypt on rotation, key-id stamping in the snapshot
   header) is deferred. Snapshots are not yet encrypted at rest — see
   `native/README.md`.

2. **Real engine-state snapshotting.** LSS serialises arbitrary `unknown`
   payloads via `JSON.stringify`. Snapshotting actual `HybridEngine` / LSM
   (Static Memory) live state — including non-JSON-safe structures like typed
   arrays and the flight-locked pool — is deferred to the integrating session,
   which will supply a state extractor/restorer pair.

3. **typeRoots coupling.** `tsconfig.json` points `typeRoots` at the sibling
   `galerina-tower-citizen/node_modules/@types` so `node:crypto` / `node:fs`
   resolve under the shared compiler (which ships no `@types`). If that sibling
   moves, this path must follow.
