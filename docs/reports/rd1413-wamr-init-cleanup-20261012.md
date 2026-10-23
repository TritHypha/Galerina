# RD-1413 WAMR probe initialization-cleanup delta — 2026-10-12

## Scope and source identity

This is a bounded experimental probe receipt, not production integration or RD
closure. The integration checkout was on `main` at
`8a51ecbfec5d6e4911717c6fb09a1f76fad1c01c`, equal to `origin/main` at the
check. These inputs were dirty working-tree files, not committed source.

The runner checked the existing pinned WAMR 2.4.5 SDK: commit
`25bd7eb63e828e4bd242cc9b38d260b4b31c6605`, Linux product-mini x86_64 Release,
`-O3 -DNDEBUG`, reference types and SIMD. It verified the exact header and
library pins in `scripts/tests/run-rd1413-wamr-context-probe.sh`; this run did
not rebuild WAMR from source. The WSL invocation unset inherited `GIT_DIR` and
`GIT_WORK_TREE` before starting the runner; the runner itself does not unset
those variables.

SHA-256 inputs at the green run:

| Path | SHA-256 |
|---|---|
| `scripts/tests/rd1413-wamr-context-probe.c` | `2677B47FE8EEFC95AA230CCD04314CE74E598D97DBBAC1281C2C05EC05C881E1` |
| `scripts/tests/rd1413-wamr-init-failure-wrap.c` | `5224DF3794A46D1DBD783401159C8E211B2065B12CE5C6E4A12923DAA3EF72B3` |
| `scripts/tests/run-rd1413-wamr-context-probe.sh` | `8944997CB828D729490100934D67EB03495183E9C3571EBB7A7B7711AA1AE4C6` |
| `scripts/tests/rd1413-wamr-context-probe.wat` | `605B365B15951D5A3CA5BCFD1A4785E60169A2E1E409A6E4676AFB495F91FEC4` |
| `scripts/tests/rd1413-wamr-context-mismatch-probe.wat` | `FCCDFC7D1D58F4B049D1F1C51FC7D0866D7FDC0DAD894BE88705573DD5BAF0B5` |
| `scripts/tests/rd1413-wamr-unapproved-import-probe.wat` | `5C30F858ECD43488C5E9015AE96123ED71D9F5C09D127FD6999A34571BB6D217` |
| `scripts/tests/rd1413-wamr-nonfunction-import-probe.wat` | `B816173F1AE7A2C2DE42A22BC52123F17E0B8D17EF0E03E2971F97E9DE9B881C` |
| `scripts/tests/rd1413-wamr-duplicate-import-probe.wat` | `17F55E1B4E0B162093A612CEB856B0FC8CC247A4BE869962FCED0795D14456D0` |
| `scripts/tests/rd1413-wamr-unlinked-import-probe.wat` | `4D750C65449E6E987FFDF0DC8164D657FA5C8ADE023DD8B0C33424FFB43E9ABA` |
| `scripts/tests/rd1413-wamr-externref-result-probe.wat` | `060A2AED2A5D0BAFCA5FDA55C101E533641DF473792E1981A93F63B0C6462006` |
| `packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_import_admission.c` | `FD6A19E36758E7359375C4EBF6C8117667B168827DF968D5D1ADEFD745EDD15D` |
| `packages-ts/galerina-core-runtime/native/wamr-host/include/wamr_import_admission.h` | `6A6D8B612171812BDAB62996DD1042854B379AB63DE10FAECE1039355F0A6405` |

## Change and discriminating result

The probe now separates argument validation, WAMR initialization, and native
registration. If initialization fails it returns without attempting cleanup
of an uninitialized runtime. If native registration fails after successful
initialization, it calls `wasm_runtime_destroy()` before returning status 2.

A test-only GNU linker wrapper injects a registration refusal only under
`RD1413_TEST_FAIL_NATIVE_REGISTRATION=1`. It otherwise delegates to the pinned
WAMR functions. On the injected path it requires one destroy call and emits its
marker only after the real destroy returns. The runner requires process status
2, exactly one post-return marker, and no duplicate-destroy marker.

The added regression was observed red before the fix: the test runner exited 1
with `FAIL: registration refusal cleanup was not observed (status=2)` and the
probe's `runtime/native registration setup failed`; no destroy marker appeared.
After the fix, the exact pinned WSL run exited 0. `bash -n` passed. The runner
reported 14 PASS lines, including:

```text
PASS: host ABI gate rejects invalid valkind bytes and unsupported result kinds
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
PASS: initialized WAMR runtime destroy returned after registration refusal
PASS: WAMR runtime init failure injected
PASS: WAMR runtime init failure injected
```

The first identical init-failure marker is from the normal six-fixture route;
the second is from the `--externref-result` route, in runner execution order.

The init-failure controls exercise the same test-only wrapper in both the normal
six-fixture branch and the `--externref-result` option branch. The latter calls
initialization before examining or reading its fixture; the negative test proves
only init-failure ordering on that branch.

I independently repeated a one-line sensitivity mutant in that option branch:

```diff
 if (!wasm_runtime_init()) {
     fprintf(stderr, "runtime setup failed\n");
+    wasm_runtime_destroy();
     return 2;
 }
```

Command (with inherited Git routing variables removed and the pinned SDK set):
`env -u GIT_DIR -u GIT_WORK_TREE WAMR_ROOT=/home/phill/.local/opt/wamr-2.4.5-sdk bash scripts/tests/run-rd1413-wamr-context-probe.sh`.
The run exited 1 at the intended second route with `FAIL: externref-path init
failure ordering failed (status=2)` and `FAIL: wasm_runtime_destroy called
after init failure`; the normal-route injection had passed first. I removed the
mutant and reran the exact runner on restored source; it exited 0 with 14 PASS
lines. This detects that specific call-order counterexample, not every wrapper
bypass or cleanup property.

The logged WAMR signature warning is expected from the deliberate mismatch
fixture. No GitHub Actions/CI ran.

## Independent review and limits

Astra follow-up `wamr-init-cleanup-adjudication-20261012-02`, continuing
`wamr-abi-probe-adjudication-20261012-01`, verified the exact brief and source
hashes. It rated the cleanup path PASS, the wrapper/runner PASS for the targeted
regression, and the stated claim boundary PASS. Astra inspected source; the
WSL run above is coordinator-executed evidence, not Astra's execution.

The prior Astra follow-up `wamr-init-cleanup-adjudication-20261012-02` predates
both init-failure tests. The new read-only Astra delta (`01a131cb-a939-7502-
a71c-4c1f621f3c86`) source-reviewed the option path and confirmed its assertions;
it classified overall coverage PARTIAL and did not execute the supplied run.
The subsequent Astra receipt-correction submission
`01a131ce-2481-7193-8d02-6aeea26cd70b` passed report fidelity and the narrow
lifecycle wording against report SHA-256
`E7F20319A0D383D0108E9D7DE18C4CF607A5002EFFF55B6DB96DB991E2D3F9DC`, TODO
SHA-256 `156FE7F20FCE8C6B2F6ABEC403274072FC8194BA4019945721D5366C2528F457`,
runner SHA-256 `8944997CB828D729490100934D67EB03495183E9C3571EBB7A7B7711AA1AE4C6`,
probe SHA-256 `2677B47FE8EEFC95AA230CCD04314CE74E598D97DBBAC1281C2C05EC05C881E1`,
and wrapper SHA-256 `5224DF3794A46D1DBD783401159C8E211B2065B12CE5C6E4A12923DAA3EF72B3`.
The prompt SHA-256 was `7BBA15DFBCBE3A5FCFC9D9E68AAB756A6BF93303E08085C586DDC3546ABD82D7`.
Astra reopened the pinned upstream WAMR source but did not run tests, WSL, or CI.
The PASS applies to documentation fidelity and the narrow lifecycle claim, not
the experiment's overall PARTIAL coverage or runtime.

The runner clears both inherited injection variables before its sequence, so
inherited values are not a current positive-run contamination risk under
ordinary Bash execution. The pinned WAMR source supports the narrower rule that
failed initialization acquires no runtime reference that destroy decrements and
shows allocator cleanup on the inspected environment-init failure path. It does
not establish complete resource cleanup for every real partial-init failure
stage. Destruction returning also does not prove erasure or memory protection.
The wrapper observes only calls routed through the linker wrapper; direct or
otherwise bypassing calls remain outside its observation.

SuperGrok's earlier completed review is retained as answer
`supergrok-wamr-init-cleanup-20261012-answer-01`, created
`2026-10-12T20:18:21.536Z`, related commit `8a51ecbfec5d6e4911717c6fb09a1f76fad1c01c`.
Its answer envelope SHA-256 is
`6D70E13AD045983E24BC8075BB98DB0C90687616E32248257AE6A1BB313088BA`; its
complete report `AGENTS/coordination/model-reviews/supergrok-rd1413-wamr-init-cleanup-20261012/reports/answer.md`
SHA-256 is `462514962D4559A42FE5BE9A53F35C621609BE331F97E33D8339FCAB47E4252C`.
It was read-only and ran no tests. SuperGrok marked lifecycle PARTIAL, wrapper/
runner NOT VERIFIABLE against its task pins, and the claim boundary PASS. Its
reported runner hash `099B9647...` differs from current `8944997C...`; its review
does not cover the newer alternate-path test.

The bounded current-tree search finds no
`wasm_runtime_init/register_natives/destroy` call under `packages-ts`; the
`wamr_import_admission` name appears in its C implementation/include and build
manifest, not as an established production lifecycle caller. Production WAMR
admission/wiring remains `NOT VERIFIABLE` beyond that search scope. This
does not establish Fungi semantics, Fungi compiler/runtime/FFI/host enforcement,
protected-memory lifecycle, or closure of RD-1413/1414/1415.
