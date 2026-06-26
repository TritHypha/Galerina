# Reports: Crypto Inventory

## Purpose

Crypto inventory reports show which cryptographic algorithms, libraries,
purposes and migration risks exist in a Galerina application.

## Short Definition

A crypto inventory report is generated evidence for cryptographic policy,
algorithm use and post-quantum readiness.

## Report Target

```text
crypto-inventory-report.json
```

Related future report targets:

```text
post-quantum-readiness-report.json
quantum-target-plan.json
quantum-measurement-report.json
quantum-fallback-report.json
```

## Required Questions

The report should answer:

- Which algorithms are used?
- What purpose does each algorithm serve?
- Which uses are policy-approved?
- Which uses are legacy or quantum-vulnerable?
- Which secrets, tokens, signatures or package trust operations depend on them?
- Which cryptographic choices are hard-coded?
- Which uses have a post-quantum or hybrid migration path?
- Which libraries or deployments require review?

## Example

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

## Safety Rules

- Reports must not print private keys, session keys, seeds, tokens or raw
  nonces.
- Reports may include algorithm names, purposes, policy decisions, library
  names and safe fingerprints.
- Hard-coded crypto choices should be reported as risks.
- `Random` used for tokens, keys, salts or nonces should be an error.
- Post-quantum readiness must be reported as policy state, not assumed.
