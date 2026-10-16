#ifndef GALERINA_VOK_AUTHORITY_HANDOFF_H
#define GALERINA_VOK_AUTHORITY_HANDOFF_H

/*
 * Out-of-process WAMR→VOK verifier file protocol.
 *
 * There is no C ABI in this crate. Do not link a Rust staticlib or
 * cdylib into the C WAMR runtime. Do not declare extern Rust symbols.
 * The verifier binary `vok-artifact-verifier` reads artifact bytes,
 * hashes them independently (it never accepts a caller digest), scans
 * every 4-byte window for Wasm magic, mints a process-local Signet,
 * consumes it, and writes:
 *
 *   --envelope-out  line-canonical Envelope (galerina.assurance.envelope.v1)
 *   --seal-out      terminal Wax Seal (galerina.assurance.wax-seal.v1)
 *
 * Envelope keys (sorted, LF, `key=value`):
 *   abi, buildPoint, capabilityDigest, componentDigest,
 *   dependencyClosureDigest, epoch, evidenceSetDigest, policyDigest,
 *   schemaVersion, target
 * followed by envelopeDigest=sha256:<hex> of framedDigest over those
 * ten lines. framedDigest = SHA-256 of
 *   "{domain.len}:{domain}{payload.len}:{payload}"
 *
 * Wax Seal keys (sorted):
 *   authentication, authorizing, envelopeDigest, kind, profileDigest,
 *   replayable, schemaVersion, terminalOutcome
 * followed by sealDigest. authorizing=false replayable=false
 * authentication=UNAUTHENTICATED_REFERENCE kind=WAX_SEAL.
 *
 * The C WAMR host re-hashes the load snapshot and binds
 * componentDigest plus envelopeDigest before wasm_runtime_load.
 * Copying the serialized seal cannot recreate the Signet.
 */

#endif
