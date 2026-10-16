#ifndef GALERINA_VOK_AUTHORITY_HANDOFF_H
#define GALERINA_VOK_AUTHORITY_HANDOFF_H

/*
 * Out-of-process WAMR→VOK verifier pipe protocol.
 *
 * There is no C ABI in this crate. Do not link a Rust staticlib or
 * cdylib into the C WAMR runtime. Do not declare extern Rust symbols.
 * The C host hash-pins the `vok-artifact-verifier` binary, fexecves
 * the same fd, writes artifact bytes to stdin, and reads the verdict
 * only from stdout. The verifier hashes stdin itself (it never accepts
 * a caller digest), scans every 4-byte window for Wasm magic, mints a
 * process-local Signet, consumes it, and writes:
 *
 *   GALERINA_VOK_VERDICT_V1\n
 *   ENVELOPE <nbytes>\n
 *   <line-canonical Envelope including envelopeDigest>
 *   SEAL <nbytes>\n
 *   <line-canonical Wax Seal including sealDigest>
 *
 * File mode (`--artifact` / `--envelope-out` / `--seal-out`) remains
 * for inspection. The C load path uses `--stdin` only.
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
 * authentication=PINNED_CHILD_PIPE kind=WAX_SEAL.
 *
 * UNAUTHENTICATED_REFERENCE is not an accepting load state. Copying a
 * serialized seal cannot recreate the Signet and cannot set C
 * pipe_origin.
 */

#endif
