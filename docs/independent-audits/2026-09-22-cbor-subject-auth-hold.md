# Independent audit — `galerina verify` CBOR subject authentication

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `galerina verify` authenticates the decoded CBOR `.lmanifest`
subject. A JSON sidecar-only signature is refused. Tampering a signed CBOR
field fails closed; flipping a JSON sidecar field with intact CBOR does not.

Run-path already used CBOR; this slice is the `verify` command. Dummy /
temp `keygen --hybrid` material only. This is **not** 124-scan closure
(ID `csf_9f99c2b9351a58e3105857f0` remains `PARTIAL_THIS_TREE`).
JSON-Decimal, OAuth, durable replay, and `.fungi` admission were not started.

Node v24.18.0, npm 12.0.2, Windows 11. Hybrid CLI test imports compiler
`dist/manifest-generator.js` (`decodeCBOR` / `encodeCBOR`) only. This
reviewer did not rebuild.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `governance/manifest-subject-auth.mjs` | `919d383c687fcae50fbddb485eb5544b6500691ec866787dc04ecd8a61add287` |
| `galerina.mjs` | `2bc30eedd2de9bf369dfcd0fdd09c3832ec80a6b15438e14d645d25ca45eb888` |
| `governance/manifest-subject-auth.test.mjs` | `0b234c582137ba5cdebdd2a56bce472bb5019fab916188630304adeee44d01f1` |
| `packages-ts/galerina-core-compiler/tests/cli-hybrid-signing-roundtrip.test.mjs` | `4584ef1ba840dd14ec3b66244251a139e58379dfdb8310e01c02aa86ff711878` |

Author hashes **recomputed on this tree** (no separate author digest was
supplied in the review prompt). Dirty paths for this slice: `M`
`galerina.mjs`, `M`
`packages-ts/galerina-core-compiler/tests/cli-hybrid-signing-roundtrip.test.mjs`;
untracked `governance/manifest-subject-auth.mjs` and
`governance/manifest-subject-auth.test.mjs`. Passing tests here are **not**
production admission.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `verify` decodes CBOR `.lmanifest` as the checked artifact | source `galerina.mjs` 1717–1718; hybrid CLI test + independent probe |
| Signature subject is CBOR body, not JSON sidecar | source `selectManifestAuthSubject` 29–34; verify 1837–1851 / 1891 / 1952 `signedBody`; log `over CBOR subject` |
| JSON-only signature refused | source 37–38 + verify 1839–1841; unit test; independent CLI probe exit 1 |
| Tamper signed CBOR field fail-closed | hybrid test step 6; independent probe `FUNGI-MANIFEST-TAMPER: v2 manifest bodyHash mismatch` |
| JSON sidecar field flip with intact CBOR does not fail | hybrid test step 5 exit 0; independent probe hybrid verified over CBOR |
| Hostile: `sidecarBindIsInsufficient` true for sourceHash+schemaVersion match with different `flowCount` | unit test + independent probe `true` |
| Hostile: JSON-only signature refuses | unit + independent CLI |
| Old JSON-body + sourceHash/schemaVersion bind gone | `git diff` removed `jsonManifest` as signed input and the post-crypto sidecar bind |
| `galerina run` CBOR admission | residual: already CBOR at 2078–2112; **not this slice** |
| Classical Ed25519 verify branch | source-inspected (`signedBody`); **not process-executed** (hybrid only) |
| 124-finding scan | **not this claim** (`PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=15000 governance/manifest-subject-auth.test.mjs` → **6/6 pass**, `fail 0`, `duration_ms 126.5713`.
   - hostile: sourceHash+schemaVersion bind still matches a tampered CBOR `flowCount` — **true**.
   - CBOR object signature is the authentication subject — **green**.
   - JSON-only signature is refused as not the checked CBOR subject — **red** (refuse).
   - split-brain sidecar vs CBOR signatures refuse — **red**.
   - both unsigned is unsigned, not a sidecar pass — **green**.
   - missing CBOR subject refuses — **red**.
2. `node --test --test-timeout=180000 packages-ts/galerina-core-compiler/tests/cli-hybrid-signing-roundtrip.test.mjs` → **1/1 pass**, `fail 0`, `duration_ms 3761.4209`.
   - clean certified hybrid `verify` exit 0, names Ed25519 and ML-DSA-65, `both halves`.
   - JSON sidecar `flowCount` flip exit **0**.
   - CBOR `flowCount` tamper exit **1**, `/FUNGI-MANIFEST-TAMPER/`.

Independent extra probe (temp `%TEMP%\galerina-cbor-subject-auth-probe.mjs`; not production; temp `keygen --hybrid` only):

- `sidecarBindIsInsufficient` with matching `sourceHash`+`schemaVersion` and different `flowCount` → **true**.
- Certified build CBOR carries an object `governanceSignature`; JSON signature string matches.
- CBOR `governanceSignature: "placeholder"` + intact JSON → verify **exit 1**, `FUNGI-MANIFEST-TAMPER: JSON sidecar signature is not the checked CBOR subject`.
- CBOR `flowCount` +1 + intact JSON → verify **exit 1**, `v2 manifest bodyHash mismatch` (declared `sha256:303e685a…` vs computed `sha256:aa065064…`). **Not** the JSON-only refuse string.
- JSON `flowCount` +1 + intact CBOR → verify **exit 0**, `Hybrid signature verified … both halves over CBOR subject`.

## Challenge 1 — is JSON still the authenticated subject?

**No for `galerina verify`. CONFIRMED closed on this dirty tree.**

Prior `verify` took `jsonManifest.governanceSignature` and signed
`jsonManifest` minus signature, then bound CBOR only by `sourceHash` +
`schemaVersion`. That bind is exactly `sidecarBindIsInsufficient === true`
when `flowCount` disagrees.

Current path: decode CBOR first (1717–1718); `selectManifestAuthSubject`
returns CBOR `body`/`sig` or refuse; hybrid and classical crypto both call
`manifestSigningInput(signedBody, …)`. JSON is consulted only to refuse
JSON-only or split-brain signature strings. Independent JSON `flowCount`
flip still verifies.

## Challenge 2 — can JSON-only signature pass verify?

**No. CONFIRMED refused.** Selector 37–38; CLI 1839–1841 `process.exit(1)`.
Unit test plus independent CLI both emit
`JSON sidecar signature is not the checked CBOR subject`. This is not
vacuous: the hybrid suite’s CBOR-tamper TAMPER is a **bodyHash mismatch**,
not this refuse string.

## Challenge 3 — CBOR field tamper fail-closed vs sidecar flip?

**Yes. CONFIRMED.** Discriminating pair: sidecar flip exit 0; CBOR
`flowCount` flip exit 1 `FUNGI-MANIFEST-TAMPER`. Probe shows the tamper
reason is recomputed v2 `bodyHash`, i.e. the CBOR body is the signed input.

## Residuals (not findings against the named claim)

- `galerina run` already authenticates decoded CBOR under production
  (2078–2112) and does **not** call `selectManifestAuthSubject`. Out of
  this verify-command slice.
- Classical Ed25519 `verify` branch shares the same subject selection;
  this review executed the certified hybrid path only.
- `sidecarBindIsInsufficient` is a characterization helper, not called
  from `galerina.mjs`. The live control is `selectManifestAuthSubject` +
  crypto over CBOR `signedBody`.
- `verify` still prints `✅ … manifest verified` **before** the signature
  gate (1805), then `❌` + exit 1 on refuse/tamper. Pre-existing log order;
  exit code is fail-closed. Scripts that grep `✅` without checking status
  can still be misled.
- Fuse-loader / signed-package write-guard still inspect
  `dist/<name>.lmanifest.json`. Not the `verify` command.
- Ed25519 build still **warns** (not fail-closed) if signed CBOR
  re-serialize fails (2662–2664); verify would then JSON-only-refuse.
  Hybrid build already fail-closes that serialize (2748–2750). Out of
  named verify claim.
- Dummy / temp hybrid keys only. No production key material.
- 124-finding scan remains a separate open programme. Inventory still
  `PARTIAL_THIS_TREE` for `csf_9f99c2b9351a58e3105857f0`.
  Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid
(JSON-only refuse and CBOR tamper both go red; sidecar flip stays green).
Evidence is sufficient for `galerina verify` on this dirty tree;
insufficient for scan closure, run-path re-audit, classical-only CLI
execution, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
