# Outstanding work and blockers — 2026-09-23

**Overall:** INCOMPLETE_NON_AUTHORITATIVE. At this reconciliation,
Galerina `main` is `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7`, one local
roadmap-document commit ahead of `origin/main`; the checkout remains dirty.
Source, tooling, and tracker checkpoints through `bf1071f24` were pushed.
This is not production admission. The scan inventory JSON still binds
candidate HEAD `91b4dec0…`; its 0/120/4 split is historical classification,
not a fresh independent audit of `e8f1b682`.

GROK-CODING-BATCH-READY Phase A + Phase B are complete. Later continues
also landed WAT metering, CBOR-subject verify, native FIFO refuse, and
`__range` guest-memory/fuel. Those do not close items 1–15.

## Blockers (owner action required)

| Blocker | Why it stops progress | Owner action |
|---|---|---|
| Remaining Git custody | Bounded source/tooling/tracker commits landed, but generated output, `.fungi` overlays, TriRegex mirror and untracked audit evidence remain | Review exact paths and preserve audit provenance; no blanket commit |
| KB pin | `kb-guards.yml` pins `dc05e30a…`; Galerina is now `e8f1b682…` locally | Advance only to a reviewed, clean candidate or explicitly retain lag |
| Production admission | Independent receipts are scoped PASS/HOLD on a dirty tree | Clean HEAD + separate admission review |
| Durable replay backend (RD-1286) | Empty admit-list is the v1 gate; no fake store | Reopen RD-1286 |
| JSON Decimal (RD-1289) | Integer-only encoder preserved | Reopen RD-1289 |
| OAuth / OpenAPI CLI | App Kernel remains bearer/public | Reopen that contract |
| Constitution | DISCUSSION_DRAFT / NOT_ADOPTED | Version/adopt, or leave draft |
| `.fungi` conversion | Global stop | Lift stop after pinned producer + PROJECT READY |
| Signing ceremony | No keys in this batch | Owner keys + ceremony |
| Physical durability / photonic hardware | Simulation is not hardware | Hardware evidence |
| RD-0361 R4 / SLIDE-VOK | Twin audit is not authority flip | Owner nod, digest reproduction, no silent `.ts` retirement |
| RD-0349 I5–I6 | Scale must be sourced | Admit metal/crypto/Rate tables or leave HOLD |
| RD-0363 P1 signer | `planSignature` stays INDETERMINATE | Authorize Ed25519/ML-DSA verifier seam |
| RD-0364 BitNet pin | `infer` still runs 16-trit demo | Supply weights hash + pin |
| RD-0365 vault/TPM | Envelope is not attestation | Vault move; L3/L4 are post-v1 |

Windows-native FIFO is **NOT VERIFIABLE** (Node omits `O_NONBLOCK`). That is a
platform gap, not a missing owner decision.

## Outstanding engineering (implementable under current stops)

Scan `0f6063dd` is inventoried **124/124 IDs**
([disposition](scan-0f6063dd-disposition-2026-09-22.md),
[reconciliation](documentation-reconciliation-2026-09-23.md)).
Every PARTIAL_THIS_TREE id is in that disposition table and cited from
[TODO.md](../TODO.md) resolution continuation. Markdown `- [ ]` census:
**2043** open boxes in **88** files; **`docs/TODO.md` has 242**. Those
historical rows remain HOLD.

| Disposition | Count |
|---|---|
| PATCHED_AUDIT_PENDING | 4 (the four highs; not re-proven at current lines) |
| PARTIAL_THIS_TREE | 120 |
| OPEN_ON_SCAN_SNAPSHOT | **0** (0 high / 0 medium / 0 low) |

Item-7 OPEN lows are exhausted on the old inventory snapshot. Tower's
load-graph bounds are in committed source; focused Tower typecheck and
load-graph/isolation/product tests passed **86/86** at `e8f1b682`.
The older `E01/RD-1296` label conflated two owners: Tower composition/load
graphs belong with **RD-1295**; **RD-1296** separately tracks compiler secret
arena/return ABI and nested contextual record admission. Nested `#record`
field obligations now recurse (`tryRecordLiteralAdoption`; independent
`01a0d00e-6950`). Remaining RD-1296: generation reuse (intern/alloc monotone). Default wrap
without `returnLayouts` stays flat. Wrap `returnLayouts` landed
(`01a0d059-f944`). `MAX_RECORD_COPY_NODES` live exhaustion
(`01a0d04f-f67a`). Secret nested layout copy (`01a0d049-36a5`). Nested
`copyArrayRecordsLayout` (`01a0d03f-69a6`), array-of-record copy
(`01a0d034-251d`), internResult intern-by-copy (`01a0d02a-a373`),
host-registry snapshots (`01a0d021-6244`), exact typed return copy
(`01a0d019-1a67`) landed. Q1 flatten still bypasses `checkTypes`.
TYPE-008 stays advisory on plain check. The claimed Tower
composition identity gap was challenged at `e8f1b682`: Q1 **NO_DEFECT**
(frozen string composition API); Q2 **NOT VERIFIABLE** as a production
check-then-load sequence. No ceremonial snapshot was added. RD-1295 is not
closed. Historical `docs/TODO.md` **242**
`[ ]` rows stay HOLD. Absence of OPEN scan rows does not close PARTIAL
rows, PATCHED highs, items 1–15, or production admission.

App-kernel no longer imports the Tower root barrel: `kernel.ts` uses
`/governance`; registry modules use `/custody` (and `/governance` for trit
fold). Focused app-kernel **46/46**; Tower product-line **87/87**.
Independent scoped PASS `01a0cf3f-d35d`.

WAT P9.4 type-directed `length` and interpreter `tryWhileFastPath` landed
on this dirty tree (independent PASSes `01a0cfaa-6cec`, `01a0cfb6-5079`).
Neither the WAT emitter nor the runtime interpreter is closed.

RD-0361 / RD-0349 / RD-0363 / RD-0364 / RD-0365 remain HOLD (R4, sourced
Commodity/Crypto scales, plan-signature verifier, BitNet pin, vault/TPM).

Implementable next under current stops: PARTIAL residuals with a
hostile/positive pair. Tower package-split and compiler RD-1296 stay
separate. Decimal `/` `%`, C20 `matchesPattern`, and signing stay HOLD.
Four PATCHED highs stay `PATCHED_AUDIT_PENDING` (not re-proven at current
lines): `csf_7c334da06ea43bf62f7b58f9` signed-lmanifest spawn,
`csf_2a86648bf19537088fa9b394` kernel audit capacity,
`csf_176f3d7332761399dac3c39d` fuse-loader key path,
`csf_abb8e005fb7ba36366169ba5` async request error boundary.

Residuals on already-landed slices:

- Recursive flatten deeper than one closed expansion drops grandchild secrets
- WAT emitter: Decimal fail-closed; C20 `matchesPattern` interpreter-only; leftover stmt kinds trap (`01a0cfaa-6cec`)
- Interpreter: Decimal `/` `%` unsupported; sync path defers stdlib; ineligible loops stay on the walker (`01a0cfb6-5079`)
- WASM host records 4096; `seedString` densely fills holes (`01a0d074-2833`); `__range` meters before allocate (`01a0e2ba-599c`); empty `__range` store pre-check (`01a0e2ce-444e`); `csf_e3409dfe75ff7adda18f556a` stays PARTIAL (ranges still live in host JS arrays)
- Native `LINUX_FIFO_REFUSED` not reached on a non-admitted WSL host
- `galerina verify` success banner is after signature/revocation (`01a0cd1e-52ec`)
- Hardware TTY echo **NOT VERIFIABLE**
- `Array.range` charges Interpreter `stepBudget` before allocate; direct `callStdlib` without `chargeSteps` refuses above 4096 (`csf_03064225783c475027bf7f5b` stays PARTIAL; independent `01a0d06a-3160`)
- Webhook replay claim is before `kernel.handle` rate; capacity maps to malformed/500
- Import memo still duplicates nested `symbols` on double-import; no module/edge/depth caps
- Run-eval is still a regex runner; recursion/depth refuse as empty string (`01a0cd57-b0a5`)
- Intelligence 4096-file ceiling not live-exercised; oversize cache rebuilds rather than a named refuse
- Package-graph scanner can still return a narrowed graph; the gate refuses omitted src/host with code (`01a0cd65-becd`)
- Kernel idempotency still keys the unsigned header; webhook replay is body-MAC bound
- `verifyChain` omitted key returns false; writer omission throws `EGR-KEY-002`; PCI `readEgressBatches` still defaults ZERO_KEY; empty `Uint8Array` is HMAC-equivalent to 32 zeros without `strictKey` (`csf_0f748088754ddb920ceb641f` stays PARTIAL; independent `01a0d003-1eab`)
- Authorized `Env.get` still returns a plain string; `env.secret` is the secure tag (`01a0cd74-5201`)
- Typed-content injection `locationAt` still scans from 0 once
- Capability grant mask is still cached once (`#capabilityResolved`); `ownSignedGrant` getters fire once (`01a0cd83-ed46`)
- Logger truncates `msg` at 4096 chars, MemoryLogSink drops oldest under 1 MiB, JsonLineSink caps the serialized line at 4096 (`csf_fd74b2a34bfe325906af1691` stays PARTIAL; independent `01a0d061-70c5`)
- Compute `free` still 0xFF-fills; TPL constructor initialises REJECT
- Snapshot scrub has a crash window between zero and unlink; no glob of all `*.tmp`
- `PowerGovernor.read()` throws `LSP-READ-001` on non-finite; throwing sensor still propagates unwrapped (`csf_e145f9dfd60df70053acdab4` stays PARTIAL)
- Git `--end-of-options` is unused; hex SHA cannot look like an option
- Pool views are still ptr+length, not WeakMap slice identity
- `effectsOf()` indexes `declaresEffect`; indexes rebuilt per call; no duplicate-key scan (`csf_b7c875ed001f66b8abedfc85` stays PARTIAL)
- `writeReportFiles` after link-refuse is still TOCTOU vs replace
- PCI flow-span brace matching ignores braces inside strings/comments
- Package scan file 1 MiB / total 32 MiB; lstat→read TOCTOU remains; 32 MiB total not live-exercised (`csf_d6acd81d895092a4750e52bf` stays PARTIAL)
- Task `stat` follows symlinks; brace matcher ignores strings
- `fmt` TOCTOU between lstat and writeFileSync
- Relink `mkdirSync` still creates scoped-name parents (`01a0cdc3-aeae`)
- verifyBuild `readFileSync` after lstat is TOCTOU
- Effect-name audit still skips `self-hosted/` and regex-extracts names (`01a0cdd4-bd9d`)
- Duplicate-key scanner is a hand JSON walker; `runners.ts` reads evidence before the 8MiB cap
- Signed-frozen is `git show HEAD:rel` shape, not Ed25519 verify
- Sibling boundary-graph copies may still differ (`01a0cde3-a072`)
- Gate-injection paren matcher ignores strings/templates
- wasmCrossCheck JSON visit is unbounded
- `O_NOFOLLOW` is undefined on this Windows Node (`01a0cded-ac4f`)
- emit-doc-wat read-after-admit is still TOCTOU
- Fuse `basename(dir)` fallback when JSON name is missing
- collectFungiFiles write TOCTOU (`01a0cdfa-c64a`)
- Mixed WASM SKIP+VALID still exits 0
- Conversion-queue has no fd identity after path admit
- PCI ledger HMAC still defaults to ZERO_KEY (`01a0ce08-1919`)
- markdown() does not strip HTML comments beyond `<>`
- Logical clock overflow uses Number, no bigint ticks
- GOPD traps can still lie at authorization snapshot time (`01a0ce15-8fbe`)
- Staged SLIDE tool is still path-spawn, not fd-exec
- Graph collect fail-closes if `lstat` is missing
- Private-doc-leak Unix 8-bit wrap NOT VERIFIABLE this host (`01a0ce80-aa32`)
- Provenance collect TOCTOU after lstat; no fd identity
- `renderFileReceiptsMarkdown` still leaves `sourceFile` unescaped
- Promote write after lstat is TOCTOU; no list-file digest pin
- Corpus scanner lstat→read TOCTOU; unreadable dirs still skip (`01a0ce92-298e`)
- `syncToPhysical` captures `bootTick` from `now()` without a finite check there
- Addon pin is still path-`require` of a staged copy, not fd-exec; successful load may leave temp
- Pure-flow LRU is still process-wide; `canonicalHash(flowNode)` omits imported helpers; SHA-256 still indexes the LRU (`01a0ceda-70d7`). Scan `csf_456107f3e63d6f916462d1bf` stays PARTIAL. Not PATCHED.
- WAT lowering lstat→read TOCTOU; `--self-test` Decimal f64 anchor already drifted on this dist
- rebrand write-after-lstat TOCTOU; `git mv` is still path-based
- No-resolver webhook kernel 401 still claims (`01a0ceb0-608e`)
- Registry lstat→open TOCTOU; brand write-after-lstat TOCTOU
- Provenance is still regex, not CFG (`01a0ceb6-d420`); RD-1304 remains
- Conformance trailing `//` and dead strings can still match
- migrate-fungi import still builds SIGNED_DIRS; write TOCTOU

## Programme holds (not this dirty-tree batch)

PROJECT READY / semantic-assurance dirty provenance. Historical root TODO
checkboxes (~242+). SLIDE/VOK/Lyth admission. C20 general matcher. Tower
package-dep extract. inferType unknown default.

## What would change this list

A named-path commit with retained evidence custody, a reviewed KB pin,
reopening RD-1286/1289/OAuth, source-backed RD-1295 or RD-1296 work, or
bounded PARTIAL residual work.
