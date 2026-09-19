# Owner actions before final assurance — 2026-09-19

Status: OWNER ACTION REQUIRED / NON-AUTHORIZING

This packet is a checklist for the remaining owner-controlled gates. It does
not request private key material in chat, in a repository, in memory, in a
graph, or in a test log.

## Current evidence boundary

The non-key laboratory work is current and bounded:

- Lyth: 23 suites / 786 checks, typecheck, forbidden-state, capability and
  doc-drift gates pass; Lyth remains non-authorizing and P7 remains downstream
  Fungi assurance.
- SLIDE/VOK: current focused suites pass 53/53; reference-only state remains
  `authorityReleased=false`; the nine Galerina producer-input checks remain
  cancelled rather than passed.
- AGENTS: explicit `AGENTS_ROOT` and `RD0873_GIT_PATH` route the audit-map
  controls to 7/7 pass; the corpus checker self-test passes but is not a
  corpus compile/build.
- WSL2: bounded Linux-under-WSL tests pass where runnable, while live host and
  fault publication are refused at the VMBUS-backed virtual-storage boundary.
  WSL2 is not physical durability evidence.

The latest receipt heads are Galerina
`a1cad4e894b067b18e39a9929bb4dc6198d6d73e`, SLIDE
`9b3b411b2b7c0f03087397387fadc5be0d278d48`, Lyth
`7f661360d0ea5f1eea5a0ca991e6015f01621ba0`, and KB
`1590b55f50628fe68fe297488bfd4825991c7be4`. The bounded source checks were
run at their explicitly named tested source heads; later documentation commits
do not promote those receipts into authority.

The owner-requested escaped `AI\_INDEX.md` route is the existing canonical
root `AI_INDEX.md`; no separate `ai/_INDEX.md` was created. The required RD
locator query remains `REFUSED` while the two tracked private RD sources are
dirty, so no current R&D decision or absence claim is inferred.

## Owner action lanes

### 1. Galerina governance and R&D

Resolve each item with a current exact-source receipt; the R&D records remain
partial/open until then:

The public register already records the hybrid trust-anchor root
`21415420b447e219` and hybrid operational signer `f3172a48372bfb23`. Their
private halves remain owner/offline custody and must not be regenerated merely
to clear a gate. The prior signed artifact is historical because the hardened
package bytes changed; the owner must perform a new authorized signing act for
the current candidate using the authoritative
[`OFFLINE-KEY-SIGNING-WALKTHROUGH.md`](../security/OFFLINE-KEY-SIGNING-WALKTHROUGH.md),
then return public-only artifacts, public hashes and the ceremony receipt.

For the separate beta-v1 release-evidence role, the owner has generated
dedicated hybrid operational key `0da09262513e2a8d`; its canonical five-field
environment passed the structure-only check. It is not admitted or used. The
root `21415420b447e219` must delegate it only after the final unsigned
durability/repository evidence and package bytes are fixed. Keep its private
environment in encrypted offline custody; this packet records no private path
or private value.

- RD-0349: owner policy for the broader Commodity/Crypto/Rate/Percent surface
  and sourced scale/rounding rules.
- RD-0361: authority/deletion proof and the SLIDE/VOK cross-repository gates;
  the bounded twin count is not production admission.
- RD-0363: authenticated signatures, complete canonical binding, replay-time
  enforcement and receipt binding.
- RD-0364: provider and weight identity, egress and budget proof, and
  authorizing receipts.
- RD-0365: vault/TPM/hardware custody evidence, host attestation and
  rollback-safe custody handling.

### 2. Separate SLIDE evidence/atlas authority

Verify and supply the offline owner ceremony receipt for the separate SLIDE
evidence and atlas authority, using the existing owner-controlled hybrid
Ed25519 + ML-DSA-65 key domain. Do not generate a replacement key merely to
make the gate green. Supply public anchors and lifecycle records for creation,
rotation, revocation, recovery and release. Provide publish-bound hosted evidence and named
Windows/Linux/macOS restart, rollback, writer, crash and power-loss receipts.

The Galerina governance key must remain out of this lane. No private key is to
be generated, copied or committed by the repository or online process.

### 3. Galerina producer → detached GIR → SLIDE/VOK

Provide the exact Galerina producer/GIR inputs at one shared build point, then
allow SLIDE to independently re-import and re-derive them. Re-run the nine
cancelled cross-repository checks and produce the scalar VOK profile receipt
chain with its registered consumer evidence. Keep profiles 64 and 256
`INACTIVE` until packed consumer and execution evidence exists; do not activate
them by changing labels.

### 4. Exact PROJECT and final assurance sequence

First obtain a valid exact-head PROJECT receipt over the clean, source-bound
materialization. Use the existing
[`REPORT-TEMPLATE.md`](../platform-handover/durability-recovery/REPORT-TEMPLATE.md)
for each external durability experiment. The EOL policy is byte-level: uniform LF/CRLF only where the
owning format permits it; mixed EOL, lone CR, invalid UTF-8, prohibited BOM or
replacement characters refuse the PROJECT gate. No bulk EOL rewrite is
authorized.

Only after PROJECT evidence and all preceding owner lanes are valid:

1. regenerate the conversion queue;
2. run final corpus assurance once, at the end;
3. review the final receipts and exact heads;
4. generate `.fungi` as the remaining operation.

Until then, no queue regeneration, full corpus compile/build, profile
activation, TypeScript retirement, production authority or `.fungi` generation
is admitted. Any stale, dirty, missing, ignored or cancelled receipt remains a
hold, not a pass.
