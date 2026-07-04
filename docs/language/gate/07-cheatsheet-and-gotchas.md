# 07 — Cheat sheet & gotchas

A one-page reference plus the full list of mistakes `gate-check.mjs` rejects. Everything here is
grounded in `SPEC-gate-language.md` v0.4 and `tools/gate-check.mjs` (the validator that runs). Where
the spec could be read one way and the checker enforces another, **the checker wins** and it is noted.

---

## File skeleton

```gate
#gate 0.3                                        # (1) pragma — REQUIRED, first non-blank line
GATE name(p: Type, q: Type) -> ReturnType:       # (2) one GATE per file, typed signature, colon
  INTENT  "what this does"                        # (3) mandatory
  EFFECTS { effect.a, effect.b }                  # (4) mandatory (empty {} only if zero effect edges)
  PRIVACY deny <class> <field> -> <sink>          # (5) optional; stack rules on continuation lines
          deny <class> <field2> -> <sink>
  AUDIT   on                                       # (6) optional: on | off | "string"
  FLOW:                                            # (7) the drawing
    [in] := IN                                     #     sole entry (exactly one := IN)
    [in] -> [node] ? predicate                     #     edge with a ? guard
    ...
END                                                # (8) terminator; nothing but comments after it
```

---

## The eight glyphs (exact codepoints)

| Glyph | Codepoint | Role | Polarity |
|-------|-----------|------|----------|
| `->` | U+002D U+003E | flow vector | — |
| `[..]` | `[` `]` | node / sandbox | — |
| `✓` | **U+2713** | True / continue arm | positive |
| `×` | **U+00D7** | False / reject arm | negative |
| `?` | U+003F | tri-state test (K3) | test |
| `-` | U+002D | deny drain / resource drain | negative |
| `!` | U+0021 | panic drain (fail-closed) | negative |
| `+` | U+002B | success egress / yield | positive |

Look-alikes (`✗` U+2717, fullwidth, Cyrillic/Greek homoglyphs) are **rejected**.

---

## Node bodies

| Form | Meaning |
|------|---------|
| `[authz]` | named node / sandbox boundary |
| `[raw:fu dbRead]` | delegate to `.fungi` `fu` function `dbRead` |
| `[view:cut fu redactPHI]` | **explicit privacy cut** (the only cut form in v0.4) |
| `[✓]` `[×]` `[-]` `[+]` `[!]` `[?]` | control marks |
| `[✓ok]` `[×fund]` | labelled marks (distinct identity; polarity-locked) |

## Edge tags (one per edge)

| Tag | Meaning |
|-----|---------|
| `? predicate` | target is a tri-state test → needs `✓`/`×`/drain arms |
| `@effect` | edge performs `effect` (must be in `EFFECTS { }`) |
| `decreases <var>` | loop variant; `<var>` produced pre-loop, proven decreasing |
| `hops <N>` | hop budget, `N ≥ 1` |

---

## The tri-logic (ALLOW / HOLD / DENY) — memorise this

| Verdict | K3 | Glyph | Must go to |
|---------|----|-------|-----------|
| **ALLOW** | +1 True | `✓` | onward → `[+]` |
| **DENY (False)** | −1 False | `×` | drain to `[-]` (or a fresh `? guard`) |
| **HOLD / Unknown** | 0 | `-` (or `!`) | the default drain, fail-closed |

`×` (definite False) and `-` (Unknown/deny-drain) are **different arms**. A `?` test needs **all
three**; one `-` cannot serve as both the False arm and the drain.

Terminals: `[+]` = success egress (ALLOW), `[-]` = governed deny (DENY), `[!]` = panic (fail-closed
unwind, must terminate in `[-]`).

---

## Gotchas — the mistakes the checker rejects

Each row is enforced by `gate-check.mjs` (self-test id in brackets where applicable).

### Header / structure
- **No `#gate` pragma first** → rejected. Pragma is `integer.integer`, numeric compare; unsupported ⇒
  REJECT (never best-effort). `#gate 9.9`/`#gate 0.10` rejected today. `[B7]`
- **Two `GATE`s in one file** → rejected. `[B5]`
- **A second `:= IN`** → rejected (single source). `[m1]`
- **Any section after `END`** (or a declarative section *inside* `FLOW`) → rejected (smuggled
  whitelist / spoofed mandatory section). `[ROUND-6/7]`
- **A second `EFFECTS` block** → rejected (silent whitelist widening). `[R9-3]`
- **BOM / NBSP / Unicode space in the pragma region** → rejected. `[H5]`

### Clauses
- **Missing `INTENT`** or **missing `EFFECTS`** → rejected (M2). `[M2]`
- **Empty `EFFECTS { }` but `@effect` edges exist** → rejected. `[M2]`
- **Non-canonical effect** (`db.read`, `http.get`) → rejected; **broad alias** (`secret.access`) →
  warns + resolves; **non-broad alias** → rejected as the compiler would. `[effects]`
- **Edge `@effect` not in `EFFECTS { }`** → rejected (whitelist). `[effects_declared]`
- **Unknown `sens_class`** (incl. dead aliases `confidential`/`sensitive`) → rejected; valid =
  `protected`/`redacted`/`unsafe`/`safe`/`secret` or live `PII`/`PHI`/`PCI`. `[B6]`/`[ZT-1]`
- **PRIVACY `deny` outside PRIVACY** (e.g. in `FLOW`) → rejected (M3). `[M3]`
- **PRIVACY field/sink that resolves to nothing** → rejected (vacuous, M1). `[M1]`

### Graph / glyphs
- **Look-alike glyph** (`✗` U+2717) or **homoglyph ident** (Cyrillic `а`) → rejected. `[B4]`
- **Label polarity spoof** (`[✓denied]`, `[-ok]`) → rejected (B1); non-ASCII label rejected. `[B1]`/`[B4]`
- **Bare mark fed by two parents** (unlabelled `[✓]`/`[×]`/`[?]`) → rejected (Ambiguous mark node).
- **Orphan / dead-end node** (no path from `[in]`, or reaches no terminal) → rejected.
- **`? test` (or bare `[?]`) without DISTINCT `✓`/`×`/drain** → rejected (K3 no-collapse, M4). `[M4]`/`[H3]`
- **Boolean `✓` split with no reject/drain arm** (or a `✓`/`+` split) → rejected (deny-by-default).
- **Node name bound to two `:op`** → rejected (double-bind, M7). `[M7]`
- **Same name as both `:cut` and `:fu`** → rejected (laundered cut authority). `[ROUND-5 H-C]`
- **Unbounded cycle** (back-edge with no `decreases`/`hops`) → rejected (CWE-400). `decreases`
  undefined / loop-internal, or `hops 0`, also rejected. `[M5]`/`[M8]`
- **2D box-drawing character anywhere, incl. comments** → rejected.
- **Unknown edge tag** (`frobnicate 7`) → rejected.

### Privacy / cut / deny-arm / panic
- **Name-only "cut"** (`[view:fu redactPHI]`, no `:cut`) with a matching `deny` rule → rejected (no
  cut dominates the sink, B2/M1). `[B2]`
- **`@redact` edge tag** → rejected (removed in v0.4; use `[name:cut fu op]`). `[v0.4]`
- **Privileged `@effect` on a `×`/`-` deny arm** (only `@audit.write` is allowed) → rejected (B3). `[B3]`
- **A `×`/`-` arm reaching `[+]` with no fresh `? guard`** → rejected (B3). `[B3]`
- **A privileged effect on a *sibling* of a re-auth guard target** → rejected (only the guard's own
  `✓` arm is exempt). `[R9-2]`
- **Panic `[!]` reaching `[+]`**, or resuming past a **non-terminal** drain → rejected (must
  terminate in `[-]`). `[H1]`/`[H6]`
- **Cut placed *before* a `@read`/`@decrypt`/reveal** (leaving plaintext uncut) → rejected. `[H2]`/`[H7]`

### Pass-but-warn (NOT a silent pass, NOT a clearance)
- A **derived value** (`@ai.inference`/`compute.*`/`native.call`) reaching egress uncut, or a
  **sensitive read reaching an un-named egress** uncut, **passes with a loud INTERIM warning** and
  defers the sound verdict to compile-time `FUNGI-PRIVACY-002`. Seen on `flow11`/`flow12`/`flow13`/`flow18`.
  A warned pass is *well-formed*, not *proven safe*. `[H8]`/`[C2]`/posture B.

---

## Running the checker

```
node tools/gate-check.mjs <file.gate | dir>     # check one file or a directory
node tools/gate-check.mjs <dir> --json          # machine-readable
node tools/gate-check.mjs --self-test           # probe every construct + audit case
```
(From `C:\wwwprojects\ZT-Galerina-GRAPH-ASCII-v2`.) Exit 0 iff every file passes every check. The
final line reminds you: *a passing map NEVER authorizes — admission is the SIGNED capability at fuse
time.*

---

## Spec-vs-checker notes (accuracy caveats)

These are places where the honest behaviour differs from a naive reading of the grammar:

1. **`@redact` still appears in the spec's prose history but is REMOVED by the checker.** The v0.4
   grammar and changelog say the `@redact` edge tag is a tombstone; the checker rejects it. Follow
   the checker: the only cut form is `[name:cut fu op]`. (Source: `SPEC` §1 note / changelog B2 vs
   `gate-check.mjs` `@redact` tombstone.)
2. **A file can PASS while carrying a privacy warning.** The spec's posture-B decision is explicit
   that the checker is a *necessary-not-sufficient* pre-filter and warns rather than hard-rejects the
   undecidable privacy cases. So "passes `gate-check.mjs`" ≠ "safe". (Source: `SPEC` privacy-posture
   note; `gate-check.mjs` `privacy_cut`.)
3. **The corpus is `#gate 0.3`; the checker's version is `0.4`.** Both are accepted. New files may
   use either; a 0.3 file is a valid 0.4 input unless it uses `@redact` or a dead sensitivity alias.
4. **Production is OFF regardless of a green lint.** `gate-check.mjs` passing says nothing about
   shippability — the production compiler refuses to sign `.gate` via `FUNGI-GATELANG-002`. See the
   [README status section](README.md#read-this-first--honest-status-of-gate).

---

## Where to go next

- The full grammar + Rosetta stone: `C:\wwwprojects\ZT-Galerina-GRAPH-ASCII-v2\SPEC-gate-language.md`.
- The validator (the real acceptance rules): `…\tools\gate-check.mjs`.
- Real source to imitate: `…\examples\*.gate` (all pass the checker).
- The design rationale: `…\DESIGN-BRIEF-gate-language.md` and `…\README.md`.
