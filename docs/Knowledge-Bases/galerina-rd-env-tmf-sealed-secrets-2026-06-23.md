# env.tmf — Sealed Secrets on the .tmf Container (R&D)

Status: R&D / DESIGN — buildable-now (v0 encrypted-but-unsigned), no build started. Date 2026-06-23. Posture: no new crypto, no new science (Galerina core boundary holds). Proposed package @galerina/ext-secrets-tmf — OPTIONAL + SEPARATE (owner requirement). zeroTrustScore 0.74. Paper verdict: defensive-pub (or none).

Store an application's environment/credential map as an encrypted-at-rest .tmf container instead of a plaintext .env, edited through a governed in-memory-only CLI. Verified against shipped source; every line reference below was checked to exist on 2026-06-23.

## 1. Hub verdict (up front — strict honesty)

The idea is good and worth building, but it is NOT novel. env.tmf is the Mozilla SOPS / Bitnami Sealed-Secrets / age pattern applied to the existing .tmf container. It encrypts secret VALUES at rest, inherits the container's authenticated-encryption + (future) signature, and adds one genuine hardening — a decrypt-strictly-in-memory editor that structurally avoids the documented SOPS temp-file leak. No new cryptography or science, so the paper verdict is defensive-pub (or none) — matching Galerina's standing no-new-crypto posture.

The four hub caveats — all CONFIRMED against prior art, none refuted:

1. At-rest only — secret-zero is RELOCATED, NOT REMOVED. An LFI / path-traversal / accidental-commit / backup-leak that reads env.tmf gets AES-256-GCM ciphertext, not plaintext credentials — a real win over plaintext .env. But the .tmf decryption (recipient KEM) key becomes the new bootstrap secret and still needs an external anchor (KMS / TPM / operator passphrase / instance-identity). This is the textbook secret-zero problem (HashiCorp Vault auto-unseal literature; SOPS DEK/KEK model). If the key co-locates on the same disk as the ciphertext you are back to square one — the same LFI reads both. env.tmf reduces blast radius (N app secrets -> 1 anchored key); it does not eliminate the external root of trust. Unavoidable by design.

2. MUST decrypt strictly in-memory — never to a temp file. sops edit decrypts plaintext to a temp directory (%Temp% / /tmp) for $EDITOR; those files are "left clear text in temp folder", never cleaned up, persist on crash, often world-readable (getsops/sops issues #624, #1044). SOPS's own non-editor mitigation is a FIFO so "the plaintext secrets never touch the disk" — confirming disk-touch is the hazard. Galerina must decrypt only inside the SealTaint arena, mlock pages against swap, and zero-wipe after use. This is the one genuine hardening env.tmf adds, and Galerina's taint/arena machinery is unusually well-suited to deliver it.

3. Local-operator-edit (legitimate) is DISTINCT from production read-back (a regression). The SOPS / Sealed-Secrets use case — a local operator decrypting THEIR OWN file in RAM, editing, re-sealing — is the canonical safe workflow. It is categorically different from streaming a decrypted secret out of a running production node back to a remote operator (the read-back regression flagged in earlier R&D). Bitnami Sealed-Secrets enforces the strong form ("only the cluster can decrypt, nobody else, not even the original author"). These two capabilities must be kept architecturally separate — see section 4.

4. OPTIONAL + SEPARATE package (owner requirement). SOPS, age, git-crypt, Sealed-Secrets, and Vault are all standalone opt-in tools layered onto an app — never baked into a language core. env.tmf ships as the optional separate ext package @galerina/ext-secrets-tmf, leaving the fail-closed compiler core unburdened.

Honest residue (what it genuinely adds over plaintext .env): ciphertext-at-rest; authenticated integrity / tamper-evidence (.tmf carries an AEAD container — .env has zero integrity); producer provenance via the future signed root; and the governed in-memory editor. All real; none novel.

## 2. Verify-vs-shipped — what reuses, what is net-new

### Reuses the .tmf engine (@galerina/ext-tmf) essentially as-is
- Modality/codec already defined: spec/tmf-modalities-v0.md:47 = modality=9 (Structured) "machine-readable trees: JSON, XML, CBOR"; :66 codec 0x0601 JSON / 0x0606 YAML. An env.tmf is just Structured section(s) carrying canonical JSON/YAML of the key/value map. Modality is bound into the TMX leaf (leafHash, container.ts:84) so it cannot be silently relabelled.
- Confidentiality is exactly KEM-DEM single-shot: kemdem.ts:168 seal(profile, recipientPub, payload, aeadContext) / :190 open(...) AES-256-GCM-seal an opaque payload under hybrid X25519+ML-KEM-768 (KEM_PROFILE 0x02, kemdem.ts:28). Use commit_mode=01/CTX (COMMIT_MODE.CTX kemdem.ts:35, applied :179) so the section is fully key-committing (CMT-4) — the SOPS/sealed-secrets pattern done correctly.
- Container write/read reusable verbatim: container.ts:77 writeTmf(sections) / :101 readTmf(buf) already do fail-closed integrity (TMX root over the CIPHERTEXT leaves, container.ts:150/:157) and reject every tamper/bounds case byte-precisely.
- All crypto-on-core / digital — matches no-new-crypto (kemdem.ts:12, SPORE-SUBSTRATE-001). @noble is borrowed from the compiler's node_modules (kemdem.ts:19-21); the new package inherits that wiring with no new crypto dependency.

The one real engine caveat (do not gloss): readTmf HARD-REJECTS any signed file (container.ts:160-164, "no vetted signature verifier wired in v0"; signing = engine slice 4 / roadmap #7, unbuilt). There is also no encrypted-container reader yet — open() is wired at the section level only, NOT composed into a readTmf-style decrypted-container reader. The encryption-spec section-7 fail-closed reader (verify-before-decrypt -> K3 ALLOW(+1) gate -> NoCryptoLib reject) is SPEC-ONLY (spec/tmf-encryption-v0.md:230-257, K3 gate :237, NoCryptoLib :256). env.tmf must implement that compose step itself (recompute TMX over ciphertext leaves -> [verify sig when slice 4 lands] -> open()). So it reuses writeTmf + seal as-is but supplies the thin encrypted-read orchestration the engine has specced but not built.

### Reuses the secrets-vault store DISCIPLINE (@galerina/ext-secrets-vault) — as a PATTERN, not a drop-in
- In-memory zero-wiped secret store — SecretsRotationManager (rotation-manager.ts). The handles Map holds Buffer values zero-wiped on replace (:45-49), on rotate-swap (:95), on evict (:135-136), on quarantine, and on shutdown dispose(). Exactly the SealTaint-arena discipline env.tmf needs.
- Atomic-swap / quiesce — rotate() (rotation-manager.ts:84-95): stage new value (:84) -> quiesce drain (:87) -> atomic swap activeValue<-stagingValue (:90-92) -> zero-wipe old buffer (:95). When an operator re-seals an env.tmf, the running node re-loads with this same stage->swap->wipe choreography (guest never restarted).
- Fail-closed serving — getActive() returns undefined for a faulted/quarantined handle (rotation-manager.ts:108-110); on_rotation_fault default is halt, so a stale/un-decryptable secret is never served.

CAVEAT — it is a PATTERN reuse, not an import. The store is tightly coupled to Vault HTTP: load()/rotate() take a VaultClient and call vaultClient.readSecret() (rotation-manager.ts:33-37, :83). The wiped store + atomic swap are NOT exposed as a source-agnostic component. So env.tmf cannot simply new SecretsRotationManager() and feed it .tmf bytes without either (a) a small refactor extracting the store from the Vault-fetch loop, or (b) adapting the value source. Honest seam: in-memory store + swap + zero-wipe + fail-closed = the reusable assets; the Vault-HTTP fetch is not relevant to env.tmf.

### Net-new (what neither package provides)
1. The env.tmf schema/convention — Structured (modality=9) section(s) carrying canonical JSON/YAML of {KEY:value}, codec choice, and the map onto the existing secret {} / EnvironmentVariableReference model. Spec + small mapper.
2. The file-backed CRUD CLI — init/set/get/list/rm/rotate-recipient/shell. Nothing in either package does file-backed secret CRUD (engine gives byte primitives; vault CLI only does read/rotate/status against a remote Vault). Entire operator-facing CLI is net-new.
3. The in-memory edit -> re-seal flow — read -> open() all sections into wiped buffers -> apply the operator's change in RAM -> seal() -> writeTmf -> atomic file replace. The "decrypt in SealTaint arena, never a temp file, zero-wipe after" guarantee is implemented here. This is the SOPS-temp-file-leak mitigation.
4. The encrypted-container compose-reader — recompute TMX over ciphertext leaves, then per-section open() with the section-7 verify-before-decrypt ordering and NoCryptoLib/fail-closed posture (specced, unbuilt).
5. Key-custody / secret-zero anchoring — choosing + wiring the external anchor. Single most important design decision; neither package addresses it. env.tmf should anchor through the existing core-config SecretConfigSource kinds (galerina-core-config/src/index.ts:1144 vault, :1145 kms) — do not invent a new custody mechanism.

## 3. Design — @galerina/ext-secrets-tmf (optional, separate, thin)

A new optional separate ext package (private:true, ext tier) sitting ABOVE both leaf packages as a thin orchestration layer. Owns ONLY glue: the schema, the CRUD CLI, the in-RAM edit/re-seal flow, the encrypted-container compose-reader, and custody-anchor policy. No new crypto, no new container bytes.
- Depends on @galerina/ext-tmf for format/crypto primitives (writeTmf/readTmf, seal/open, buildContext, KEM_PROFILE 0x02, COMMIT_MODE.CTX). Consumes public exports only.
- Depends on @galerina/ext-secrets-vault for the in-memory zero-wiped store + atomic-swap + fail-closed DISCIPLINE (pattern, or a small extracted store). Does NOT pull in VaultClient/HTTP unless the operator explicitly chooses Vault as the custody anchor.
- Layering sanity: both deps are leaf packages with zero runtime deps ("dependencies": {}), both private:true ext ("non-core / outside the deterministic compiler core"). The new package sits at the same ext tier, above both, owning only glue. Marked optional (not auto-loaded), consistent with EnvironmentPolicy — .env disallowed in staging/prod (core-config index.ts:1250/:1252); env.tmf is the encrypted-at-rest alternative for those modes.

### Part 1 — env.tmf schema
- Container = the shipped v0 .tmf (header + section table + payload region [+ signature block]). writeTmf/readTmf used as-is for the unsigned-but-encrypted body; TMX-256 root over the CIPHERTEXT leaves gives fail-closed integrity already.
- One secret = one TmfSection: modality=9 (Structured), coord = the opaque non-semantic 16-byte id (HKDF/SHAKE of the name truncated to 16 B — the cleartext name is NOT leaked in the table), payload = KEM-DEM-sealed ciphertext of the canonical value bytes, codec 0x0601 JSON (for a {value,metadata} leaf) or raw for a bare opaque value.
- Value confidentiality: seal(0x02, recipientPub, valueBytes, aeadContext) with commit_mode=01/CTX (CMT-4). aeadContext (36 B, buildContext) binds sectionId+coord+modality+codec+epoch so a section cannot be lifted/replanted/relabelled.
- One reserved manifest section (fixed-sentinel coord): a sealed Structured JSON directory {name->coord} + per-secret metadata (provider tag, created/rotated epoch, kem_profile, intended environment). Names live only inside ciphertext.
- Signed root deferred: ML-DSA-65 over the TMX root = engine slice 4 / #7, UNBUILT — readTmf rejects any signed file today. v0 env.tmf ships UNSIGNED-but-ENCRYPTED (flags.signed=0); the signed-root requirement is gated on slice 4. Document the deferral; never fake a signature.

### Part 2 — CRUD CLI (SQL-mode style, in-memory only)
Binary galerina secrets-tmf <cmd> (also galerina-secrets-tmf), --file ./env.tmf default.
- init: create an empty encrypted env.tmf for a recipient pubkey (sealed manifest only).
- set NAME: value from STDIN or no-echo prompt — NEVER argv (argv leaks in ps/history); open -> add/replace coord in arena -> re-seal -> writeTmf -> atomic rename of a CIPHERTEXT-ONLY temp.
- get NAME: decrypt one section in-arena -> stdout (for piping into a process), REFUSE on a TTY without --force (shoulder-surf/scrollback), zero-wipe after.
- list: decrypt MANIFEST ONLY -> names + metadata, never values.
- rm NAME: remove section + manifest entry, re-seal, atomic replace.
- rotate-recipient --new-pub P: re-encrypt every section under a new recipient KEM pubkey (SOPS-style per-file rekey); old buffers zero-wiped.
- shell: interactive REPL (set/get/list/rm/.save/.quit): opens the whole file ONCE into the SealTaint arena, mutates arena buffers, .save re-seals + atomic-replaces, .quit zero-wipes. NO $EDITOR, NO FIFO, NO /tmp. This is the differentiating piece — structurally avoids the documented sops edit temp-file leak (#624).
Hard build constraints (enforce in code, not just docs): decrypt strictly into SealTaint-arena / wiped Buffers (reuse rotation-manager.ts:45-49/:95 discipline); mlock pages against swap where the platform allows; zero-wipe on every replace/save/quit/error; never write plaintext to a temp file; never put a secret value in argv. CLI surface is net-new; maps onto engine seal()/open()/writeTmf()/readTmf().

### Part 3 — Key anchor (the recipient KEM secret key) — does NOT remove secret-zero
open() takes recipientSec as a CALLER-supplied Uint8Array (kemdem.ts:190) — the engine has ZERO custody logic. KEM-DEM relocates the bootstrap secret to this key. State plainly: env.tmf moves secret-zero from N app secrets -> 1 anchored key and reduces blast radius; it does not eliminate the external root of trust.
- Local dev: operator passphrase -> Argon2id KDF -> unwrap the recipient secret key held ONLY in the arena. Same posture as today's plaintext .env.galerina-signing (galerina.mjs:309/:349, written cleartext with only a "NEVER COMMIT" comment) — but encrypted-at-rest.
- Prod: anchor through the EXISTING core-config SecretConfigSource kinds — {kind:"kms",keyId,provider} / {kind:"vault",storeId,keyPath} (core-config index.ts:1144-1145), reusing the vault governed-fetch/external-anchor pattern. TPM / instance-identity / workload-identity also valid. Do not invent a new custody mechanism.
- HARD CAVEAT (must be in the README and refused-by-lint where possible): if the recipient secret key co-locates on the same disk as the ciphertext, the at-rest win EVAPORATES — the same LFI/traversal reads both. The anchor MUST be external. Unavoidable by design; the package cannot solve secret-zero.

### Part 4 — Production runtime path
At boot: (1) fetch the recipient KEM secret key from the external anchor via the SAME governed-fetch as the vault path (SecretConfigSource kms/vault). (2) read env.tmf with the NET-NEW encrypted-container compose-reader (encryption section-7, specced :230-257, unbuilt): readTmf recomputes TMX over ciphertext leaves fail-closed (container.ts:101/:150/:157) -> [verify ML-DSA sig when slice 4 / #7 lands] -> per-section open() with section-7 verify-before-decrypt + K3 ALLOW(+1) gate (:237) + NoCryptoLib reject (:256). (3) decrypt into the SealTaint arena, hold as zero-wiped Buffers in a SOURCE-AGNOSTIC store modeled on SecretsRotationManager (store + swap + wipe + fail-closed discipline, NOT VaultClient HTTP). (4) decrypt fault -> FAIL CLOSED, never serve stale (getActive :108-110; on_*_fault default halt). The .env / .env.galerina-signing file path STAYS DEV-ONLY — EnvironmentPolicy.allowDotEnvFiles=false for staging/production (core-config index.ts:1250/:1252); env.tmf is the encrypted-at-rest replacement there. An operator editing + re-sealing an env.tmf triggers a runtime reload via the rotation-manager stage->quiesce->swap->wipe choreography (rotation-manager.ts:84-95); guest never restarted.

## 4. Local-edit (fine) vs production read-back (regression) — enforced by construction
Two distinct capabilities, kept architecturally separate:
- LOCAL-EDIT — LEGITIMATE (the SOPS use case): a local operator decrypts THEIR OWN env.tmf into the arena, edits, re-seals. This is the shell/set/rm surface. Runs on the operator's machine against a file they already hold the key for. (Bitnami Sealed-Secrets = the strong cluster-bound form; SOPS = the symmetric form — both local-or-cluster-bound, never remote-egress.)
- PRODUCTION READ-BACK — REGRESSION (the earlier-flagged hazard): streaming a decrypted secret out of a running production node back to a remote operator. NOT a feature of this package; must be impossible by construction. get is local-only and refuses on a TTY without --force; there is NO network read-back endpoint. The package's only network surface, if any, is the custody-anchor unseal call (KMS/TPM) — never secret read-back.
Enforce with: separate code paths / no shared egress; a lint/CI gate forbidding any net sink on the decrypt path; and EnvironmentPolicy.allowSecretValuesInReports=false (core-config index.ts:1231) already denying secret values in reports.

## 5. What env.tmf does NOT solve (no overclaiming)
1. Secret-zero / key anchor — not solved, unsolvable by this design. The decryption key is the new bootstrap secret; an external anchor must hold it. Co-locating it on the same disk evaporates the win. Relocates and shrinks blast radius — does not eliminate the external root of trust.
2. Runtime exposure — once decrypted for the app to use, the secret is plaintext in process memory. mlock + zero-wipe shrink the window; they don't eliminate memory-scraping / core-dump exposure (the Go-GC-copy caveat from memguard-style patterns applies; ensure the arena is not subject to relocation/copy and locks pages against swap).
3. Key-rotation pain — SOPS-style per-file value encryption makes add/remove/rotate manual and per-file unless a controller/asymmetric model (a la Sealed-Secrets) is adopted later.
4. Not new cryptography or science — by explicit Galerina design. It is the SOPS / Sealed-Secrets / age pattern on .tmf.
MUST-AVOID build constraint (restated): never decrypt env.tmf to a temp file on disk — that reproduces the exact SOPS weakness (#624: plaintext temp left in /tmp or %Temp%, persists on crash, world-readable). Decrypt in-memory only (SealTaint arena), lock pages against swap, zero-wipe after use.

## 6. Prior art + paper verdict
- Mozilla SOPS (github.com/getsops/sops) — DEK/KEK structure: AES-256-GCM data key wrapped by an external KEK (AWS/GCP/Azure KMS, age, PGP). The temp-file edit weakness (#624 / #1044) is the thing env.tmf improves on. Per-file rekey pain documented (GitGuardian SOPS guide).
- Bitnami Sealed-Secrets (github.com/bitnami/sealed-secrets) — the strong asymmetric form: only the cluster decrypts; developers can only encrypt. The model for the local-edit-vs-read-back asymmetry.
- age — modern file encryption; the at-rest + integrity baseline.
- HashiCorp Vault auto-unseal / secret-zero literature — confirms caveat (i): moving secret-zero to one anchored key is the standard outcome, not elimination.

**Competitive landscape (owner R&D 2026-06-24) — the OSS market splits in two, and neither half does both:**
- **Diskless INJECTORS (solve fetching, NOT confinement):** Keyway (`keyway run --`, no `.env` on disk, gRPC fetch → process memory), Infisical / Doppler (`infisical run --` / `doppler run --`, cloud KMS → env), 1Password CLI (`op run`, `op://` references resolved at boot). *Where they fail AZT:* they inject into the UNSHIELDED OS environment (`process.env` / `os.environ`) — a rogue npm package or an AI agent in the same process does `console.log(process.env)` and exfiltrates everything. No SealTaint isolation; no governed editor.
- **Encrypted EDITORS (the temp-file flaw):** SOPS / Ansible-Vault (`sops edit` decrypts plaintext to a `/tmp` or `/dev/shm` temp file, opens it in `$EDITOR`; a crash leaves the plaintext on the SSD — getsops #624/#1044), and the GnuPG+Vim hack (`gpg -d | vim -`, which still writes a `.swp` swap file unless perfectly configured). None edits diskless.

**Galerina differentiation (why `@galerina/ext-secrets-tmf` is structurally net-new, though still a COMPOSITION):** (1) replaces `$EDITOR` with a sandboxed in-arena buffer — NO `/tmp`/`.swp`/`$EDITOR`, plaintext never touches the SSD; (2) replaces `process.env` with the **SealTaint** governed arena — secrets cannot be read by a rogue library/agent (compile-time taint + arena confinement), unlike the injectors' open env; (3) **atomic write-only in-memory rotation** (K3-`0` hold → pointer swap → zero-wipe), no app restart — none of the OSS tools do live zero-downtime rotation. The OSS community solved FETCHING; Galerina secures EDITING + MEMORY-CONFINEMENT. Still defensive-pub (composition of known patterns), not novel science.

Paper verdict: defensive-pub (or none). No new crypto, no new science -> 0 patent value. A short defensive-publication note (the SOPS/Sealed-Secrets pattern on the .tmf container, with the in-memory-only editor as the one differentiating hardening) is the ceiling.

## 7. Effort / sequencing
- Part 1 schema: S, buildable-now (unsigned+encrypted; signed root GATED on slice 4 / #7).
- Part 2 CRUD/shell CLI: M, buildable-now (in-arena zero-wipe edit/re-seal = the core net-new work).
- Part 3 key anchor: S (local-dev passphrase) buildable-now; M (prod KMS/TPM anchor) partially gated (thin adapter over SecretConfigSource kms/vault).
- Part 4 production runtime: M, buildable-now for the encrypted (unsigned) compose-reader + arena store; sig-verify step GATED on slice 4.
- Part 5 edit/read-back boundary: S, buildable-now (no-net-sink lint gate + local-only get + allowSecretValuesInReports=false).
Overall: M, mostly buildable-now. Only ML-DSA signed-root verification is hard-gated on galerina-ext-tmf slice 4 (#7) — ship v0 encrypted-but-unsigned and document the deferral. zeroTrustScore 0.74 — strong at-rest + integrity + governed fail-closed reader + in-memory-only editor (genuine hardening over sops edit), but capped below ~0.85 because (a) secret-zero is relocated not removed, (b) runtime memory exposure remains, (c) signed-root unbuilt in v0, (d) the co-located-key footgun is one operator mistake from nullifying the win.

## 8. Relation to neighbours
- @galerina/ext-tmf (docs/Knowledge-Bases/galerina-tmf-engine.md) — the format/crypto engine env.tmf consumes. Slice 4 (#7) signing is the only hard blocker for a signed env.tmf.
- @galerina/ext-secrets-vault (galerina-core-config-vault.md, galerina-key-custody-rotation-decision.md) — the in-memory store/swap/wipe discipline env.tmf reuses as a pattern. Vault remains the remote-fetch custody model; env.tmf is the file-at-rest model. Keep them separate; env.tmf must NOT add a read-back-to-remote-operator path.
- #110 secrets {} body-drop (galerina-design-secrets-epilogue-blocks.md:39) — the secret {} / EnvironmentVariableReference model is retained but its credential body-drop wiring is the open core gap. env.tmf is the file format + operator tooling for those credentials; the declarative secrets {} block is how a contract references them. Complementary, not competing.