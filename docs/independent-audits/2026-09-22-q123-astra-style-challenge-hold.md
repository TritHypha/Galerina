# Independent Astra-style challenge — Q1/Q2/Q3 instrumentation and proposed repairs

**Verdict: HOLD**

This reviewer is a Grok subagent running an Astra-style challenge. It is **not** GPT-6 Astra, not a distinct provider, and not a production-admission ceremony. Astra-the-model remains **NOT VERIFIABLE** in this session.

This receipt is **not** the author’s packet (`docs/reports/security-three-boundaries-2026-09-22.md`) and **not** the earlier independent HOLD (`docs/independent-audits/2026-09-22-q123-three-security-boundaries-independent-hold.md`). Production sources were not edited. Nothing was committed.

Candidate: worktree `./.worktrees\rd-0873-native-fungi-bootstrap-implementation`, HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (`main`, dirty). Passing tests here are **not** clean-HEAD evidence. Node v24.18.0, npm 12.0.2, Windows 11 + WSL for live FIFO.

Frozen production SHA-256 **matched** this tree:

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `56f31f24f3e07ad13c43a448d298adf47466a41ef125e450ac24d34da0310a95` |
| `packages-ts/galerina-framework-api-server/src/index.ts` | `8649156f18eb8709ff049bbd7ce82472d60a5d6f2459c1cbe769c7a8bdbb48e5` |
| `packages-ts/galerina-framework-api-server/src/replay-store.ts` | `43a84a5559ba8020fb5cc6bc87412eada0584f8927cb31bca23eddff4577a579` |
| `packages-ts/galerina-core-sentinel-state/src/atomic-writer.ts` | `7555095d7cbb0330990e232d14421b01187ac4664fec18b1297530bcf2ba4008` |
| `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | `c1f83dbd20f6172c7c30bb59862af39b30e4b883310af7ed34647bfee016bcb3` |

Tests import `dist/`. Those `dist/` files are newer than the frozen sources on this host. Independent probes showed the same G5c splice, process-local denylist, and blocking `open` as the frozen sources. Corpus digests of the five production paths matched.

Test/tool SHA-256 on this run (untracked tests; not frozen production):

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `6b6c58b2d5b7d3f08d4b7a769192fc50c87910ac7c37ee9fa3b7363327297f65` |
| `packages-ts/galerina-framework-api-server/tests/q2-durable-replay-admission.test.mjs` | `492fd64814b6c0bca07eed0ed2c81af2d6b3be19e1e4ad98c6d498445edb9e97` |
| `packages-ts/galerina-core-sentinel-state/tests/q3-fifo-toctou.test.mjs` | `53b4e5d80d3c0e3c4ec04180fbbd06e56bf3ac98750771fda59fbcf7aea441a2` |
| `scripts/audit-three-security-boundaries.mjs` | `4cbd2fafc3c5555d27dd70feac0f2bebfb60ec7ea739e139397fc9f2fae31ad9` |

## Rerun receipts

1. `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **8/13 pass, 5 fail**, `duration_ms 459`. Failures are `0 !== 7` on secret early heap returns. Memory words at 1024/1028/1032 are already 0 on the failing smallest case (wipe ran; value did not).
2. `node --test --test-timeout=60000 packages-ts/galerina-framework-api-server/tests/q2-durable-replay-admission.test.mjs` → **5/12 pass, 7 fail**, `duration_ms 446`. Failures are `Missing expected exception` on wrapper/bound/Proxy/accessor/forged/unknown, plus post-admission `assert.fail` after the wrapper was admitted.
3. `node --test --test-timeout=60000 packages-ts/galerina-core-sentinel-state/tests/q3-fifo-toctou.test.mjs` → **5/9 pass, 4 fail**, `duration_ms 47940`. File/parent TOCTOU children `signal=SIGKILL`, stderr `Q3_SWAPPED` / `Q3_SWAPPED_PARENT`. Direct FIFO, valid file, symlink, Windows `O_NONBLOCK` absence, and **sibling-after-kill** passed.
4. `node scripts/audit-three-security-boundaries.mjs --self-test` → **OK (18 fixtures)**, exit 0.
5. `node scripts/audit-three-security-boundaries.mjs --json --corpus-manifest docs/reports/security-three-boundaries-corpus-2026-09-22.json` → **FINDING**, exit 1, four findings, five production digests matched, manifest digest `df850078f537305575881b602225c301767eb16e152a9909b93ec4334b6c76ed`.

Independent extra probes (temp script under `%TEMP%`, not production):

- Fall-through secret `g(7)` with G5c present: `{got:7, w0:7, w1:7, w2:7, hasG5c:true, hasXl:false, hostCleanup:"undefined"}`.
- `requireDurableReplay: true` with **no webhook** constructs. Forwarding wrapper is **admitted**. `isProcessLocalReplayStore(wrapper)===false`.
- Audit: appending `isAdmittedDurableReplayStore` to a denylist-only gate silences Q2. A comment `O_NONBLOCK` or `O_RDONLY | (O_NONBLOCK ?? 0)` without `isFIFO` silences Q3. `Q1_CAPTURE_THEN_WIPE` is defined and **never consulted** by `detect()`.
- Windows Node: `fs.constants.O_NONBLOCK` absent. `registry-generation-store.ts` still `fs.open(filePath, "r")`; post-open `handle.stat()` is not `isFifo`.

## Vector 1 — tests can go green while the defect remains

**CONFIRMED.** Several already-green tests are not oracles of the three defects. Smallest counterexample per lane:

### Q1 smallest counterexample (already green)

**Hand-WAT mutation control** (`q1-secret-return-value.test.mjs` “wipe-before-load returns 0; capture-then-wipe returns 7”). It never runs the emitter. Frozen `wat-emitter.ts` 778–783 still splices `memory.fill` immediately before `(return`. That test is green on this dirty candidate while `g(7)===0` on the compiler path.

Two more already-green holes that survive a primitive-only G5c fix:

1. **Fall-through remanence.** The “substring is not an oracle” test asserts `g(7)===7` while G5c is present and does **not** read memory. Independent probe: after that exact program, arena words are still `7,7,7`. Cause in frozen source: `emitZeroOnExit` is disabled when `bodyHasEarlyReturn` (`wat-emitter.ts` 797–799), and the last Fungi `return w.a` is not a WAT `(return`. G5c therefore does not wrap the load **and** B2b does not wipe on exit.
2. **Host-cleanup absence oracle.** `typeof L.wipeSecretHeapAfterHostCopy === "undefined"` **passes because the cleanup is missing**. That is documentation of the gap, not proof of cleanup. Heap-pointer `h(7)->Sec` asserts the field is still 7 (no guest wipe of the returned object). Together they stay green while secret remanence remains in exported memory.

The five red 7-to-0 tests are honest dual oracles for *early* heap returns: the smallest case requires both post-call zeros **and** `got===7`, so deleting G5c cannot green them. They do not cover fall-through remanence or host cleanup.

### Q2 smallest counterexample (already green)

**`requireDurableReplay: true` with no webhook is untested and constructs.** Frozen `index.ts` 554–562 only runs the gate when `opts.webhook !== undefined`. Independent probe: `createApiServer({ kernel, allowInsecureLoopback: true, requireDurableReplay: true })` returns a server. The whole Q2 suite always passes a webhook, so this path cannot go red.

Already-green instrumentation that will stay green after a denylist-shaped “positive admit”:

- First case builds `countingStore(memory)` then constructs **`memory`**, not `counted`. `claimCount===0` is vacuous.
- “Post-admission method replacement” returns in the `catch` when construct throws. After a correct refuse it never executes replacement; the name overclaims.
- Adjacent `grantedEffects: []` vs omitted grant (2/2) is not replay admission. It inflates the file to 5/12 without touching the WeakSet denylist.
- Direct `MemoryReplayStore` / subclass refuse is the denylist working, not unknown-adapter refuse.

The seven red wrapper/proxy/bound/accessor/forged cases **are** honest oracles of unknown-adapter admission.

### Q3 smallest counterexample (already green)

**“TOCTOU kill leaves the unrelated sibling file unchanged” passed while the read child was SIGKILL’d** (`Q3_SWAPPED` on stderr, sibling still `secret-sibling\n`). It does not require `signal===null`, `status===0`, or `LSS-FIFO-001`. Blocking open + kill satisfies it. That is a green test of the live defect.

Also already green while lstat-then-blocking-open remains:

- Direct FIFO present at `lstat` (`refuseSnapshotSpecialFile` → `LSS-FIFO-001` before `open`). This is discovery-time FIFO, not TOCTOU.
- Windows `O_NONBLOCK` absence test: asserts the constant is missing and returns. Not a refuse proof.
- Registry child (`q3-fifo-toctou-registry-child.mjs`) treats `/fifo|FIFO|special file|not a bounded regular file/i` as success and the parent test does not `assert.match` `LSS-FIFO-001`. A non-FIFO identity-change TypeError can green that child.
- Symlink control `catch { return }` is a latent silent-pass if `symlinkSync` fails. **PLAUSIBLE** this host: the control passed with a real `LSS-LINK-001`, so the skip did not fire this run.

The four SIGKILL cases (read/scrub/registry/parent) are honest block oracles.

### Audit CLI

Self-test 18/18 and corpus FINDING match the executable reds. The scanner is substring-only. **CONFIRMED** vacuity: `isAdmittedDurableReplayStore` or any `O_NONBLOCK` token silences Q2/Q3 even when the denylist / blocking open remains. `Q1_CAPTURE_THEN_WIPE` is dead. Do not treat `--json --corpus-manifest` PASS as WASM/TOCTOU proof.

## Vector 2 — what fails if the described repairs land on this frozen source

Author repairs (not applied): capture-then-wipe (Q1), fail-closed unless positively admitted durable (Q2), `O_NONBLOCK` then `fstat`/`isFIFO` (Q3). Posture is **PLAUSIBLE**. As currently specified against these locators, each repair is incomplete and can green the existing suite while a residual defect remains.

### Q1 capture-then-wipe

Frozen locator: `wat-emitter.ts` 778–783, regex splice of `wipeFill` before `(return`. `emitZeroOnExit` at 801–824 already shows local-capture order for **no-early-return** primitive leaves.

If G5c is rewritten as “evaluate operand into a local, `memory.fill [1024, heap)`, return the local” **only on WAT `(return`**:

- The five 7-to-0 tests **can go green**. That is the intended discriminator for early heap loads.
- Mixed-body fall-through remanence **remains**. `bodyHasEarlyReturn` still disables `emitZeroOnExit`. The last expression is still not a WAT `(return`. Probe already shows `got=7` with words `7,7,7` while G5c is present. The fall-through test stays green because it never reads memory.
- “Skip wiping a heap-pointer result” leaves the returned `Sec` in exported memory. The heap-pointer test stays green (field 7). The host-cleanup test stays green **only while `wipeSecretHeapAfterHostCopy` is undefined**. A real host cleanup cannot land without rewriting that absence oracle; a no-op export plus a rewritten `typeof === "function"` check would then go green with remanence intact. **PLAUSIBLE** post-repair green-while-defect; the current test would actually go **red** if the function is added without changing the test.
- `return id(w.a)`: capturing the **full call** then wiping runs `$id` while the secret heap is still live. Capturing only the load then calling then wiping still leaves a same-module window. No test covers a callee that copies linear memory. **NOT VERIFIABLE** here (wasm-standalone `id` is a pure param return).
- Keeping the regex layer without injecting `(local $… i32)` yields invalid WAT; assemble fails; currently-green G5c tests go red. The repair has to be a structured rewrite, not another sibling splice.
- Host/import exception wipe remains **NOT VERIFIABLE** on this fixture (zero `(import`).

### Q2 fail-closed unless positively admitted durable

Frozen locator: `index.ts` 554–562 `requireDurableReplay === true && webhook !== undefined && isProcessLocalReplayStore(replayStore)`. No `isAdmittedDurableReplayStore`. No durable production backend.

If the gate becomes “refuse unless on an admit-list” and the list is empty:

- The seven wrapper tests **go green**. That is the correct fail-closed outcome for unknown adapters. Do not fabricate a backend; the suite correctly never does.
- `requireDurableReplay` without a webhook **still constructs** unless the described “when a webhook store is present” clause is widened. Independent probe already constructed. The suite will not catch it.
- Naming `isAdmittedDurableReplayStore` **silences the corpus scanner even if the body is `return !isProcessLocalReplayStore(store)`** (denylist inverted, wrappers still admitted). Executable wrapper tests stay red in that case; `--json --corpus-manifest` can go PASS. Self-test fixture `q2Clean` is exactly that token rename.
- Forged-brand coverage is the fields `durable: true` / `kind: "durable-replay-store"`. A new admit bit (`admittedDurable`, a well-known Symbol, a second WeakSet the tests never forge) is untested. **PLAUSIBLE** green-while-defect after a duck-typed “positive” admit.
- Post-admission replacement remains a catch-return after refuse; it does not become a method-replacement test.
- Webhook `claim` at request time is not exercised. Construction-only.

### Q3 `O_NONBLOCK` then `fstat` `isFIFO`

Frozen locators: `atomic-writer.ts` `read` 114–119 `lstatSync` → `refuseSnapshotSpecialFile` → `openSync(live, O_RDONLY)` then ino/dev `fstat`; `scrub` 147–159 same then `openSync(live, O_WRONLY)`; `registry-generation-store.ts` `readBoundedRegularFile` 417–433 `lstat` / `isFifo` then `fs.open(filePath, "r")`. Post-open `handle.stat()` does not call `isFifo`.

If that text is applied literally to this source:

- **`scrub` never reaches `fstat` on the swapped FIFO.** POSIX `open(fifo, O_WRONLY|O_NONBLOCK)` with no reader is `ENXIO`. Frozen `scrub` treats lstat `ENOENT` as a no-op; `read` maps open `ENOENT` to `null`. Mapping `ENXIO` like absence would skip a substituted FIFO (`SCRUB_OK`, child exit 3) — hang gone, refuse gone. Mapping it to `LSS-FIFO-001` is required and is **not** in the one-line repair. Child only exits 0 on `LSS-FIFO-001`.
- **`fs.promises.open(path, "r")` cannot set `O_NONBLOCK`.** Numeric flags are required. Adding `handle.stat().isFIFO()` after the current open still blocks; the registry SIGKILL test stays red. The described repair fails if it is applied to the promise API as written.
- **Windows:** `constants.O_NONBLOCK` is absent. `O_RDONLY | undefined` is `O_RDONLY` (`ToInt32(undefined)===0`). Native blocking open remains. The Windows test stays green by asserting the constant is missing. Live FIFO remains WSL-only; Windows-native FIFO open is **NOT VERIFIABLE**.
- **Existing ino/dev check without `isFIFO`:** `O_RDONLY|O_NONBLOCK` on a FIFO with no writer succeeds, then `fstat` ino/dev ≠ lstat of the regular file → `LSS-LINK-001`. The AtomicWriter child exits 1 unless the code is `LSS-FIFO-001`. Hang can be gone while the four refuse tests stay red (wrong diagnostic) **or** go green if they only assert “did not block” — they currently require `LSS-FIFO-001` on read/scrub/parent.
- Registry child will green on `"not a bounded regular file"` without proving FIFO refuse.
- Sibling-after-kill stays green regardless.
- Any `O_NONBLOCK` token, including a comment or `O_NONBLOCK ?? 0` beside a remaining blocking `open`, silences the corpus Q3 detector. Probe **CONFIRMED**.
- FIFO with a live writer does not block on `O_RDONLY` even without `O_NONBLOCK`. Tests never open a writer. **NOT VERIFIABLE** here; `fstat`/`isFIFO` on the opened fd remains mandatory.

Parent-directory substitution is a FIFO plant behind a swapped dir symlink. `O_NONBLOCK`+`isFIFO` on the opened fd can refuse that plant. Replacing the parent with a different **regular** file is a different TOCTOU (identity change, not FIFO). The parent test would not cover it.

## Labels (author claims vs this challenge)

| Claim | Label | Notes |
|---|---|---|
| Q1 G5c wipe-before-operand makes secret early `g(7)===0` | **CONFIRMED** | 5/13 red; dual oracle (zeros + value) |
| Q1 fall-through can return 7 while G5c substring is present | **CONFIRMED** | And arena words remain 7 (remanence; test does not check) |
| Q1 host cleanup exists | **REFUTED** as presence; absence oracle is green | `wipeSecretHeapAfterHostCopy` undefined |
| Q1 proposed capture-then-wipe closes Q1 | **PLAUSIBLE** for early primitive returns; **incomplete** for mixed fall-through and heap-pointer remanence | |
| Q2 unknown adapters admitted under `requireDurableReplay` | **CONFIRMED** | wrapper/proxy/bound/accessor/forged construct |
| Q2 `requireDurableReplay` without webhook refuses | **REFUTED** | constructs |
| Q2 proposed empty positive admit-list closes Q2 | **PLAUSIBLE** for webhook stores; **incomplete** for no-webhook and scanner-token vacuity | no fake backend — agreed |
| Q3 lstat-then-open blocks after FIFO swap | **CONFIRMED** on WSL | SIGKILL + `Q3_SWAPPED` / `Q3_SWAPPED_PARENT` |
| Q3 direct FIFO at lstat already refused | **CONFIRMED** | not a TOCTOU oracle |
| Q3 sibling test is a refuse oracle | **REFUTED** | green under SIGKILL |
| Q3 proposed `O_NONBLOCK`+`fstat`/`isFIFO` as specified | **PLAUSIBLE** on Linux `O_RDONLY`; **incomplete** for `O_WRONLY` `ENXIO`, promise `"r"` open, Windows, and scanner token | |
| Windows-native live FIFO open | **NOT VERIFIABLE** | no `O_NONBLOCK`; DrvFs cannot host FIFOs |
| Host/import exception wipe | **NOT VERIFIABLE** | wasm-standalone, zero `(import` |
| GPT-6 Astra reviewed this candidate | **NOT VERIFIABLE** | this receipt is a Grok subagent; say so |
| Production admission / clean-HEAD | **REFUTED** | dirty candidate, unrepaired sources |

## Overall

**HOLD.** Q1, Q2, and Q3 remain open on this dirty candidate. The author’s red tests are mostly hostile oracles of the three locators. Several green tests, and the audit CLI, can stay or go green while the defect remains. The three proposed repairs are the right direction and are not a completed fix as written against the frozen source.

Do not claim the security fixes complete. No production admission. No clean-HEAD certification. Keep this receipt separate from the author packet.
