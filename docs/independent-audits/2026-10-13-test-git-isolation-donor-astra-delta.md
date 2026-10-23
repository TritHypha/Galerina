# Test Git-isolation donor: Astra delta review

- Reviewer: existing Astra agent `01a13557-f7e5-72d0-9802-4f73da57d91f`.
- Review received: 2026-10-13 15:41 UTC.
- Separate response/submission ID: not exposed by the completion payload; this was returned in the existing review context, not redispatched.
- Scope: donor commit `1288bf86f6134b658b7768d4175b6d9eea1b5f57`, its integrated equivalent, and the separate untracked root helper/test.
- Reviewed integration baseline: `823c8bc30c34a354e033f597f6477d258e0de488`.
- Test updated from this finding: `scripts/tests/run-all-tests.test.mjs`, SHA-256 `C5360CFA919E04AF4C6592FFFBAEE081DD754388E47DA3667FA2375A2F42B9F0`.
- Astra metadata: no model/version metadata was exposed in the completion payload.

## Retained review findings

The following records the returned findings and dispositions in a path-safe summary; it is not a byte-for-byte transcript.

**Overall: PARTIAL. The committed implementation largely supersedes donor `1288bf86f`; the untracked root helper is weaker and should not replace it.**

Verified main HEAD, donor HEAD, all five SHA-256 pins, and all three clean runner/test blob identities. Review timestamp: **2026-10-13 15:41 UTC**. This is a new bounded delta in the existing review context; no new response/submission ID is exposed.

### Findings

**1. Medium — the untracked root helper does not satisfy the broader isolation contract.**
The helper deletes only four uppercase variables. It leaves Git configuration injection and `WSLENV` mappings intact; in a case-sensitive environment it also leaves mixed/lowercase routing names.

Direct, non-writing reproduction: after loading this helper, injected `GIT_CONFIG_COUNT/KEY_0/VALUE_0` remained effective: `git config --get codex.reviewprobe` returned `poison`. An in-memory case-sensitive environment probe also retained `git_dir` and `Git_Work_Tree`.

This is **not a demonstrated bypass of the committed shared runner**, which uses the stronger package helper. The reviewer referenced the root helper at line 2 of the pinned checkout.

**2. Low — one donor regression was lost during evolution.**
The donor runner test explicitly covered empty `GIT_INDEX_FILE`. The current runner test generates nonempty poison paths for every case, retaining lowercase `git_dir` coverage but losing the empty-value regression.

The reviewer independently exercised the actual current runner with **16 combinations**: four routing variables × uppercase/lowercase × empty/nonempty. All refused with exit 3 and `TEST-GIT-ENVIRONMENT-REFUSED`. Thus this is a **retained-test gap, not a reproduced implementation failure**. The reviewer referenced the current runner test at line 1237.

**3. Low — the untracked test’s helper selection depends on working directory.**
`resolve("scripts/isolate-test-git-environment.mjs")` selects the root helper only from repository root. From the compiler package directory it selects the different package helper. Use a module-relative URL to make the tested subject unambiguous. The reviewer referenced the untracked test at line 7.

### Separate dispositions

| Unit | Verdict | Evidence and limitation |
|---|---|---|
| Donor `1288` versus main | PARTIAL | All six changed-file responsibilities are represented: four compiler commands retain the preload; package sanitization and worker tests are expanded; runner refusal is expanded; policy-test file is identical. Empty-value regression was not retained. `1288` is not an ancestor of main; `5317ce06b` is. |
| Untracked root helper/test | PARTIAL | The reviewer independently reran its test: 1/1 passed, proving only uppercase removal and unrelated-variable preservation. Additional probes expose its narrower coverage. These files remain untracked and are not the shared runner’s isolation implementation. |
| End-to-end runner behavior | PARTIAL | Current refusal probes passed. Source contains module-entry sentinels and positive execution controls, but the reviewer did not rerun those fixture-producing tests or WSL interop. Previously supplied Windows 6-pass/3-skip and WSL 9/9 remain supplied results. |

### Wiring and containment

- All four declared compiler test commands install the package preload. Their relative path is correct under normal npm package-working-directory semantics.
- The shared runner constructs an absolute package-preload URL, installs it through `NODE_OPTIONS`, and creates isolated Git configuration for children. Its refusal occurs before lease acquisition/package execution.
- The committed library handles names case-insensitively, removes recognized Git configuration channels, and preserves unrelated environment/mappings while deliberately replacing ambient Git configuration.
- Arbitrary direct `node --test` commands without the preload are outside this wiring guarantee.

**Smallest safe next action:** retain the evolved committed implementation; restore explicit empty-value runner regressions, then run the sentinel/positive-control runner test on Windows and WSL. Account for the untracked helper/test as a weaker duplicate—do not merge it as additional protection. This review alone does not authorize retiring the donor’s other work.

No files or Git state intentionally changed during Astra's review, no CI, and no Fungi/runtime/host-security or RD-closure claim.

## Local follow-up

The explicit empty `GIT_INDEX_FILE` regression was added to the existing runner test, without changing production code. The focused test passed on native Windows and WSL. The complete `scripts/tests/run-all-tests.test.mjs` file passed on Windows (**31/31**) and WSL (**20 passed, 11 Windows-only skipped, 0 failed**). No GitHub Actions/CI was run. This verifies the exercised runner contract only; donor retirement, full checkout custody and broader Fungi security remain separate.
