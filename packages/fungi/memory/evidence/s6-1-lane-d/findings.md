# OPEN-S6-1 — Lane D triage (pre-existing dependent failures)

Run: gcw-wd-202610281533 (Work driver, full auto), 2026-10-28 ~15:33-16:15 GMT.
Base measured: Galerina main 4499645c2 (deps built with gcw-s5j-depbuild.mjs, WSL node v24.20.0).
Branch: grok/s5-all-sites-mutants-20261028 (one open Grok branch for Galerina).
Scope: test-only and evidence only. No src/, no host/ TS edits (TS is frozen reference),
no signing, no key reads, synthetic data only.

## Census on main 4499645c2

| Package | Suite | Pass/Fail | Status after this run |
|---|---|---|---|
| galerina-framework-example-app | tests/e2e.test.mjs | 4/3 | 4/3, test 2 now past the registry gate (see D-1) |
| galerina-framework-example-app | tests/proofs.test.mjs | 0/2 | environment, not code (D-4) |
| galerina-framework-example-app | tests/hold-pin.test.mjs | 4/0 | green |
| galerina-framework-example-app | tests/route-capability-grants.test.mjs | 6/0 | green |
| galerina-observability | tests/kernel-integration.test.mjs | 20/1 | open (D-5) |
| galerina-observability | health / logger / metrics | 10/0, 27/0, 11/0 | green |
| galerina-api-protocol-rest | tests/e2e-fuse.test.mjs | 0/4 | needs package build (D-3) |

## Root causes

### D-1 Stale fixtures vs the fail-closed registry gate (6 of 10 fuse failures)

Commit 468ef12c3 (2026-10-11, "require admission and block startup effects") made
fusePackage / fusePackages in galerina-framework-app-kernel/src/fuse-loader.ts throw
FUNGI-FUSE-REGISTRY-REQUIRED unless opts.registryCheck is a function returning {ok:true}.
The Lane D tests and the example host were written before that gate and never pass a
registry verdict. The gate is correct; the fixtures are stale. Do NOT weaken the gate.

Fix applied (this run): example-app tests/e2e.test.mjs test 2 now passes a synthetic,
name-pinned registry (ALLOW only pkg.name === "greeting", deny everything else).
Result: test 2 gets past REGISTRY-REQUIRED and stops at the next gate, D-2.

### D-2 Greeting manifest unsigned in a fresh clone (needs Phillip)

After D-1, example-app test 2 fails with FUNGI-FUSE-UNSIGNED: the greeting dist manifest
is unsigned while governance signing keys exist. A real signed build is required;
signing is Phillip-only (never sign or fake signatures). Stays red until a signed build.

### D-3 api-protocol-rest e2e-fuse needs a built package

Test 1 asserts "package must be built first"; tests 3/4 hit ENOENT on dist/*.wasm and
dist/*.lmanifest.json. The build itself (galerina.mjs build --package ...) needs the
compiler, which is blocked by D-4 in this clone. Test 2 also lacks a registryCheck
(same D-1 pattern) at e2e-fuse.test.mjs line 72; lines 54 and 151 (fuse-success paths)
need the same name-pinned registry. Not edited this run because the suite cannot run
unbuilt, so the edit would be unverified. Refusal tests (lines 113, 144) should also get
the pinned ALLOW so they prove the intended refusal (unsigned/placeholder) instead of
passing early on REGISTRY-REQUIRED; today they pass for the wrong reason.

### D-4 proofs.test.mjs is an environment failure

`galerina.mjs generate tests <flow> --tap` reports "Compiler unavailable: Cannot find module
packages-ts/galerina-core-compiler/node_modules/@galerina/core-runtime-wasm/dist/decimal-core.js"
and refuses (fail-closed). core-runtime-wasm dist is not built by gcw-s5j-depbuild.mjs.
Action: add core-runtime-wasm to the dep build list, then re-run; expected to go green
unless the committed proofs/*.obligations.tap have drifted.

### D-5 observability metricsAuditSink counts 1, expects 2

"metricsAuditSink feeds counts off the kernel audit pipe" expects the unmatched-route 404
to be counted. On main only one request reaches the metrics sink. Likely cause: the S6
kernel rounds (0a576ba3c, f6f1fa71f, 705b9126c, 2026-10-23) changed how a no-route 404 is
audited (no declared policy, so no runtimeReport:false opt-out). Needs a decision: either
the test expectation is stale (404 for an unknown path is not audited to a metrics-only
sink) or the kernel should still emit a counts-only event for 404. Not changed this run.

### D-6 example-app host fuseGreeting cannot satisfy the gate

host/server.ts fuseGreeting(opts) calls fusePackage without registryCheck and does not
thread one from opts, so example-app tests 5 (kernel GET /hello) and 7 (serve) cannot pass
under the gate. Fix belongs in the host, which is frozen TS: carry it into the .fungi host
work (fuseGreeting must take a central registry verdict, no implicit allow).

## Next actions

1. Add core-runtime-wasm to the dependency build; re-run proofs.test.mjs (D-4).
2. Build api-protocol-rest, then apply name-pinned registryCheck at lines 54/72/113/144/151 (D-3).
3. Decide D-5 (404 counted or not) and align test or kernel.
4. D-6 in .fungi host work; D-2 needs Phillip's signed build.

## Update 2026-10-28 (gcw-wd-d7ecd6e8)

- D-4 RESOLVED (environment): building the `galerina-core-compiler` dependency closure with
  `gcw-s5j-depbuild.mjs` also builds `galerina-core-runtime-wasm` (`dist/decimal-core.js`).
  After that, example-app `proofs.test.mjs` is 2 pass / 0 fail. No code change is needed. The census
  must build core-runtime-wasm before running example-app.
- D-3 NOT RUN: `api-protocol-rest` has no `dist/`, and its build is `galerina.mjs build --package .`.
  That build auto-provisions a dev signing key and signs the manifest (zero-touch key lifecycle),
  which this lane may not do (no signing, no `.env*` reads). It moves to Phillip with D-2: one
  signed build of `api-protocol-rest`. After that, apply the name-pinned `registryCheck` to the
  `e2e-fuse.test.mjs` fuse calls at lines 54, 72, 113, 144 and 151 and re-check that the refusals at
  113 and 144 fail for the intended reason.
- Arena parallel flake: fixed in this run, see `../s5-arena-flake/findings.md`.

## Update 2026-10-28 (gcw-wd-202610281633): D-5 decided

- D-5 RESOLVED as a stale test expectation, not a kernel bug. The guess above (S6 rounds of
  2026-10-23) was wrong: the behaviour comes from `eb1645a4f` (2026-09-22, "checkpoint runtime and
  tooling hardening"), the fix for audit flooding by unknown paths. Its claim
  `csf_2a86648bf19537088fa9b394` ("unknown-path 404 does not reserve/emit mandatory audit") was
  independently verified in `docs/independent-audits/2026-09-23-patched-highs-verify-hold.md` and is
  pinned by app-kernel `tests/audit-async.test.mjs` ("unmatched 404/405 traffic does not consume
  mandatory audit capacity"). In `createAppKernel` an unmatched request has no route policy, so
  nothing is reserved or emitted.
- Decision (full auto, logged in LEDGER-002): keep the kernel as it is (it is frozen TS reference,
  and auditing attacker-chosen paths would reopen the flood and add route-cardinality pressure on
  the metrics collector). Realign the observability test: a 404 for an unknown path returns 404 and
  is not counted (`totalRequests` 1, `4xx` 0, `latency.count` 0).
- New pins in `packages-ts/galerina-observability/tests/kernel-integration.test.mjs`:
  - S6-D5-02: unmatched 404 and 405 never reach the metrics audit pipe.
  - S6-D5-03: 1200 distinct unknown paths add no route entry, do not trip `routesOverflowed`, and
    leave no attacker path text in the snapshot.
  - S6-D5-04: matched traffic after a flood of unknown paths is still counted under `/a`.
  - S6-D5-05: a handler-chosen 404 on a matched route is audited and counted (`4xx` 1), so the
    rule is "unmatched is not audited", not "404 is not audited".
- Census: `kernel-integration.test.mjs` is now 25 pass / 0 fail (was 20/1).
- Follow-up (new queue candidate, .fungi kernel work): if operators need to see scanning
  traffic, add a bounded counts-only unmatched counter (method class and 404/405 only, no path
  retained, saturating), outside the audit pipe so it cannot consume audit capacity.

Next actions item 3 is closed. Open in this lane: D-6 (.fungi host work), D-2/D-3 (Phillip's
signed builds).

## Update 2026-10-29 (D-2 root cause)

- The greeting dist manifest is NOT unsigned: it carries a real Ed25519 governanceSignature, keyId `942d6b2726b0a991` (legacy Ed25519-only dev signer per docs/security/galerina-key-register.md).
- No public half for that keyId is tracked in `governance/`, so a fresh clone warns FUNGI-FUSE-NO-PUBKEY, degrades to "unsigned", and fuse throws FUNGI-FUSE-UNSIGNED.
- Added `src/fuse-signature-gate.fungi` (K3 strong-Kleene gate; NO_PUBKEY = UNKNOWN -128, reason 2; admits only exact ALLOW) with tests in `tests/d2-fuse-signature/` (8/8 differential vs frozen TS rule; diagnosis 3 pass + 1 todo that turns green once the key is fixed).
- Remaining (Phillip, needs signing material): either (A) commit the public half `governance/signing-key-942d6b2726b0a991.pub.pem` derived from his private key, or (B) re-sign greeting under operational hybrid key `f3172a48372bfb23` via the offline ceremony (then e2e test 2 needs an injected hybridVerifier). D-3 (signed api-protocol-rest build) unchanged.