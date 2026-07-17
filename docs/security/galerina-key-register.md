# Galerina signing-key register — every key, what it is, what depends on it

**Why this exists.** On 2026-07-17 a routine custody question ("do I need to back up any other key?")
could not be answered without an hour of forensics: reading file sizes, grepping git history, and
inferring a key's algorithm from the length of its `.env`. Two keys surfaced that appeared in **no
document anywhere**. A conclusion was reached and retracted **twice**. None of that was a code problem —
every fact was already true and discoverable. It was an **inventory problem**: the facts existed, but
nowhere together.

This page is the register. **It is a curated VIEW; the enforcing code and the ledger are the source of
truth.** Where this page and `governance/revocations.json` / `governance/trust-anchor.json` disagree,
they win and this page is the bug.

**No key material appears here — public halves, ids, sizes and dispositions only.** An agent must never
open a `*.env` or any `*_PRIVATE_KEY_B64`.

---

## 1. The register (verified 2026-07-17)

| key id | algorithm | private half | public half in `governance/` | role |
|---|---|---|---|---|
| `21415420b447e219` | **hybrid** Ed25519 + ML-DSA-65 | owner, offline archive (hash-verified) | ✅ `.pub.pem` + `.mldsa.pub.b64` | **trust-anchor root** |
| `ab46f4c7e2797b9b` | Ed25519 | **LOST** | ✅ | superseded root (the loss that forced RD-0368) |
| `8eecf4187ebc9341` | Ed25519 | leaked | ✅ | **REVOKED** — private key committed to git at `cb5036d` |
| `cd01346961d88e94` | Ed25519 | **committed to KB git** (`7ec0af0`, deliberate escrow) | ✅ | escrowed dev key |
| `f89c9478a0c3c8ae` | Ed25519 | none on disk | ✅ | spent generation |
| `6b4c9e43afc89c02` | Ed25519 | none on disk | ✅ | **purpose unrecorded** |
| `942d6b2726b0a991` | **Ed25519-only (legacy, pre-hybrid)** | `.env.galerina-signing` (working tree, gitignored) | ❌ **none** | dev manifest signer used by `galerina.mjs` |

### Reading the private-half column without opening anything

The `.env` **size** tells you the algorithm, and this is how the 2026-07-17 confusion was finally
resolved:

- **~460 bytes ⇒ Ed25519-only.** An Ed25519 private PEM base64s to ~160 bytes; plus headers ≈ 460.
- **~5,944 bytes ⇒ hybrid.** An ML-DSA-65 private half is 4,032 bytes → ~5,376 base64; +460 ≈ 5,944.

So a 460-byte `.env.galerina-signing` **cannot** be the hybrid root, however it is labelled. A prior
memory note asserted it *was* the root; only this arithmetic caught it.

---

## 2. The two keys that ambush every session

**`942d6b2726b0a991` — the legacy dev signer.** It sits in `.env.galerina-signing`, the file the #34
runbook tells you to `source`. `galerina.mjs` consumes it, so **every build signs with it**. It has **no
public half**, so nothing can verify its signatures against a trusted anchor. It is **Ed25519-only**,
which means it **cannot sign a certified manifest at all** — `GALERINA_MANIFEST_PROFILE=certified`
mandates the hybrid and hard-denies a missing ML-DSA half (`FUNGI-MANIFEST-PQ-REQUIRED`).

It exists because a rotation left it: the system still needed *a* key at that path. **It is not an
orphan** — it signs `build/r6-01…r6-05.lmanifest`, the Stage-A ≡ Stage-B parity fixtures consumed by
`tests/r6-corpus/r6-parity.test.mjs`. Whether that test **verifies** those signatures (key is
load-bearing → back it up) or merely **reads** the manifests (key is fungible → regenerate freely) is
**UNRESOLVED at time of writing and must be settled before anyone retires or wipes it.**

**`6b4c9e43afc89c02` — purpose unrecorded.** Zero source references, 34 references in `build/`. Nobody
has written down what it was for.

---

## 3. ⚠️ `key-inventory.mjs` gives two opposite answers — trust neither blindly

`governance/key-inventory.mjs` is a good tool: it never reads private material and its disposition rule
is fail-closed. But its **liveness rule counts any textual reference**, and that breaks in both
directions:

| key | default scan | `--thorough` |
|---|---|---|
| `6b4c9e43afc89c02` | 0 refs → **RETIRE** | 34 refs → **KEEP** |
| `942d6b2726b0a991` | 0 refs → **RETIRE** | 11 refs → **KEEP** |
| `f89c9478a0c3c8ae` | 0 refs → **RETIRE** | 1 ref → **KEEP** |

- **Default** excludes `build/`, so it would retire a key the build still uses. Its own banner says *"run
  `--thorough` before archiving"* — which makes the default output **meaningless for archiving decisions**.
- **`--thorough`** counts **gitignored, regenerable** artifacts as proof of life, so it returns *"No retire
  candidates"* — meaning **the house-cleaning tool can never recommend cleaning anything.**

**Neither run distinguishes the only thing that matters:** *"a live gate depends on this signature"* vs
*"a throwaway artifact mentions this id."* Until it does, **do not act on either output alone.**

**The fix (open):** classify each reference by kind — tracked source / ledger role / **gitignored
regenerable output** — and count only the first two toward liveness. Then `--thorough` becomes safe to
act on and the default stops lying.

---

## 4. Rules that hold regardless

1. **Only public halves are ever committed.** `governance/signing-key-<id>.pub.pem` and
   `.mldsa.pub.b64`. A private half in git is the `8eecf4187ebc9341` incident — it cannot be un-published
   by deleting a file, only revoked.
2. **The private half lives outside every working tree.** Not gitignored-inside — *outside*. A gitignore
   is a backstop, not a control. Verify with `git rev-parse --show-toplevel` in the key's folder: it must
   **fail**.
3. **Copy-first, destroy-second.** Verify a custody copy by **SHA-256 comparison** — it proves
   byte-identity without either party reading the secret. `ab46f4c7e2797b9b` is what "destroy first" costs.
4. **Retiring a public half is `git mv` to `governance/retired/` + a supersession entry in the
   append-only ledger.** Never `rm` — a revoked key's public half must stay verifiable forever.
5. **An agent never opens a private key file.** Metadata only: name, size, ACL, hash.
6. **`cipher /w:` does not guarantee erasure on an SSD.** Wear-levelling and over-provisioning mean the
   controller may never overwrite the physical cells. Full-disk encryption is what actually protects
   residual blocks; confirm with `manage-bde -status C:` (needs elevation).

---

## 5. Open items

- [ ] **Settle `942d6b2726b0a991`** — does `r6-parity.test.mjs` verify its signatures or just read the
      manifests? Decides fungible-vs-load-bearing. **Nothing should be retired or wiped until this is
      answered.**
- [ ] **Record the anchor pins.** Both recompute and match, but are recorded nowhere:
      `signing-key-21415420b447e219.pub.pem` → `8A39AD34…6627A`;
      `.mldsa.pub.b64` → `02B05DCC…7B56`. Verifiers should pin **bytes**, not just an id.
- [ ] **Declare the operational key.** `key-inventory.mjs` reports `active=(not supplied)` and defaults
      `signer=` to the **cold root**. RD-0368's split plan says the registry authority must be a *new
      operational key, never the cold root*. Owner decision.
- [ ] **Fix the `key-inventory.mjs` liveness rule** (§3) and add a `--self-test`.
- [ ] **`6b4c9e43afc89c02`** — establish and record its purpose.
- [ ] **Identify the signer of the one tracked `.lmanifest`** (`examples/fuse-demo/my-custom-api-rest/`).
      It is CBOR, so a text scan cannot see it.
- [ ] **Secure-wipe the surplus plaintext copies** — gated on the two items above, and on §4 rule 6.

*Written 2026-07-17. Contact hello@trithypha.dev. No key material and no local paths appear here by
design.*
