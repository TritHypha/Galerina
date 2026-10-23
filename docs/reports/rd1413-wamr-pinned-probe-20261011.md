# RD-1413 WAMR pinned probe receipt — 2026-10-11

## Scope and identity

This receipt records a fresh WSL execution of the repository's native WAMR
probe runner against the current dirty integration checkout. Galerina was on
`main` at `c46e1e01b4c33fa6d540550482deaf4b44dcc7c6`; the native helper and
probe files listed below were working-tree inputs, not committed source. No
GitHub Actions or CI ran.

The runner verifies the pinned WAMR headers and `libiwasm.a` digest, plus
`wat2wasm` and GCC versions, before compiling the helper and running probes.
It exited **0**. The artifact digest checked by the runner was
`f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d`.
The prior build record identifies WAMR commit
`25bd7eb63e828e4bd242cc9b38d260b4b31c6605`, Linux product-mini x86_64 Release,
`-DNDEBUG`, reference types and SIMD. This execution rechecked the pinned SDK
and probe; it did not rebuild WAMR from source.

## Current source SHA-256

- `packages-ts/galerina-core-runtime/native/wamr-host/include/wamr_import_admission.h` — `6A6D8B612171812BDAB62996DD1042854B379AB63DE10FAECE1039355F0A6405`
- `packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_import_admission.c` — `FD6A19E36758E7359375C4EBF6C8117667B168827DF968D5D1ADEFD745EDD15D`
- `scripts/tests/rd1413-wamr-context-probe.c` — `D933257E4AB2937C75941D8AF33DE5A7D1294C62CD2A24046B821B1B1BB6DB8E`
- `scripts/tests/run-rd1413-wamr-context-probe.sh` — `831A7F31D7491AD0FA129EB451288B6CA6AD8CDEE8E57DF107956D7012AF8711`
- `scripts/tests/rd1413-wamr-externref-result-probe.wat` — `060A2AED2A5D0BAFCA5FDA55C101E533641DF473792E1981A93F63B0C6462006`
- `scripts/tests/rd1413-wamr-duplicate-import-probe.wat` — `17F55E1B4E0B162093A612CEB856B0FC8CC247A4BE869962FCED0795D14456D0`
- `scripts/tests/rd1413-wamr-unlinked-import-probe.wat` — `4D750C65449E6E987FFDF0DC8164D657FA5C8ADE023DD8B0C33424FFB43E9ABA`

## Exact runner output

Runner exit status: `0`.

```text
PASS: host ABI gate rejects invalid valkind bytes and unsupported result kinds
[07:15:08:942 - 710DF05CE780]: failed to check signature '()i' and resolve pointer params for import function (host, operation_context)
PASS: WAMR import metadata exposes the mismatched i64 -> i64 signature before instantiation
PASS: host ABI gate rejects mismatched imports before instance creation
PASS: host ABI gate rejects imports outside the closed allowlist
PASS: host ABI gate rejects non-function imports before instance creation
PASS: host ABI gate rejects duplicate module imports
PASS: host ABI gate refuses a matching but unlinked native import
PASS: per-instance context isolation, missing-context refusal, and mismatch callback refusal
PASS: host ABI gate classifies an externref result as a signature mismatch
PASS: WAMR probe refuses an oversized Wasm input before allocation
PASS: WAMR probe accepts and fully reads a fixture exactly at its size bound
```

The warning is expected for the deliberately mismatched import and was not
suppressed. Temporary modules and probe executable are removed by the runner's
cleanup trap; their hashes are not retained.

## Independent adjudication and limits

Astra worker `01a12b7c-c3a4-7341-ac42-e733629ca466`, follow-up submission
`01a12bdc-778b-7362-87a7-b9e0a9ca283b`, accepted (1) the exact pinned Release
build/artifact claim on the supplied build receipt and (2) the narrow externref
fail-closed claim for that profile. This is advisory review, not authorization.

The externref fixture is rejected as `SIGNATURE_MISMATCH` before instantiation
and without native registration or call. That does not establish that the
result-kind accessor is correct: a valid externref kind and an unsupported-kind
sentinel can lead to the same mismatch. Assertion-enabled and other
non-pinned configurations remain unsupported/unverified. The raw WAMR build
log, resolved built-artifact path, effective build configuration and compiled
helper-C hash from the earlier build are not retained here; replayable build
provenance remains open.

This probe covers ABI admission and bounded context behavior only. It does not
wire the helper into a production Fungi runtime, establish protected-memory
custody or cleanup, or close RD-1413, RD-1414 or RD-1415.

## 2026-10-13 current-integration rerun

The pinned runner was rerun from the current dirty integration checkout at
`823c8bc30c34a354e033f597f6477d258e0de488`, with `GIT_DIR`, `GIT_WORK_TREE`,
`GIT_INDEX_FILE` and `GIT_COMMON_DIR` unset. It exited **0** under WSL using
GCC `15.2.0`, WABT `1.0.36`, and the pinned WAMR headers and library. The
library SHA-256 again matched `f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d`.

Current input SHA-256 identities:

- `packages-ts/galerina-core-runtime/native/wamr-host/include/wamr_import_admission.h` — `6A6D8B612171812BDAB62996DD1042854B379AB63DE10FAECE1039355F0A6405`
- `packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_import_admission.c` — `FD6A19E36758E7359375C4EBF6C8117667B168827DF968D5D1ADEFD745EDD15D`
- `scripts/tests/rd1413-wamr-context-probe.c` — `2677B47FE8EEFC95AA230CCD04314CE74E598D97DBBAC1281C2C05EC05C881E1`
- `scripts/tests/rd1413-wamr-init-failure-wrap.c` — `5224DF3794A46D1DBD783401159C8E211B2065B12CE5C6E4A12923DAA3EF72B3`
- `scripts/tests/run-rd1413-wamr-context-probe.sh` — `8944997CB828D729490100934D67EB03495183E9C3571EBB7A7B7711AA1AE4C6`
- `scripts/tests/rd1413-wamr-context-probe.wat` — `605B365B15951D5A3CA5BCFD1A4785E60169A2E1E409A6E4676AFB495F91FEC4`
- `scripts/tests/rd1413-wamr-context-mismatch-probe.wat` — `FCCDFC7D1D58F4B049D1F1C51FC7D0866D7FDC0DAD894BE88705573DD5BAF0B5`
- `scripts/tests/rd1413-wamr-unapproved-import-probe.wat` — `5C30F858ECD43488C5E9015AE96123ED71D9F5C09D127FD6999A34571BB6D217`
- `scripts/tests/rd1413-wamr-nonfunction-import-probe.wat` — `B816173F1AE7A2C2DE42A22BC52123F17E0B8D17EF0E03E2971F97E9DE9B881C`
- `scripts/tests/rd1413-wamr-duplicate-import-probe.wat` — `17F55E1B4E0B162093A612CEB856B0FC8CC247A4BE869962FCED0795D14456D0`
- `scripts/tests/rd1413-wamr-unlinked-import-probe.wat` — `4D750C65449E6E987FFDF0DC8164D657FA5C8ADE023DD8B0C33424FFB43E9ABA`
- `scripts/tests/rd1413-wamr-externref-result-probe.wat` — `060A2AED2A5D0BAFCA5FDA55C101E533641DF473792E1981A93F63B0C6462006`

Observed controls: invalid value kinds/unsupported results, mismatched imports
before instantiation, disallowed/non-function/duplicate/unlinked imports,
per-instance context isolation and callback mismatch, externref-result
classification, oversized-input refusal, exact-size input acceptance,
registration-refusal destruction, and init-failure ordering (including the
externref path). The deliberate mismatched-import WAMR diagnostic was emitted
as expected. The runner's generated modules and executable were confined to
its `mktemp` directory and removed by its cleanup trap.

This refreshes only the pinned probe result for the exact listed dirty source
inputs. It does not reproduce the WAMR build from source, retain raw build
provenance, prove native production runtime wiring or protected-byte custody,
or close any RD. No repository source or generated index was changed by the
probe run; no GitHub Actions/CI ran.

## 2026-10-13 pinned WAMR source rebuild and probe

The WAMR source checkout was clean at commit
`25bd7eb63e828e4bd242cc9b38d260b4b31c6605`. A new, previously absent local
build directory, `build-galerina-repro-20261013/`, was configured from
`product-mini/platforms/linux` with CMake `4.4.3`, GNU C/C++ `15.2.0`, Release
`-O3 -DNDEBUG`, Linux `X86_64`, interpreter enabled, fast interpreter/AOT/JIT
disabled, built-in/WASI libc and pthreads disabled, multi-module disabled,
reference types and SIMD enabled. The `vmlib` target was built with two jobs.
The build completed; WAMR emitted one non-fatal `-Wunused-variable` warning
for `frame_ref_before_pop` in `wasm_loader.c`.

The rebuilt `build-galerina-repro-20261013/libiwasm.a` SHA-256 is
`f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d`, exactly
matching the runner's pinned library digest. The current Galerina probe runner
was then rerun against this rebuilt library (not the prior SDK copy); it exited
**0** and emitted all 14 expected PASS markers. The deliberate mismatched
import diagnostic remained visible. Galerina input hashes are listed in the
preceding current-integration rerun section.

This supplies source-commit/configuration-to-artifact reproducibility for the
pinned WAMR archive and reruns the bounded native probe against that artifact.
It does not mean the helper is production-wired, prove a protected Fungi memory
operation or byte custody, or close RD-1413/1414/1415. No GitHub Actions/CI ran.

### 2026-10-13 exact-artifact rerun and externref assertion configuration

The source rebuild is present under the WAMR source checkout at
`build-galerina-repro-20261013/`, clean at `25bd7eb63e828e4bd242cc9b38d260b4b31c6605`.
Its `libiwasm.a` SHA-256 is
`f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d`, matching
the runner pin. The effective vmlib definitions enable `WASM_ENABLE_REF_TYPES=1`
and `WASM_ENABLE_SIMD=1`; Release compile flags are `-O3 -DNDEBUG`. `BH_DEBUG`
is not separately defined by the build flags; the pinned `core/config.h`
defaults it to `0`. `-DNDEBUG` alone is not the reason the assertion is
disabled.

At that source commit, `wasm_func_type_get_result_valkind` routes an
`externref` result through `bh_assert(0)` and then returns `(wasm_valkind_t)-1`.
With this artifact's `BH_DEBUG=0`, the assertion macro is a no-op; the Galerina
signature comparison sees the unsupported sentinel and refuses the declared
signature mismatch. The WAMR import API in this configuration therefore
refuses before instantiation without aborting. An assertion-enabled
`BH_DEBUG=1` artifact was not built or tested and is not covered by this result.

Fresh WSL rerun from the integration checkout at
`823c8bc30c34a354e033f597f6477d258e0de488` used the pinned headers and the
exact source-rebuilt archive above, with `GIT_DIR`, `GIT_WORK_TREE`,
`GIT_INDEX_FILE` and `GIT_COMMON_DIR` unset. The runner exited 0 and emitted 14
expected PASS markers, including externref-result signature refusal,
pre-allocation oversize refusal, exact-bound full read, and cleanup controls.
This is evidence for that pinned Release artifact and probe only; it does not
prove other WAMR configurations, production Fungi wiring, protected-byte
custody, or RD closure. No GitHub Actions/CI ran.

## 2026-10-13 CLI revoked-export witness controlled-red

Astra worker `01a13347-b269-7e72-a37f-b377bf657188` reviewed the exact CLI
test delta (submission `01a133c2-8de3-7623-aa11-e8f4b3c2d0c5`) as PARTIAL and
recommended a controlled mutation that calls the wrapped export, discards its
result, then refuses. The committed-head context is `823c8bc30c34a354e033f597f6477d258e0de488`;
the current dirty CLI source hash was
`14F9CFAEF974E83A3AE9A40E0CF4D6176F8C5806DA8B1E35A975D810E60ADF6E`, and the
focused test hash after claim-narrowing was
`A8EBAB6787540915F859C642ADD74AB3765134C132260E886B9091F2C246646A`.

To avoid changing the shared source, the experiment used disposable sibling
copies. The mutant CLI (`96B24D6C123D6B742EFD41F221B4FF358F912F573383AEC125B569C9060D9E3B`)
delayed only the revoked-key exit under a test-only environment switch, then
called the real compiled `answer` export and refused before printing its
result. The copied test (`9C1E524C3B9DF45FFC271730DBE2A1677F9BAC6DD0239C6C26D2748FCF162815`)
ran the positive and refusal controls; the mutation produced the expected
failure at the marker assertion (`true !== false`). The original source and
test hashes remained unchanged. Both disposable copies were removed after the
run.

The bounded two-vector delta was sent to the same Astra worker, without a
duplicate dispatch: follow-up submission
`01a133cb-a84f-7441-8c78-34344c50c789`, retained prompt
`outputs/astra-cli-revocation-controlled-red-followup-20261013.md`, SHA-256
`C91875BE5ACA056A1091913CC5E519F4C66FA7A48DC8DCBC87C58636C1E77888`.
Its result is pending; the controlled-red is verified execution evidence, not
independent adjudication or RD closure.

The ordinary focused test passes 8/8 on Windows and WSL; the controlled mutant
fails at the new assertion as intended. This demonstrates detection of the
specific “invoke named export, suppress result, then refuse” regression for
this CLI route. It does not prove absence of module-start or other side effects,
other dispatch routes, Fungi runtime/FFI/host security, `/auth/verify`
composition, or RD closure. Astra's review remains advisory; no CI ran.

### Astra WAMR evidence-delta adjudication — 2026-10-13

This is an addendum to the existing WAMR review, not a new whole-review dispatch.
Reviewer thread `01a13491-1aad-7470-b905-a86f5d97ee85`, turn
`01a13521-0501-7d52-b5b2-13d169dfc28b`, final message
`msg_0cbfbbf44f8f72e1016ace1d12368487d2842c0a03872df857`, completed
`2026-10-13T11:59:41Z`; response SHA-256
`971294C8B5D586377FE85B05991ADAB05595AE1103BFCE4CCF52944EFA9786D8`.

Astra confirms the exact pinned Release configuration and externref refusal for
this probe: the WAMR archive/configuration enables reference types, SIMD and
interpreter; `BH_DEBUG` defaults to 0, and `wasm_func_type_get_result_valkind`
returns the unsupported `-1` sentinel after the no-op assertion. Galerina's
`signature_matches` refuses that signature before instantiation. The updated
receipt records the exact-artifact rerun; Astra inspected the receipt but did
not rerun it. This resolves the earlier configuration qualification only for
the pinned Release artifact and fixture.

The review does not establish behavior for other WAMR builds or a mandatory
debug profile. Under `BH_DEBUG=1`, source predicts assertion termination, an
availability failure; no debug artifact was tested. Metadata-fault and
standalone cleanup coverage gaps remain. The donor slice is superseded by the
inspected integration working files; this authorizes no Git action and proves
no production Fungi wiring, protected-memory guarantee or RD closure.

### WAMR metadata-fault and standalone cleanup controls — 2026-10-13

Added test-harness-only fault injection; production admission code was not
changed. The focused WSL runner now injects a negative import-count result, a
missing import name, and a null function type through linker wrappers, then
asserts the current admission implementation refuses each before callback
entry. It also injects native-registration refusal through the standalone
`--duplicate-imports` mode and requires exit 2 plus exactly one runtime-destroy
success marker. The ordinary-mode registration cleanup and runtime-init
refusal controls remain in the runner.

The pinned runner exited 0 with 18 `PASS:` markers. The WAMR diagnostic for the
deliberate signature-mismatch fixture remains expected. WSL Git authority
variables were unset; no GitHub Actions/CI ran. This is exact native-probe
coverage only, not a production WAMR grant path or Fungi/RD proof.

Current working hashes:
- `scripts/tests/rd1413-wamr-context-probe.c`:
  `83A8F89E9A3C0A80D4DDBAAA5F836CDF8E6AB8E6AFFC86BABF5C034791ADF037`
- `scripts/tests/rd1413-wamr-init-failure-wrap.c`:
  `9ED5F8771F96B3B92FD152D21875222489C8A23DCBFAD7029EA27A6370936552`
- `scripts/tests/run-rd1413-wamr-context-probe.sh`:
  `64B61BD41F8BCB5ECD4F86D92A1335B641AEA64B648A2873B2249B3621438C8E`

A bounded read-only delta review was delivered to the same Astra reviewer
thread `01a13491-1aad-7470-b905-a86f5d97ee85`; it is pending. Retained prompt:
`outputs/astra-wamr-metadata-fault-cleanup-review-20261013.md`, SHA-256
`E6DC724299A93065AD5F668EE3553D284A7954567C33C817775E03FFB99BABC9`.
Independent review is not yet complete; no staging or Git publication occurred.

### Astra adjudication and cleanup-witness correction — 2026-10-13

The bounded Astra delta review completed on reviewer thread
`01a13491-1aad-7470-b905-a86f5d97ee85`, turn
`01a13529-1190-70a3-94f9-cc4919485ca8`, final message
`msg_0cbfbbf44f8f72e1016ace1f37679487d28d68a242c886a2ab`, at
`2026-10-13T12:09:01Z`; exact reply SHA-256
`90AD5BE87D22E500832E451C06089D727435FA66C69F7FE4FF559A4250DA4055`.
It returned **Q1 PASS / Q2 PARTIAL**. The negative import-count, missing-name
and null-function-type controls reach their intended refusing branches.
Missing prior-import metadata remains untested. Astra identified that the
cleanup marker did not prove `__real_wasm_runtime_init()` had succeeded: a
hypothetical initialization bypass could still reach a passing marker.

Closed that specific harness-evidence gap test-first. The new runner case first
failed against the previous wrapper: a test-only bypass reported initialization
success without calling WAMR, yet the old wrapper emitted the cleanup PASS
marker (runner exit 1). The wrapper now records the result of the real WAMR
init and emits cleanup success only after successful real initialization. The
same WSL runner now exits 0, verifying both that the bypass is rejected and
that ordinary standalone registration-refusal cleanup still succeeds. This is
test-instrumentation evidence only; production code is unchanged. Standalone
unlinked-import cleanup and missing prior-import metadata remain uncovered.

Fresh focused WSL command (Git authority environment variables unset) exited 0:

```text
wsl.exe -d Ubuntu -- bash -lc "cd '/mnt/c/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20261009' && unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR && WAMR_INCLUDE_DIR=/home/phill/wamr-2.4.5-sdk/include WAMR_LIBRARY=/home/phill/wamr-2.4.5-source/build-galerina-repro-20261013/libiwasm.a bash scripts/tests/run-rd1413-wamr-context-probe.sh"
```

Current working hashes:
- `scripts/tests/rd1413-wamr-context-probe.c`:
  `83A8F89E9A3C0A80D4DDBAAA5F836CDF8E6AB8E6AFFC86BABF5C034791ADF037`
- `scripts/tests/rd1413-wamr-init-failure-wrap.c`:
  `D154E198A159DE038A7B17E49D760AC2801E5D15C5F9C1C3F9DFD494C1639DFF`
- `scripts/tests/run-rd1413-wamr-context-probe.sh`:
  `E3C3892371DA9BE230B16795742C90ED8A11970179B2EEAA03D5D6718910DCEF`

The completed Astra review adjudicates the immediately preceding hashes, not
this final wrapper/runner delta. Fresh independent review remains pending; no
staging or Git publication occurred.

### Inherited test-bypass environment isolation — 2026-10-13

The completed Astra delta review found that the runner cleared the existing
injection variables but omitted `RD1413_TEST_BYPASS_REAL_RUNTIME_INIT`. An
inherited value of `1` therefore contaminated the ordinary standalone cleanup
positive control. Reproduced before the fix: the runner exited 1 and WAMR
reported `wasm_runtime_malloc failed: memory hasn't been initialized` before
its intended controls ran.

The runner now unsets this variable alongside the other test-only injections
before any child process. Re-ran the exact pinned WSL runner with the caller
environment deliberately exporting `RD1413_TEST_BYPASS_REAL_RUNTIME_INIT=1`;
it exited 0 and printed the expected metadata, size-bound, externref, normal
cleanup, simulated-bypass refusal and init-failure controls. This is a
discriminating environment-isolation result for this test harness only.

Current runner SHA-256:
`3DD0A4CA59B2EAAB1E385DCF5A9C18B17A512C3C1B1D6F15A7BA8F9A65FD9F1F`.
The exact contaminated-environment WSL command was:

```text
wsl.exe -d Ubuntu -- bash -lc "cd '/mnt/c/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20261009' && unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR && export WAMR_INCLUDE_DIR=/home/phill/wamr-2.4.5-sdk/include WAMR_LIBRARY=/home/phill/wamr-2.4.5-source/build-galerina-repro-20261013/libiwasm.a RD1413_TEST_BYPASS_REAL_RUNTIME_INIT=1 && bash scripts/tests/run-rd1413-wamr-context-probe.sh"
```

The same command before the change exited 1, reproducing the inherited-state
failure. No GitHub Actions/CI ran. A bounded, read-only final-delta review was
sent to the same Astra reviewer thread `01a13491-1aad-7470-b905-a86f5d97ee85`;
the prompt is `outputs/astra-wamr-env-unset-followup-20261013.md`,
SHA-256 `5A772B518CE13BA8FB7EA7E042A71EF5DC419F820E88317D6E876A049F327238`.
Independent adjudication is pending. No production runtime/admission code,
staging, commit, push or merge was changed or claimed.
