# Galerina Substrate / Tolerance Contracts — Direction B sub-spec (KB-first, fail-closed)

**Status:** spike sub-spec (Direction **B** of the photonic/ternary R&D agenda). **KB-first** — this
document is the design contract; the parser change, the `substrate-inference.ts` module, the
`verifySubstrate()` pass, and the tests are implemented *against* it. **Reviewed and curated 2026-06-15;
implementation proceeding. Math-home decision resolved to the copy + golden-oracle path (§6).**
**Date:** 2026-06-15. Sequenced **after** Direction A (shipped) and Direction C (shipped), as required by
`galerina-substrate-failure-model.md` §8.
**Parent agenda:** `galerina-photonic-tri-substrate-rd-agenda.md` §5 (Direction B); follow-up list
`galerina-substrate-failure-model.md` §8.
**Provenance.** Direction A made the governance verdict three-valued and proved it cannot fail open
(`galerina-three-valued-governance.md`). Direction C shipped the *noise math* and the
`SPORE-SUBSTRATE-001..004` diagnostic family in `galerina-tower-citizen/src/substrate-model.ts` — a
self-contained library, **no contract grammar, no compiler pass**. Direction B is the missing surface:
a `substrate {}` **contract block** an author writes, and a **compiler verifier pass** that holds the
flow to the Direction-C model *before any silicon exists*.

**Guardrails honoured (binding).** Deny-by-default / fail-closed throughout (every unproved guarantee
⇒ `error`, never silent pass). No invented crypto — SHA-256 + ML-DSA-65 stay; crypto on a noisy lane is
*forbidden*, not re-engineered. No `.tmf` / TritMesh coupling. Galerina stays TS-like flow+contract — no
Rust/Zig, no new runtime. **No hardware/throughput claims** — the verifier reasons over a *software
noise model* only. Deterministic — the verifier's emit/clear decision is a closed-form function of the
declared parameters (no sampling, no wall-clock, no non-seeded randomness in the check path).

**Verify-before-build.** Every symbol cited below was read in the live tree. The one fact that shapes
the entire dependency design is restated as a constraint, not an assumption, in §6.

---

## 1. The problem

Direction C can answer *"given this noise and this redundancy, is the declared tolerance provable?"* —
but only if someone hands it parameters. Today nothing does: a `.spore` author has **no way to declare**
that a flow runs on a photonic/noisy lane, what error rate it tolerates, or how many redundant lanes it
votes across. Direction B closes the loop:

1. give the author a **lean, optional contract block** — `substrate { lane / tolerance / redundancy }`
   — mirroring `resilience {}` / `observability {}` (agenda `#58`);
2. give the compiler a **`verifySubstrate()` pass** that reads that block (plus the flow's declared
   effects) and asks the Direction-C model the three questions B1/B2/B3 below;
3. fail **closed**: any unproved guarantee is a build diagnostic with a concrete fix, not a runtime
   surprise.

The honesty constraint from Direction C carries forward unchanged: this is **not a hardware twin**. It
is (a) a conservative compile-time checker, and (b) the spec a future photonic backend is held to — if
a flow signs off under parameters `P`, the eventual silicon must be at least as good as `P` or the
sign-off is void.

---

## 2. Prior art / mapping onto Galerina

- **Optional inferred contract blocks** — `resilience {}` (`resilience-inference.ts`) and
  `observability {}` (`observability-inference.ts`) established the *convention-over-configuration*
  idiom: the block is optional; when absent the compiler infers a safe default; when present it
  overrides. `substrate {}` is the **third** block of this family and reuses the idiom verbatim.
- **von Neumann N-modular redundancy (NMR) / TMR** — already shipped as `consensusTrit` (the
  `#173/#196` 3-input majority kernel) and wrapped by Direction C's `nmrFailureProbability`. B2 is the
  contract surface over that theorem.
- **Kleene-K3 fail-closed composition** — Direction A's `vAnd` + No-Coercion; the safety half of B3
  (a noisy reading can only *degrade* a verdict, never upgrade it) is inherited structurally and is
  *not* re-proved here.
- **Static manifest clamping** (`galerina-domain-guard-policies.md`) — the prior art for "a contract
  declares a bound the compiler enforces before runtime"; `substrate {}` is the same shape applied to
  the noise axis.

---

## 3. The grammar

`substrate {}` is an **optional** sub-block of `contract {}`, peer to `resilience {}` /
`observability {}` / `privacy {}` / `invariant {}`. Concrete surface:

```spore
secure flow settleBatch(req: BatchRequest) -> Result<Receipt, ApiError>
contract {
  intent { settle a batch on an emerging photonic accelerator }
  effects { database.write audit.write }
  substrate {
    lane: photonic        // photonic | noisy | digital   (digital = the classical default)
    tolerance: 1e-6       // max acceptable P(committing result not delivered); maps to epsilonDeclared
    redundancy: 3         // odd integer ≥ 1, OR the keyword `tmr` (= 3); 1 = no voting
  }
}
{ /* … */ }
```

**Field semantics (all three optional inside the block; sensible defaults applied — §5.4):**

| Field | Type | Maps to Direction-C symbol | Default if omitted |
|---|---|---|---|
| `lane` | `photonic \| noisy \| digital` | drives `ctx.laneIsNoisy` (`photonic`/`noisy` ⇒ `true`) | `digital` (lane is *not* noisy → block is inert) |
| `tolerance` | float in `[0,1]` | `SubstrateGuarantee.epsilonDeclared` | `1e-9` (conservative: tight default) |
| `redundancy` | odd int ≥ 1, or `tmr` | `SubstrateGuarantee.redundancyN` (`tmr` → `3`) | `1` (un-voted) |

The **noise parameters** (`phaseDriftSigma`, `crosstalkCoeff`, `laneFailureProb`, `readoutSigma`, `seed`
— `SubstrateParameters` in `substrate-model.ts:42–53`) are **NOT author-facing in this spike**. The
author declares the *guarantee* (`lane`/`tolerance`/`redundancy`); the *model parameters* are supplied
by a per-lane profile (§6, §10 Q2). This keeps the contract honest: an author cannot hand-wave the noise
floor down to make their tolerance pass.

### 3.1 Parser changes (no new handler — reuse `parseContractSubBlock`)

The unified sub-block handler `parseContractSubBlock(subBlockName)` (`parser.ts:4206–4577`) already
parses `lane: photonic` / `tolerance: 1e-6` / `redundancy: 3` as single-line `decl:` nodes via the
generic fallback (`parser.ts:4510–4568`). The only change is **one dispatch arm** in
`parseContractDecl()` (the if-check ladder at `parser.ts:3833–4118`, after the `invariant` arm at
`3971–3975`):

```ts
// parser.ts, parseContractDecl() while loop, after the invariant arm (3975)
if ((tok.kind === "keyword" || tok.kind === "identifier") && tok.value === "substrate") {
  if (seenBlocks.has("substrate")) {
    this.emit("SPORE-SYNTAX-009", "DUPLICATE_CONTRACT_SECTION",
      "Duplicate 'substrate' block in contract.", this.loc());
  } else {
    seenBlocks.add("substrate");
  }
  children.push(this.parseContractSubBlock("substrate"));
  this.skipNewlines();
  continue;
}
```

`parseContractSubBlock("substrate")` returns, with **no change to the handler**:

```js
{ kind: "identifier", value: "substrate:block", location, children: [
  { kind: "identifier", value: "decl:lane photonic" },
  { kind: "identifier", value: "decl:tolerance 1e-6" },
  { kind: "identifier", value: "decl:redundancy 3" },
]}
```

This matches the `"resilience:block"` / `"observability:block"` prefix pattern that
`hasExplicitResilience()` keys off (`resilience-inference.ts:73–78`). **Duplicate-block detection**
(`SPORE-SYNTAX-009`, defined in `compiler-diagnostics.md:369`, currently un-enforced) is opportunistically
turned on for `substrate` via a `const seenBlocks = new Set<string>()` declared once before the
`3833` while loop — `substrate` is **not** in the repeatable-block exception list (`intent`, `assuming`,
`access`, `@`-attributes). Reference emit/continue templates: `SPORE-SYNTAX-LEGACY-001` (`parser.ts:646–654`),
`SPORE-SYNTAX-LEGACY-002` (`parser.ts:441–476`).

### 3.2 FlowMeta extension

`FlowMeta` (`parser.ts:223–237`) carries only flow-*header* metadata and does **not** model contract
sub-blocks; the contract is an AST child (`contractDecl`, hoisted at `parser.ts:758–766`, stored in
`flowClauses` at `814–815`). To stay consistent with how `resilience`/`observability` are read, the
`substrate {}` block is **read from the AST**, not pushed onto `FlowMeta` — Direction B follows the
exact precedent and adds **no new `FlowMeta` field**. (`InferredSubstrate` carries the parsed values;
see §5.4.)

One optional, low-cost convenience mirrors the `HasPrivacy` NodeFlag (`parser.ts:826–830, bit 7`): set a
`HasSubstrate` NodeFlag bit when a `substrate:block` child is present, so `verifyFlow()` can cheaply
skip flows without a block (the no-regression guarantee, §7.4). This is a *flag*, not a `FlowMeta`
field; if the flag is deemed scope-creep for the spike, the AST search in §5.4 is the fallback and is
equally correct.

---

## 4. The three invariants (B1 / B2 / B3)

All three reuse the codes Direction C **already registered** in
`substrate-model.ts:273–278` (`SUBSTRATE_DIAGNOSTICS`) and `compiler-diagnostics.md` §`SPORE-SUBSTRATE-*`.
No new codes are minted. Priority order when several fire is fixed by Direction C's
`verifyToleranceUnderNoise` (`substrate-model.ts:315–352`): **001 > 004 > 003 > 002**.

| # | Invariant | Trigger | Code · name | Severity |
|---|---|---|---|---|
| **B1** | **crypto-on-core.** Integrity is never tolerance-bounded. | flow has a Hash/Sign/crypto effect **and** `lane` is `photonic`/`noisy` | `SPORE-SUBSTRATE-001` · `CRYPTO_ON_NOISY_LANE` | **error** (always, every profile) |
| **B2** | **redundancy sufficiency.** Declared tolerance must be provable at the declared `N`. | `epsilonModeled > tolerance` at the declared `redundancy` | `SPORE-SUBSTRATE-002` (raisable by more `N`) / `SPORE-SUBSTRATE-003` (`N>1` still short, **or** `pBad ≥ 0.5` so voting cannot converge) | `002`: **error** in `production`/`deterministic`, **warning** in `dev`. `003`: **error** (always) |
| **B3** | **determinism preservation.** An un-voted noisy result must not feed a deterministic context. | `lane` noisy **and** `redundancy == 1` **and** sink requires determinism | `SPORE-SUBSTRATE-004` · `UNVOTED_ANALOG_INTO_DETERMINISTIC` | **error** (always) |

### 4.1 B1 — crypto-on-core (`SPORE-SUBSTRATE-001`)

**Rule.** If the flow declares any crypto effect *and* its declared lane is noisy, emit `001` and deny.
Crypto integrity requires bit-exactness; it can never be "tolerated" at `1e-6`. The fix is structural —
move the crypto to a digital lane — never "raise redundancy".

**Crypto-effect detection.** Scan `flow.declaredEffects` (a `FlowMeta` string array; access idiom at
`governance-verifier.ts:1262–1263`) for the crypto family:

```ts
const CRYPTO_EFFECT = /^crypto\.(hash|sign|verify)$/;     // canonical EFFECT_REGISTRY names
const hasCrypto = flow.declaredEffects.some(e => CRYPTO_EFFECT.test(e));
```

**Lane-is-noisy detection.** Read the `lane` value from the parsed `substrate:block` (§5.4): `photonic`
or `noisy` ⇒ noisy; `digital` or absent ⇒ not noisy. (This spike keys on the *declared* lane only; the
`extractHardwareTargets()` / `HARDWARE_TRUST_PROFILES` path at `governance-verifier.ts:772–809, 1612` is
a §10 follow-up for cross-checking the declared lane against a `hardware { target }` declaration — out
of scope here, listed honestly in §9.)

`001` is profile-independent: integrity is not negotiable at any deployment posture.

### 4.2 B2 — redundancy sufficiency (`SPORE-SUBSTRATE-002` / `-003`)

**Rule.** Build the `SubstrateGuarantee` from the block (`epsilonDeclared = tolerance`,
`redundancyN = redundancy`, `mustCommit = true` when the lane is noisy), call
`checkGuarantee(params, g)` (`substrate-model.ts:262–269`), and branch exactly as Direction C's
`verifyToleranceUnderNoise` does (`substrate-model.ts:336–350`):

- `check.met` ⇒ pass.
- `!met && !check.redundancyHelps` (i.e. `pBad ≥ 0.5`) ⇒ `SPORE-SUBSTRATE-003` **error** — voting
  fundamentally does not converge; raising `N` is futile. Fix: reduce noise / move to digital.
- `!met && redundancyN > 1` ⇒ `SPORE-SUBSTRATE-003` **error** — declared `N` is short of what the model
  needs. Fix: raise `N` (the `check.trace` over `N=1,3,5,7` shows the smallest sufficient `N`).
- `!met && redundancyN == 1` ⇒ `SPORE-SUBSTRATE-002` — tolerance unmet with no voting; raising `N`
  *would* help. Severity is **warning in `dev`, error in `production`/`deterministic`** — the only
  profile-sensitive code in the family. Profile is read from `this.currentProfile`
  (`governance-verifier.ts:1126`, set at `1135`; the `isProduction` idiom is at `1662`).

**Author's lever (the monotonicity guarantee).** For `pBad < 0.5`, `nmrFailureProbability` is *strictly
decreasing in odd N* (`substrate-model.ts:222–236`), so a sufficient `N` always exists and **clears**
the diagnostic — adding `redundancy: 3` (or `tmr`) to a flow flagged at `N=1` admits it (acceptance
test §7.2). When `pBad ≥ 0.5` the honest answer is "voting won't help" — `003`, not a false promise.

### 4.3 B3 — determinism preservation (`SPORE-SUBSTRATE-004`)

**Rule.** An **un-voted** (`redundancy == 1`) reading from a noisy lane is non-deterministic at the bit
level; feeding it into a context that *requires* determinism is a `004` error. The fix is a consensus
vote (`redundancy: tmr` via `consensusTrit`) or a digital lane.

**Deterministic-sink detection (as implemented).** A flow is a determinism-requiring sink when **either**:

1. the active deployment profile is `deterministic` (the whole flow must be reproducible); **or**
2. the flow declares `contract.safety { require deterministic_execution }` — bound regardless of profile.
   The verifier computes this via the existing `extractSafetyRequirements(flowNode)` (`governance-verifier.ts:779`)
   and passes the boolean into `checkSubstrateViolations` (the inference module stays free of `contract.safety`
   parsing). *(Originally a §9 follow-up — now shipped.)*

Crypto is **not** a B3 sink signal: crypto-on-a-noisy-lane is fully owned by **B1/`001`** (which returns
before B3), so re-testing `hasCrypto` here would be dead. (`hasCrypto` is computed once and used only by B1.)

```ts
const isUnvoted = inf.redundancyN === 1;                                  // 1 or omitted (default)
const sinkRequiresDeterminism = profile === "deterministic" || externalDeterminismSink;
if (laneIsNoisy && isUnvoted && sinkRequiresDeterminism) { /* SPORE-SUBSTRATE-004, error */ }
```

`004` outranks `002`/`003` (Direction C priority): we report the *categorical* "unvoted analog into a
deterministic sink" before the *quantitative* tolerance shortfall, because the fix (vote it) is the
same and more fundamental.

### 4.4 Why safety is inherited, not re-proved

The deep half of B3 — that a noisy reading can never *manufacture* an `ALLOW` — is Direction A's
No-Coercion theorem, realised as `effectiveVerdict(ideal, reading) = vAnd(ideal, reading)`
(`substrate-model.ts:208–210`, proved exhaustively in `tests/substrate-model.test.mjs` acceptance #4).
Direction B does **not** re-prove it; B3 only enforces the *availability/reproducibility* discipline
that a value crossing the boundary was voted. Safety is structural; B-codes guard provability.

---

## 5. The `verifySubstrate()` pass

### 5.1 Where it lives

A new sibling inference module **`galerina-core-compiler/src/substrate-inference.ts`**, mirroring
`resilience-inference.ts` / `observability-inference.ts` (the 3-part structure: type exports → private
AST helpers → public `inferFlowSubstrate()` + `checkSubstrateViolations()`). The governance verifier
imports it; it does **not** inline the logic. Tests collocate as
`tests/substrate-inference.test.mjs` (naming convention per the test map), plus governance-level
acceptance tests in `governance-verifier.test.mjs` (§7).

### 5.2 Insertion point in `governance-verifier.ts`

Inside the per-flow `verifyFlow()` method, **after** the invariant-block verification
(`SPORE-INV-001/002`, ~`governance-verifier.ts:1820–1827`) and **before** the trap declarations
(`SPORE-TRAP-001/002`, ~`1829–1832`) — the same neighbourhood where `checkResilienceViolations` /
`checkObservabilityWarnings` are wired (`1846–1874`). Guarded on a non-undefined `flowNode`:

```ts
// governance-verifier.ts — verifyFlow(), after invariant verification (~1827)
if (flowNode !== undefined) {
  const subDiags = checkSubstrateViolations(flowNode, flow, this.currentProfile);
  for (const d of subDiags) {
    this.diagnostics.push(makeGovDiag(d.code, d.name, d.severity, d.message, loc, d.suggestedFix));
  }
}
```

`makeGovDiag` (`governance-verifier.ts:167–182`) and the `this.diagnostics` sink (`1107`, returned by
`getResult()` at `1211–1219`) are reused unchanged — `substrate` diagnostics are pure compile-time
policy checks and touch **none** of `governanceFlagsByFlow`, `proofGraphs`, or `runtimeManifests`.

### 5.3 The module's public surface (`substrate-inference.ts`)

```ts
import { type AstNode, type FlowMeta } from "./parser.js";
import type { DeploymentProfile } from "./governance-verifier.js";

export type SubstrateLane = "photonic" | "noisy" | "digital";

export interface InferredSubstrate {
  readonly lane: SubstrateLane;        // default "digital"
  readonly tolerance: number;          // default 1e-9
  readonly redundancyN: number;        // default 1; `tmr` → 3
  readonly explicit: boolean;          // true iff a substrate:block was present
}

/** Convention-over-configuration reader: explicit block overrides; else inert digital default. */
export function inferFlowSubstrate(flowNode: AstNode, flow: FlowMeta): InferredSubstrate;

export interface SubstrateViolation {
  readonly code: string;               // one of SUBSTRATE_DIAGNOSTICS (001..004)
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly suggestedFix?: string;
}

/** B1/B2/B3, fail-closed, priority 001 > 004 > 003 > 002. */
export function checkSubstrateViolations(
  flowNode: AstNode, flow: FlowMeta, profile: DeploymentProfile,
): SubstrateViolation[];
```

`checkSubstrateViolations` is the **only** entry the verifier calls. When `inferFlowSubstrate` reports
`lane === "digital"` (the default), the function returns `[]` immediately — a flow with no
`substrate {}` block, or one that declares `lane: digital`, is **completely inert** (§7.4).

### 5.4 AST extraction (reuses the resilience idiom)

`inferFlowSubstrate` finds the block exactly as `hasExplicitResilience` does
(`resilience-inference.ts:73–78`) — search `contractDecl.children` for an `identifier` whose `value`
is `"substrate:block"`, then parse its `decl:` children:

```ts
function findSubstrateBlock(flowNode: AstNode): AstNode | undefined {
  const contract = (flowNode.children ?? []).find(c => c.kind === "contractDecl");
  return (contract?.children ?? []).find(
    c => c.kind === "identifier" && c.value === "substrate:block");
}
// decl children carry "decl:lane photonic" / "decl:tolerance 1e-6" / "decl:redundancy 3"
// → split on whitespace, validate, fail-closed on garbage (see §8).
```

Malformed values fail **closed**: a non-numeric `tolerance`, a non-odd/non-positive `redundancy`, or an
unrecognised `lane` keyword is itself a diagnostic (`SPORE-SUBSTRATE-002`/`-003` family or a syntax-level
reject), never a silent coerce-to-default — see §8.

---

## 6. Where the NMR math lives (the load-bearing dependency decision)

**Verified fact (re-read in the live tree, not assumed):** `galerina-core-compiler`'s `package.json`
depends only on `@galerina/devtools-graph-algorithms` and `@noble/post-quantum` (plus `argon2`,
`bcryptjs`, `wabt`, `wat-wasm`). It does **not** depend on `galerina-tower-citizen`, and `tower-citizen`
depends only on `@galerina/inference-bridge-contract`. `governance-verifier.ts` (3263 lines) contains
**zero** references to `nmrFailureProbability` / `singleLaneErrorProbability` / `substrate-model`.
**Therefore the verifier cannot `import` `substrate-model.ts`** — there is no edge between the packages
and adding one (either direction) risks a cycle.

**Decision — RESOLVED via package extraction (done 2026-06-15).** The spike originally shipped a
labelled copy in the compiler (drift-controlled by §6.1's golden constants); the follow-up has since
been executed: a new **zero-dependency workspace package `@galerina/substrate-math`** (`packages-galerina/
galerina-substrate-math`) now holds the pure compute as the **single source of truth**:

- `singleLaneErrorProbability(params)`, `nmrFailureProbability(pBad, N)`, `flipProbability(params)`
  + the gains and `binom` — all pure, stateless, mathematically fixed (a binomial tail + a clamp formula).
- Both consumers depend on it (`file:../galerina-substrate-math`): the compiler's `substrate-math.ts` is now
  a thin **re-export**; `tower-citizen/substrate-model.ts` keeps its `SubstrateParamError`-throwing
  **validation wrappers** and delegates the compute (so its public error contract is unchanged — zero
  test changes there). There is now **one** binomial implementation, so the copy-and-drift risk is gone.
- The package validates with its own `SubstrateMathError`; each consumer that needs a different error
  contract validates first in its wrapper. Cost paid honestly: +1 package (47 total), one new dependency
  edge each, graph regenerated — all verified green (47/47, 4,346 tests). Direction C's
  `substrate-model.ts` was re-touched only to swap local defs for the import + wrappers (reviewed; its
  21 tests still pass unchanged).

§6.1's golden-constant assertions remain in both consumer suites **plus** the package's own test — now a
three-way conformance check against the single implementation rather than a drift guard between copies.

This keeps the compiler free of the simulator regardless of A or B: no `NoisyLane`, no `tpl-simulator`
gates, no sampler leak into the compiler — only the closed-form check.

What does **not** move: `NoisyLane`, `effectiveVerdict`/`vAnd`, `consensusTrit`, `empiricalAdversarialError`,
`verifyToleranceUnderNoise`. The compiler needs only the *closed-form check*, never the sampler or the
gates. The branch logic of `verifyToleranceUnderNoise` (`substrate-model.ts:317–352`) is *re-expressed*
in `checkSubstrateViolations` against compiler types (it cannot be imported), but its **branch order and
thresholds are mirrored exactly** and pinned by the oracle.

### 6.1 Drift control (the symmetric golden-value oracle)

Because the math now lives in two compiled trees (or is briefly copied), a typo or bit-flip in one copy
must fail **both** suites immediately. Ship one shared fixture:

`tests/substrate-math-oracle.fixture.mjs` exporting two frozen tables:

- `NMR_GOLDEN_VALUES` — `(pBad, N, expectedEpsilon)` tuples pinning `nmrFailureProbability`. Anchors,
  hand-verified against `galerina-substrate-failure-model.md` §3.3: `nmr(0,N)=0` ∀N; `nmr(1,N)=1` ∀N;
  `nmr(0.5,N)=0.5` ∀ odd N; `nmr(0.1,3)=0.028`; plus the strictly-decreasing sweep at `pBad=0.1`
  over `N=1,3,5,7`.
- `SLEP_GOLDEN_VALUES` — `(params, expectedPBad)` tuples pinning `singleLaneErrorProbability` for the
  CLEAN / NOISY / SEVERE fixtures (calibration constants `PHASE_GAIN=1.0`, `XTALK_GAIN=0.5`,
  `READOUT_GAIN=0.5` from `substrate-model.ts:58–60`, cited to §3.2 of the failure-model spec).

**As implemented (reconciled):** the two packages are test-isolated in this monorepo (no shared test
infrastructure, and a cross-package relative import is fragile), so rather than one physical fixture
file, the **same hand-verified golden constants are asserted independently in BOTH suites** —
`galerina-tower-citizen/tests/substrate-model.test.mjs` and `galerina-core-compiler/tests/substrate-contracts.test.mjs`.
The constants are the shared contract: `nmr(0.1,3)=0.028`, `nmr(0.5,N)=0.5` ∀ odd N, `nmr(0,N)=0`,
`nmr(1,N)=1`, the strictly-decreasing-vs-non-decreasing monotonicity sweep, and the lane-profile
`singleLaneErrorProbability` values. Both implementations are pinned to these literals, so any divergence
between the two NMR copies fails at least one suite on the next `npm test` — symmetric, fail-fast, zero
runtime cost. Extracting `@galerina/substrate-math` (§6 follow-up) would let both suites import one fixture;
until then the duplicated-but-pinned constants achieve the same drift guarantee. New cases must cite their
justification (spec section or hand computation), never a value copied out of a running implementation.

---

## 7. Acceptance tests (encoded, not prose)

`parseAndVerify(source, profile)` and `hasDiag(result, code)` are the existing harness helpers
(`governance-verifier.test.mjs:24–28`). Governance-level cases live there; pure model-vs-oracle cases
live in `substrate-inference.test.mjs`.

### 7.1 B1 — Hash on `lane: photonic` is rejected

```js
it("SPORE-SUBSTRATE-001: crypto effect on a photonic lane is denied (every profile)", () => {
  const result = parseAndVerify(`
secure flow sealReceipt(r: Receipt) -> Result<Sealed, ApiError>
contract {
  effects { crypto.sign audit.write }
  substrate { lane: photonic; tolerance: 1e-6; redundancy: 3 }
}
{ return Ok(Sealed.of(r)) }
`, "production");
  assert.ok(hasDiag(result, "SPORE-SUBSTRATE-001"));
  const d = result.diagnostics.find(x => x.code === "SPORE-SUBSTRATE-001");
  assert.equal(d.severity, "error");                 // never tolerated, even with redundancy: 3
  assert.match(d.message, /digital lane|integrity/i);
});
it("SPORE-SUBSTRATE-001 still fires in dev (integrity is profile-independent)", () => {
  const result = parseAndVerify(/* same source */, "dev");
  assert.equal(result.diagnostics.find(x => x.code === "SPORE-SUBSTRATE-001").severity, "error");
});
it("no 001 when the same crypto effect is on a digital lane", () => {
  const result = parseAndVerify(`
secure flow sealReceipt(r: Receipt) -> Result<Sealed, ApiError>
contract { effects { crypto.sign } substrate { lane: digital } }
{ return Ok(Sealed.of(r)) }
`, "production");
  assert.ok(!hasDiag(result, "SPORE-SUBSTRATE-001"));
});
```

### 7.2 B2 — tight tolerance without TMR is rejected; a vote admits it

```js
it("SPORE-SUBSTRATE-002: tight tolerance at N=1 is rejected; redundancy: tmr clears it", () => {
  const tight = `
flow average(xs: List<F64>) -> F64
contract { substrate { lane: photonic; tolerance: 1e-6; redundancy: 1 } }
{ return mean(xs) }`;
  const r1 = parseAndVerify(tight, "production");
  assert.ok(hasDiag(r1, "SPORE-SUBSTRATE-002"));
  assert.equal(r1.diagnostics.find(x => x.code === "SPORE-SUBSTRATE-002").severity, "error");

  const voted = tight.replace("redundancy: 1", "redundancy: tmr");   // tmr → N=3 (consensusTrit)
  const r2 = parseAndVerify(voted, "production");
  assert.ok(!hasDiag(r2, "SPORE-SUBSTRATE-002"));    // monotone: raising N clears it (substrate-model.ts:222–236)
  assert.ok(!hasDiag(r2, "SPORE-SUBSTRATE-003"));
});
it("SPORE-SUBSTRATE-002 is a warning in dev, error in production", () => {
  const src = `flow average(xs: List<F64>) -> F64
contract { substrate { lane: photonic; tolerance: 1e-6; redundancy: 1 } } { return mean(xs) }`;
  assert.equal(parseAndVerify(src, "dev").diagnostics
    .find(x => x.code === "SPORE-SUBSTRATE-002").severity, "warning");
  assert.equal(parseAndVerify(src, "production").diagnostics
    .find(x => x.code === "SPORE-SUBSTRATE-002").severity, "error");
});
it("SPORE-SUBSTRATE-003: when pBad ≥ 0.5 voting cannot converge — error, no false promise", () => {
  // SEVERE lane profile (pBad ≥ 0.5) → 003, even at high redundancy; trace never clears.
  const r = parseAndVerify(/* severe-lane flow, redundancy: 7 */, "production");
  assert.ok(hasDiag(r, "SPORE-SUBSTRATE-003"));
  assert.ok(!hasDiag(r, "SPORE-SUBSTRATE-002"));
});
```

### 7.3 B3 — voted result into a deterministic sink accepted; un-voted rejected

```js
it("SPORE-SUBSTRATE-004: un-voted noisy result into a deterministic sink is rejected", () => {
  const r = parseAndVerify(`
flow scoreRisk(req: Req) -> Score
contract { substrate { lane: noisy; tolerance: 1e-3; redundancy: 1 } }
{ return analogScore(req) }
`, "deterministic");
  assert.ok(hasDiag(r, "SPORE-SUBSTRATE-004"));
  assert.equal(r.diagnostics.find(x => x.code === "SPORE-SUBSTRATE-004").severity, "error");
});
it("a voted (N=3) result is admitted into the same deterministic sink", () => {
  const r = parseAndVerify(`
flow scoreRisk(req: Req) -> Score
contract { substrate { lane: noisy; tolerance: 1e-3; redundancy: 3 } }
{ return analogScore(req) }
`, "deterministic");
  assert.ok(!hasDiag(r, "SPORE-SUBSTRATE-004"));      // a vote restores determinism at the boundary
});
```

### 7.4 No-regression — flows without `substrate {}` are completely unaffected

```js
it("a flow with NO substrate block emits zero SPORE-SUBSTRATE-* diagnostics", () => {
  const r = parseAndVerify(`
secure flow createOrder(req: Request) -> Result<Response, ApiError>
contract { effects { database.write audit.write crypto.sign } }
{ return Ok(Response.ok({})) }
`, "production");
  for (const code of ["SPORE-SUBSTRATE-001","SPORE-SUBSTRATE-002","SPORE-SUBSTRATE-003","SPORE-SUBSTRATE-004"])
    assert.ok(!hasDiag(r, code), `unexpected ${code} on a flow without substrate{}`);
});
it("lane: digital is inert — crypto + tight tolerance still emit nothing", () => {
  const r = parseAndVerify(`
flow f(x: F64) -> F64
contract { effects { crypto.hash } substrate { lane: digital; tolerance: 1e-12; redundancy: 1 } }
{ return x }
`, "production");
  assert.equal(r.diagnostics.filter(d => d.code.startsWith("SPORE-SUBSTRATE-")).length, 0);
});
```

Plus the **oracle** tests (§6.1) in both suites and a **constant-identity** check
(`assert.equal(SUBSTRATE_DIAGNOSTICS.CRYPTO_ON_NOISY_LANE, "SPORE-SUBSTRATE-001")`, mirroring the
`SPORE_RES_001.code` style at `governance-verifier.test.mjs`). The full package suite + the graph check
run at the phase boundary.

### 7.5 Constant registration

Direction C exports `SUBSTRATE_DIAGNOSTICS` from `substrate-model.ts:273–278` (tower-citizen). For the
compiler the four codes are registered as exported `SPORE_SUBSTRATE_001..004` const objects in
`governance-verifier.ts` (the diagnostic-constant section, alongside `SPORE_RES_001`/`SPORE_OBS_001`), and
re-exported from `index.ts` in the governance-verifier export block (`index.ts:663–692`):

```ts
export {
  /* …existing… */
  SPORE_SUBSTRATE_001, SPORE_SUBSTRATE_002, SPORE_SUBSTRATE_003, SPORE_SUBSTRATE_004,
} from "./governance-verifier.js";
```

The `code` strings must equal the Direction-C `SUBSTRATE_DIAGNOSTICS` values byte-for-byte; a tiny test
asserts the two families agree (cross-package string check via the shared oracle fixture or a literal
table) so the contract surface and the math library can never disagree on a code.

---

## 8. Fail-closed handling of malformed input

| Malformed declaration | Outcome |
|---|---|
| `tolerance:` non-numeric / `< 0` / `> 1` | reject — emit a parse/`SPORE-SUBSTRATE-002`-family diagnostic; never coerce to default |
| `redundancy:` even / `< 1` / non-integer | reject — `redundancy` must be odd ≥ 1 (mirrors `assertOddPositive`, `substrate-model.ts:80–84`); never round |
| `lane:` unrecognised keyword | `malformed` → `SPORE-SUBSTRATE-002` error; do **not** silently treat as `digital` |
| `tolerance:` split/incomplete numeric (`1e-`) | `malformed` → `SPORE-SUBSTRATE-002` error; **never** truncate to the leading digit |
| `substrate {}` present but empty | inert: defaults make `lane=digital` → returns `[]`; no false positive |

Defaults apply **only** to *omitted* fields, never to *garbage* fields — the difference between "the
author chose the safe default" and "the author wrote nonsense we silently swallowed". The latter always
fails the build. As implemented, a malformed `tolerance`/`redundancy`/`lane` sets `InferredSubstrate.malformed`,
which `checkSubstrateViolations` reports as `SPORE-SUBSTRATE-002` (error) — it does **not** mint a new code
(spec §4 binding) and the message names the malformed field.

### 8.1 Numeric literals — scientific notation (a language-wide lexer enablement)

Tolerances are naturally tiny (`1e-6`, `1e-9`); writing them as decimals is error-prone. The spike found
the Galerina **lexer did not tokenize scientific notation** — `1e-6` lexed as `[1, e, -, 6]`, which a naive
extractor truncated to `1.0`, **silently inverting a tight tolerance into worst-case-loose** (a fail-open
the first adversarial review caught as a blocker). The fix is at the language level: the numeric-literal
scanner (`lexer.ts`, decimal branch) now consumes an `e`/`E` exponent with an optional sign when a digit
follows, so `1e-6` is **one** numeric token everywhere in Galerina. This is a small, guarded change (a
trailing `e` with no following digit stays an identifier; hex `0x1e` is unaffected) and was verified to
cause **zero regression** across the full suite. **Defense-in-depth:** `parseToleranceField` additionally
requires the value to match a complete numeric literal (`^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$`); a split
or incomplete numeric (`1e-`, `1 e - 6`) fails closed as `SPORE-SUBSTRATE-002`, never a silent default.

---

## 9. Follow-ups (explicitly NOT in this spike — honest scope)

- ✅ **DONE (post-spike follow-up): `contract.safety { require deterministic_execution }` as a B3 sink
  signal** (§4.3). Implemented via the existing `extractSafetyRequirements()` (`governance-verifier.ts:779`);
  the verifier passes the boolean into `checkSubstrateViolations`. Pinned by tests in `substrate-contracts.test.mjs`.
- **Lane cross-check against hardware (still open).** The `extractHardwareTargets()` / `HARDWARE_TRUST_PROFILES`
  APIs exist (verified), but flagging a `lane: digital` flow that targets photonic silicon needs a **new
  diagnostic + semantics** (a `LANE_HARDWARE_MISMATCH`-style finding) — a design decision deferred to its own
  spike (the spike's "no new codes" rule held).
- **Author-facing noise parameters / per-lane profiles.** This spike supplies `SubstrateParameters` from
  a fixed conservative profile; a `lane-profile.toml`-style registry (or sentinel-fed parameters, per
  failure-model §8) is future work. Until then `tolerance`/`redundancy` are checked against the
  *conservative* model — the honest direction (can't be gamed downward).
- ✅ **DONE: `@galerina/substrate-math` package extraction** (§6) — the NMR compute is now a shared
  zero-dep package; the compiler's copy is gone (thin re-export), tower-citizen wraps it. 47/47 green.
- **`routePrecision()` lane axis** (`precision-strategy.ts`, named in failure-model §8) — route a flow
  to digital vs photonic based on the verified `substrate {}` block.
- **HMAC-bound `SubstrateModelSnapshot`** (failure-model §8) so a backend signs against the exact model
  parameters it must satisfy — couples cleanly once parameters are author/profile-visible.

---

## 10. Short, high-leverage open questions

1. **Default `tolerance` when omitted — `1e-9` (tight) vs no-check.** §5 proposes a tight default so an
   author who writes `substrate { lane: photonic }` and nothing else still gets a real check. Is a tight
   default the right deny-by-default posture, or should an omitted `tolerance` mean "author has not made
   an availability claim, skip B2" (B1/B3 still apply)? Leaning tight.
2. **Where do `SubstrateParameters` come from per lane?** A single conservative built-in profile for the
   spike, or a minimal `lane → params` registry now? The check's honesty depends entirely on this not
   being author-tunable downward. Leaning single conservative profile for the spike.
3. ~~`@galerina/substrate-math` package now, or copy-with-oracle for the spike?~~ **RESOLVED (§6): copy +
   golden-constant oracle for the spike** (avoids re-touching shipped Direction C + mid-spike workspace
   rewiring); package extraction is the documented follow-up (§9).
4. **Should B3's deterministic-sink set include the `production` profile, or only `deterministic`?**
   §4.3 uses `deterministic` + crypto-boundary; widening to `production` would be stricter but may
   surprise existing production flows that never opted into a substrate. Leaning `deterministic` +
   crypto only.

---

## 11. Cross-references

`galerina-substrate-failure-model.md` (Direction C — the model, the `SPORE-SUBSTRATE-*` registration, §8
follow-ups that scope this doc) · `galerina-three-valued-governance.md` (Direction A — `Verdict`, `vAnd`,
No-Coercion; the inherited safety half of B3) · `substrate-model.ts`
(`singleLaneErrorProbability:98`, `nmrFailureProbability:227`, `binom:214`, `checkGuarantee:262`,
`verifyToleranceUnderNoise:317`, `SUBSTRATE_DIAGNOSTICS:273`) · `parser.ts`
(`parseContractDecl:3833`, `parseContractSubBlock:4206`, `FlowMeta:223`, NodeFlags `HasPrivacy:826`) ·
`governance-verifier.ts` (`verify:1128`, `verifyFlow` insertion ~`1827`, `makeGovDiag:167`,
`currentProfile:1126`, effect-array idiom `1262`) · `resilience-inference.ts` /
`observability-inference.ts` (the inferred-block precedent + AST-search idiom) · `index.ts:663–692`
(constant export block) · `compiler-diagnostics.md` (`SPORE-SUBSTRATE-*`, `SPORE-SYNTAX-009`) ·
`galerina-domain-guard-policies.md` (static-manifest-clamping prior art) ·
`galerina-photonic-tri-substrate-rd-agenda.md` §5 (parent agenda, `#58`).
