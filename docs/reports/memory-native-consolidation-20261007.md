# Native memory consolidation evidence

Date: 2026-10-07. Candidate base:
`8cbb790646f6a7dad23985ab5e860feb167329b2`.
The commit introducing this report binds its final source and generated files.

## Custody and scope

Phillip authorized committing, pushing and merging eligible Galerina memory
work. The prior source branch at `5cb651189a3d693d96a350c1891518de39d1f6e5`
was merged into the consolidation branch and published to main at the base
above, after the core-security 21-test and auth/compiler 82-test checks passed.

This candidate reconciles 37 legacy source/test/tool paths plus one new helper
regression file. It includes typed auth-route response shape, SecretLease
refusal, generic argument kinds, interpreter deadline enforcement, closed
non-secret Wasm effect-grant admission, Rust arena cleanup observations,
WAMR import/context probes, WIT mirror generation and diagnostic discovery.
It is not production admission of secret-bearing Wasm operations.

## Independent review and correction

Astra task `01a11642-55bd-7c23-9ccc-587f10444bf9`, review turn
`01a1183a-16bb-78a1-8f49-a813b5afa09c`, found a helper return-context regression.
The new helper handling inherited the enclosing flow's result type. Exact
source tests reproduced three failures: false refusal of a secret-preserving
helper, missing refusal of a secret-to-public helper inside a secret-returning
flow, and an extra false positive before an outer return.

The correction shares the callable context save/establish/restore block,
including secret-control depth and finally-based restoration. The five new
tests pass, including public controls and outer-context restoration. The
follow-up is submission `01a11842-ea74-7023-8a38-fcfde24c889f` and returned PASS
for the narrow correction: 129 focused tests and six independent context
probes passed, including an in-memory reversion reproducing the prior failures.
Reply identity: `msg_0617df87b65142c5016ac6ba317e9887d282d8ff1fd5c1c128`.
Reviewed checker SHA-256:
`A9F8C4E910F561A6F34B5C66D9319D9AE7750471D908EA2AC3FF5669570AB05A`.
Reviewed helper test SHA-256:
`58D3D7882CDC784EE09DAA1715A18987965EEA9D2FBDA3197B1660B6D5C4CDBE`.
The prompt and received reply are retained in the coordinating chat workspace;
their file digests are respectively
`9AC5DA058515B618D308CB04A27292C448A0A93EEBCD627F6E039666536066F3`
and `263CB70364C78F5FEC7EFCDA40E3BAC8A8BF15179E03C478CE99676D7BB23025`.
The implementation session independently reproduced the finding and verified
the correction. Astra cleared preservation by commit/push, but recommended
holding main integration pending the two broad-verification dispositions below.

## WSL local verification

No GitHub CI was invoked. Successful checks on this consolidated source:

- Compiler build, including the evidence receipt for 935 tracked inputs.
- Focused compiler/value-state/auth-route/Wasm admission set: 294 passed after
  the helper correction.
- Runtime-Wasm suite: 72 passed.
- Secrets-vault build and suite: 34 passed; generated WIT mirrors checked.
- Diagnostic/index generator tests: 10 passed.
- Native VOK Rust default test command passed; explicit ignored Linux arena
  tests passed (six library tests and two integration tests).
- WAMR 2.4.5 SDK probe passed signature, unknown/non-function import refusal,
  per-instance context isolation and missing-context refusal checks.

The non-compiler checks preceded the final helper-only correction; their
source paths were not changed by that correction. These are scoped receipts,
not a whole-estate test pass or independent proof of a live protected operation.

## Incomplete broad verification

The frozen Codex-zone assertion T14 in the Q5N D7/D8 refusal test still fails.
Expected digest: `7db668236da13ad6e898bd7ab125e67c096b8b4ca2aeea861698fb1c2a649c9f`.
Observed digest: `d0b7917b0cb79ed19965945807e5bea45c61250bf0f2d0849586ca87f9b87e71`.
The failure was independently reproduced on the preceding clean source branch;
the emitter blob is unchanged across main, source and this candidate. The
frozen expected digest was not repinned to manufacture a pass.

A full compiler npm test attempt was stopped after a child Git fixture
inherited process-local WSL GIT_DIR/GIT_WORK_TREE and inserted a shared
core.worktree setting. The erroneous entry was removed; candidate HEAD,
reflog and staged path set remained unchanged, and the legacy staged-tree
identity remained exact. The broad run also emitted a failure named
"classical CLI refuses a legacy CBOR signature and an untrustworthy revocation
registry" before interruption. Its cause is not adjudicated here. The broad
run is INCOMPLETE, not a suite pass; further broad testing must isolate Git
fixtures from the checkout. Subsequent focused tests ran with both variables
unset and passed.

The repository project-graph refresh entry could not run in this checkout:
the core-cli built entrypoint is absent. No project-graph freshness claim is
made. Diagnostic code-index/registry generation is a separate check, and an
external codebase graph refresh must be bound to the eventual committed head.

## Meaning and next action

Commit/push preserves reviewed scoped work; main integration of this native
candidate is ON HOLD for the classical-CLI failure and frozen T14 mismatch.
Do not equate
source publication, component passes or branch closure with RD closure.
Fungi is a new language whose memory rules can be designed deliberately;
TypeScript remains bootstrap implementation evidence, not a ceiling on Fungi.
Attested-host protection, the complete protected-operation authority chain,
provider/revocation/output ordering and the exact private acceptance mapping
still need their own source-bound end-to-end evidence.
