# Independent audit — production/deterministic host `grantedEffects` required

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: source-declared effects are not production runtime
authorization.

- production and deterministic modes require host `grantedEffects`
  whenever the target flow declares any effect (`FUNGI-RUNTIME-GRANT-REQUIRED`).
- `CapabilityHost` authorizes the intersection of `declaredEffects` and
  `grantedEffects` when `grantedEffects` is present.
- Development may omit `grantedEffects` (declared-only).

Scan `csf_97aa94f1a74c506b55bcb1a1` remains **PARTIAL_THIS_TREE**.
Inventory on this tree: **88 OPEN / 32 PARTIAL / 4 PATCHED**. This is
**not** 124-scan closure and **not** production admission. JSON-Decimal,
OAuth, durable replay, signing, and `.fungi` admission were not started.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Tests
import `../dist/index.js`. `dist/` is gitignored
(`packages-ts/.gitignore:5`). This reviewer did not rebuild.

Named sources match HEAD blobs. Dist mtimes are newer than those sources
and contain the same grant gate / intersection check.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/runtime.ts` | `b9784ac93d615ceb1e51d1c0cec20148e70ed1de946bf773757fa4948761352f` |
| `packages-ts/galerina-core-compiler/src/runtime/capabilityHost.ts` | `9440e7ec177a9b6588e0bd0320f2386f852df6aa30da5e0273a7e8627e2228a9` |
| `packages-ts/galerina-core-compiler/tests/capability-host.test.mjs` | `c66b32980b8ee2fc989d442bd9ede358600f38c417bb0817464fc54aab077f66` |
| `packages-ts/galerina-core-compiler/dist/runtime.js` | `07581714b3429e1db9b6b8c750569be8fe6b80c5866f5c7374d3748a7c3d1b6a` |
| `packages-ts/galerina-core-compiler/dist/runtime/capabilityHost.js` | `63bb6bd36d74d1203fa7c1a97e5e4fac59538cd4d44fb03a7f140dfc37f6d7d4` |
| `packages-ts/galerina-core-compiler/dist/index.js` | `aa1d0a517aaa298ee40d5c32f18146cd875b68477b3f846c3e1ac0017eecfe5f` |

Author-declared hashes match the three named files. Git blobs for those
three equal HEAD (`9dbcda2c…`, `0efc1efd…`, `947101ac…`). Dist is not in
HEAD. Dist `runtime.js` 184–216 and `capabilityHost.js` 122–134 match the
source grant / intersection logic. `dist/index.js` re-exports `run` /
`serve` from `./runtime.js` and `createCapabilityHost` from
`./runtime/capabilityHost.js`. Passing tests here are **not** production
admission.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded owner decisions`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| production/deterministic require host `grantedEffects` when the target flow declares any effect | `run()` `runtime.ts` 309–327: `productionAuthority = mode === "production" \|\| mode === "deterministic"`; if `productionAuthority && declaredEffects.size > 0`, `snapshotGrantedEffects(options.grantedEffects)` must succeed or the run returns `ok: false` with `FUNGI-RUNTIME-GRANT-REQUIRED`. Dist `runtime.js` 184–201. Suite + independent leak flow |
| source declarations do not grant | diagnostic message: `source declarations do not grant effects`. Independent production missing-grants reason `missing` |
| `snapshotGrantedEffects` is host-owned and snapshotted before dispatch | `runtime.ts` 113–126 / dist 32–46. `undefined` → `missing`; non-array → `grantedEffects must be an array of strings`; empty-string entry → `grantedEffects entries must be non-empty strings`. Independent: `Set` and `[""]` both GRANT-REQUIRED |
| `CapabilityHost` intersection when `grantedEffects` is present | `capabilityHost.ts` 212–224 / dist 122–134: declared first, then `grantedEffects.has`. Suite host-granted deny; independent intersection allow/deny |
| development may omit `grantedEffects` (declared-only) | `runtime.ts` 329–337: only snapshots grants in non-production when the option is present; otherwise `grantedEffects` stays `undefined` and is omitted from `createCapabilityHost`. Test helper `makeHost` (test 21–26) never passes grants. Independent: `mode:"dev"` and default mode run the leak flow `ok: true` with no GRANT-REQUIRED; `makeHost(["database.read"])` allows `database.read` |
| pure production flow does not invent grants as authorization | suite `admits a production flow with no declared effects without inventing grants`. `runtime.ts` 332–334 sets `grantedEffects = new Set()` only when production authority and `declaredEffects.size === 0`. Independent pure `answer` production/deterministic `ok: true` |
| 124-finding scan | **not this claim**. `csf_97aa94f1a74c506b55bcb1a1` stays PARTIAL_THIS_TREE |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core-compiler/tests/capability-host.test.mjs`
   → **11/11 pass**, `fail 0`, `cancelled 0`, `skipped 0`,
   `duration_ms 336.3861`.
   - `check() — host-granted effects` / `denies a declared effect that the host did not grant` — **green** (0.2046ms)
   - `production run — host grants required` / `refuses production execution of a declared effect without grantedEffects` — **green** (18.8351ms)
   - `production run — host grants required` / `admits a production flow with no declared effects without inventing grants` — **green** (5.9352ms)

Independent extra probe (`%TEMP%\galerina-grant-required-probe.mjs`; not
production; imports this tree’s `dist/index.js`):

- production leak without `grantedEffects`: `ok: false`,
  `FUNGI-RUNTIME-GRANT-REQUIRED`, message reason `missing`
- deterministic leak without `grantedEffects`: `ok: false`, same code
- production leak with `grantedEffects: ["network.outbound"]`: `ok: true`,
  value int `1`
- production leak with `grantedEffects: []`: snapshot succeeds; `ok: true`,
  value int `1` (flow does not invoke the effect; see residual)
- production `grantedEffects: new Set([...])`: GRANT-REQUIRED,
  reason `grantedEffects must be an array of strings`
- production `grantedEffects: [""]`: GRANT-REQUIRED,
  reason `grantedEffects entries must be non-empty strings`
- production/deterministic pure `answer`: `ok: true`
- `mode: "dev"` and default options leak: `ok: true`, no GRANT-REQUIRED,
  default `mode === "dev"`
- `makeHost(["database.read"])` allows `database.read`; denies undeclared
  `network.outbound` (`not declared`)
- host with declared `{database.read, network.outbound}` and granted
  `{database.read}`: read allowed; outbound denied (`not granted by the host`)
- host with declared `{database.read}` and granted empty set: read denied
  (`not granted by the host`)

Leak-flow diagnostics also include `FUNGI-EFFECT-007` and `FUNGI-TIER-001`.
Those do not deny the granted/dev runs and do not substitute for
GRANT-REQUIRED on production missing grants.

## Residual — do not claim closed

Development still authorizes declared-only. That is in the named claim
(`Development may omit grantedEffects`) and is why
`csf_97aa94f1a74c506b55bcb1a1` stays **PARTIAL_THIS_TREE**, not PATCHED.
`makeHost` in the suite is the declared-only residual.

GRANT-REQUIRED is a **presence/shape** gate on `options.grantedEffects`,
not an admission check that host grants cover every declared effect.
Production `grantedEffects: []` admits the unused-declaration leak flow.
Actual capability calls still hit the intersection deny (empty grant set
denies `database.read`).

`serve()` listener admission (`admitRuntime`) does not require grants.
The gate is inside `run()`. A production listener can still bind; the
GRANT-REQUIRED early return has no `execution`/`value`, so the request
callback fail-closes with `admitted route … refused during execution`.
Not started as a suite case.

Malformed grants in **dev** (`runtime.ts` 329–331) are ignored
(`if (snap.ok) grantedEffects = snap.grants`), leaving declared-only.
Production/deterministic do not take that branch when declarations exist.

This is **not** 124-scan closure. Inventory remains 88 OPEN / 32 PARTIAL
/ 4 PATCHED. Overall scan status remains **INCOMPLETE_NON_AUTHORITATIVE**.

Deferred / not started: JSON-Decimal, OAuth, durable replay, signing,
`.fungi` admission, independent production-clearance ceremony.

## Overall

**PASS** of the named production/deterministic grant-required claim on
this dirty candidate.

`run()` requires a successful `snapshotGrantedEffects` whenever
`productionAuthority && declaredEffects.size > 0`. Dist is not stale for
that gate. CapabilityHost intersects declared and granted when grants are
present. The named suite is 11/11, including production GRANT-REQUIRED
and host-granted deny. Independent probes reproduce production leak →
`FUNGI-RUNTIME-GRANT-REQUIRED` and the declared-only `makeHost` allow.

Do not treat this as PATCHED of `csf_97aa94f1a74c506b55bcb1a1` or as
production admission. Development declared-only authorization remains.
