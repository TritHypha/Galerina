# Galerina Security Invariants Matrix

Single reference mapping every security invariant to its checker, diagnostic code, enforcement point,
runtime enforcement status, and test file.

> **Reading the table**
> - **Enforced At** — `compile` means the check runs during the compiler pipeline; `runtime` means the
>   capability host / interpreter enforces it at execution time; `compile+runtime` means both.
> - **Runtime?** — `Yes` if a runtime guard (capability host, interpreter, or limit policy) additionally
>   enforces the invariant beyond the compile-time check. `No` means compile-time only.
> - **Test File** — path relative to the package root (`tests/`).

---

## Taint / Injection Safety

| Invariant | Code | Checker | Enforced At | Runtime? | Test File |
|---|---|---|---|---|---|
| Raw tainted value reaches injection sink (SQL/HTML/Shell/Path/LDAP/Header/URL) | SPORE-TAINT-001 | `taint-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |
| Unvalidated value at business-logic sink | SPORE-TAINT-002 | `taint-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |
| Value cleaned for context A used at sink expecting context B (wrong-context untaint) | SPORE-TAINT-003 | `taint-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |
| Discouraged sanitiser used where OWASP-preferred boundary exists (`Sql.escape`, `Shell.quoteArg`) | SPORE-TAINT-004 | `taint-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |

---

## Value-State / Privacy Qualifiers

| Invariant | Code | Checker | Enforced At | Runtime? | Test File |
|---|---|---|---|---|---|
| `safe mut` upgrade without a recognised gate function (`validate.*`, `sanitize.*`, `parse.*`, `json.decode`) | SPORE-VALUESTATE-001 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |
| Unsafe conditional upgrade — one branch has a gate, one does not | SPORE-VALUESTATE-002 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |
| Unsafe binding reaches a governed sink (`AuditLog.write`, `*DB.write`, `shell.exec`, …) | SPORE-VALUESTATE-003 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |
| Tainted value propagated via non-gate string expression | SPORE-VALUESTATE-004 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |
| Two-hop derived unsafe value reaches a governed sink | SPORE-VALUESTATE-005 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |
| Protected value assigned to plain binding without `protected` qualifier, OR `protected` value passed to `AuditLog.write` without `redact()` | SPORE-VALUESTATE-006 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |
| Redacted value converted back to its original type (irreversible redaction) | SPORE-VALUESTATE-007 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |
| `SecureString` passed to a log / print function | SPORE-SECRET-001 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |
| `SecureString` compared with `==` or `!=` instead of `constantTimeEquals()` | SPORE-SECRET-002 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |
| `SecureString` passed to a serialization call (`JSON.stringify`, `toml.encode`, …) | SPORE-SECRET-003 | `value-state-checker.ts` | compile | No | `tests/value-state-checker.test.mjs` |

---

## Effects / Declaration

| Invariant | Code | Checker | Enforced At | Runtime? | Test File |
|---|---|---|---|---|---|
| Effect used without declaration in the flow's contract block | SPORE-EFFECT-001 | `effect-checker.ts` | compile | No | `tests/effect-checker.test.mjs` |
| Effect declared but no matching operation observed (over-declaration) | SPORE-EFFECT-002 | `effect-checker.ts` | compile | No | `tests/effect-checker.test.mjs` |
| Pure flow declares or observes effects (purity broken) | SPORE-EFFECT-003 | `effect-checker.ts` | compile | No | `tests/effect-checker.test.mjs` |
| Privileged effect (`pii.write`, …) declared on plain `flow` instead of `secure flow` | SPORE-EFFECT-004 | `effect-checker.ts` | compile | No | `tests/effect-checker.test.mjs` |
| Broad alias (`network`, `database`) used instead of specific effect | SPORE-EFFECT-005 | `effect-checker.ts` | compile | No | `tests/effect-checker.test.mjs` |
| Effectful stdlib function called without declaring the required effect | SPORE-STDLIB-001 | `effect-checker.ts` → `stdlib-registry.ts` | compile | No | `tests/stdlib/` |

---

## Source / Dynamic-Code Escape

| Invariant | Code | Checker | Enforced At | Runtime? | Test File |
|---|---|---|---|---|---|
| `eval()` or `DynamicCode.load()` called in a flow body | SPORE-SOURCE-ESCAPE-001 | `source-escape-checker.ts` | compile | No | `tests/source-escape-checker.test.mjs` |

---

## Authority / Policy (Governance Verifier)

| Invariant | Code | Checker | Enforced At | Runtime? | Test File |
|---|---|---|---|---|---|
| Protected or sensitive field listed in `contract.response.denies` appears in the response body | SPORE-GOV-003 | `governance-verifier.ts` | compile | No | `tests/governance-verifier.test.mjs` |
| Policy purpose contradicts declared effects (e.g. `read-only` + `database.write`) | SPORE-GOV-005 | `governance-verifier.ts` | compile | No | `tests/governance-verifier.test.mjs` |
| Authority block exists but has no `reason` clause | SPORE-GOV-007 | `governance-verifier.ts` | compile | No | `tests/governance-verifier.test.mjs` |
| Privileged flow declares no effects or capabilities | SPORE-GOV-009 | `governance-verifier.ts` | compile | No | `tests/governance-verifier.test.mjs` |
| `use SetName` references a contract set not declared at program scope | SPORE-GOV-011 | `governance-verifier.ts` | compile | No | `tests/governance-verifier.test.mjs` |
| Contract set requires `audit.write` but the flow does not declare it | SPORE-GOV-012 | `governance-verifier.ts` | compile | No | `tests/governance-verifier.test.mjs` |
| Pure flow calls a flow with effects (boundary violation) | SPORE-GOV-013 | `governance-verifier.ts` | compile | No | `tests/governance-verifier.test.mjs` |
| Required context field declared in `contract.context` is never accessed | SPORE-CONTEXT-001 | `governance-verifier.ts` | compile | No | `tests/governance-verifier.test.mjs` |

---

## Value / Safety Classification

| Invariant | Code | Checker | Enforced At | Runtime? | Test File |
|---|---|---|---|---|---|
| `safety_critical` flow does not declare `audit.write` | SPORE-VAL-001 | `governance-verifier.ts` | compile | No | `tests/spore-val-enforcement.test.mjs` |
| `safety_critical` flow does not declare `require deterministic_execution` | SPORE-VAL-002 | `governance-verifier.ts` | compile | No | `tests/spore-val-enforcement.test.mjs` |
| `classification` value in `contract.value` is not a recognised Galerina classification | SPORE-VAL-003 | `governance-verifier.ts` | compile | No | `tests/spore-val-enforcement.test.mjs` |

---

## Hardware Governance Class

| Invariant | Code | Checker | Enforced At | Runtime? | Test File |
|---|---|---|---|---|---|
| `contract.hardware { target quantum }` without `ProofLevel.FormalRequired` (ExperimentalPlane class) | SPORE-HW-001 | `governance-verifier.ts` → `proof-graph.ts` | compile | No | `tests/spore-hw-enforcement.test.mjs` |
| Sealed hardware target (`npu`, `tpu`, `ane`) declared without `audit.write` | SPORE-HW-002 | `governance-verifier.ts` → `proof-graph.ts` | compile | No | `tests/spore-hw-enforcement.test.mjs` |
| Photonic or neuromorphic target (AcceleratorPlane) declared without runtime attestation requirement | SPORE-HW-003 | `governance-verifier.ts` → `proof-graph.ts` | compile | No | `tests/spore-hw-enforcement.test.mjs` |

---

## Runtime Profile Restrictions

| Invariant | Code | Checker | Enforced At | Runtime? | Test File |
|---|---|---|---|---|---|
| Recursion in `strict` or `high_integrity` profile | SPORE-PROFILE-001 | `profile-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |
| Unbounded loop in `strict` profile (no compile-time-known bound) | SPORE-PROFILE-002 | `profile-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |
| JIT / dynamic code execution target in `strict` or `high_integrity` profile | SPORE-PROFILE-004 | `profile-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |
| Dynamic package load in `strict` profile | SPORE-PROFILE-005 | `profile-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |
| `high_integrity` profile without a declared runtime budget (`contract.limits { request_time … }`) | SPORE-PROFILE-006 | `profile-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |
| Dynamic runtime mutation in `high_integrity` profile | SPORE-PROFILE-007 | `profile-checker.ts` | compile | No | `tests/phase28-profile-taint.test.mjs` |

---

## Network / Anti-Abuse

| Invariant | Code | Checker | Enforced At | Runtime? | Test File |
|---|---|---|---|---|---|
| Network call target not in the flow's declared `contract.network { allow host … }` allowlist | SPORE-NET-001 | `security-policy.ts` (constant); enforced by capability host | compile+runtime | Yes | `tests/governance/flags-and-manifest.test.mjs` |
| Network call resolved to a private / reserved IP address (SSRF prevention) | SPORE-NET-002 | `security-policy.ts` (constant); enforced by capability host at DNS resolution | runtime | Yes | `tests/governance/flags-and-manifest.test.mjs` |
| Ungoverned background execution (`process.spawn`, `worker.spawn`, `event.schedule`) without effect declaration | SPORE-ANTI-ABUSE-001 | `security-policy.ts` (constant); enforced by effect checker + interpreter | compile+runtime | Yes | `tests/governance/flags-and-manifest.test.mjs` |
| Declared contract limit exceeded at runtime (`network_requests`, `request_time`, `memory`) | SPORE-RUNTIME-006 | Capability host / limit policy at runtime | runtime | Yes | `tests/runtime-enforcement.test.mjs` |

---

## Notes

- All compile-time checkers are invoked via the exported functions in `dist/index.js`:
  `checkTaint`, `checkProfiles`, `checkValueStates`, `checkEffects`, `checkSourceEscapes`,
  `verifyGovernance`.
- `SPORE-HW-001..003` constants are defined in `proof-graph.ts` and re-exported by both
  `governance-verifier.ts` and `index.ts`.
- `SPORE-NET-001/002` and `SPORE-ANTI-ABUSE-001` are constant descriptors in `security-policy.ts`;
  the **enforcement logic** lives in the capability host and interpreter, so those rules are
  runtime-only or compile+runtime as noted above.
- The `protected → redacted sink` rule (Rule 5 in `value-state-checker.ts`) fires as
  **SPORE-VALUESTATE-006** (not SPORE-VALUESTATE-003) to distinguish privacy-qualifier violations
  from plain unsafe-binding violations.
- `secret.read` boundary: consuming `env.secret()` without declaring `secret.read` triggers
  **SPORE-EFFECT-001** via the effect checker. Within the value-state checker, `SecureString`
  values are further restricted by **SPORE-SECRET-001/002/003**.
