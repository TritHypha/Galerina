# Galerina forward roadmap — post-Hallmark (2026-07-11)

**Branch:** `refactor/spore-format` · **HEAD at write:** hallmark landed (`c42c5d7c`) + benchmark
alignment (this session). Commit-only; the owner pushes. This roadmap supersedes the daily
`roadmap-2026-07-11.md` for the value-types / open-types / benchmark arc; the Stage-6
self-hosting roadmap (`stage6-hundred-percent-fungi-roadmap-2026-07-10.md`) still governs the
`.fungi`-twin programme.

## 0. Where we are — the Zero-Trust thesis boundaries

Achievable-now target = 100 % of each boundary's **governed decision surface** in checker-verified
`.fungi` twins + a declared, shrinking host floor. Literal "no `.ts`" for any boundary is the
**#143 execution switch** (Stage-B WASM byte-parity + the DSS.wasm kernel-bypass TCB), a major
owner-gated build — not a per-boundary gap.

| Boundary | % (governed surface twinned) | Note |
|---|---|---|
| Compiler | 100 | self-hosted twins; host floor = crypto/wasm-toolchain (declared) |
| Packages | 98 | registry + package + fuse admission all twinned |
| I/O — OS kernel | 66 | sentinel-io + auth gate twinned; rest = DSS.wasm kernel-bypass (execution-gated) |
| Memory | 62 | validator/pool/segmentation/trit/alloc-free all twinned |
| TLSTP zero-middleware | 30 | S1 K3 cert-gate twinned; in-sandbox decryption = design intent |

*(The % audit renders as a `show_widget` dashboard, never terminal text — see the standing rule.)*

## 1. Done this session (2026-07-11)

- **I3 exact Money scaling + I2 per-currency-decimals plumbing** (`d1a3b37c`) — BigInt decimal core, no float bridge.
- **H1 `hallmark` open types — LANDED & green** (`c42c5d7c`): full feature (lexer/parser/checker), codes `FUNGI-HALLMARK-001..005`, 19 tests, 5 examples (Level-2-Types 094–098), taint-transparency verified, KB registered. Compiler suite **4471/4471**; full workspace **92/92 green**.
- **Benchmark harness alignment** — tri-logic + data-query rewritten to a common bulk-N path (one `runBulkTri` / `scanRecords` loop on every runtime); both now `comparable: true` and PASS the unit-alignment check; checksums match across node/python/rust; harness test green.
- **Benchmark setup docs** — MSYS2 UCRT64 g++ install path; g++ is installed on the dev box (add `C:\msys64\ucrt64\bin` to PATH); next run should include the C++ column + wat2wasm.

## 2. Next — the owner's sequence

1. **Rules / skills review using Hallmark + the new syntax** — teach `hallmark`, the exact-Money arithmetic, and the effect/value-state gates in the AI-authoring guidance (the "best way to develop code" pass, in the spirit of the effect-checker docs). Encode the do/don't patterns so an AI reaches for a hallmark + a gate rather than a raw String.
2. **TLSTP zero-middleware → 100 %** — continue twinning core-network decision surfaces (cors-policy · egress-guard · inbound-guard · defensive-controls · admission-feedback); the S4 recovering FSM + B8 transport are the deeper pieces. Honest ceiling: in-sandbox decryption stays design intent behind #143.

## 3. Blocked on the pinned ISO-4217 snapshot (R&D is sourcing)

- **I1** `UNIT_REGISTRY` (fiat active set + metals + curated crypto; hash-pinned, never hand-typed).
- **I2** JPY-0dp example (needs the registry so `moneyDecimals` returns real per-currency dp).
- **I5** `Commodity<XAU>` / `Crypto<T>` value types. **I6** `Rate<A,B>`.
- Hallmark `decimals` / `sign` schema fields parse + capture today but their quantity-algebra
  enforcement joins this registry work.

## 4. Owner-gated (surfaced, not done)

- **B4** hallmark cross-package schema hash-pin — until it lands, hallmark types are **package-local** (RD-0353 V5 interim rule).
- **#20** diagnostic-code taxonomy burn-down (165 PascalCase-name violations → 0, then flip `audit-diagnostic-codes` from `--soft` to enforcing). New hallmark codes are already UPPER_SNAKE-compliant, so they did NOT add to the backlog.
- **RD-0340 Option-1 flip** (reject, not warn, an un-annotated privacy cut) · **RD-0341** (warn a proceeding `_ =>` fail-open) · **D2** key-custody step 5/6 · **merge `refactor/spore-format` → main**.

## 5. Benchmark programme (deferred pieces now unblocked)

- **Next full run must include the C++ column** (g++ now installed — add `C:\msys64\ucrt64\bin` to PATH) and exercise **wat2wasm** (WABT CLI installed).
- **Checksum reconciliation** for compute-mix / arithmetic-threshold (Galerina int-wrap vs the reference big-int) before quoting those two — tri-logic + data-query now match byte-for-byte, so they are clean.
- Stable headline (unchanged): Galerina→WASM is competitive with native — measured within ~2× of Node, beats Node 8–10× on allocation, 45–1400× over the governed tree-walk interpreter (governance = a compile-time cost). See benchmarks/results/latest.json.

## 6. Standing security backlog (unchanged, owner-paced)

#22 WAT fuel cap · #24 rate-limit cluster · #28 key-custody · #29 assurance layer (fuzz + Z3) · #31 KB path-leak backlog · #35–#39 docs-honesty + syntax-migration cluster · #41 defensive-controls fold.
