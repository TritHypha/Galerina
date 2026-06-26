# Galerina — Design Stability & Forward-Planning Charter

**Status:** binding conventions (2026-06-16). **Purpose:** keep Galerina ahead of the well-known
language/crypto mistakes, and stop today's pragmatic stopgaps from ossifying into legacy. Written
after a security/PQ cycle (SPORE-SECRET-002 fix, SPORE-PRIVACY-002, #34 hybrid attestation, SPORE-CRYPTO-PQ-001)
flagged a few "decide-now-or-regret-later" items. Cross-refs: [[galerina-quantum-resistance-posture]],
[[galerina-privacy-embedding-egress]], [[galerina-governance-rules]].

## 1. The anti-mistake principles (what we already do — keep doing)

| Other-language mistake | Galerina's standing choice |
|---|---|
| Null (the billion-dollar mistake) | No hidden nulls — `Result`/`Option`, explicit errors |
| Ambient authority (Java/Node) | Capability-based, deny-by-default, no ambient authority |
| Invisible side effects | Effects are declared + checked; undeclared = error |
| Silent coercion (JS `==`; CLI `"true"→false`) | Fail-loud, never silently coerce |
| One-hop taint (classic taint bug) | Taint propagates through transforms (slice/concat/spread/interp/member) |
| Roll-your-own-crypto | Crypto-on-core; vetted libs only; **no invented crypto** |
| Harvest-now-decrypt-later | PQ/hybrid signatures, machine-enforced (SPORE-CRYPTO-PQ-001) |
| Downgrade attacks | No silent downgrade; per-surface FIPS-204 domain separation |
| Non-exhaustive `match` | Mandatory wildcard arm |
| C bitwise footguns | Bitwise intentionally absent from `.spore` (engine layer only) |

**Rule:** a new feature must not regress any row above. A reviewer should check the relevant rows.

## 2. Crypto/serialized-format versioning (the TLS/JWT lesson)

**Every signed or serialized format carries an explicit version, and ANY format change bumps it.**
Adding a field, a domain-separation context, or changing an encoding is a format change.

- Current self-describing tags: ProofGraph governance signature `algorithm: lln.gov.sig.v1|v2`;
  audit attestation `signature.algorithm` + `schemaVersion`. Bridge attestation is distinguished by the
  presence of `mlDsaSignature` (acceptable while there is no persisted-signature migration concern).
- **Known in-place change (allowed only because keys are ephemeral / nothing persisted):** the #34
  FIPS-204 context retrofit changed the v2 ML-DSA pre-image without bumping the tag. This is fine ONLY
  pre-persistence. **Once signing keys are long-lived (production key custody, #149), a format/context
  change MUST bump the version** — never silently, or old artifacts mis-verify.
- Do NOT add a version field with no consumer *now* (that is itself speculative legacy — see §3). Add it
  at the same commit as the first format change that needs it.

## 3. Provisional stopgaps register (do not ossify)

These are pragmatic-now and may be superseded — do not build deeply on them without revisiting:

- **Marker-effect pattern (`effects { crypto.sign crypto.sign.hybrid }`) — PROVISIONAL v0.** Chosen to
  enforce SPORE-CRYPTO-PQ-001 without parser surgery (dotted effects already parse). A first-class
  "effect-with-attributes" syntax may replace it. Until then it is the documented way; if it spreads
  widely, decide whether to formalize or migrate BEFORE a large corpus depends on it. Risk avoided:
  stringly-typed config sprawl.
- **`ed|mldsa` pipe encoding for hybrid signatures — internal/pragmatic.** Verified safe (split-injection
  rejected, `parts.length !== 2` + empty-half guards, verifier does not dispatch on an attacker-controlled
  `alg` — so no JWT-style alg-confusion). If the signature is ever externalized/interop'd, align it with the
  `.tmf` length-prefixed canonical encoding rather than string concat.

## 4. Enforcement escalation plan (avoid "strict mode nobody enables")

- **Inter-flow secret/embedding cross-flow propagation is a WARNING by design** (the checker is
  intra-procedural; it cannot prove the callee seals, and erroring would break legitimate secret-helper
  patterns). **Escalation path:** promote to error in certified profiles once a call-graph / inter-procedural
  egress analysis exists. Tracked here so it does not silently become permanent noise.
- **Runtime backstop is the deferred defense-in-depth layer.** Compile-time is the sole enforcement for the
  taint/secret/embedding egress rules today; the DRCM runtime monitor scans only `__tag==='secure'` values.
  Extending it to embedding/secret tags is the planned second layer (interpreter scope).

## 5. Diagnostic-namespace ownership (avoid semantic drift)

- `SPORE-PRIVACY-001` = the declarative `privacy {}` block `deny protected X to Y` clause (parsed, Phase 10C+,
  not yet enforced). `SPORE-PRIVACY-002` = the dataflow embedding-egress rule (enforced). **Distinct mechanisms
  under one family — keep them distinct; do not merge.** New privacy rules take the next free number and state
  their mechanism (declarative-clause vs dataflow-taint) in `governance-rules.md`.
