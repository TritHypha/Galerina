// @logicn/ext-tmf — the .tmf format engine (Phase 2, roadmap #6).
//
// Build order (specs frozen in LogicN-R-AND-D/tmf/spec/*):
//   ✅ Slice 1 — TMX-256 integrity core (TriMerkle-XOF / SHAKE256)
//   ✅ Slice 2 — container reader/writer (header + 56-byte section table; §6 fail-closed reader)
//   ✅ Slice 3 — KEM-DEM confidentiality (hybrid X25519+ML-KEM-768 → SHAKE256 KDF → AES-256-GCM + CTX commit)
//   ⬜ Slice 4 — ML-DSA-65 signing over the root (#7), via @noble/post-quantum (hybrid Ed25519)
//   ⬜ Slice 5 — inclusion proofs + history chain + Governed Trust Capsule (#12)
export { H, ARITY, ABSENT, leafHash, nodeHash, topNode, tmxRoot } from "./tmx256.js";
export {
  MAGIC, HEADER_SIZE, HEADER_CORE_SIZE, ENTRY_SIZE, TMX_PROFILE_SHAKE,
  TmfError, headerCore, writeTmf, readTmf,
} from "./container.js";
export type { TmfErrorCode, TmfSection, TmfReadResult } from "./container.js";
export {
  AEAD_CONTEXT_SIZE, COMMIT_SIZE, KEM_PROFILE, KEM_CT_SIZE, AEAD_SUITE, DEM_MODE, COMMIT_MODE,
  TmfCryptoError, buildContext, commitModeOf, deriveKaead, keyCommit, committedAad,
  streamNonce12, streamNonce24, ctxCommitTag, keygen, seal, open, streamSeal, streamOpen,
} from "./kemdem.js";
export type { TmfCryptoCode, AeadContextFields, SealResult, StreamSealResult } from "./kemdem.js";
