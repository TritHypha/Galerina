# Provisional-trit streaming automata: deterministic-resource pattern matching with no rewind

**Defensive publication · dp-rd-0459 · 2026-07-17 · TritHypha (hello@trithypha.dev) · Prior-art disclosure — not a patent claim** (landed in `docs/paper/defensive-papers/` 2026-07-22)
**Purpose:** establish prior art for the mechanisms below so they remain freely implementable. Design-stage; no performance claims are made.

## Claimed mechanisms

### 1. The three-dimensional ternary transition tensor

A pattern compiles to `T[state][symbol-class][guard] → trit` rather than the classical 2-D `T[state][class]`. The trit values are:

- `+1` — confirmed transition
- `0` — **provisional**: a transition awaiting a condition (next stream block, UTF-8 completion, a boundary, a policy check)
- `−1` — rejected / impossible

The essential choice: the third value means *provisional*, not "don't care." It carries unfinished assertions forward as first-class logical state, which is what removes the need for backtracking machinery.

### 2. Ternary propagation with security-veto dominance

Per input symbol, one parallel state update with Kleene-shaped combination — along a path, `−1` annihilates and `0` is contagious (`+1∧0=0`); across merging paths, confirmed dominates provisional dominates dead (`+1∨x=+1`, `0∨−1=0`). A **veto operator is kept outside the lattice**: `VETO(x) = −1` for all `x`, combined after any path-merge OR — so an ordinary disjunctive merge can never override a security rejection. (This is the general OR-merge/veto-lane discipline: any system that merges three-valued outcomes disjunctively needs a post-merge veto channel, because `max(−1,+1) = +1`.)

### 3. No-rewind streaming via provisional checkpoints

The input stream is immutable. At a block boundary, any state needing more data degrades `+1 → 0`; on the next block, `0 → +1` (confirmed) or `0 → −1` (contradicted). A checkpoint carries only: confirmed-state vector, provisional-state vector, capture tags, stream offset, integrity code — **never an input-replay stack**. Interrupted streams resume without reprocessing.

**Terminal-drain rule (fail-closed completion):** at true end-of-input, a still-provisional accept state is *not* a match — `0 → −1` at the terminal boundary. Provisionality must drain to rejection, never to acceptance.

### 4. The compile-time cost certificate

A pattern is admitted only when its resource bound is provable at compile time. The compiled object carries a certificate — maximum states, maximum active states per byte, bounded-repetition expansion, capture slots, cycles per byte, stream memory, and the flags `backtracking: false`, `rewind: false`. Expressions whose cost cannot be certified (backreferences, recursion, arbitrary callbacks, unbounded variable-width lookbehind) are rejected from the trusted engine, or run only in an electronically sandboxed compatibility mode under strict limits. This closes the residual left by non-backtracking execution alone, since bounded repetitions are known to remain exploitable in some non-backtracking and hardware engines.

### 5. Data-oblivious high-security mode

For validating sensitive protocol frames: fixed-size input blocks, a fixed number of state rounds per block, constant lane occupancy, padded short inputs, and accept/reject withheld until block completion — so power, timing, and activity observables do not vary with the data. Match output is separated from diagnostic output.

### 6. Dual-rail ternary integrity encoding

Each trit on two rails: `+1=(1,0)`, `0=(0,0)`, `−1=(0,1)`, and `(1,1)` reserved as a **fourth physical state that is not a logical value** — an integrity trap (`railA ∧ railB ⇒ halt lane, invalidate result, record fault`). Detects crosstalk, stuck channels, detector saturation, fault injection, and contradictory simultaneous transitions. An invalid encoding is a *trap*, never mapped to the provisional value — collapsing tamper into "unknown" would discard the tamper signal.

### 7. Hybrid architecture and staged realization

Electronic compiler → signed bytecode (the certificate object is signable and refusable at admission) → optical/TCAM character classification (ternary CAM's exact/wildcard/excluded matches character classes naturally) → parallel transition fabric → electronic guard/capture/integrity engine. A software reference engine (trits over packed integer arrays, differential-tested against a conventional non-backtracking engine on the supported profile) banks the security value with no exotic hardware: the certificate, no-rewind, terminal-drain, and veto semantics are substrate-independent.

## Prior art acknowledged

Non-backtracking automata engines (RE2; Rust regex-automata), multi-pattern scanning (Hyperscan), ReDoS analyses including the bounded-repetition attack class on non-backtracking matchers (USENIX Security), all-optical ternary-CAM cells, FPGA NFA/DFA acceleration, and ternary optical computing research. The mechanisms claimed here are the provisional-trit semantics (§1–§3), the certificate-as-admission object (§4), the data-oblivious mode as specified (§5), the dual-rail trap encoding applied to automaton state (§6), and their composition (§7).

## Declarations

- **Type / tier:** defensive publication (prior-art disclosure, novelty disclaimed per §"Prior art acknowledged") — **design-stage**; not a flagship/workshop novelty claim; no new cryptography, no new science; no performance number is claimed.
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the project's TriRegex assessment R&D (the RD-0459 line).
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** design disclosure — the claimed mechanisms are fully specified in this document; the software reference engine of §7 is described, not shipped with this note.
- **Licence:** Apache-2.0.

*Published as a defensive disclosure. Contact hello@trithypha.dev.*
