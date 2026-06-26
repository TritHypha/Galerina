# tmf-container — `.tmf` trust-container creation

Measures **creating a `.tmf` v0 trust-container**: per-section SHAKE256 leaf hashes →
3-ary TMX-256 Merkle tree → root → little-endian header/table/payload packing.

One operation = build the **canonical golden container** (spec `tmf-container-v0`, 2
sections → exactly **203 bytes**). Every runtime asserts the **same published root**
`43386e64…685212` before timing, so all three provably do **identical work**.

## Columns

| Column | What it actually is |
|---|---|
| **Node.js** | **Galerina's shipped `@galerina/ext-tmf` engine** (`dist/index.js`, `writeTmf`). The engine is pure TypeScript-on-Node — there is **no `.spore` execution path** for `.tmf` creation — so the engine's throughput *is* the Node.js row. There is deliberately no Galerina-interpreter column here. |
| **Python** | Independent reference writer using stdlib `hashlib.shake_256` (the spec's own conformance oracle). |
| **Rust** | Independent reference writer with a self-contained SHAKE256 (FIPS-202 Keccak-f[1600]), no external crates (builds with the suite's plain `rustc`). |

## Honesty notes

- **This is a SHAKE256 + serialization race across language runtimes**, not "Galerina vs
  the world" — the Galerina engine *is* the Node implementation. Label it as such.
- A wrong implementation **cannot** produce a false result: each runner asserts the
  golden root and exits non-zero on mismatch, so it is excluded rather than charted.
- The canonical container is small (203 B, 4 SHAKE calls), so the number reflects
  **per-container creation overhead** (hash setup + packing), where Node's per-call
  `createHash` FFI cost shows up against Python/Rust's lower-overhead hashing.
- **Encryption (KEM-DEM) and signing are deliberately excluded**: the seal path uses
  random nonces (not byte-deterministic, so no cross-language identity) and signing
  (slice 4) is not implemented. Only the deterministic unsigned-cleartext path is fair.
