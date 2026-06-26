# Key Lifecycle — Zero-Touch Signing & the `SPORE-KEY-*` Diagnostics

> **Status:** shipped 2026-06-17 (`governance/key-lifecycle.mjs`). Implements the principle
> *"a developer building an app with Galerina never has to think about keys — it's automatic;
> a warning appears only when something is wrong (e.g. a key goes stale)."* See
> [[feedback-keys-rotate-automatically]] and [[galerina-key-custody-and-rotation]].

## The model

| Situation | What Galerina does | Developer action |
|---|---|---|
| No key yet (dev) | **Auto-provisions** a dev signing key on first build/run — silent except a one-time notice | none |
| No key yet (production) | **Fails closed** — refuses to invent a production key | provision via KMS/HSM |
| Key healthy | **Silent** — signs normally | none |
| Key stale (age > 90d) | **Warns** (`SPORE-KEY-002`) — does not block | rotate (one command) |
| Key revoked | **Fails closed** (`SPORE-KEY-004`) | mint a fresh key |
| Registry tampered | **Fails closed** (`SPORE-KEY-010`) | restore + re-sign |
| Weak key-file perms (POSIX) | **Warns** (`SPORE-KEY-005`) | `chmod 600` |

Normal operation is **silent**. The toolchain only speaks up when there is something to act on.

## Diagnostic codes

| Code | Severity | Meaning | What to do |
|---|---|---|---|
| **SPORE-KEY-001** | notice (dev) / **error** (prod) | No signing key found | Dev: nothing — one is auto-provisioned. Prod: provision the key in your KMS/HSM and set `GALERINA_SIGNING_KEY_ID` (private key via the keystore, never on disk/CLI — #149). |
| **SPORE-KEY-002** | warning | Signing key is **stale** (older than the rotation age, default 90d) | Rotate: `galerina keygen` → add the OLD key id to `governance/revocations.json` → `node governance/sign-revocations.mjs`. (Auto-rotation = #149.) |
| **SPORE-KEY-004** | error (fail-closed) | Signing key is **revoked** | Mint a fresh key (`galerina keygen` / next build auto-provisions). The revoked key must never sign again; see `security/revocations/`. |
| **SPORE-KEY-005** | warning | Private-key file (`.env.galerina-signing`) is group/world-readable | `chmod 600 .env.galerina-signing`; better, move to a KMS/HSM. |
| **SPORE-KEY-010** | error (fail-closed) | Revocation registry is **untrusted** (tampered, or signed by an unknown/revoked key) | Do not proceed. Restore `governance/revocations.json` from a trusted source and re-sign: `node governance/sign-revocations.mjs`. |

These are **CLI / runtime** diagnostics emitted by `governance/key-lifecycle.mjs` (not compiler-pipeline `SPORE-*` codes), surfaced by `galerina build` / `run` / `verify`.

## Fail-safe ordering (assessSigningKey)

1. **Registry trust first** — if the revocation registry can't be trusted, nothing downstream can (`SPORE-KEY-010`, fail-closed). Prevents a tampered registry from hiding a revoked key.
2. **Key presence** — absent → auto-provision (dev) or fail-closed (prod) (`SPORE-KEY-001`).
3. **Revocation** — revoked key → fail-closed (`SPORE-KEY-004`); never signs.
4. **File permissions** — warn (`SPORE-KEY-005`).
5. **Staleness** — warn (`SPORE-KEY-002`); never blocks (a stale-but-valid key still works while you rotate).

Errors fail **closed**; staleness/perms only **warn** — so the developer is never blocked by a key that is merely old, but is always blocked by a key that is revoked or a registry that is tampered.

## Production note
The plaintext `.env.galerina-signing` (mode 0600, git-ignored) is a **development** custody mechanism. Production keeps the key in an **HSM/KMS/hardware token** with **automatic rotation of short-lived leaf keys under a pinned root anchor** — open item **#149** + the v2 trust-anchor pinning. The diagnostics above are profile-aware so production refuses the dev shortcuts.
