# Independent audit — four imported PATCHED_AUDIT_PENDING highs

**Verdict: PASS** (scoped to the four named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims (scan `0f6063dd` highs, imported `PATCHED_AUDIT_PENDING`):

1. `csf_7c334da06ea43bf62f7b58f9` — rebuild spawn is argv + `shell:false`;
   a directory with `&echo MARKER` is not interpreted by cmd.
2. `csf_2a86648bf19537088fa9b394` — unknown-path 404 does not reserve/emit
   mandatory audit; 8× `/nope` then `/health` `runtimeReport` still 200.
3. `csf_176f3d7332761399dac3c39d` — keyId `x/../../plugin/attacker` cannot
   select a pubkey outside `governanceDir`.
4. `csf_abb8e005fb7ba36366169ba5` — GET `//[` returns 400 `bad_request`
   without `unhandledRejection`.

Q1 caller/mutation and Q2 leftover work/capacity were challenged on these
four claims (below). Three-boundary WAT caller-mutation and RD-1286 durable
backend admission are **not** this named four-high closure.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). This
reviewer did not rebuild. Kernel / fuse-loader / api-server tests import
`dist/` (gitignored `packages-ts/.gitignore` line 5). Dist mtimes are
newer than src and carry the same controls (see hashes).

## Dirty slice vs HEAD `91b4dec0`

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

| path | vs HEAD |
|---|---|
| `scripts/rebuild-fusable-packages.mjs` | clean (HEAD blob `ebf233f25c`) |
| `scripts/tests/rebuild-fusable-packages.test.mjs` | clean (HEAD blob `6da8735f80`) |
| `packages-ts/galerina-framework-app-kernel/src/kernel.ts` | clean (HEAD blob `6aabcb5ca5`) |
| `packages-ts/galerina-framework-app-kernel/src/fuse-loader.ts` | clean (HEAD blob `9c999120dd`) |
| `packages-ts/galerina-framework-app-kernel/tests/fuse-loader.test.mjs` | clean (HEAD blob `66067be81c`) |
| `packages-ts/galerina-framework-api-server/tests/api-server.test.mjs` | clean (HEAD blob `67e56dd3f9`) |
| `packages-ts/galerina-framework-app-kernel/tests/audit-async.test.mjs` | **M** HEAD `ab665f8869` → WT `49391e575e` (+22: 8× `/nope` hostile) |
| `packages-ts/galerina-framework-api-server/src/index.ts` | **M** HEAD `6b7c4113c7` → WT `7c4d76c49f` (Q2 `requireDurableReplay`; parseUrl already on HEAD) |
| `packages-ts/galerina-framework-api-server/src/replay-store.ts` | **M** (empty durable admit-list helpers; not a named-claim hash) |

Unrelated dirty on this worktree was not this claim. Dist is untracked
(gitignored).

## Source hashes on this tree

Author-named hashes MATCH all six listed files. Independent SHA-256 via
`crypto.createHash('sha256')` on the working-tree bytes (temp probe
`%TEMP%\patched-highs-independent-probe.mjs`, not production).

| path | sha256 | vs claim |
|---|---|---|
| `scripts/rebuild-fusable-packages.mjs` | `27f08b7edfc1ecd666b4c3c43fed79202e97c49c092ebd3572288be73a4fa3c0` | MATCH |
| `scripts/tests/rebuild-fusable-packages.test.mjs` | `5c4e001ab78dee989d45480d09da54746ff1c1f7232c86963b55b453c3a54bdd` | MATCH |
| `packages-ts/galerina-framework-app-kernel/src/kernel.ts` | `189a739e13100d0b08a097e1858551414224ecb6e91e2b66a0a2f2388aa424f3` | MATCH |
| `packages-ts/galerina-framework-app-kernel/tests/audit-async.test.mjs` | `374af602414b35ad7717672c46e115748aa5fb45419ddb36177fb8cc0124d86f` | MATCH |
| `packages-ts/galerina-framework-app-kernel/src/fuse-loader.ts` | `fc23ef01bc192c7ac9d74ce33b11b55c6d9469a2f03983df7738607d5bdc87d4` | MATCH |
| `packages-ts/galerina-framework-api-server/src/index.ts` | `009c7b0f0ee4be815d8e0a3e3e568f57afb6e1878f418ca8e90dcab51e9fc784` | MATCH |

Additional executed / supporting hashes (not in the author claim list):

| path | sha256 |
|---|---|
| `packages-ts/galerina-framework-app-kernel/dist/kernel.js` | `6d828e329692b854a62699489efd7d8e4fb222f0f00bb003c497d5cecc1c73ab` |
| `packages-ts/galerina-framework-app-kernel/dist/fuse-loader.js` | `81fcaf788159690eff16f7eb3d549a469a42080ed6861a2b309eff954e4032d4` |
| `packages-ts/galerina-framework-app-kernel/tests/fuse-loader.test.mjs` | `cb431e857756ed0e96f45aeac048c5e2e9567f7142a9e4a0ccebfa6e1eb70ce5` |
| `packages-ts/galerina-framework-api-server/dist/index.js` | `8350cef55d27af722e59bd25c343eb74270d10a73661823eb2cd261cf37e5dbf` |
| `packages-ts/galerina-framework-api-server/tests/api-server.test.mjs` | `ce7c2cbdf1a7c6aacffd3eb550e7bc024c0602692c0f5dc1289347e5b77fa233` |
| `packages-ts/galerina-framework-api-server/src/replay-store.ts` | `dbf3519f56e4ccb68428bb031b94d7a7dbc751de49925fb3211acc556af887a2` |

Inventory file `docs/reports/scan-0f6063dd-inventory-2026-09-22.json`
sha256 `360a56825276f8fc2146bfc1f16d548f89e74761607e957318df4d1a6d3c4b45`
(`n=124`, `OPEN_ON_SCAN_SNAPSHOT=69`, `PARTIAL_THIS_TREE=51`,
`PATCHED_AUDIT_PENDING=4`, `high=4`). Independently recounted:
`disposition_sum=124`, `findings.length=124`. The four highs remain
labeled `PATCHED_AUDIT_PENDING` in that file (`note`: “PLAUSIBLE prior
GAL-H* cluster; not re-verified this turn”). This receipt is the
independent re-verification; this reviewer did not edit the inventory.
This is **not** 124-scan closure. Not Astra. Not production admission.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Rebuild spawn is 3-arg `spawnSync(process.execPath, buildArgs, {shell:false})` | source `rebuild-fusable-packages.mjs` 156–157; probe `spawnHasExecPath=true`, `shellFalse=true`, `shellTrue=false`, `shellIsWin=false` |
| Hostile dir `&echo MARKER` is not interpreted by cmd | named test; 47/47 includes it (`duration_ms` 627.6 for that test) |
| Unknown-path 404 does not `reserve`/`emit` | `handle` reserves only `declaredPolicy?.audit.runtimeReport === true`; 404 returns `policy: undefined`; `emit` only `else if (policy !== undefined)` |
| 8× `/nope` then `/health` `runtimeReport` still 200 | named hostile test; independent dist probe `fourOhFours=[404×8]`, `health=200` |
| keyId cannot escape `governanceDir` | `SIGNING_KEY_ID` + `admittedGovernanceKeyPath` basename gates; named path-shaped test |
| Hostile `x/../../plugin/attacker` refuses | named test; probe `regexAcceptsHostile=false`, `admittedPath=null`; naive `path.join` **would** escape to `C:\plugin\attacker.pub.pem` |
| GET `//[` is 400 `bad_request` inside the request catch | `parseUrl` refuses `startsWith("//")`; `handleRequest` catches `RequestTargetError`/`TypeError`; `onRequest` `.catch` |
| No `unhandledRejection` on `//[` | named test listens on `process` and asserts `unhandled.length===0` |
| Q1 caller mutation (these four) | CONFIRMED refused (challenges below) |
| Q2 leftover audit capacity after 404s | CONFIRMED preserved for mandatory `/health` |
| Q2 durable-replay leftover work | CONFIRMED leftover: admit-list empty; `requireDurableReplay` refuses `MemoryReplayStore` |
| 124-finding scan closure / production admission | **not this claim** |

## Command receipts

`node --test --test-timeout=120000` of

- `scripts/tests/rebuild-fusable-packages.test.mjs` (2)
- `packages-ts/galerina-framework-app-kernel/tests/audit-async.test.mjs` (10)
- `packages-ts/galerina-framework-app-kernel/tests/fuse-loader.test.mjs` (20)
- `packages-ts/galerina-framework-api-server/tests/api-server.test.mjs` (15)

→ **47/47 pass**, 0 fail, 0 skipped, `duration_ms 797.1181`.

Named controls all green:

- `Windows rebuild helper keeps discovered package directories as process arguments`
- `a package directory containing shell metacharacters is not interpreted by cmd.exe`
- `unmatched 404/405 traffic does not consume mandatory audit capacity`
- `hostile: unknown-path 404s cannot exhaust mandatory audit capacity`
- `a path-shaped keyId cannot escape the admitted governance directory`
- `malformed request targets return 400 without an unhandled rejection`

Independent extra probe (`PROBE_OK`; import of dist kernel + replay-store;
reconstructed `parseUrl` / `admittedGovernanceKeyPath`; no live `shell:true`
spawn; no `calc.exe`):

- rebuild: `shellFalse=true`; `shellTrue=false`; `shellIsWin=false`;
  `spawnOpts=true`; snippet
  `spawnSync(process.execPath, buildArgs, { cwd: REPO, encoding: "utf8", shell: false, windowsHide: true, timeout: 60000 })`
- keyId `x/../../plugin/attacker`: `regexAcceptsHostile=false`;
  `admittedPath=null`; `validKey=true` for `ab46f4c7e2797b9b`;
  `slash=false`; `backslash=false`; `dotDot=false`; `empty=false`
- naive reconstruction (no regex): `path.join(gov, "signing-key-" + hostile + ".pub.pem")`
  = `C:\plugin\attacker.pub.pem`; `naiveEscapes=true`;
  `basenameHostileFile="attacker.pub.pem"`
- `parseUrl("//[")` → `RequestTargetError`; `new URL("//[", "http://x")` →
  `TypeError Invalid URL`; `/health?x=1` → `{path:"/health", query:{x:"1"}}`
- Q2 audit leftover: 8× 404 then health 200; `drained=1` (the health event);
  `pending=0`
- Q2 durable leftover: `isProcessLocalReplayStore(mem)=true`;
  `isAdmittedDurableReplayStore(mem)=false`; wrapper object not admitted

## Challenge 1 — does rebuild still interpolate discovered directories into a shell command? (Q1 caller mutation)

**No. CONFIRMED refused.** Locator: `scripts/rebuild-fusable-packages.mjs` 154–157.

```154:157:scripts/rebuild-fusable-packages.mjs
  const buildArgs = [join(REPO, "galerina.mjs"), "build", "--package", dir];
  if (ALLOW_SIGNED) buildArgs.push("--force");
  const r = spawnSync(process.execPath, buildArgs,
    { cwd: REPO, encoding: "utf8", shell: false, windowsHide: true, timeout: 60000 });
```

Three-argument `spawnSync` + `options.shell === false` does not pass a
concatenated command line to `cmd.exe`. The discovered `dir` stays one
argv element (`buildArgs[3]`). Named hostile fixture
`pkg&echo ${MARKER}&rem` asserted `echoed=false`. Inventory path
`scripts/lib/signed-lmanifest.mjs` is the discovery site; the spawn
repair is this helper.

## Challenge 2 — do unknown-path 404s consume leftover mandatory audit capacity? (Q2 leftover capacity)

**No. CONFIRMED they do not.** Locator: `kernel.ts` 474–475, 761–806.

`handle` looks up `declaredPolicy` by exact path+method before any
pipeline mutation. Unknown `/nope` has no declared policy, so it does
not `reserve`. `runPipeline` returns `{ policy: undefined }` on 404/405.
`emit` runs only `else if (policy !== undefined)`. Capacity `1` therefore
survives 8 unknown-path 404s for a later `/health` with
`audit.runtimeReport: true` (named hostile + independent dist probe
`health=200`). 404 callers do not mutate `#reservations` / `#queue`.

HEAD already carried this `handle` logic; the dirty slice only adds the
8× `/nope` hostile test.

## Challenge 3 — can a path-shaped keyId mutate pubkey selection outside `governanceDir`? (Q1 caller mutation)

**No. CONFIRMED refused** on the Ed25519 `resolvePublicKey` path.
Locator: `fuse-loader.ts` 467–496.

```467:496:packages-ts/galerina-framework-app-kernel/src/fuse-loader.ts
const SIGNING_KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function admittedGovernanceKeyPath(
  path: NodePath,
  governanceDir: string,
  keyId: string,
  suffix: string,
): string | undefined {
  if (!SIGNING_KEY_ID.test(keyId)) return undefined;
  const fileName = `signing-key-${keyId}${suffix}`;
  if (path.basename(fileName) !== fileName) return undefined;
  const candidate = path.join(governanceDir, fileName);
  if (path.basename(candidate) !== fileName) return undefined;
  return candidate;
}
```

`x/../../plugin/attacker` fails the regex (`/` not admitted). The
basename gates would also refuse, because
`basename("signing-key-x/../../plugin/attacker.pub.pem") === "attacker.pub.pem"`.
Independent reconstruction of the unguarded `path.join` **does** escape
to `C:\plugin\attacker.pub.pem`. Named test with an attacker
`plugin/attacker.pub.pem` plus `requireSignature: true` rejects
`FUNGI-FUSE-(UNSIGNED|NO-PUBKEY|TRUST|SIG)`. Dist
`fuse-loader.js` 299–320 matches src.

## Challenge 4 — does GET `//[` escape the asynchronous request error boundary?

**No. CONFIRMED 400 inside the boundary.** Locator: `api-server/src/index.ts`
331–354, 777–787, 585–600.

`parseUrl` throws `RequestTargetError` on `raw.startsWith("//")` before
`new URL`. `handleRequest` maps `RequestTargetError` and `TypeError` to
400 `{error:"bad_request"}` and returns. `onRequest` still `.catch`s the
promise to 500 if anything else escapes. Named test: GET `//[` → 400,
`unhandled.length===0`. Independent: `parseUrl("//[")` is
`RequestTargetError`; `new URL("//[", "http://x")` is `TypeError`
`Invalid URL` (so even without the `//` prefix gate, the TypeError arm
would still 400). ParseUrl is on HEAD; the dirty `index.ts` slice is Q2
`requireDurableReplay`, not this control.

## Q1 caller/mutation (scoped)

CONFIRMED refused for the four named callers:

- discovered package directory names do not mutate a cmd.exe command string
- unauthenticated `/nope` does not mutate audit reservation/capacity
- manifest `keyId` does not mutate Ed25519 pubkey path outside `governanceDir`
- malformed `//[` does not mutate process lifetime via `unhandledRejection`

## Q2 leftover work/capacity (scoped)

CONFIRMED:

- leftover mandatory-audit capacity after unknown-path 404s remains
  usable (`/health` 200 at `capacity: 1`)
- durable-replay leftover work is still leftover: `ADMITTED_DURABLE_REPLAY_STORES`
  is empty; `isAdmittedDurableReplayStore(MemoryReplayStore)=false`;
  dirty `createApiServer({requireDurableReplay:true, webhook})` throws
  `production durable replay is outstanding`. RD-1286 backend is not
  fabricated. That is **not** 124-scan closure and **not** this H4 claim.

## Residuals (not findings against the four named claims)

- Rebuild still interpolates `name` into `dist/<name>.wasm`; `dir` remains
  a filesystem argv path for child `galerina.mjs build --package`. Child
  argv interpretation is not this shell claim.
- Best-effort `auditSink.emit` on **matched** non-mandatory routes still
  shares InMemoryAuditSink capacity. Drained evidence retains capacity
  until `takeDrained()`. Default capacity is 1024, not 1.
- Hybrid `hybridVerifier` still receives the raw `keyId` and `packageDir`.
  An injected verifier that treated `keyId` as a path would be host-owned.
  Hybrid unverifiable still degrades to unsigned; revoked asserted keyId
  is separately refused under `allowUnsigned`.
- `parseUrl("/[")` is admitted as path `/[`. Some targets may be rejected
  by Node’s HTTP parser before the adapter. Null-byte / backslash refuse
  in `parseUrl` are extra to the named `//[` case.
- Tests execute gitignored `dist/`. Dist is not stale vs src on this tree
  (kernel/fuse-loader/api-server dist mtimes 2026-09-22T16:25Z, src older;
  dist contains `runtimeReport` reserve, `SIGNING_KEY_ID`, `RequestTargetError`,
  `requireDurableReplay`).
- Inventory still lists these four as `PATCHED_AUDIT_PENDING`. This receipt
  does not reclassify them. 69 OPEN / 51 PARTIAL remain. Overall
  **INCOMPLETE_NON_AUTHORITATIVE**.
- Three-boundary Q1 WAT secret-return caller mutation and nested flatten
  residuals are out of this named four-high scope.

## Classification

No `CONFIRMED_FINDING` on the four named highs. Detectors are not invalid.
Evidence is sufficient for argv+`shell:false`, 404-capacity leftover,
path-shaped keyId refuse, and `//[` 400-without-unhandledRejection.
Insufficient for scan closure, production admission, RD-1286 durable
replay, hybrid-verifier path hygiene, and compiler-argv / filesystem-path
hostility.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
