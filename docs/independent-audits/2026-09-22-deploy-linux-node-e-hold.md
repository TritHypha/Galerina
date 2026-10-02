# Independent audit — deploy-linux.sh SOURCE_HASH reader does not interpolate basenames into node -e

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `scripts/deploy-linux.sh` does not interpolate source
basenames into `node -e` code.

- The `SOURCE_HASH` reader is
  `node --input-type=module -e "... process.argv[1] ..." "${MANIFEST_JSON}"`.
- The `-e` program contains no `${BASE_NAME}` / `${MANIFEST` interpolation.
- A metacharacter path `x; echo pwned.lmanifest.json` is passed as argv
  and returns the JSON `sourceHash`.

Tests: `scripts/tests/deploy-linux-node-e.test.mjs` (untracked). The
hostile case `spawnSync`s `node --input-type=module -e <snippet> <path>`
with `shell: false`; it does **not** execute the bash wrapper.

Scan `csf_fbc2bfa6f90625ea0e399ec7` is **PARTIAL_THIS_TREE**. Inventory
**73 OPEN / 47 PARTIAL / 4 PATCHED** was independently re-counted from
this tree’s inventory JSON `findings[]` and matches
`disposition_counts`. This is **not** 124-scan closure. Not Astra. Not
production admission.

Node v24.18.0, Windows win32 x64 (NT 10.0.19045). This reviewer did not
rebuild. The bash wrapper itself is **not** executed on this host.

Dirty slice for this claim vs HEAD `91b4dec0`: untracked `??`
`scripts/tests/deploy-linux-node-e.test.mjs`.
`scripts/deploy-linux.sh` is **clean vs HEAD** (git blob
`8c509f696cf66b5f13292cd6c4e8b4b558321afc`; `git diff HEAD` empty).
The argv reader already landed in HEAD via
`eb1645a4fd6aedec3fabb646ec5c84001aa30ff1`
(`fix(security): checkpoint runtime and tooling hardening`). Unrelated
dirty on this worktree was not this claim.

## Source hashes on this tree

Author-named hashes MATCH both listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `scripts/deploy-linux.sh` | `0106b841be2dbd47083020df5ff56b26c6ab2d779062ab9d820e225c160e1900` |
| `scripts/tests/deploy-linux-node-e.test.mjs` | `740e900716becbdab4b0bd0f9cf74659ce603f077b3c66ce0e0130a9ebc3d422` |

HEAD pin: `91b4dec08fe4376febc9494a8023bd02912b8695`
(`2026-09-22 15:27:14 +0100` `fix(security): enforce host grants and checkpoint bounded owner decisions`).
Working-tree git hash-object of the untracked test is
`31a53bd761bf7dde0b2bfada9877f0fc1a83fabe`. Test is not in HEAD.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD. That blob interpolated `'${MANIFEST_JSON}'` into the `-e`
program:

`SOURCE_HASH="$(node -e "const m=JSON.parse(require('fs').readFileSync('${MANIFEST_JSON}','utf8')); process.stdout.write(m.sourceHash||'')")"`

Inventory file
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
`e949ed71dffe1c19dd94e0c9a6edb7552af9e9a4de50f82bad05d76db9f062f1`
(`n=124`, `OPEN_ON_SCAN_SNAPSHOT=73`, `PARTIAL_THIS_TREE=47`,
`PATCHED_AUDIT_PENDING=4`). Finding
`csf_fbc2bfa6f90625ea0e399ec7` title
`Linux deployment helper interpolates source basenames into node -e code`,
medium, path `scripts/deploy-linux.sh` start_line 69, disposition
`PARTIAL_THIS_TREE`. Independent recount of `findings[]` (124 rows,
key `finding_id`) is the same 73 / 47 / 4.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `SOURCE_HASH` reader is `node --input-type=module -e` + `process.argv[1]` + `"${MANIFEST_JSON}"` as a **separate** argv | script 69; named static test; extracted `-e` program is exactly the test `SNIPPET` |
| `-e` program contains no `${BASE_NAME}` / `${MANIFEST` / any `${` | script 69; regex `doesNotMatch(/node --input-type=module -e "[^"]*\$\{/)` ; independent extract `e_has_dollar_brace=false` |
| Only one `node … -e` in the script | independent `node_e_count=1` |
| Metacharacter path is argv data and returns `sourceHash` | named hostile; independent `hostile_status=0` `hostile_stdout="sha256:deadbeef"` `hostile_pwned=false` |
| On this Node, `-e` extra args start at `process.argv[1]` (no `[eval]` slot) | independent `argv_layout=["…node.exe","EXTRA_ARG"]` `argv1_is_extra=true` `argv_has_eval=false` |
| Scan-era interpolation put the path into JS source | `0f24ca30` line 69 `'${MANIFEST_JSON}'` inside `-e`; independent concat payload wrote `INJECTED` to stdout under that shape |
| Current argv treats a JS-concat payload as a filename | independent `cur_concat_stdout=""` `cur_concat_injected_stdout=false` `cur_concat_enoent=true` |
| Production script clean vs HEAD | **CONFIRMED** blob `8c509f6…` equals `HEAD:scripts/deploy-linux.sh` |
| Named node tests | **2/2 pass**, `duration_ms 212.2739` |
| Bash wrapper executed | **not this host**; residual |
| 124-finding scan closure | **not this claim** (`csf_fbc2bfa6f90625ea0e399ec7` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 scripts/tests/deploy-linux-node-e.test.mjs`
   → **2/2 pass**, 0 fail, `duration_ms 212.2739`.
   - `deploy-linux.sh reads the manifest path from argv, not an interpolated basename` — **green** (0.9985ms)
   - `hostile: a metacharacter manifest path is data, not shell or JS syntax` — **green** (95.4197ms)

Independent extra probes (eval only; temp
`%TEMP%\galerina-deploy-e-hold-probe.mjs` and
`%TEMP%\galerina-deploy-e-scanera.mjs`, not production). Node v24.18.0.
Extracted `-e` program from script 69:

`import fs from 'node:fs'; const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(m.sourceHash||'')`

Current argv (`spawnSync(node, ["--input-type=module","-e", snippet, path], {shell:false})`):

- `process.argv` with extra `EXTRA_ARG` → `["<node.exe>","EXTRA_ARG"]` (no `[eval]`)
- `x; echo pwned.lmanifest.json` containing `{sourceHash:"sha256:deadbeef"}` → stdout `sha256:deadbeef`; no `pwned`
- filename `x'; process.stdout.write('INJECTED'); //` containing `{sourceHash:"sha256:quotebreak"}` → stdout `sha256:quotebreak`; not JS
- JS-concat payload `'+(process.stdout.write('INJECTED')||'{}')+'` as argv → ENOENT, stdout empty, no `INJECTED`

Scan-shaped interpolation (path spliced into the `0f24ca30` `'${path}'` `-e` string, then `node -e`):

- same JS-concat payload → **stdout `INJECTED`** (write ran as JavaScript before the subsequent `readFileSync` ENOENT)
- a `'` in the path is JS syntax (`SyntaxError: missing ) after argument list`)

That is the scan-era match: the basename/path was source text inside `-e`.
Current script passes the path as argv; Node reads it as a file.

## Challenge 1 — does the `-e` program interpolate `${BASE_NAME}` or `${MANIFEST_JSON}`?

**No. CONFIRMED.** Script 69’s `-e` operand is a double-quoted JS
program that uses `process.argv[1]` only. `"${MANIFEST_JSON}"` is the
**next** shell word, after the closing quote of `-e`. Extract
`e_has_dollar_brace=false`, `e_has_BASE_NAME=false`,
`e_has_MANIFEST=false`, `e_has_argv1=true`. Named static
`doesNotMatch` and `includes(SNIPPET)` agree.

## Challenge 2 — does a `; echo pwned` manifest path stay data?

**Yes. CONFIRMED.** Named hostile and independent `runArgv(hostile)`
both return `sha256:deadbeef` with `shell: false`. `pwned` is not in
stdout or stderr. Detector can go green on the honest hash.

## Challenge 3 — would scan-era interpolation still execute attacker JS?

**Yes, under the `0f24ca30` shape. CONFIRMED contrast.** Concat payload
`'+(process.stdout.write('INJECTED')||'{}')+'` printed `INJECTED` when
spliced into the scan-era `-e` string. The same payload as current
`argv[1]` did not run; Node tried to `open` that name (`ENOENT`).
Detector can go red on interpolation.

## Challenge 4 — is `process.argv[1]` the extra path, or `[eval]`?

**Extra path on this Node. CONFIRMED.** `node --input-type=module -e
<dump> EXTRA_ARG` printed `["<node.exe>","EXTRA_ARG"]`. Named hostile
could not have returned `sourceHash` if argv[1] were `[eval]`. This
review does not claim that layout for other Node majors.

## Residuals (not findings against the named no-interpolation / argv-hash claim)

- The bash wrapper is **not** executed on this Windows host. Evidence
  is the `node -e` argv contract plus static inspection of script 69.
  A `"` inside `MANIFEST_JSON` could still break the **bash** quoting
  of `"${MANIFEST_JSON}"`; that axis was not exercised.
- Named hostile `; echo pwned` is a shell metacharacter. Inside the
  scan-era JS single-quoted string it is not itself a JS break; the
  JS-injection contrast used a quote/concat payload. The named test
  still proves current argv treats that filename as a path.
- Other script interpolations (`node galerina.mjs check "${FUNGI_FILE}"`,
  echo of `${WASM_FILE}` / `${MANIFEST_JSON}`) are outside this `-e`
  claim.
- `process.argv[1]` layout was confirmed on Node v24.18.0 only.
- Scan ID `csf_fbc2bfa6f90625ea0e399ec7`
  (`Linux deployment helper interpolates source basenames into node -e code`,
  medium, `scripts/deploy-linux.sh`) stays `PARTIAL_THIS_TREE`.
  Inventory file sha256
  `e949ed71dffe1c19dd94e0c9a6edb7552af9e9a4de50f82bad05d76db9f062f1`
  `disposition_counts` / independent `findings[]` recount are
  **73 OPEN / 47 PARTIAL / 4 PATCHED**. This review did not
  re-adjudicate the other 123 IDs. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named no-`-e`-interpolation / argv
`sourceHash` claim. Detector is not invalid. Evidence is sufficient
for those bullets; insufficient for bash-wrapper execution, bash
quote-breaking of `"${MANIFEST_JSON}"`, other Node argv layouts, scan
closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
