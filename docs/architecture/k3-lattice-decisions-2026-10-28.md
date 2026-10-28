# K3 lattice decisions: consensus ties, DENY AND UNKNOWN, and runtime ownership

**Date:** 2026-10-28.
**Status:** decision record and status sync. It closes no RD and releases no
authority. RD-0775 (K3 UNKNOWN is not 0) stays the governing record; this note
writes down three follow-ups from the 2026-10-26 Fungi memory wrap-up in one
place so they are owner-visible and are not re-argued later.

**Scope:** the Galerina K3 verdict lattice as it stands on `main` after the K3
wire lock-step chapter (see `docs/TODO.md`, "K3 wire lock-step chapter -
2026-10-28"). Production is GIR -> SLIDE. VOK
(`packages-ts/galerina-core-runtime/native/vok-authority`) is the Rust checker
beside SLIDE and is not part of the production build. TypeScript is the frozen
reference; new work goes in `.fungi`.

---

## 1. The lattice in one table

| Value | TypeScript reference | `.fungi` | Wire byte (u8) | Authorizes? |
|---|---|---|---|---|
| ALLOW / ADMIT | `+1` | `Verdict.Allow` | `0x01` | yes, and only this value |
| NEUTRAL | `0` (a computed trit) | n/a at the wire | never written | no, refused silently |
| UNKNOWN | typed `K3_UNKNOWN` sentinel, never `0` | `Verdict.Unknown` via `k3UnknownWire()` | `0x80` (-128) | no, refused with `FUNGI-GOV-3VL-001` |
| DENY / REFUSE | `-1` | `Verdict.Deny` | `0xFF` (-1) | no |

Rules that hold everywhere:

- Only exactly `+1` authorizes. Every other value, including a malformed one,
  is refused at the trust boundary (`decideAtBoundary`).
- A bare `0x00` at a byte boundary is refused (`VOK_TRIT_BARE_LEGACY_ZERO`).
  Legacy `0` is read as UNKNOWN only inside the versioned wire frame, under the
  owner option B bridge, until the Step Z sunset (P2 expiry 2026-12-31;
  `1798761599` accepts, `1798761600` refuses; path deleted by 2027-01-18).
- A trusted clock value `<= 0` fails closed (`LEGACY_CLOSED`).

## 2. Consensus ties (CONSENSUS-TIE-NOTE)

`consensusTritN` in
`packages-ts/galerina-tower-citizen/src/three-valued-governance.ts` is
sign-of-sum over N votes, with an undecided outcome mapped to UNKNOWN:

| Input | Result | Why |
|---|---|---|
| empty vote set | UNKNOWN | no evidence is not a vacuous yes |
| any UNKNOWN vote | UNKNOWN | UNKNOWN is infectious |
| votes summing above 0 | ALLOW | sign of the sum |
| votes summing below 0 | DENY | sign of the sum |
| non-zero votes summing to exactly 0 (a split) | UNKNOWN | the quorum could not decide |
| every vote `0` | NEUTRAL | a computed neutral, not missing evidence |
| a vote that is not a trit or the sentinel | hard refusal | fail-closed input check |

The function header in `three-valued-governance.ts` already states the tie
rule (landed with `c0940fec9` and `b498128eb`). This note is the owner-visible
copy; the TypeScript header is frozen reference and was not edited again.

**Consequence:** a split or empty quorum fails closed, but it is audit-noisy,
because every tie raises `FUNGI-GOV-3VL-001` at the boundary rather than a
plain DENY. That is intended: "the quorum could not decide" and "the quorum
said no" are different audit facts and must stay different.

**Leftover:** the three-input `consensusTrit` in
`packages-ts/galerina-tower-citizen/src/tpl-simulator.ts` (the arithmetic
balanced-ternary simulator) still returns `0` on a tie. It is classified as
arithmetic, not governance, and is tracked with the K3-COPIES unit (U8), not
here.

## 3. DENY AND UNKNOWN (the trade-off)

Three places combine a refusal with an unknown, and they deliberately do not
all give the same answer:

| Where | Operator | DENY with UNKNOWN gives | Absorbing value |
|---|---|---|---|
| TS reference `vAnd` / `allOf` (`three-valued-governance.ts`, pinned `6adf84b8e`), and `.fungi` `effective-verdict.fungi` / `verdict-or.fungi` | infectious K3 | UNKNOWN | UNKNOWN |
| TS `trustMeet` / `trustMeetAll` (`epistemic-type-state.ts`, `89cfa6039`) | REFUTED-absorbing meet | REFUTED | REFUTED |
| VOK `authority_verdict` (`vok-authority/src/lib.rs`, `.min()` over `Refuse < Unknown < Admit`) | lattice minimum | Refuse | Refuse |

**Decision (recorded 2026-10-28, owner-visible):** keep all three as they are.

- **Verdict composition is infectious.** With the pinned `vAnd`, DENY AND
  UNKNOWN is UNKNOWN. The composite is still refused, because only `+1`
  admits, so this never fails open. What it buys is the audit fact: a verdict
  that touched missing evidence is reported as "could not decide" with
  `FUNGI-GOV-3VL-001`, even when another factor also said no. The cost is that
  DENY is not absorbing when UNKNOWN is present, so a reviewer cannot read a
  composite UNKNOWN as "no factor refused".
- **Epistemic trust is REFUTED-absorbing.** `trustMeet` answers a different
  question: has anything been disproved? A disproof must not be laundered into
  UNKNOWN, because a later discharge step could lift UNKNOWN to PROVEN.
  `trustMeet` therefore checks REFUTED first and does not delegate to `vAnd`
  (the rejected alternative is recorded in its header).
- **VOK is a checker, not a composer.** VOK only has to decide whether an
  admitted shape may run. Refuse absorbing is the strictest answer, and the
  audit reason for UNKNOWN is already raised on the Galerina side. VOK's internal
  `{-1, 0, 1}` lattice is not the wire; the wire is the u8 codec in section 1.

**Rule for new code:** a new governance composer in `.fungi` uses the
infectious `vAnd` semantics. A new evidence or proof combiner uses the
REFUTED-absorbing meet. Never reuse one for the other's job.

**Stale wording to fix with K3-COPIES:** the `verdict.ts` header in
`galerina-auth` still calls DENY the "annihilator under conjunction". That is
only true when no UNKNOWN is present. It is frozen TS and is left for the
copies unit; the package README was corrected on 2026-10-28.

## 4. Runtime half of the memory guarantees (MEMORY-RUNTIME-SLIDE)

The Fungi memory chapter proves **language-level** rules in the Galerina
checker: alias rules, wipe obligations, region keys and lease shapes as
written in `.fungi` source. It does not, and must not be cited as, runtime
enforcement.

| Guarantee | Who enforces it in production | Who cross-checks it |
|---|---|---|
| alias and borrow rules at run time | SLIDE | VOK (development and tests only) |
| wipe on release / region end | SLIDE | VOK |
| one-use execution lease | SLIDE | VOK |
| admission and receipts | SLIDE | VOK |
| language-level memory rules | Galerina checker | Galerina tests |

- `SLIDE/src/verified-object-kernel.mjs` is a JavaScript reference model of
  admission, one-use leases and receipts. It holds no production authority.
- The Rust VOK checker is a bolt-on beside SLIDE. No production guarantee may
  depend on VOK being present.
- A claim such as "Galerina guarantees wipe-on-release" is wrong. Write
  "Galerina checks that the program declares the wipe; SLIDE performs it".

## 5. K3 leftovers recheck on `main` (`7a7e903e0`)

A `git grep` for UNKNOWN-as-zero on `main` after the lock-step chapter found
two remaining copies, both inside the K3-COPIES unit (U8) and both behind the
K3C-2 owner nod:

| File | Line | What | Status |
|---|---|---|---|
| `packages-ts/galerina-core-compiler/src/hardening-residency.ts` | 597 | `UNKNOWN: 0 as const` in the compiler Trust lattice | frozen TS; held for K3C-2 |
| `packages-ts/galerina-tower-citizen/src/self-hosted/inference-governance.fungi` | 7 | comment `INDETERMINATE = 0` | comment only; left so the tower-citizen build manifest stays unchanged until K3C-2 lands |

The compiler's native `Verdict.Unknown` as i32 `0` (`wat-emitter.ts`,
`interpreter.ts`) is the main K3C-2 item and is unchanged. The red tests in
`packages-ts/galerina-core-compiler/tests/k3-copies-red.test.mjs` stay
`{ todo }` until then.

## 6. Cross-references

- `docs/TODO.md`: "K3 wire lock-step chapter - 2026-10-28" and "Fungi memory
  chapter wrap-up - 2026-10-26".
- `docs/architecture/galerina-slide-lyth-execution-pipeline-20261026.md`:
  production shape GIR -> SLIDE, VOK as a bolt-on checker.
- `packages-ts/galerina-auth/README.md`: composition rules, corrected
  2026-10-28 to match `compose.ts`.
- `packages-ts/galerina-tower-citizen/src/three-valued-governance.ts`: `vAnd`,
  `vOr`, `vNot`, `consensusTritN`, `decideAtBoundary`.
- `packages-ts/galerina-tower-citizen/src/epistemic-type-state.ts`:
  `trustMeet`, `trustMeetAll`.
