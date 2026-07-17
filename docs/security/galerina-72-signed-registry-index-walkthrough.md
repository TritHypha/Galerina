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
| Registry **entries** (`galerina-registry/packages/*/package.galerina.yaml`) | ⚠️ **Phase-28 scaffold**, "declarative stubs pending full resolver wiring" / "pending governance review" |
| **Private key** custody | ✅ **owner holds it** |

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

## 4. The signing act (once §1 is decided and §3 is built)

On your signing host, with the private key present **only** in the environment:

```powershell
# 1. Load the key into this session ONLY — from wherever you custody it, not from the repo.
#    (Parse your key .env into env vars; do not copy the file into the tree.)
Get-Content <your-key-file> | Where-Object { $_ -match '^\s*GALERINA_' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  Set-Item -Path ("Env:" + $k.Trim()) -Value $v.Trim()
}

# 2. Confirm the key id you are about to sign under (id only — never print key material).
$env:GALERINA_SIGNING_KEY_ID

# 3. Build + sign + self-verify (the tool from §3).
node scripts/<signer>.mjs --registry <registry-identity> --issued-at <iso8601> --out <index-path>

# 4. Verify the emitted index INDEPENDENTLY against the committed public key.
node scripts/<verifier>.mjs --index <index-path>

# 5. Drop the key from this session.
Remove-Item Env:GALERINA_SIGNING_* -ErrorAction SilentlyContinue
```

Then commit **only** the signed index (never the key), and record the **index `issuedAt` + the authority
keyId + a SHA-256 pin of the emitted index** so verifiers pin bytes, not just an id.

**Close the session properly:** wipe any working copy of the key, confirm `git status` shows no key file, and
confirm the ACL/custody copy is intact **before** destroying anything — the #34 runbook's copy-first,
destroy-second ordering applies here too. A destroy without a verified copy loses the trust root.

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
