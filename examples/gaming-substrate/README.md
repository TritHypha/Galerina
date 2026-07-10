# gaming-substrate — "lane is a hardware axis, not a domain"

A worked example prompted by the idea *"`substrate { lane: photonic }` exists, so we could add
`lane: gaming`."* We can't — and this directory shows why, by example.

## `lane` is the physical substrate, not the application domain

`substrate { lane: … }` selects the **hardware compute substrate** a flow runs on. It accepts
exactly three values, each with a fixed noise profile the compiler reasons over:

| lane | meaning | noise (pBad) |
|---|---|---|
| `digital` | classical, bit-exact (the default; block is inert) | 0 |
| `photonic` | optical accelerator — small tolerable drift, converges under voting | 0.02 |
| `noisy` | degraded analog — voting cannot converge | 0.60 |

"Gaming" is an **application domain**, not a substrate — it has no noise profile. A single game
spans *multiple* lanes: approximate physics can run on `photonic`, but anti-cheat/score signing
must stay `digital`. So `lane: gaming` is a category error. A domain is modelled by **choosing the
right lane per flow** (and, for richer cases, by a domain profile/policy — see notes/62 theme-5),
never by inventing a lane keyword.

As of 2026-06-25 the compiler **rejects an unknown lane** (`lane: gaming` → `FUNGI-SUBSTRATE-002`)
rather than silently ignoring it — see the fail-open note below.

## The files (each verified with `node galerina.mjs check`)

| file | lane | result | teaches |
|---|---|---|---|
| `01-physics-step.fungi` | `photonic` + `tolerance` + `redundancy: tmr` | ✅ clean | approximate gameplay physics is a legitimate photonic-lane workload **when voted** |
| `02-anticheat-sign-digital.fungi` | `digital`, `crypto.sign.hybrid` | ✅ clean | authoritative/anti-cheat crypto stays bit-exact on the digital lane |
| `03-anticheat-sign-photonic-WRONG.fungi` | `photonic`, `crypto.sign.hybrid` | ❌ `FUNGI-SUBSTRATE-001` | crypto integrity is **never** tolerance-bounded — denied on any noisy lane, at every profile |

The contrast between 02 and 03 is the whole point: same game, same crypto, different lane — one
admitted, one denied. That is `lane` behaving as a hardware axis. Player PII in a leaderboard or
audit log uses `redact()` (see `docs/examples/Level-4-Security/158-redact-email`), orthogonal to
the lane choice.

## Two fail-opens this example surfaced (both fixed 2026-06-25)

Building it found two real holes in the substrate gate, both letting a crypto effect run on a
noisy lane undetected. See `../../../ZTF-Knowledge-Bases/galerina-substrate-lane-fail-opens-2026-06-25.md`.

1. **PQ-suffixed crypto escaped the gate.** The crypto-on-core matcher was `$`-anchored, so
   `crypto.sign.hybrid` (the form a *certified* profile **mandates**) didn't match and slipped
   past `FUNGI-SUBSTRATE-001` — a fail-open in exactly the highest-assurance posture. Fixed to match
   the whole `crypto.<head>.*` family.
2. **Malformed lane was silently inert.** An unrecognised lane keyword (or a value polluted by a
   trailing `//` comment) failed closed to `value:"digital"`, but the `lane === "digital"`
   early-return ran *before* the malformed check, so it masqueraded as an author-chosen inert lane
   and dropped the crypto gate. Fixed: malformed is checked first → `FUNGI-SUBSTRATE-002`.

> Tip the examples encode: keep `//` comments on their **own line** inside a `substrate {}` block.
> A trailing comment on a field line is not stripped and now fails the build closed.
