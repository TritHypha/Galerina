# RD-1413 CLI revocation export-dispatch controlled-red — 2026-10-13

## Scope and pinned inputs

This is a test-detector challenge for the CLI refusal path only. It does not
prove Fungi runtime, FFI, host isolation, protected-byte custody, `/auth/verify`
composition or RD closure.

- Integration checkout HEAD: `823c8bc30c34a354e033f597f6477d258e0de488`.
- Original dirty CLI `galerina.mjs` SHA-256:
  `14F9CFAEF974E83A3AE9A40E0CF4D6176F8C5806DA8B1E35A975D810E60ADF6E`.
- Original focused test
  `packages-ts/galerina-core-compiler/tests/cli-classical-signing-refusals.test.mjs`
  SHA-256:
  `A8EBAB6787540915F859C642ADD74AB3765134C132260E886B9091F2C246646A`.
- Disposable mutant CLI SHA-256:
  `D58D8ED4383C961120CCB30C57589AE598587C49FEB579E4EC56779FC15117DF`.
- Disposable controlled-red test SHA-256:
  `358C688AEBDEB6FBC7F19E8612C2CB42B9E2D0D26BB1C3F38584EF5F55E48E42`.

The disposable test differed from the original only as shown below: it selected
the mutant CLI and set a test-only switch in the revoked-key invocation. The
existing probe still wrapped the real `WebAssembly.instantiate` result and
recorded the marker immediately before applying the actual `answer` export.

## Exact controlled mutation

```diff
--- a/galerina.mjs
+++ b/galerina.mjs
@@ revoked-key refusal
-            process.exit(1);
+            if (process.env.GALERINA_TEST_DELAY_REVOKED_REFUSAL !== "1") process.exit(1);
+            globalThis.__galerinaTestRevokedBeforeDispatch = true;
@@ after resolving the selected exported function
+    if (globalThis.__galerinaTestRevokedBeforeDispatch === true) {
+      fn(...args);
+      console.error("❌ FUNGI-MANIFEST-REVOKED-KEY: controlled regression invoked export before refusal.");
+      process.exit(1);
+    }
     const rawOutput = fn(...args);
```

The second hunk calls the real selected export, discards its value, and then
refuses before the ordinary output formatting/printing path. The test-only
delta was:

```diff
-const CLI = join(REPO, "galerina.mjs");
+const CLI = join(REPO, "galerina.controlled-red-20261013.mjs");
@@ revoked-key child environment
-{ GALERINA_PROFILE: "production", GALERINA_TEST_INVOKE_MARKER: invocationMarker },
+{
+  GALERINA_PROFILE: "production",
+  GALERINA_TEST_INVOKE_MARKER: invocationMarker,
+  GALERINA_TEST_DELAY_REVOKED_REFUSAL: "1",
+},
+assert.match(output(refused), /controlled regression invoked export before refusal/);
```

That additional test-copy assertion requires the mutant to reach its diagnostic
after `fn(...args)` returns. The positive control independently establishes
that the same compiled `answer` export returns `42`. No original source or test
file was modified by this experiment. In the retained run, the diagnostic
assertion passed and the subsequent marker-absence assertion failed; therefore
the mutant returned from the selected export before refusing. This remains
wrapper-level evidence and does not independently instrument Wasm instructions
inside the export body.

## Reproduction

From the integration checkout root:

```text
node --test packages-ts/galerina-core-compiler/tests/cli-classical-signing-refusals.controlled-red-20261013.test.mjs
```

Expected controlled-red exit: `1`. The six unaffected leaf controls pass; the
revocation subtest fails exactly because the marker exists (`true !== false`):

```text
▶ classical CLI admits a trusted fixture and refuses invalid signature or revocation evidence
  ✔ separate pinned registry signer permits an empty revocation snapshot (353.8311ms)
  ✔ missing snapshot (308.2496ms)
  ✔ unsigned snapshot (303.7563ms)
  ✔ wrong pinned root (305.8702ms)
  ✔ tampered signed payload (319.6269ms)
  ✔ signed non-append-only snapshot (301.3643ms)
  ✖ revocation refuses before dispatching the wrapped answer export (363.7299ms)
✖ classical CLI admits a trusted fixture and refuses invalid signature or revocation evidence (4277.2114ms)
ℹ tests 8
ℹ suites 0
ℹ pass 6
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4434.6781

✖ failing tests:

test at packages-ts\galerina-core-compiler\tests\cli-classical-signing-refusals.controlled-red-20261013.test.mjs:169:13
✖ revocation refuses before dispatching the wrapped answer export (363.7299ms)
  AssertionError [ERR_ASSERTION]: revoked flow export dispatch must not be attempted
  
  true !== false
  
      at TestContext.<anonymous> (file:///C:/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20261009/packages-ts/galerina-core-compiler/tests/cli-classical-signing-refusals.controlled-red-20261013.test.mjs:199:14)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1325:25)
      at Test.start (node:internal/test_runner/test:1191:13)
      at TestContext.<anonymous> (file:///C:/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-main-baseline-20261009/packages-ts/galerina-core-compiler/tests/cli-classical-signing-refusals.controlled-red-20261013.test.mjs:169:13)
      at async Test.run (node:internal/test_runner/test:1332:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

Node reported `tests 8, pass 6, fail 2` because the named nested subtest failure
also fails its parent test. The test process exited 1 as expected.

## Interpretation and independent review status

This mutation demonstrates that the marker assertion detects the specified
“invoke selected export, suppress its result, then refuse” regression on this
CLI route. Marker presence proves entry into the JavaScript wrapper immediately
before native invocation; by itself it does not prove Wasm instructions ran,
because `Reflect.apply` could throw before body execution. The ordinary revoked
test’s defensible claim is limited to no attempted dispatch through this wrapped
`answer` export. It does not cover module-start effects, other exports/aliases,
earlier compilation/loading/host effects or alternate invocation routes.

Astra worker `01a13347-b269-7e72-a37f-b377bf657188` reviewed the earlier test
and source in follow-up `01a133cb-a84f-7441-8c78-34344c50c789`, but could not
verify the then-deleted mutant bytes or transcript and therefore returned
PARTIAL for detector sensitivity. The exact repeat mutation and transcript were
then supplied to that same worker; no Fungi/runtime/FFI/host or RD guarantee
follows. No CI ran.

The repeat is assigned to the same Astra worker in submission
`01a133d1-b0f8-7730-8f84-b84df9d9350a`, using the retained prompt
`outputs/astra-cli-revocation-controlled-red-followup-20261013.md` at SHA-256
`C48EEF0BE931CAE653684FDE0906D96BDE5BD0AF9EC1EB3BC0F212C511D21F53`. The
exact evidence report hash at dispatch was
`51BFE457291AF715B44BF42C501C0565B6FBEAEC16643E32882F3BFE021CBE9E`.

Astra returned PASS for the narrow detector-sensitivity claim in that submission.
It independently inspected the mutant/test-copy diffs and report, but did not
rerun the test. It verified that the post-call diagnostic assertion precedes
the marker-absence assertion and passes before the latter fails, supporting a
normal return from `fn(...args)` before refusal. The ordinary claim stays:
revocation prevents attempted dispatch through this wrapped `answer` export.
Module-start effects, other exports/aliases/routes, earlier host effects,
general Wasm-body instrumentation, Fungi runtime/FFI/host guarantees, protected
byte custody, `/auth/verify` composition and RD closure remain outside scope.
The verbatim reply is retained at
`outputs/astra-cli-revocation-controlled-red-review-20261013.md` in the Codex
task workspace. Astra reported that the report version it inspected had hash
`F8A86FE661FA22ADBC149ABDC7213725D7B26B2D52B82B81E2E1F12ACEA083C6` and
verified that its evidence prefix plus terminal newline matched the dispatch
hash above; the submission-identity note had been appended after dispatch.
This report was then extended with the adjudication, so neither digest is the
current full-file hash.
