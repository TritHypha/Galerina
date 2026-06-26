# Rules: Non-Negotiable

These rules define behavior Galerina must not silently weaken.

Non-negotiable rules are the highest-priority category in Galerina's planning
model. See [Priority Categories](rules-priority-categories.md).

## Rules

- Only `Bool` controls ordinary conditions.
- `Tri` and `Decision` require explicit handling.
- Missing values use `Option<T>` or another explicit typed form.
- Recoverable errors use `Result<T, E>` or an equivalent typed result form.
- Public routes must not return raw internal models.
- Public routes must use typed requests and declared responses/views.
- Encapsulation is controlled by secure flow boundaries, classification,
  response/view contracts, capabilities, effects, scoped lifetimes, package
  exports and reports; public/private visibility alone is not sufficient.
- Production data fields must be classified.
- Secrets redact by default.
- Effects must be declared.
- Runtime authority must be verified before execution.
- Data cannot grant authority. Roles, permissions, ownership and capability
  claims from input must be verified by runtime identity, policy and capability
  checks.
- Policy, capabilities, effects and audit boundaries are part of execution, not
  optional middleware.
- Sensitive action requires permission.
- Sensitive data exposure requires permission.
- Effects are not actor authorization; protected actions and protected data
  exposure require capabilities or permissions.
- Package authority must be explicit.
- Scoped vaults must not become global variables.
- Vault reads and writes must be scoped, typed, permission-checked,
  owner-checked and reportable.
- Context replaces hidden global request/user state.
- Sensitive values must not escape declared scopes or lifetimes.
- `Result<T, E>` and `Option<T>` must be handled explicitly.
- Match catch-all branches must be explicit, observable and safe; they must not
  silently hide unknown security-sensitive states.
- Native interop must be explicit, permissioned and reportable.
- Inheritance and inherited authority are disallowed in normal Galerina source.
- Runtime mutation and monkey patching are forbidden in normal code.
- Target fallback must be declared and reported.
- Verified fast paths must never bypass policy, capability limits, effect
  boundaries, data contracts or audit requirements.
- AI compute must be declared, typed, permissioned, bounded and auditable.
- AI may request capabilities, but AI may not grant capabilities to itself.
- AI-generated code must be quarantined, checked, tested, audited and approved
  before promotion to trusted code.
- AI intent and authority issuance must remain separate. Reasoning, planning and
  code generation do not grant runtime authority.
- AI must not edit compiler, policy, permission, audit, capability-checker,
  package-signing or cryptographic trust roots without external governance.
- No process may grant itself broader authority than its approver chain
  possesses.
- Capability leases must be scoped, revocable, auditable and no broader than the
  approver chain permits.
- Photonic and optical values must be resolved or matched before controlling
  ordinary application flow.
- Quantum state must be measured into an explicit classical result before
  controlling ordinary application flow.
- Security randomness must use `SecureRandom`; `Random` is forbidden for
  secrets, keys, tokens, salts and nonces.
- Cryptographic choices must be policy-driven and reportable.
- Generated AI content starts untrusted.
- Untrusted data must pass through size, depth, schema, type, range,
  canonicalisation, ownership, policy and boundary checks before use.
- No request, task, AI/tool call or hardware compute plan may consume unlimited
  CPU, wall time, memory, recursion, loop iterations, spawned tasks, network
  calls or accelerator work.
- Hardware acceleration is not trust. CPU, GPU, NPU, DMA-capable device and
  native interop use must remain permissioned, bounded, isolated where
  possible and reportable.
- Dynamic eval, unrestricted shell execution, hidden network access, raw
  filesystem access, unsafe native interop, raw pointers, monkey patching,
  policy-bypassing reflection and AI self-granted capabilities are denied by
  default.
- Risky authority features require declared effects, capabilities, policy
  approval and audit records.
- No hidden power, hidden mutation, hidden execution or hidden cost.
- Assume everything is unsafe until declared safe.

## v1 Scope

These rules should be reflected in examples, diagnostics, reports and framework
docs before the framework surface expands.
