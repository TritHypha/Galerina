# deps/ — third-party signed governed components

This app's OWN compute lives in [`packages/greeting`](../packages/greeting) and is
declared in [`App.manifest`](../App.manifest)'s `deps[]`. This `deps/` directory is
where **third-party** (or split-out) governed components would be vendored as a built
`<component>.wasm` plus its `<component>.fuse.json` descriptor.

Every component — first- or third-party — is admitted at the **fuse border**: a
deny-by-default, fail-closed gate the host runs before the App Kernel will compose it
(see [`host/server.ts`](../host/server.ts)). Three independent gates must all pass:

1. **Hash pin** — the component's sha256 must match the `sha256` declared for it in
   `App.manifest` (`deps[]`). A changed binary is refused (`SPORE-FUSE-HASH-MISMATCH`).
2. **Signature** — the component's manifest must carry a valid Ed25519 signature from
   an authorised `signer`. An unsigned or wrongly-signed component is refused
   (`SPORE-FUSE-UNSIGNED` / `SPORE-FUSE-SIG-INVALID`).
3. **Revocation** — a revoked signing key is refused even if the signature is
   otherwise valid (`SPORE-FUSE-KEY-REVOKED`).

Capability imports are **closed / deny-by-default**: a component may only import a
capability the host explicitly provides at the seam. An unresolved import is a
link-time `LinkError`, not a silent fallthrough.

> Capability binding lives in the **signed `.lmanifest` fuse{} block**, never in a
> `.tmf`. `.tmf` carries integrity/confidentiality only.

## Declaring a dep

Add it to `App.manifest`:

```json
"deps": [
  {
    "name": "example-component",
    "wasm": "deps/example-component.wasm",
    "sha256": "sha256:<digest-of-the-built-wasm>",
    "signer": "<authorised-ed25519-public-key-id>"
  }
]
```

An empty `deps[]` admits nothing — that is the secure default.
