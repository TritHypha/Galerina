# Cybersecurity-skills defensive audit of Galerina — 2026-07-09

**What this is.** A structured, authorized, **defensive** security review of the owner-owned `Galerina/`
tree, using the local `Anthropic-Cybersecurity-Skills` library as an *attack-class taxonomy / playbook*
(never as an authority), to test RD-0294's by-construction claims against what the code actually does and
log the gaps. Companion design half: the KB `PROMPT-main-session-rd-0290-0294-implementation-2026-07-09.md`
(RD-0290a onward). Audit findings feed the RD-0294 residuals register.

**Discipline (binds this doc).** The library is a community project (`mukul975`), **not Anthropic-affiliated**
— it is a checklist, not a verdict (same DP-RD-0270 rule: the code and the maths decide, not a label). No
`unhackable`/`not hackable` claims: a CONFIRMED row means *"this attack class is unrepresentable at runtime,
bounded by the residuals that remain"* — never a marketing absolute. Integrity ≠ origin. Applied to `Galerina/`
only; defensive, find-and-fix.

## Verdict legend

| Verdict | Meaning |
|---|---|
| **CONFIRMED** | the by-construction claim holds in the actual code (a defensible security property) |
| **GAP** | a design residual — specified but not yet built; not exploitable now, tracked |
| **OPEN-RISK** | exploitable in the current code — jumps the residuals queue, fix-then-log |
| **N/A** | the attack class does not apply to this surface |

## Summary of findings (this pass — priorities 1-2)

| # | Surface | Library skill | OWASP / CWE | RD-0294 | Verdict |
|---|---|---|---|---|---|
| F1 | `.lmanifest` signature **verification** algorithm handling | jwt-algorithm-confusion; cryptographic-audit | A08 / **CWE-347** | **0294t** | **CONFIRMED** |
| F2 | `.spore` container is **unsigned-v0** (authenticity) | code-signing-for-artifacts | A08 / **CWE-345** | **0294m** | **CONFIRMED** (+ GAP: authenticity deferred) |
| F3 | `.spore` crypto-primitive hygiene | cryptographic-audit | A02 / CWE-327/328 | 0294n/o/p | **CONFIRMED** (primitive hygiene) |
| F4 | current signing is **Ed25519-only** (PQ not default) | post-quantum-cryptography-migration | A02 / CWE-327 | 0294 PQ residual | **GAP** |
| F5 | `kb-preflight` **skips** two drift gates on an absent KB token | detecting-supply-chain-attacks-in-ci-cd | A05 / **CWE-636** | **RD-0290a** | **GAP** (fail-open-on-absent; owner-config, not attacker-exploitable) |
| F6 | historical `audit-doc-drift` fail-open `catch{}` | detecting-supply-chain-attacks-in-ci-cd | CWE-636 | RD-0290a | **CONFIRMED-fixed** |
| F7 | `audit-name-collisions` silently skipped an unparseable `package.json` | detecting-dependency-confusion | CWE-636 | 0294 supply-chain | **OPEN-RISK → FIXED** |
| F8 | `.spore` DEM nonce derivation (fresh per-section KEM key; stream nonces position-derived + anti-truncation) | cryptographic-audit | A02 / CWE-323 | 0294p | **CONFIRMED** |
| F9 | `.spore` AEAD binds `kem_profile`+`aead_suite`+`dem_mode` + `requireAesGcm` pin (suite-downgrade prevented) | cryptographic-audit | A02 / CWE-757 | 0294n | **CONFIRMED** (minor GAP: format version not in AAD) |
| F10 | `.spore` AAD binds section identity but not an explicit whole-file identity | cryptographic-audit | A02 / CWE-345 | 0294o | **GAP** (confirm `coord` uniqueness vs spec §5) |
| F11 | `.spore` key-commitment: `key_commit` + Chan-Rogaway CTX tag (CMT-4) over AES-GCM | cryptographic-audit | A02 / CWE-327 | 0294 CMT-4 | **CONFIRMED** |

---

## Priority 1 — `.spore` crypto-at-rest & signature verification

### F1 — `.lmanifest` verification is algorithm-pinned, not `alg`-driven (0294t) · **CONFIRMED**

*Skill:* `exploiting-jwt-algorithm-confusion-attack`, `performing-cryptographic-audit-of-application`.
*Code:* `packages-galerina/galerina-framework-app-kernel/src/fuse-loader.ts` `verifyManifestSignature` (L380-469);
`packages-galerina/galerina-core-compiler/src/lmanifest-hybrid-verifier.ts` `makeLmanifestHybridVerifier`.

The classic algorithm-confusion attack (attacker sets `alg` to `none`, or to a primitive that reuses the
public key as an HMAC secret) is **unrepresentable** here, because the `algorithm` field is a **gate/router,
never a primitive selector**:

1. The Ed25519 path hardcodes the primitive — `crypto.verify(null, bytes, edPublicKey, sig)` (RFC 8032
   deterministic Ed25519). The `algorithm` string is only checked to *equal* `"ed25519"` as a gate; it does
   not choose the verifier.
2. `alg` = unknown / absent / `"none"` → neither `isRealEd25519` nor `looksHybrid` → returns `"unsigned"` →
   **refused under `requireSignature`** (fail-closed). An attacker cannot promote a tampered manifest to
   `"verified"` by rewriting `algorithm`.
3. The hybrid (v2) path **pins Ed25519 + ML-DSA-65 and verifies BOTH halves**; a missing/malformed ML-DSA
   public key is a **hard throw** (`FUNGI-FUSE-HYBRID-PQ-KEY-MISSING`) — *no PQ downgrade*.
4. **Domain separation blocks component-extraction downgrade.** v1 pure-Ed25519 signs the raw
   `manifestSigningInput`; v2 hybrid signs the `makeManifestEnvelope(sha256(body))` under context
   `galerina.proofgraph.governance.v2`. Different messages ⇒ a hybrid signature's Ed25519 component is **not**
   a valid v1 pure-Ed25519 signature, so a hybrid manifest cannot be silently downgraded to Ed25519-only by
   stripping the ML-DSA half and rewriting `algorithm`.

*Honest caveat (not a hole):* the `algorithm` field itself is inside the stripped `governanceSignature`, so it
is **not** covered by the signature. This does not enable confusion — the field only routes to pinned
verifiers over domain-separated inputs; a value change either lands on a pinned primitive or on the
fail-closed `"unsigned"` path. **Verdict: CONFIRMED — CWE-347 alg-confusion class unrepresentable; the header
is non-authoritative.**

### F2 — `.spore` is genuinely unsigned-v0, fail-closed on any signed file (0294m) · **CONFIRMED**

*Skill:* `implementing-code-signing-for-artifacts`. *Code:* `packages-galerina/galerina-ext-spore/src/container.ts`.

- `writeSpore` writes an **UNSIGNED** container (`flags.signed = 0`) and *never writes a fake signature* —
  "real signing is slice 4 / #7". So the RD-0294m claim (`.spore` UNSIGNED) is accurate in the code, today.
- `readSpore` §6 step 5: a file with the `signed` flag set is **rejected** —
  `AuthError: "signed .spore rejected: no vetted signature verifier wired in v0 (no silent downgrade)"`.
  This is the important property: the reader **refuses to admit a signed file it cannot verify** rather than
  ignoring the signature — no silent downgrade, no forged-signature-accepted path.
- Integrity is real: per-leaf `leafHash` recompute + TMX-256 `tmxRoot` recompute, compared with
  `crypto.timingSafeEqual` (constant-time), bounds-checked in BigInt **before** any hashing.

**Verdict: CONFIRMED** that `.spore` v0 provides **integrity** (tamper-evident via the TMX-256 root) with a
fail-closed reader. **GAP:** it provides **no authenticity** — an unsigned container has no proof of origin
(anyone can recompute a valid root), so `.spore` v0 must not be relied on for authorization/provenance until
the deferred ML-DSA-65 signing lands (0294m top residual). *Integrity ≠ origin* — state it that way, never
"tamper-proof."

### F3 — `.spore` crypto-primitive hygiene · **CONFIRMED**

*Skill:* `performing-cryptographic-audit-of-application` (Validation: weak-hash / ECB / hardcoded-key / weak-KDF).
*Code:* `galerina-ext-spore/src/{kemdem,tmx256,container}.ts`.

Against the crypto-audit checklist: **no** MD5/SHA-1/DES/RC4/ECB — the suite is SHAKE256 (XOF) for the KEM-DEM
and the TMX-256 Merkle tree; KDF is SHAKE256 with **domain-separated context labels** (constants like
`spore-dem-kdf-v0` are *labels*, not keys — no hardcoded secret); digest comparisons route through the vetted
`crypto.timingSafeEqual`. Nonce/AAD/suite-pin footguns (0294p/o/n) are the next depth to verify in `kemdem.ts`
(deferred to a P4 pass). **Verdict: CONFIRMED for primitive hygiene** (no weak-algorithm / ECB / hardcoded-key
findings on this surface).

### F4 — current signing is Ed25519-only; PQ is opt-in, not default · **GAP**

The live `.lmanifest` builds sign **pure Ed25519** (v1) — the hybrid Ed25519+ML-DSA-65 (v2) path exists and is
fully fail-closed (F1) but is not yet the default. Classically secure today; the PQ-readiness residual is that
hybrid is not the default signing mode. **GAP** (tracked), not OPEN-RISK.

---

## Priority 2 — RD-0290a fail-open CI-gate posture

### F5 — `kb-preflight` skips two drift gates when the KB token is absent · **GAP (fail-open-on-absent)**

*Skill:* `detecting-supply-chain-attacks-in-ci-cd`. *Code:* `.github/workflows/conventions.yml`.

`kb-preflight` sets `has_kb_token = (secrets.ZTF_KB_READ_TOKEN != '')` (L405); `lint-conventions` (L23) and
`diagnostic-doc-drift` (L194) both carry `if: needs.kb-preflight.outputs.has_kb_token == 'true'`. So when the
token is **absent**, those two doc-drift gates are **skipped** in CI — drift goes unchecked there. Per RD-0290a's
fail-closed doctrine this is a documented **fail-open-on-absent-credential**.

Mitigations already in place: (a) both gates still run **ENFORCING** locally / pre-commit (`run-phase-close`,
where the private KB is present); (b) a **present-but-wrong** token now fails **red**, not skips (fixed in
`85e04392`, which reverted the worse `14532c5f` skip-on-wrong-token fail-open — a red gate is the check
working, never green it by skipping).
The fully fail-closed state is a **read-only KB-scoped fine-grained PAT** (pending owner action), after which
the `if:` guards can be dropped so the gates run unconditionally. **Verdict: GAP** — owner-config coverage gap,
not an attacker-controlled bypass; closes with the PAT. *Also:* the `kb-preflight` comment (L391-398) is stale
— it describes only the skip and should note the now-fail-closed wrong-token behavior.

### F6 — the historical `audit-doc-drift` fail-open `catch{}` is remediated · **CONFIRMED-fixed**

`scripts/audit-doc-drift.mjs:34` documents the fix inline: *"not silence — this audit once silently lost its
whole corpus to a fail-open catch{} here."* The known RD-0290a bug is closed in Galerina.

### F7 — `audit-name-collisions` silently skips an unparseable `package.json` · **OPEN-RISK (minor)**

`scripts/audit-name-collisions.mjs:91`: `try { …name… } catch { /* skip unparseable */ }`. A package whose
`package.json` is malformed is silently dropped from the name-collision / dependency-confusion check — a small
fail-open (CWE-636): a deliberately-broken manifest evades the check. **Fix (fail-closed):** flag/❌ an
unparseable `package.json` instead of skipping it (an unreadable manifest is itself a finding). Low severity
(a malformed manifest fails other gates), but it violates the fail-closed doctrine the gate exists to uphold.

*(Other `catch{}` sites reviewed — `audit-provenance.mjs:37`, `relink-workspace.mjs`, `rename-package.mjs`,
`run-phase-close.mjs:331` — are benign FS/CLI-availability skips, not enforcement bypasses.)*

---

## Priority 4 — `.spore` crypto footguns (`galerina-ext-spore/src/kemdem.ts`)

*Skill:* `performing-cryptographic-audit-of-application`. The KEM-DEM layer is hybrid X25519+ML-KEM-768 →
SHAKE256 KDF → AES-256-GCM, with a §4 committing-AAD and a §8.5 CMT-4 committing tag.

### F8 — nonce derivation (0294p) · CONFIRMED
Every `seal`/`streamSeal` does a **fresh KEM encapsulation → fresh `K_aead`** per section/stream, so the DEM
key is per-message. Single-shot uses a random 96-bit nonce — with one message per key the GCM birthday bound
(nonce reuse) does not apply (CWE-323 N/A). STREAM nonces are **position-derived** (`prefix8 ‖ BE-u32((i<<1)|last)`,
index < 2³¹) — unique within a key — and the `last`-flag makes a dropped trailing frame recompute an invalid
terminator nonce (anti-truncation). No nonce-reuse footgun.

### F9 — suite-pinning (0294n) · CONFIRMED (minor GAP)
`kem_profile`, `aead_suite`, `dem_mode` are folded into the 36-byte AEAD context that IS the AAD, and
`requireAesGcm` throws on any suite ≠ AES-256-GCM. A ciphertext cannot be opened under a different (weaker)
suite — the tag fails and the code refuses (CWE-757 downgrade prevented). *Minor GAP:* the **format version**
itself is not in the AAD (only the suite selectors) — fold it in (RD-0294n).

### F10 — AAD file-binding (0294o) · GAP
The AAD binds section-local identity (`section_id`, `coord`, `modality`), the suite, `commit_mode`, and `epoch`
— but **not an explicit whole-file identifier**. Cross-file section splicing (moving a section between two files
for the same recipient) is resisted only by (a) the caller-supplied opaque 128-bit `coord` being unique per
section — a **spec §5 / caller obligation not enforced in `kemdem.ts`** — and (b) the container TMX-256 root +
signature. For **unsigned-v0** the root is recomputable, so it leans on `coord` uniqueness alone. **GAP:** confirm
`coord` is guaranteed globally-unique (spec §5) and/or fold an explicit file identity into the AAD (RD-0294o).
Zero-trust framing: splice-resistance is **not provable from `kemdem.ts` alone**.

### F11 — key-commitment (CMT-4) · CONFIRMED
AES-GCM is **not** key-committing (the partitioning-oracle / one-ciphertext-two-keys weakness). This layer adds
`key_commit = SHAKE256(…‖K_aead)` folded into the AAD and a §8.5 **Chan–Rogaway CTX committing tag** recomputed
and **constant-time compared before the AEAD runs**. That closes the non-committing-AEAD footgun (the CMT-4 §2
win). Plus `timingSafeEqual` throughout, best-effort key zeroization in `finally`, CSPRNG (`randomBytes`) nonces,
and **verify-before-decrypt** (open() only after the container + signature gate proves integrity/authenticity/
ALLOW) — fail-closed. *Not verified in P4:* size-bucket padding + constant section table, and the rollback
**freshness anchor** (`epoch` is AAD-bound, but proving it is the *latest* epoch needs the external anchor —
RD-0294p residual).

## Not yet run (scoped — priorities 3, 5)

Recorded so coverage is honest — these are **not** audited here:

- **P3 · `.hypha` by-construction (0294a/b/i/k/l):** second-order SQLi, depth/complexity DoS, SSRF-from-query
  (`egress_free_operators`), deserialization, XXE. **Blocked from code-verification in Galerina:** the `.hypha`
  runtime (TritMeshQL) is **not in this tree** — `galerina-data-query` ships only a `.graph/boundary-policy.json`
  stub, and the engine/operator vocabulary lives in a sibling (TritMesh) repo. In-repo evidence is the
  `docs/examples/hypha/*.hypha` corpus (e.g. `06-injection-is-inert` — an injection payload stays an inert value
  leaf, no string→query construction to escape), which is **suggestive, not code-proof**. Per zero-trust these
  stay **PLAUSIBLE** until the engine is audited where it lives.
- **P5 · API/authz (0294e/f), MCP tool-poisoning (0294x/y/z), supply-chain (0294r-w):** BOLA/BOPLA on
  `galerina-framework-api-server` / `galerina-web-router`, JWT alg-confusion on `galerina-auth`, MCP manifest
  binding (DP-RD-0285b), SLSA/in-toto provenance on the `.lmanifest` pipeline.

## Honest frame

The CONFIRMED rows (F1, F2-integrity, F3, **F8, F9, F11**) are defensible as *"this attack class is
unrepresentable at runtime,"* bounded by the open residuals: **F2** (.spore authenticity/signing deferred →
integrity, not origin), **F4** (Ed25519-only default, PQ opt-in), **F5** (CI drift-coverage gated on a pending
KB token), **F10** (AAD binds section-, not file-identity — confirm `coord` uniqueness / RD-0294o), the P4
size-padding + rollback-freshness residuals, and the unaudited **P5** cluster. **P3 (`.hypha`) is
engine-external** — PLAUSIBLE, not code-verified in this tree. Nothing here supports an "unhackable" claim;
each CONFIRMED is a class boundary, not a guarantee. CONFIRMED-by-construction rows are candidate defensive-publication material, held until a
0285j-class measurement backs any performance claim (papers README rule).
