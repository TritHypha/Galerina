# `governance/incubating/` — plugin drafts (NOT scanned by the border gate)

`galerina border-check` scans only [`../plugins/`](../plugins/). This directory holds
**unfinished plugin drafts** that are deliberately kept out of the admission path so
the gate stays silent (a zero-trust gateway should raise nothing until there is a
real breach — see the alert-fatigue rationale in the 2026-06-17 audit follow-up).

A draft here is **not trusted and not admitted** — its presence is inert.

## Current drafts

### `groq-inference-v1`
A schema-only draft (network-capable: `ai.inference`, `network.outbound`,
`audit.write`) with a placeholder `sourceHash` (`sha256:pending-galerina-promote`).
It correctly failed the border gate; rather than leave a permanent boot-time
denial, it is parked here until it is real. Moved from `../plugins/` on 2026-06-17.

## Promotion path (draft → admitted)

When a draft is genuinely ready, promote it deterministically:

1. **Compile** the actual `.wasm` / native artifact on a trusted build host.
2. **Hash** it locally: `shasum -a 256 path/to/artifact` → set `manifest.sourceHash`
   to `sha256:<that digest>`.
3. **Sign** the manifest with the **offline** hybrid Ed25519 + ML-DSA-65 root key
   (`21415420b447e219` / the current active generation — never the revoked
   `8eecf4187ebc9341` or the lost interim root `ab46f4c7e2797b9b`, see
   `security/revocations/REV-2026-06.md` and RD-0368).
4. **Pin** the public key in the verifier/admission policy.
5. **Move** the directory back into `../plugins/` and confirm
   `node galerina.mjs border-check` admits it (`1 admitted, 0 denied`).

Steps 1–3 require the build host and the offline private key — they are not
automatable by an assistant and must be performed by the key holder.
