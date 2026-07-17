# Galerina #72 — signed central registry index: operator walkthrough

**What this is:** the operator procedure for producing a **validly-signed central registry index**
(`galerina-registry-index/v1`) — the tamper-evident catalog that sits *before* the package resolver and
defeats a validly-self-signed-but-forked package. Companion to the
[#34 offline key-ceremony runbook](./galerina-34-offline-key-ceremony-runbook.md), which covers **manifest**
signing and key custody; this document covers only the **index**, which that runbook does not.

**Who runs it:** the **owner / trust-root custodian**, not an automated agent. Whoever holds the private key
is the registry authority: they can assert any package as certified. An agent must never hold, read, or use
the private key — it prepares the unsigned artifact and the tooling; the custodian performs the signing act.

---

## 0. Read this first — #72 is NOT unblocked by the key alone

The key arriving removes **one** of **four** blockers. Honest status:

| Piece | State |
|---|---|
| Index **library** (`registry-index.ts`) — build / canonical-input / sign / verify / lookup | ✅ **built + tested** |
| Index **signer CLI** — gather entries → build → sign → write | ❌ **does not exist — must be built** |
| Registry **entries** (`galerina-registry/packages/*/package.galerina.yaml`) | ⚠️ **placeholders** — 2 packages, each `hash: "sha256:pending"`, `governance.reviewed: false` |
| **Private key** custody | ✅ **owner holds it** |

**§4 is runnable today** (push, custody hardening, anchor pinning, wipe). **§4b — the signing act — is not, and
deliberately has no command:** the signer doesn't exist, and the entries pin nothing. See §4b for the evidence.

`signRegistryIndex(index, keyId, sign)` takes an **injected** `sign` callback — the module is deliberately
crypto-agnostic (no `node:*`). Nothing today supplies a real Ed25519 signer or gathers the entries. **So
there is no command to run yet.** Steps 3–4 below are the procedure *once the signer lands*; §2 is the
decision set that must be settled first, because two of those decisions change what gets signed.

---

## 1. Two things to decide BEFORE any signing act

### 1.1 ⚠️ The index signature is Ed25519-only — manifests are hybrid. Reconcile first.

`RegistryIndexSignature.algorithm` is the literal `"Ed25519"`. Manifest signing, by contrast, is **hybrid
Ed25519 + ML-DSA-65** with an explicit **no-silent-downgrade hard deny**
(`FUNGI-MANIFEST-PQ-REQUIRED` — a `certified`/`v2` manifest missing its ML-DSA public key is refused).

That is an asymmetry pointing the wrong way. The **central index is the more critical artifact**: a
per-package manifest signature only asserts "this package is what its publisher says"; the index asserts
"**this package is admissible at all**". It is the allow-list. Signing a **post-quantum-weak central index**
under a hybrid root, while the *less* critical manifests get PQ protection, is an inconsistent posture.

**Decide:** (a) accept Ed25519-only for the index v1 with a recorded, time-boxed rationale, **or** (b) extend
the index signature to hybrid (a `v2` schema + a verifier change) **before** the first signing act. Signing
under (a) and migrating later means re-signing and re-pinning — cheap now, expensive once artifacts depend
on the index. **Recommendation: settle this before minting the first signed index.**

### 1.2 Which key is the "registry authority"?

`RegistryIndexSignature.keyId` is documented as **the registry authority keyId — *not* a package keyId**.
The trust root and the registry authority are conceptually different roles:

- **Use the root** — simplest; but every index signing act touches the trust root, and the root is meant to
  be air-gapped and rarely used.
- **Mint a separate operational registry-authority key**, signed/anchored by the root — the root stays cold;
  a compromise of the operational key is revocable without re-pinning the root. This is the same "split an
  operational signing key" option already noted as an open owner item.

**Recommendation: the split.** The whole point of a trust root is that it is used almost never.

---

## 2. Key handling — invariants for this procedure

These are non-negotiable and match the #34 runbook's §4:

- **Keep the private key OUTSIDE every repo working tree.** It currently sits outside any git repo — that
  is the correct place; **do not move it into the repo**, not even as a gitignored file. A gitignore is a
  backstop, not a control; the control is that the bytes are never inside a tree that can be committed.
- **Never commit** the key or any `*_PRIVATE_KEY_B64` value. Only the **public** halves
  (`governance/signing-key-<id>.pub.pem`, `.mldsa.pub.b64`) are committed — they already are.
- **Inject via environment, from wherever you hold it** — do not copy it next to the code to make a command
  shorter.
- **Restrict the ACL** to your user, and prefer an encrypted/offline volume:
  `icacls <your-key-file> /inheritance:r /grant:r "$($env:USERNAME):F"`
- **Wipe working copies afterwards** (`cipher /w:` on the containing volume). Note there are already
  known plaintext root copies pending secure wipe — this one joins that list until wiped.
- **An agent never reads this file.** If a walkthrough ever asks an assistant to `cat`, `source`, or echo it,
  that walkthrough is wrong.

---

## 3. What must be built first (engineering, not custody)

The signer CLI is the missing unit. It must:

1. **Gather entries** — read `galerina-registry/packages/*/package.galerina.yaml` into `RegistryEntry[]`
   (`name`, `version`, `sourceHash` `"sha256:<hex>"` — the **pinned** expected package hash, `publisher`,
   `keyId` (the *manifest*-signing keyId expected for that package), `certificationLevel`, `riskRating`,
   `capabilities`, `effects`). **The `sourceHash` must be computed from the real package bytes**, not copied
   from the stub — a pinned hash that doesn't pin anything is the whole failure mode this index exists to stop.
2. **Build** — `buildRegistryIndex({ registry, issuedAt, entries })`. `issuedAt` is **caller-supplied** and
   must be **strictly newer** than the last accepted index (`verifyRegistryIndex(..., minIssuedAt)` treats
   older-or-equal as `ERR_REGISTRY_INDEX_STALE` — rollback/replay defense). Deterministic: no `Date.now()`
   inside the library.
3. **Sign** — `signRegistryIndex(index, keyId, sign)` where `sign` is a real Ed25519 detached signer over
   the UTF-8 bytes of `registryIndexSigningInput(index)` (the index **without** its `signature`, RFC 8785
   JCS), returning base64. The signer reads the private half from the environment; **it must never log,
   echo, or persist the key**.
4. **Verify before writing** — round-trip the freshly-signed index through `verifyRegistryIndex` with the
   committed **public** key. Refuse to emit an index that doesn't verify.
5. **Fail closed** — no `--force`, no "sign anyway", no placeholder signature path.

**Acceptance for the tool:** a signed index verifies; a tampered entry fails `ERR_REGISTRY_INDEX_BAD_SIGNATURE`;
an unknown authority keyId fails `ERR_REGISTRY_INDEX_NO_KEY` (fail-closed for the central index — unlike a
package manifest, an unverifiable central index is worthless); an older `issuedAt` fails
`ERR_REGISTRY_INDEX_STALE`; a `canon` other than `jcs` fails `ERR_REGISTRY_INDEX_MALFORMED`. Those are
existing, tested codes — the tool must not invent new ones.

---

## 4. Step-by-step — what you CAN run today

These are runnable now, in order. PowerShell, from the repo root unless stated. Nothing here touches the
private key's contents.

### 4.1 Green the origin (do this first — it is currently red)

`origin/main` is behind local and its HEAD fails the Phase-47 routingPolicy test; the fix is already
committed locally. Pushing the stack greens it.

```powershell
cd <galerina-repo>
git log --oneline origin/main..HEAD          # review exactly what you are about to publish
node scripts/run-all-tests.cjs               # expect: 93/93 packages passed
git push origin main
git log --oneline -1 origin/main             # confirm origin moved
```

### 4.2 Harden the key's custody (no key contents are read)

Confirm it is outside every working tree, lock the ACL to you, and confirm a custody copy exists **before**
destroying anything.

```powershell
# Confirm the key's folder is NOT a git repo (this must FAIL with "not a git repository"):
cd <folder-containing-your-key>
git rev-parse --show-toplevel

# Confirm no repo tracks a private key (expect: only .pub.pem / .mldsa.pub.b64 public halves):
cd <galerina-repo>
git ls-files "*21415420b447e219*"

# Restrict the NTFS ACL to your user (do this on the working copy AND the custody copy):
icacls <your-key-file> /inheritance:r /grant:r "$($env:USERNAME):F"
```

### 4.3 Verify the public anchor is committed (verifiers pin these, not the private half)

```powershell
cd <galerina-repo>
git ls-files governance/ | Select-String "21415420b447e219"
Get-FileHash governance/signing-key-21415420b447e219.pub.pem -Algorithm SHA256
Get-FileHash governance/signing-key-21415420b447e219.mldsa.pub.b64 -Algorithm SHA256
```

Record both SHA-256 pins alongside the key id, so verifiers pin the **bytes**, not just an id.

### 4.4 Wipe surplus plaintext copies (COPY-FIRST, DESTROY-SECOND)

Only after you have **verified a readable custody copy** (hardware token / encrypted offline media / secrets
manager). A destroy without a verified copy **loses the trust root permanently** — you would have to mint a
new `<id>` and re-pin every verifier.

```powershell
Remove-Item <surplus-plaintext-copy>
cipher /w:<containing-folder>        # overwrite the freed space on that volume
```

---

## 4b. The signing act — NOT RUNNABLE YET (and why)

There is deliberately no command here. Two hard blockers, both verified in the tree today:

**(a) The signer does not exist.** `signRegistryIndex(index, keyId, sign)` takes an **injected** `sign`
callback — `registry-index.ts` is crypto-agnostic by design (no `node:*`). Nothing gathers entries or supplies
an Ed25519 signer. §3 is that tool; it is engineering work, not a custody act.

**(b) THE PACKAGES DO NOT EXIST.** *(Corrected 2026-07-17 — this section previously said "the data is
placeholders", which was too kind and sent the reader looking for a data-entry fix. The truth is
structural.)*

`packages-galerina/galerina-registry/` contains, in its entirety: `LICENSE`, `package.json`,
`package-lock.json`, `README.md`, `.graph/`, and **two YAML files**. There is no `src/`, no `dist/`, no
code. There is no `@galerina/auth`. Each manifest reads:

```yaml
hash: "sha256:pending"                    # NOT awaiting `galerina package hash` — there are no bytes to hash
signature: null
governance:
  reviewed: false
  notes: "Phase 28 scaffold. Pending governance review."
```

And the registry's own README says so plainly — it was accurate the whole time:

> **⚠️ Scaffold (Phase 28).** The package manifests here are **declarative stubs pending full resolver
> wiring**… The guarantees described below are the **intended design** — they are **NOT yet actively
> enforced or signed**, so do not treat them as live controls.

So **#72 was never blocked on a signer or on a governance review. It is blocked on the registry being
empty.** "Governance-review the two packages" is not a decision anyone can make: you cannot review code
that does not exist, and the README's own "Adding a Package" flow puts review at step 4, *after* a real
content hash at step 3. The index's entire purpose is that `sourceHash` **pins the expected package
bytes**; here there are no bytes.

**What you would actually be certifying.** Both stubs carry claims that signing would make authoritative:

- **`@galerina/auth`** declares `network.outbound` as an **effect** but *not* as a capability
  (`capabilities: [secret.read, audit.write]` vs `effects: [secret.read, audit.write, network.outbound]`).
  For a package that reads secrets, `network.outbound` is the exfiltration path — and it is the one with
  no matching capability.
- **`@galerina/healthcare`** claims `complianceFramework: "HIPAA"` and "HIPAA-aligned PHI handling", while
  declaring `database.read`/`database.write` and **not** `phi.read`/`phi.write` — which are real canonical
  effects. The package whose stated purpose is PHI handling would not trip PHI governance at all. Signing
  this index makes the **trust root assert HIPAA alignment for a package with zero code**. That is the
  single most dangerous artifact in this task, and it is four lines of YAML.

**Therefore #72 as written is not achievable and should be re-scoped or parked**: a certified registry
with no packages is not a thing. Either real packages get published first (then hash → review → sign), or
#72 closes as premature. Signing an index over two stubs would convert "unverified" into "certified by the
registry authority" — strictly worse than having no index, because the resolver would then trust it.

Once §1 is decided, §3 is built, and the entries are real, the sequence will be: load the key into the session
env only (never copy it into the tree) → confirm `$env:GALERINA_SIGNING_KEY_ID` (id only, never print key
material) → build+sign+self-verify → verify independently against the committed public key → drop the env vars
→ commit only the signed index and record its `issuedAt`, authority keyId, and a SHA-256 pin.

---

## 5. Remaining blockers after the key (be honest about these)

1. **Signer CLI** — §3, not built. Engineering task.
2. **Entries are Phase-28 stubs** "pending governance review". Signing a stub catalog produces a *validly
   signed but semantically false* index — strictly worse than no index, because it converts "unverified" into
   "authoritatively asserted". **Do not sign until the entries are real and reviewed.**
3. **§1.1 Ed25519-vs-hybrid** — decide before the first act, or accept a re-sign later.
4. **§1.2 authority-key split** — decide before the first act; it determines the `keyId` that gets pinned.

*Written 2026-07-17. Companion to the #34 ceremony runbook (manifest signing + custody). No key material and
no local paths appear in this document by design.*
