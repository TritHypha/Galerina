# Independent audit — PCI HMAC ingest / Markdown escape / clock overflow

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims (three independent OPEN lows, this-turn PARTIAL candidates):

- **A. `csf_9858ec158575ac1bc8012785`**: Compliance ledger must not accept
  unauthenticated egress decisions. File
  `packages-ts/galerina-devtools-pci/src/compliance-ledger.ts`.
  THIS TURN: `readEgressBatches` takes `hmacKey` (default `ZERO_KEY`),
  refuses empty/non-`Uint8Array` keys, verifies `galerina.audit-batch.v2`
  HMAC with the same length-prefixed encoding as `AuditEgress.computeBatchHash`
  (`epoch:` / `seq:` / `prevHash` / `count:` / `${byteLength}:record\n`),
  and `prevHash` chain via `timingSafeEqual` after hex decode. Dist rebuilt.
  Tests `tests/compliance-ledger.test.mjs` + `tests/cli-ledger.test.mjs`
  **13/13**. Residual the author flags: omitted `hmacKey` still defaults
  to `ZERO_KEY` (same as `AuditEgress`); CLI `ledger` uses that default.

- **B. `csf_014ea5de2911424f2c64d2d6`**: Benchmark Markdown must not
  preserve result-controlled markup. File
  `packages-ts/galerina-devtools-benchmarks/src/report-model.mjs`.
  ALREADY on HEAD: `markdown()` escaped `\ | ` * _ [] <>` and newlines.
  THIS TURN: exported `markdown`. Hostile test for pipe/newline/script.
  Tests `test/report-model.test.mjs` **8/8** (import src, not dist).
  Residual the author flags: does not strip HTML comments beyond `<` `>`.

- **C. `csf_dcb4cf46b657cc73883f5615`**: Logical clock must not advance
  past `MAX_SAFE_INTEGER`. File
  `packages-ts/galerina-core-sentinel-time/src/logical-clock.ts`.
  ALREADY on HEAD (src blob unchanged vs HEAD): `tick` / `advance` throw
  `PrecisionFault` `LST-OVF-001`. THIS TURN: tests for `tick` at
  `MAX_SAFE_INTEGER` and `advance` overflow. Tests
  `tests/logical-clock.test.mjs` **9/9**. Dist already contained the
  check (not rebuilt this turn). Residual the author flags: overflow
  uses `Number`; no bigint ticks.

This reviewer independently re-read production + tests + dist for A and
C (those suites import gitignored `dist/`), hashed working-tree bytes,
ran the named suites, and executed an extra probe from `%TEMP%` (not by
trusting the named tests alone). Author-named hashes were **not**
supplied in the review packet. Independent `crypto.createHash('sha256')`
and `Get-FileHash` MATCH each other on the listed files.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **23 OPEN / 97
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 23 = 0 high / 0 medium /
23 low, `PARTIAL_THIS_TREE` 97, `PATCHED_AUDIT_PENDING` 4; `n` 124;
disposition sum 124). The three named IDs are among the 23 OPEN lows.
Overall `INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan
closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named PCI
and clock suites import gitignored `dist/` (`packages-ts/.gitignore`
line 5 `dist/`). Named report-model tests import `../src/report-model.mjs`.
This reviewer did not rebuild. PCI dist mtime is newer than matching src
and carries HMAC verify. Clock dist is older than this-turn tests and
matches HEAD src (overflow already present).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-devtools-pci/src/compliance-ledger.ts` | **M** HEAD blob `acfc3253d4` → WT blob `30fb2cae05`. HEAD `readEgressBatches` JSON-parsed each line with no HMAC / no chain / no shape check. THIS TURN: `createHmac` + `timingSafeEqual`; `computeEgressBatchHash` v2 length-prefixed; empty key refuse; `prevHash` chain from GENESIS; malformed batch throw. `buildComplianceReportFromDir` now forwards optional `hmacKey`. |
| `packages-ts/galerina-devtools-pci/tests/compliance-ledger.test.mjs` | **M**. THIS TURN: hostile forged allow batch without matching HMAC must throw. Imports `../dist/index.js`. |
| `packages-ts/galerina-devtools-pci/tests/cli-ledger.test.mjs` | **M** (small). CLI still calls `buildComplianceReportFromDir(sourceDir)` with no key. |
| `packages-ts/galerina-devtools-pci/dist/compliance-ledger.js` | gitignored; rebuilt this turn; `readEgressBatches` HMAC + chain + empty-key refuse present. |
| `packages-ts/galerina-devtools-benchmarks/src/report-model.mjs` | **M** HEAD blob `872c69c0c7` → WT blob `10732776ee` (`+1 / −1`). Sole production hunk: `function markdown` → `export function markdown`. Escape table already on HEAD. |
| `packages-ts/galerina-devtools-benchmarks/test/report-model.test.mjs` | **M**. THIS TURN: hostile pipe/newline/`<script>` plus `markdown as escapeMarkdown`. Imports src. |
| `packages-ts/galerina-core-sentinel-time/src/logical-clock.ts` | **clean** (blob `1ce256bf03` = HEAD). `tick` `>= MAX_SAFE_INTEGER` / `advance` `tick + n > MAX_SAFE_INTEGER` already throw `LST-OVF-001`. |
| `packages-ts/galerina-core-sentinel-time/tests/logical-clock.test.mjs` | **M** (+16). THIS TURN: tick-at-max and advance-overflow hostiles. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-sentinel-time/dist/logical-clock.js` | gitignored; **not** rebuilt this turn; overflow check present (mtime `2026-09-22T12:53:19Z`). |

## Source hashes on this tree

Author-named hashes were **not supplied**. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH each other).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-devtools-pci/src/compliance-ledger.ts` | 16805 | `343af34c47daab1ae5e9e9aff46a179c33ebc44500a7cd124b3fcd518e3421c1` |
| `packages-ts/galerina-devtools-pci/dist/compliance-ledger.js` | 13225 | `6f4b132221de822c462b634758c50bc7984fd5cee5f95f3a49d6ab9b3811e7b7` |
| `packages-ts/galerina-devtools-pci/tests/compliance-ledger.test.mjs` | 12790 | `f81a37d49fb21ce27a96c7b5e1597517b9f0023a04b8468823e1c142babd7ab4` |
| `packages-ts/galerina-devtools-pci/tests/cli-ledger.test.mjs` | 2586 | `3b35630b784d03ff65bddefda36d182263053c3256af20333924da30f69084bd` |
| `packages-ts/galerina-devtools-benchmarks/src/report-model.mjs` | 8655 | `6fe0e6efde4bd2cdcac2a5dde69c865fd5b39087467c1ef2dfbeb27e0703b788` |
| `packages-ts/galerina-devtools-benchmarks/test/report-model.test.mjs` | 7381 | `20247a559bcd9eb082f338bb3b1ab41104a81ad8c29daa8db05479fa29da99b7` |
| `packages-ts/galerina-core-sentinel-time/src/logical-clock.ts` | 2338 | `1ccdcfe47fc67443202cc6f656b5e38e2237f988df103add86b4848d32248cc6` |
| `packages-ts/galerina-core-sentinel-time/dist/logical-clock.js` | 2337 | `05c2bca719633e4e40490a7fa01c329a242b8c423b65adb848d9f2a0e07b13f8` |
| `packages-ts/galerina-core-sentinel-time/tests/logical-clock.test.mjs` | 3003 | `22f0a026d6978d5fff03976523e8aa5fd63705f3d045060451425f8ca3b01585` |
| `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` | 66787 | `202224680cfc7d7dd4bc58e61054925f2459c4d500be1e327a99a7a8fdcc264b` |

Independent MATCH (Get-FileHash ↔ crypto) on every row above.

Dist mtimes (UTC): PCI `compliance-ledger.js` `2026-09-23T11:30:04Z`
(src `2026-09-23T11:28:27Z`); clock `logical-clock.js`
`2026-09-22T12:53:19Z` (src `2026-09-22T11:57:26Z`). PCI dist is newer
than this-turn src. Clock dist predates this-turn tests and matches the
unchanged HEAD overflow body.

Inventory file sha256 `202224680cfc7d7dd4bc58e61054925f2459c4d500be1e327a99a7a8fdcc264b`
(`??` / dirty on this tree). `findings_json_sha256` pin
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.
Named rows still `OPEN_ON_SCAN_SNAPSHOT` with note “No this-turn source
re-verification”. Reviewer did not reclassify.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| A | ingest must authenticate egress batches | `readEgressBatches` HMAC v2 + `hexEqual`/`timingSafeEqual` + prevHash chain; encoding matches `AuditEgress` `computeBatchHash` | PCI suites **13/13** including forged allow refuse | `%TEMP%` forged HMAC throw `egress batch HMAC does not authenticate`; empty `Uint8Array` throw `requires an HMAC key` | omitted key = `ZERO_KEY` still accepts a matching all-zero MAC (author residual; extra probe confirmed accept). In-memory `buildComplianceReport` still trusts caller batches. CLI does not pass a key. |
| B | result-controlled markup must not survive Markdown cells | `markdown()` escape table; used by `buildReportMarkdown` / `renderTransition` | report-model **8/8** including hostile `|` / newline / `<script>` | `markdown("a\|b")` → `a\\|b` | HTML comments not stripped beyond `<` `>` (author residual). |
| C | clock must not advance past `MAX_SAFE_INTEGER` | `tick` / `advance` throw `LST-OVF-001`; clock not mutated on throw | logical-clock **9/9** | `new LogicalClock(MAX_SAFE_INTEGER).tick()` throws `PrecisionFault` `LST-OVF-001`; `now()` unchanged | `Number` ticks; no bigint (author residual). |

## Suites (fresh this review)

From worktree, `node --test`:

- `packages-ts/galerina-devtools-pci/tests/compliance-ledger.test.mjs` +
  `packages-ts/galerina-devtools-pci/tests/cli-ledger.test.mjs`:
  **13/13** pass, fail 0, duration ~918ms.
- `packages-ts/galerina-devtools-benchmarks/test/report-model.test.mjs`:
  **8/8** pass, fail 0, duration ~126ms.
- `packages-ts/galerina-core-sentinel-time/tests/logical-clock.test.mjs`:
  **9/9** pass, fail 0, duration ~125ms.

## Extra probe from `%TEMP%`

Script `<LOCAL_TEMP>/pcihmac-mdescape-clockovf-probe.mjs`
imported worktree PCI dist, report-model src, and sentinel-time dist.
`PROBE_OK` exit 0.

- Forged allow batch (`batchHash` = `"a".repeat(64)`) → throw
  `egress batch HMAC does not authenticate`.
- `readEgressBatches(dir, new Uint8Array(0))` → throw
  `compliance ledger requires an HMAC key to authenticate egress batches`.
- `markdown("a|b")` === `a\|b`.
- `LogicalClock(Number.MAX_SAFE_INTEGER).tick()` → `PrecisionFault`
  `LST-OVF-001`; `now()` remains `MAX_SAFE_INTEGER`.
- Additional (residual documentation, not a named-claim fail): a
  length-prefixed v2 MAC under the all-zero 32-byte key is accepted when
  `hmacKey` is omitted.

## Residuals (author-flagged; independently observed)

- PCI still defaults to `ZERO_KEY` when `hmacKey` is omitted; CLI
  `ledger` calls `buildComplianceReportFromDir(sourceDir)` with no key.
  Empty key is refused; omitted key is not. A well-known-zero MAC still
  authenticates.
- `markdown()` does not strip HTML comments beyond replacing `<` `>`.
  `<!--` becomes `&lt;!--` rather than being removed as a comment token.
- Clock overflow uses `Number`; constructor/`tick`/`advance` are not
  bigint. `advance(0)` at `MAX_SAFE_INTEGER` does not throw (sum is not
  greater than the bound).

## Inventory (recount only; no reclassification)

`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` schema
`galerina.scan-0f6063dd.inventory.v1`, `n` 124, overall
`INCOMPLETE_NON_AUTHORITATIVE`, `worktree_head`
`91b4dec08fe4376febc9494a8023bd02912b8695`.

Header and findings-array recount MATCH: `OPEN_ON_SCAN_SNAPSHOT` 23 /
`PARTIAL_THIS_TREE` 97 / `PATCHED_AUDIT_PENDING` 4. Severity 4 high /
68 medium / 52 low. All 23 remaining OPEN are low. Named three remain
OPEN. Reviewer did not change the JSON.

## Verdict

**PASS** for the three named this-turn PARTIAL candidates on this dirty
tree. HMAC ingest refuses forged batches; Markdown cells escape `|`;
logical clock refuses a tick at `MAX_SAFE_INTEGER`. Residuals remain
and keep the scan rows OPEN. **INCOMPLETE_NON_AUTHORITATIVE**. Not
production admission. Not Astra. Dirty HEAD
`91b4dec08fe4376febc9494a8023bd02912b8695`.
