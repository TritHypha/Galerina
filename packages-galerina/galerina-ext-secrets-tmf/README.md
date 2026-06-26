# @galerina/ext-secrets-tmf

OPTIONAL, SEPARATE (`private:true`, `ext` tier, not auto-loaded) sealed-secrets layer for Galerina.

`env.tmf` is an **encrypted-at-rest replacement for a plaintext `.env`**, edited through a governed
**in-memory-only** CLI. It is a THIN orchestration layer over the shipped `@galerina/ext-tmf`
(format/crypto) and the `@galerina/ext-secrets-vault` store **discipline**. It adds **NO new crypto**
and **NO new container bytes**; crypto stays Binary (SPORE-SUBSTRATE-001).

This is the SOPS / Bitnami-Sealed-Secrets / age pattern applied to the `.tmf` container, with one
genuine hardening: **the decrypt-strictly-in-memory editor that structurally avoids the documented
`sops edit` temp-file leak** (getsops #624/#1044). It is **not new cryptography or science** —
paper verdict is defensive-pub (or none).

## What it gives you over a plaintext `.env`

- **Ciphertext at rest** — an LFI / path-traversal / accidental-commit / backup-leak that reads
  `env.tmf` gets KEM-DEM (hybrid X25519+ML-KEM-768 → AES-256-GCM) ciphertext, not credentials.
- **Authenticated integrity / tamper-evidence** — the `.tmf` TMX-256 root is recomputed over the
  ciphertext leaves and fail-closes on any tamper (a `.env` has zero integrity).
- **Names off the table** — each secret's `coord` is `SHAKE256("env-tmf-coord-v0" ‖ name)[:16]`, so
  the cleartext **name never appears** in the section table. Names + metadata live ONLY inside a
  sealed manifest section.
- **Governed in-memory editor** — `set`/`rm`/`shell` decrypt strictly into a `SealTaint` arena,
  zero-wipe on every replace/save/quit/error, and **never write plaintext to a temp file**, never
  spawn `$EDITOR`, never open a FIFO, never leave a `.swp`.

## HARD security posture (enforced in code, not just docs)

| Property | Where |
|---|---|
| decrypt only into wiped Buffers / a SealTaint arena | `arena.ts` (`SealArena`, `withWiped`) — mirrors `ext-secrets-vault` rotation-manager:45-49/:95 |
| zero-wipe on replace / save / quit / error | `arena.ts`, `store.ts` (`finally` wipes), `cli.ts` |
| `mlock` pages vs swap where the platform allows (best-effort hook) | `mlock.ts` |
| NEVER plaintext to a temp file (SOPS #624 class) | `io.ts` `atomicWriteCiphertext` writes **ciphertext only** |
| NEVER a secret value in argv | `cli.ts` `rejectValueInArgv` + value from STDIN / no-echo prompt; `lint-no-secret-egress` flags ANY `process.argv` read outside the single sanctioned `slice(2)` entry point (structural, not keyword-based) |
| `get` REFUSES on a TTY without `--force` | `cli.ts` `get` branch |
| `get` writes via **synchronous** `writeSync(1, …)` | `cli.ts` `get` — no plaintext copy retained in Node's async stream queue past the arena wipe |
| `keygen` NEVER builds a hex string of the secret key; REFUSES the secret on a TTY without `--force` | `cli.ts` `keygen` — raw bytes via `writeSync(2, …)` through a wiped Buffer; mirrors the `get` TTY guard (secret-zero must not hit scrollback) |
| KEM-profile substitution fail-closed | `store.ts`/`runtime.ts` `assertKemProfile` — the attacker-mutable packed profile byte must equal BOTH the v0 hybrid profile AND the profile bound at `ctx[26]` before `open()` |
| `get` is local-only — NO network read-back sink | enforced by `scripts/lint-no-secret-egress.mjs` |
| verify-before-decrypt → K3 ALLOW(+1) → NoCryptoLib reject | `store.ts` `composeRead` |
| decrypt fault / bad key = FAIL CLOSED, never serve stale | `store.ts`, `runtime.ts` (`loadAll` disposes on fault) |

## CLI

```
galerina-secrets-tmf <cmd> [--file ./env.tmf]
  keygen                              # print a fresh recipient keypair (anchor SEC externally!)
  init --pub HEX                      # create an empty encrypted env.tmf
  set NAME --pub HEX                  # value from STDIN or no-echo prompt — NEVER argv
  get NAME [--force]                  # in-arena -> stdout for piping; REFUSE on a TTY without --force
  list                               # manifest only -> names + metadata, NEVER values
  rm NAME --pub HEX
  rotate-recipient --new-pub HEX      # re-key every section (SOPS-style per-file rekey)
  shell --pub HEX                     # in-arena REPL — NO $EDITOR / NO FIFO / NO /tmp / NO .swp
```

Set a value (note: the value is **piped**, never an argument):

```sh
printf %s "$DB_PASSWORD" | galerina-secrets-tmf set DB_PASSWORD --pub "$PUB"
```

Get a value for a process (local-only, piped — refuses to echo to a TTY):

```sh
galerina-secrets-tmf get DB_PASSWORD | my-app --stdin-secret
```

The recipient secret key is supplied to the CLI as a **passphrase-wrapped** blob via the
`GALERINA_ENVTMF_WRAP` env var (a *pointer* to anchored material, hex of `salt|iv|ct`), unlocked by a
**no-echo passphrase prompt**. The plaintext key lives ONLY in an arena buffer.

## Schema (v0, unsigned-but-encrypted)

- Container = the shipped v0 `.tmf` (`writeTmf`/`readTmf` as-is). `flags.signed = 0`.
- One secret = one `TmfSection`: `modality = 9` (Structured), `coord = SHAKE(name)[:16]`,
  `payload = seal(0x02, recipientPub, valueBytes, aeadContext)` with `commit_mode = CTX` (CMT-4,
  key-committing). The 36-byte AEAD context binds `section_id + coord + modality + conf_flags`.
- One reserved **manifest** section (fixed-sentinel coord) holds the sealed `{ name → coord }`
  directory + per-secret metadata (`created`/`rotated`/`category`/`environment`/`kem_profile`).

**Signed root is DEFERRED.** ML-DSA-65 over the TMX root is `@galerina/ext-tmf` slice 4 / #7
(unbuilt); `readTmf` rejects any signed file today. v0 `env.tmf` ships **unsigned-but-encrypted**
and **never fakes a signature**. The bench (P7) confirms a signed-flag file is rejected.

**Epoch binding (v0):** the AEAD context binds `epoch = 0` deterministically (section identity is
already pinned by `section_id + coord`); the human-facing `created`/`rotated` timestamps live in the
sealed manifest. This keeps the v0 schema free of a new container field.

## Key anchor — env.tmf RELOCATES secret-zero, it does NOT remove it

This is the most important honesty note. `open()` takes `recipientSec` as a **caller-supplied**
key (`kemdem.ts:190`); the engine has zero custody logic. KEM-DEM moves the bootstrap secret to this
**one** recipient KEM secret key.

> `env.tmf` moves secret-zero from **N app secrets → 1 anchored key** and reduces blast radius. It
> does **NOT** eliminate the external root of trust. **If the recipient secret key co-locates on the
> same disk as the `env.tmf`, the at-rest win EVAPORATES** — the same LFI/traversal reads both. The
> anchor **MUST** be external. This is unavoidable by design; the package cannot solve secret-zero.

- **Local dev:** operator passphrase → Argon2id (`anchor.ts`, `wrapRecipientSecret`/
  `unwrapRecipientSecret`) → unwrap the recipient secret key **in the arena only**.
- **Prod:** anchor through the EXISTING core-config `SecretConfigSource` kinds —
  `{kind:"kms",...}` / `{kind:"vault",...}` (`galerina-core-config/src/index.ts:1144-1145`) via a
  host-injected fetcher (`anchor.ts`, `anchorProdSecret`). TPM / instance-identity also valid. We do
  NOT invent a new custody mechanism, and this package ships **no KMS/Vault transport**.

## Production runtime path

`runtime.ts` `loadAll(buf, recipientSec, K3.ALLOW)`:
1. fetch the recipient KEM secret from the external anchor (`anchor.ts`),
2. encrypted-container compose-reader (`store.composeRead`): `readTmf` recomputes TMX over the
   ciphertext leaves fail-closed → K3 ALLOW(+1) gate → NoCryptoLib reject → per-section `open()`,
3. decrypt into the `SealArena` (zero-wiped, source-agnostic store),
4. **decrypt fault → FAIL CLOSED**: the arena is disposed (wiped) and nothing is served.

## Local-edit vs production read-back

- **Local-edit (legitimate):** a local operator decrypts THEIR OWN file in the arena, edits,
  re-seals (`set`/`rm`/`shell`). This is the canonical safe SOPS workflow.
- **Production read-back (regression — NOT a feature):** streaming a decrypted secret out of a
  running node to a remote operator. **Impossible by construction here:** `get` is local-only,
  there is NO network read-back endpoint, and `scripts/lint-no-secret-egress.mjs` FAILS CI on any
  net sink / plaintext-to-disk / secret-in-argv on the decrypt path.

## Runtime exposure caveat (no overclaiming)

Once decrypted for the app to use, the secret is plaintext in process memory. `mlock` + zero-wipe
shrink the window; they do not eliminate memory-scraping / core-dump exposure. `mlock` is a
best-effort hook (`mlock.ts`) — the confidentiality guarantee does NOT depend on it.

**Secret VALUES** are held only in zero-wiped / `mlock`'d arena Buffers and wiped on every
replace/remove/quit/error path. The zero-wipe guarantee covers values. Two narrower residuals,
documented honestly (audited, accepted — not value leaks):

- **Secret NAMES transiently exist as un-wipeable JS strings.** Every read decrypts the manifest
  and `JSON.parse(TextDecoder().decode(bytes))`, which materialises an immutable JS string of the
  manifest JSON (names + metadata, **never values**) plus parsed object keys. JS strings cannot be
  zero-wiped; they linger in the GC heap until collected. The schema deliberately keeps names out of
  the cleartext section table (only opaque SHAKE coords appear there), so names are far less
  sensitive than values — but if your threat model treats names as secret, note that a name briefly
  exists as an un-wipeable heap string during every `list`/`get`/edit. Values are NOT affected.
- The unwrapped recipient key and decrypted value bytes pass through Node-internal cipher Buffers
  (`createDecipheriv.update`/`final`, `Buffer.concat`); `anchor.ts`/`store.ts` now explicitly
  `fill(0)` each intermediate they can reach, but Node may still allocate transient copies the JS
  layer cannot address (a platform limitation of `node:crypto`, not a logic gap).

## Build / test / bench

```sh
npm run build           # vendored tsc -> dist/
npm test                # build + node --test tests/*.test.mjs
npm run lint:secrets    # the no-egress CI gate
node ../../tri-encription/bench/rd-0104-env-tmf-secrets-security.mjs   # the load-bearing security bench
```

`@galerina/ext-tmf` is resolved during in-staging build via a `paths` alias (tsconfig) and a local
`node_modules/@galerina/ext-tmf` junction to the shipped package. Once the hub absorbs this package
into `packages-galerina/`, the workspace resolves it natively.
