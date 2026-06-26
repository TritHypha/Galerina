# Quantum Readiness

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage C

## Purpose

Galerina should be quantum ready in two different ways:

```text
1. post-quantum secure
2. quantum-compute ready
```

Post-quantum security is the near-term requirement. Quantum compute support is
future target planning.

Galerina must not claim that ordinary web, API or agent code can simply run on a
quantum computer.

## Short Definition

```text
quantum readiness = crypto agility now + isolated quantum compute planning later
```

## Core Position

Galerina remains a secure web/API/agent language first.

Quantum support means:

- quantum-safe crypto policy
- crypto inventory reports
- clear separation of `Random` and `SecureRandom`
- isolated quantum-aware types
- explicit measurement before application control flow
- quantum target planning as future compute work
- optional future QIR or OpenQASM output

## Post-Quantum Secure

Post-quantum secure means Galerina applications can migrate away from
cryptographic choices that may become weak against future quantum computers.

Galerina should support policy-driven cryptography so applications do not hard-code
algorithms across business logic.

Current standards baseline:

```text
FIPS 203 = ML-KEM key establishment
FIPS 204 = ML-DSA digital signatures
FIPS 205 = SLH-DSA stateless hash-based digital signatures
```

These should be treated as crypto-policy inputs, not scattered application
syntax.

## Quantum Compute Ready

Quantum compute ready means Galerina may later describe, check and report quantum
workloads.

Quantum computers are not general-purpose replacements for ordinary application
servers. Future Galerina quantum support should use specialised compute blocks,
simulators, cloud quantum platforms or intermediate representations such as QIR
or OpenQASM.

OpenQASM and QIR are useful future references because they focus on quantum
program representation and target interoperability, not ordinary web app
execution.

## Quantum-Safe Crypto Policy

Example direction:

```galerina
security crypto {
  profile post_quantum_ready

  key_exchange {
    prefer ML_KEM
    allow classical_hybrid true
  }

  signatures {
    prefer ML_DSA
    fallback SLH_DSA
  }

  tls {
    require modern
    report quantum_vulnerable_algorithms
  }
}
```

Compiler and security reports should warn about:

- RSA key exchange
- old Diffie-Hellman
- weak elliptic-curve assumptions
- unapproved signature algorithms
- hard-coded crypto choices
- libraries with no post-quantum migration path

## Crypto Inventory Report

Galerina should generate:

```text
crypto-inventory-report.json
```

Example:

```json
{
  "reportType": "galerina.crypto.inventory",
  "postQuantumReady": true,
  "uses": [
    {
      "purpose": "package_signature",
      "algorithm": "ML-DSA",
      "status": "post_quantum"
    },
    {
      "purpose": "legacy_tls",
      "algorithm": "RSA-2048",
      "status": "quantum_vulnerable",
      "recommendation": "replace or hybridize"
    }
  ]
}
```

## Random Versus SecureRandom

Quantum readiness starts with basic cryptographic hygiene.

Galerina should separate non-security randomness from security randomness:

```galerina
Random.number()
SecureRandom.bytes(32)
```

Rule:

```text
Random must not be used for secrets, keys, tokens, salts or nonces.
```

Example diagnostic:

```json
{
  "code": "SPORE-CRYPTO-001",
  "severity": "error",
  "message": "Random.number() cannot be used for token generation. Use SecureRandom.",
  "safeToShow": true
}
```

## Quantum Types

Future Galerina may define isolated quantum types:

```galerina
type QBit
type QRegister<N>
type QState<N>
type QuantumCircuit
type Measurement<T>
```

These must not behave like ordinary values.

Rejected:

```galerina
if qbit {
  return true
}
```

Accepted:

```galerina
let result: Measurement<Bool> = measure qbit

match result {
  Measured(true) => return Ok(true)
  Measured(false) => return Ok(false)
}
```

Rule:

```text
Quantum state cannot control application flow until measured.
```

This matches the same safety shape as `Tri` and photonic values:

```text
Only Bool controls ordinary application flow.
Uncertainty must be resolved explicitly.
```

## Quantum Compute Target Planning

Quantum compute should be a future target, not the main runtime.

Example future direction:

```galerina
compute quantum GroverSearch {
  input searchSpace: QuantumRegister<8>
  output result: Measurement<Int>

  target {
    prefer quantum
    fallback simulator
    allow silentFallback false
  }
}
```

Normal routes still run on the secure web runtime:

```galerina
route POST "/optimise" {
  request OptimiseRequest
  response OptimiseResponse
  handler runOptimisation
}
```

## Reports

Quantum-ready Galerina should support report targets such as:

```text
crypto-inventory-report.json
post-quantum-readiness-report.json
quantum-target-plan.json
quantum-measurement-report.json
quantum-fallback-report.json
```

## Non-Goals

Galerina should not claim:

- ordinary routes run on quantum computers
- quantum hardware is a general server replacement
- quantum state can be treated as `Bool`
- fallback from quantum hardware to simulator or CPU is silent
- hard-coded cryptography is acceptable because current libraries support it

## Priority Placement

Post-quantum crypto policy is a security/platform requirement.

Quantum compute types and QIR/OpenQASM output are future/research concepts until
the v1 parser, checker, memory model, effects, permissions and secure web
runtime are stable.

## Best Short Statement

```text
Galerina should be post-quantum secure before it tries to be quantum-compute capable.
```
