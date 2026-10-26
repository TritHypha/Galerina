# 48 env-anchor-beta typed UNKNOWNs and cited gaps

TYPED_UNKNOWN TS_DIFFERENTIAL: no frozen TypeScript oracle for a beta .env anchor exists on base 5d4d21d86. TS is frozen reference only; no TS differential is run.

CITED_GAP ANCHOR_TS (not edited): packages-ts/galerina-ext-secrets-spore/src/anchor.ts at 5d4d21d86 is older frozen reference code. anchorProdSecret accepts only kms|vault and rejects env/runtime, and wrapRecipientSecret (AES-256-GCM, line 53) binds no AAD. The intended beta path is this unit: a plain deployment .env read once at boot through the SecretsProvider port, with AAD bound to purpose+root. .env.spore stays deferred until after beta. Aligning or retiring anchor.ts is a separate unit and needs Phillip's direction.

PRE_EXISTING FOLDER_AUDIT: scripts/audit-fungi-memory-folder.mjs already returns FOLDER_REFUSED on base 5d4d21d86 (stale allowlist: evidence/32..47, kg01/05/06, closure, many src units and test dirs). This branch adds host/, src/env-anchor-beta.fungi, tests/env-anchor-beta and evidence/48-env-anchor-beta to that list. The allowlist refresh is not done here; it is recorded as pre-existing and non-blocking for this unit.

TYPED_UNKNOWN REAL_CREDENTIAL_RECEIPT: all tests use synthetic .env files and random synthetic keys. No real .env was read. Real-credential behaviour stays UNKNOWN until Phillip runs the local pass/fail receipt script himself after merge.

NON_AUTHORIZING: checker and unit-test evidence proves language-level boot admission only. Runtime memory enforcement (aliases, wipes, leases) belongs to SLIDE production code, cross-checked by VOK, and is not claimed here.
