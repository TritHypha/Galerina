# Galerina / SLIDE / Lyth-Weaver execution pipeline (2026-10-26)

Diagram: [galerina-slide-lyth-execution-pipeline-20261026.svg](galerina-slide-lyth-execution-pipeline-20261026.svg) (supplied by Phillip, 2026-10-26 06:17 GMT).

It covers the main components and roles of all three projects, and marks implemented, bounded and research areas separately.

- **Current:** GIR -> WAT -> WASM -> compatibility runtime.
- **Intended (diagram v2):** GIR -> SLIDE package + checks -> VOK admission role (today a JS reference model) -> SLIDE runner executes. Final production shape per the 07:51 ruling: GIR -> SLIDE, with production admission in SLIDE.
- **Optional:** WAT/WASM kept only for explicitly selected compatibility and comparison.

**SLIDE** (Substrate Layout Interconnect Deterministic Engine) prepares and executes independently verified program artifacts. It replaces Galerina's WebAssembly layer, so its K3 encoding must match Galerina's in lock-step (UNKNOWN = -128, never 0).

**VOK** (Verified Object Kernel) is shown in the diagram as the *VOK admission role, today a JS reference model*. The runner executes; VOK does not. VOK production authority and migration remain open; see the dated 07:51 and 07:56 sections below.

## Open follow-up

- Naming mismatch: some Galerina docs say "Verified Operation Kernel". Reconcile them with SLIDE's "Verified Object Kernel" on the 1b Galerina docs branch.
## Memory: who owns what on the intended path (Phillip, 2026-10-26 06:19 GMT)

Flow: .fungi memory rules -> Galerina checks -> GIR -> SLIDE validation -> VOK admission -> SLIDE runtime memory operations.

- **Galerina:** expresses ownership, borrowing, lifetimes, secret-buffer cleanup and permitted effects in .fungi, checks them, and carries the required facts into GIR.
- **SLIDE:** re-checks those facts on its own and carries out the admitted allocation, access, bounds, cleanup and reuse operations through its runtime and host boundary.
- **VOK:** gates execution on the required authority and resource evidence, and controls the execution lease.

Memory R&D therefore belongs in Galerina for language semantics, and in SLIDE/VOK for execution enforcement. A passing Galerina checker does not show that the runtime actually prevents aliases or wipes bytes.

**Today's limit:** the current CLI still executes through WAT/WASM. The intended SLIDE path has only bounded implementations, and full memory enforcement across it is not yet established.

## Correction (Phillip 2026-10-26 07:51 GMT)
- The final production shape is **GIR -> SLIDE**, not GIR -> SLIDE -> VOK. Validation, admission, the one-use execution lease and runtime memory enforcement all live in SLIDE's production code.
- **VOK** (Verified Object Kernel, Rust) is the non-production checking area. It is an off-build checker/oracle used to cross-check SLIDE and is not part of the production build.
- Corrected memory ownership:
  - **Galerina:** owns the .fungi language rules, checks them and carries the facts into GIR (unchanged).
  - **SLIDE (production):** re-validates the GIR facts, admits execution, controls the one-use lease, and does allocation, access, bounds, cleanup and reuse.
  - **VOK (checking only):** independently cross-checks SLIDE's validation, admission and lease decisions in verification. It does not gate production.
- Corrected flow: .fungi memory rules -> Galerina checks -> GIR -> SLIDE validation + admission -> SLIDE runtime memory operations. VOK cross-checks off-build.
- Wording (Phillip 07:52 GMT: VOK is effectively a "bolt-on": a Rust checker that sits beside SLIDE for verification, not part of the production build.)

## Clarification (Phillip 2026-10-26 07:56 GMT)
- `SLIDE/src/verified-object-kernel.mjs` is a JavaScript VOK **reference model** with no released production authority. It runs in bounded reference paths and models admission checks (eight gates, memory being one), one-use leases and receipts.
- The Rust VOK checker is Galerina `native/vok-authority`.
- Production admission, the one-use lease and receipts belong to SLIDE itself. VOK, in both its JS and Rust forms, only cross-checks; in development and tests its resource evidence shows that SLIDE's runtime memory behaviour matches Galerina's GIR facts.
- The memory-ownership row 'VOK: gates execution ... controls the execution lease' above is outdated. Corrected row:
  - **VOK (non-production bolt-on: Rust checker `native/vok-authority` + JS reference model `SLIDE/src/verified-object-kernel.mjs`):** cross-checks SLIDE admission, lease use and authority/resource evidence in development and tests; SLIDE production owns admission and the one-use lease.

## Diagram v2 (Phillip 2026-10-26 07:58 GMT)
The SVG beside this note was replaced with Phillip's v2 (sha256 1136e79af09455ad4babe0b9134f79b894415add1017205bdff6d051d2c8d718). It shows:
- VOK as the **VOK admission role, today a JS reference model** (`SLIDE/src/verified-object-kernel.mjs`).
- **The runner executes; VOK does not.**
- The **replacement seam is after canonical GIR**; the Galerina frontend and GIR are kept.
- The optional **GIR -> WAT/WASM branch goes to a separately admitted executor** and is never a silent rescue after refusal.
- **VOK production authority and migration are still open.**

The 07:51 and 07:56 rulings stand: production admission, the one-use lease and receipts belong to SLIDE; VOK (JS reference model + Rust `native/vok-authority`) is a non-production bolt-on that cross-checks. The diagram's 'VOK admission role' names the role that SLIDE production must own (see review question Q2c).
