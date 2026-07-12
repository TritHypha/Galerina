# SLSA supply-chain + deep-BOLA defensive pass (RD-0294w · F14) — 2026-07-09

Third continuation of [`cybersec-skills-audit-2026-07-09.md`](cybersec-skills-audit-2026-07-09.md) (after the
[MCP pass](mcp-tool-poisoning-pass-2026-07-09.md)) — closes the deferred **SLSA supply-chain (RD-0294w)** item
and takes the **deep per-object BOLA** verify that F14 left PARTIAL as far as it soundly goes. Same method:
test claims against real code, verify-by-running, honest verdict tiers, **never CONFIRMED for machinery that
doesn't exist**. Anything fixed in-pass is fixed the zero-trust way (provide/pin, don't disable).

## Part A — SLSA / supply-chain (RD-0294w)

| ID | Claim under test | Verdict | Evidence |
|----|------------------|---------|----------|
| **S1** | CI actions are pinned to an **immutable commit SHA**, not a movable tag | **CONFIRMED (fixed in-pass)** | both workflows now `@<40-hex>`; enforced by conformance `actions-pinned` |
| **S2** | The workflow **token is least-privilege** | **CONFIRMED** | `permissions: contents: read` on `conventions.yml` + `secret-scan.yml` |
| **S3** | **No install-time code execution** surface | **CONFIRMED** | 0 `preinstall`/`postinstall`/`prepare` scripts across all tracked `package.json` |
| **S4** | Dependency **versions are pinned** (reproducible) | **CONFIRMED** | 95 tracked `package-lock.json` pin resolved versions + integrity hashes (manifests use `^` ranges; the lockfiles are the pin) |
| **S5** | The **external dependency surface** is small + vetted (no typosquat-prone obscure deps) | **DEMONSTRATED** | only `typescript`, `@types/node`, `@noble/{post-quantum,hashes,ciphers}`, `argon2`, `bcryptjs`, `snarkjs`, `wat-wasm`/`wabt` — all reputable |
| **S6** | **SLSA build-provenance attestation** on release artifacts | **SPEC-ASSERTED / GAP** | the `.lmanifest` hybrid-signs the runtime IR digest (a provenance-*adjacent* attestation — F1), but no SLSA-format build-provenance document exists yet |

### S1 — actions SHA-pinning (the fix)
Before this pass, both workflows referenced `actions/checkout@v4`, `actions/setup-node@v4`,
`gitleaks/gitleaks-action@v2` — **movable tags**. A moved tag on a third-party action runs arbitrary code
with the workflow's token (the 2025 `tj-actions/changed-files` compromise class, CWE-829). Fixed: every `uses:`
now pins the exact 40-hex commit SHA (resolved via `gh api repos/<a>/commits/<tag>`), with a `# v4`/`# v2`
trailing comment for readability. The third-party `gitleaks-action` is explicitly marked. **Operationalised:**
a new `actions-pinned` check in `@galerina/devtools-security/conformance-scan.mjs` (CONFIRMED) goes RED if any
tag/branch pin reappears — so a future PR cannot silently un-pin.

### S6 — honest gap
Galerina attests the *runtime IR digest* into a hybrid-signed `.lmanifest` (Ed25519 + ML-DSA-65), which binds
"this signed capability ⇄ this exact governed code". That is provenance-adjacent but is **not** a SLSA
build-provenance attestation (builder identity, source ref, build parameters, materials). No SLSA document is
emitted today — recorded as design-stage, not banked. When it lands it should reuse the existing hybrid-signing
pipeline and gain a conformance check.

## Part B — deep per-object BOLA (F14 follow-up)

F14 (BOLA object-level) was PARTIAL: *"stated non-negotiable + value-state/effect-checker enforced; deep
per-object verify deferred."* This pass resolves **why** it can only ever be partial at compile time.

| ID | Claim | Verdict | Evidence |
|----|-------|---------|----------|
| **B1** | The object **identifier cannot be forged** (a raw primitive cannot address an object) | **CONFIRMED (shipped this session)** | the `brand-keys` lint (RD-0286 §5.3): a raw `String`/`Int`/literal reaching a keyed `database.`/`storage.`/`ledger.` verb is an ENFORCING CI violation; a `Brand<T,"Name">` proves a constructor/validation site |
| **B2** | **Object-level authorization** — "caller *may* access *this* object" — is statically enforced | **NOT STATICALLY DECIDABLE (runtime property)** | whether caller X owns object Y depends on runtime grants vs the object's owner; no compiler pass can decide it. Sound enforcement = the **signed capability + K3 verdict at admission**, by design (deny-only: topology never authorizes) |
| **B3** | The **data plane** (a protected/tainted field cannot leak at a sink) is enforced | **CONFIRMED** | `value-state-checker.ts`: `FUNGI-VALUESTATE-006` (protected value → `AuditLog.write` without `redact()`), `-003` (unsafe→governed sink), `SECRET-001/002/003` — this is BOPLA/excessive-exposure (BOLA's data-sibling), enforced at compile time |

**Conclusion (zero-trust framing).** BOLA decomposes into three layers, and Galerina enforces each at the
*only* place it is soundly enforceable: **identifier integrity** structurally at authoring time (B1, `brand-keys`),
**object authorization** at the signed-capability admission gate at runtime (B2 — a compile-time "deep per-object
verify" is a category error, since ownership is runtime state), and the **data plane** at compile time (B3,
value-state). The honest residual is not "a missing compiler check" but the standing platform invariant that
admission is the capability — which is exactly the deny-only posture the whole system is built on. F14 is
re-stated from PARTIAL to **layered-CONFIRMED with a runtime boundary**, not a deferred TODO.

## Status
SLSA: S1–S5 CONFIRMED/DEMONSTRATED (S1 fixed + gated in-pass); S6 the one honest GAP (design-stage). Deep-BOLA:
B1/B3 CONFIRMED, B2 correctly bounded as a runtime property. No OPEN-RISK requiring an immediate code change
remained after S1 was pinned. Conformance scanner now 8 checks (self-test 21→24/24). Actions un-pinning and
raw-key regressions are now standing RED gates.
