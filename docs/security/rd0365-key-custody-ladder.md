# RD-0365 key-custody ladder (L0–L4)

Status: design reference for v1, **NON_AUTHORIZING**. This document grants no custody rung and no
production authority. It records the ladder RD-0365 defines, the limits that every citation of it
must keep, and exactly what the compiler does today.

## The ladder

Each rung is strictly stronger than the one below it. A rung is a **claim the host must prove**,
never a label it may assert.

| Rung | `keyCustody` value | Custody | What it defeats | State |
|---|---|---|---|---|
| L0 | (none) | plaintext `.env` | nothing | **Retired**; replaced by env.spore |
| L1 | `env-spore` | env.spore sealed at rest | casual file exfiltration, repository leaks | **Current baseline** |
| L2 | `os-keystore` | OS keystore wraps the env.spore KEK (Windows DPAPI, macOS keychain) | offline file theft without the user session | Post-v1 |
| L3 | `tpm-sealed` | TPM 2.0 PCR-sealed KEK, bound to machine and measured boot | key theft to another machine; a tampered boot chain | Post-v1 |
| L4 | `hardware-signer` | key never leaves the TPM/HSM/token; signing happens inside the device | in-use key extraction by a compromised process | Post-v1 |

## Honest limits

- **Node has no native TPM API.** L3 and above need a vetted, pinned native module or CLI, and the
  dependency is host-specific (Windows CNG versus Linux tpm2-tss).
- **TPM protects custody, not use.** L3 stops a stolen key file being useful elsewhere. It does not
  stop a compromised process on the legitimate machine from *using* the key (that needs L4). No rung
  stops a legitimate signer from signing a malicious artifact; that is process and review.
- **Post-quantum asymmetry.** TPM 2.0 does not implement ML-DSA. The hybrid key's ML-DSA half can be
  TPM-*sealed* (custody) but not TPM-*signed* (use), so its best case is software signing with sealed
  storage until PQ hardware is common. Receipts must not overclaim this.

## What the compiler does today

- `HOST_PROFILES` carries a `keyCustody` field on every profile, and `UNKNOWN_HOST` is `env-spore`.
  The field is the reserved v1 slot RD-0365 asks for. A profile label is **never** evidence.
- `evaluateKeyCustody(host, attestation, verifier, nowMs)` admits `env-spore` for a declared profile as
  **unenforced** baseline custody. It admits an elevated rung only with an exact, current,
  host-matched `galerina.key-custody-attestation.v1` envelope **and** an injected native verifier.
  Copied, undeclared, stale, malformed or mismatched evidence is refused.
- `resolveHostKeyCustody(name, …)` resolves a host **name** through the registry (an undeclared name
  becomes `UNKNOWN_HOST`) and returns the `claimed` rung, the `effective` rung and the decision. The
  effective rung is the claim only when the decision is admitted **and** enforced; otherwise it is
  `env-spore` ("it may still operate at its proven lower rung", RD-0365 §3).
- The governance verifier consumes this for every `hardening { host <name> }` directive. Compile time
  holds no attestation, so a profile that claims more than `env-spore` (today only `register_pinned`,
  which claims `hardware-signer`) gets the **FUNGI-HARDEN-009 `KEY_CUSTODY_CLAIM_UNPROVEN`** warning
  and is treated as env-spore. This is **advisory**: it never fails a build and never grants a rung.

## Threat model mapping

| Threat | Covered by |
|---|---|
| KV1 key exfiltration at rest | L1 and above |
| KV2 reuse after machine theft | L3 PCR binding |
| KV3 in-use process compromise | L4 only |
| KV4 rogue custody claim | `evaluateKeyCustody` refusal; FUNGI-HARDEN-009 at the hardening consumer |
| KV5 PQ-half asymmetry | the limit above; receipts must not overclaim |
| KV6 rotation and compromise recovery | the RD-0319 runbook and #149 (unchanged) |

## v1 line and what remains

The v1 custody line is L1 (shipped), plus the vault move (owner Track-D#2), plus this documented
ladder, plus the reserved `keyCustody` slot. Still open, all owner- or hardware-gated:

- the completed vault move;
- a native custody provider with TPM quote and PCR verification, its identity and revocation;
- measured-boot and key-sealing receipts, and per-platform rollback evidence;
- a TPM PCR quote joining package admission evidence (post-v1);
- owner-authorized production admission.

NON_AUTHORIZING; no clearance.
