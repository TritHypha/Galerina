# 09 — Data-oblivious secrets (constant-time / no secret-dependent branches)

> **Why this page exists.** A `secure` flow can leak a secret **without ever logging it** — just by *branching on it*.
> The path your code takes, how long it takes, and what the CPU speculatively executes are all observable. This page
> shows how to write **data-oblivious** `.fungi`, and the dev tool that flags the anti-pattern. (Background: RD-0258.)

## The mental model

A value is "secret" here if it is confidentiality-marked: **`protected let`**, **`redacted let`**, or bound from
**`secret.read(...)`** (see [05 — bindings, taint, privacy](05-bindings-taint-privacy.md)). The rule:

> **Never let a secret decide *which code runs* or *how long it takes*.**

Two leak channels, both real:

- **Timing** — `secretPassword == input` returns the instant the first byte differs, so an attacker recovers the secret
  one byte at a time. This is the classic password / token / HMAC compare attack.
- **Speculative execution (Spectre)** — a secret-dependent `if` lets the CPU speculatively run the *wrong* branch and
  leave a measurable cache footprint.

## AVOID — secret-dependent compare and branch

```galerina
secure flow login(readonly request: LoginRequest) -> LoginResult {
    protected let stored = secret.read("pw-hash")

    // AVOID — non-constant-time equality on a secret: leaks it via timing.
    if stored == request.attempt {          // ✗ secret-eq-compare
        return LoginResult { ok: true }
    }
    return LoginResult { ok: false }
}
```

```galerina
    // AVOID — the branch TAKEN (and its timing/speculation) leaks the secret bit.
    redacted let key = secret.read("api-key")
    if key { doFastPath() } else { doSlowPath() }   // ✗ secret-branch — arms are distinguishable
    match key { … }                                  // ✗ secret-match — data-dependent dispatch
```

## CORRECT — constant-time compare, data-independent flow

```galerina
secure flow login(readonly request: LoginRequest) -> LoginResult {
    protected let stored = secret.read("pw-hash")

    // CORRECT — a constant-time comparison whose duration depends only on LENGTH, not content.
    // (Use the platform's constant-time compare; do not hand-roll ==.)
    let ok = Crypto.constantTimeEquals(stored, request.attempt)
    return LoginResult { ok: ok }
}
```

The discipline for a secret-dependent *decision* is **evaluate both arms, then select on a mask** so control flow is
identical regardless of the secret — the arithmetic select folds with the K3 **`min`** operator (never multiply:
multiply would forge ALLOW from two DENYs — see the tri-logic note in [06 — governance constructs](06-governance-constructs.md)).

## The dev tool — `audit-oblivious`

```bash
node scripts/audit-oblivious.mjs            # HIGH: secret-eq-compare
node scripts/audit-oblivious.mjs --extra    # + advisory: secret-branch / secret-match
```

It scans authored `.fungi` (masking strings + comments), flags the three patterns above, and runs `--soft` at every
phase-close. Exempt a line you have proven safe (e.g. a genuinely constant-time compare, or a value that is a policy
boolean not truly sensitive) with a trailing comment:

```galerina
    if policyEnabled == true { … }   // oblivious-allow: secret-eq-compare — policyEnabled is a config flag, not a secret
```

## Status — what the compiler does vs what you do today

- **Today:** the discipline is **yours to apply**; `audit-oblivious` makes violations visible. There is no automatic
  rewrite yet.
- **Held (owner-gated):** a compiler-enforced **`@oblivious`** attribute + a lowering pass that rewrites secret-dependent
  branches into "both-arms + `min`-mask select" and proves the emitted WAT has a secret-independent trace. That is a
  grammar + crown-jewel-lowering change, so it ships only on explicit owner approval — until then, write it by hand and
  let the detector check you. (Design: `ZTF-Knowledge-Bases/galerina-rd-0258-data-oblivious-detector-and-design-2026-07-04.md`.)

## Honest scope

`audit-oblivious` is a **heuristic** — it keys on the confidentiality markers, not a full dataflow trace, so a secret
copied into an unmarked `let` and then compared will slip past it (as will a secret reached through a function return).
It is a first line of defence, not a proof. Taint (untrusted *input* reaching a sink) is a **different** property — that
is the taint-checker's job, covered in [05 — bindings, taint, privacy](05-bindings-taint-privacy.md).
