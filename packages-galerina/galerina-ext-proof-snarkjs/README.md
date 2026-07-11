> ⚠️ **GPL-3.0 optional extension.** This package links snarkjs (GPL-3.0) in-process, so it is
> licensed **GPL-3.0-only** — importing it places your distributed work under GPL-3.0 obligations.
> Opt in knowingly. It is a non-core, opt-in extension; no other `@galerina/*` package depends on it.

# @galerina/ext-proof-snarkjs

An optional Groth16 / zk-SNARK proof extension for Galerina, wrapping [snarkjs](https://github.com/iden3/snarkjs).

## License

GPL-3.0-only (see [`LICENSE`](./LICENSE)). This is the **single deliberate non-Apache exception** in
the Galerina workspace — every other `@galerina/*` package is Apache-2.0. Because it is a *combined
work* with snarkjs (GPL-3.0), the package itself must be GPL-3.0. The containment invariant — that no
Apache-2.0 `@galerina/*` package may take this as a dependency — is enforced fail-closed by
`scripts/audit-license-compat.mjs` (RD-0355). A consumer that wants zk-proofs opts into GPL-3.0
*knowingly*; nobody inherits it silently.
