# Rules: Quantum Readiness

## Purpose

Keep post-quantum security, quantum-aware types and future quantum compute
planning separate from ordinary application execution.

## Rules

- Galerina must not claim ordinary web/API code runs on quantum computers.
- Crypto choices must be policy-driven, not hard-coded across application code.
- Post-quantum readiness must be reportable through crypto inventory reports.
- `Random` must not be used for secrets, tokens, keys, salts or nonces.
- `SecureRandom` is required for security randomness.
- Quantum state must not control ordinary application flow until measured.
- Quantum measurement must produce an explicit classical type such as
  `Measurement<T>` or resolved `Bool`.
- Quantum target fallback must be declared and reported.
- Silent fallback from quantum hardware to simulator, CPU, GPU or other target
  is forbidden.
- QIR/OpenQASM output is future target planning, not a v1 language promise.

## Security Rules

Unknown quantum or cryptographic states must not collapse into allow.

Quantum-related values follow the same safety shape as `Tri` and photonic
values:

```text
uncertain state -> explicit resolution or measurement -> classical type -> application flow
```

## v1 Scope

V1 should document the security and report rules. Quantum compute types,
simulator support, QIR output and OpenQASM output remain future/research work
until the core parser, checker, runtime and reports are stable.
