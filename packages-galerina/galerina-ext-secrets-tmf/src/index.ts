// @galerina/ext-secrets-tmf — sealed secrets on the .tmf container (OPTIONAL, ext tier).
//
// A THIN orchestration layer over @galerina/ext-tmf (format/crypto) + the
// @galerina/ext-secrets-vault store DISCIPLINE. NO new crypto, NO new container bytes.
// env.tmf = a v0 .tmf with flags.signed=0 (unsigned-but-ENCRYPTED). The signed root is GATED
// on ext-tmf slice 4 / #7 — we never fake a signature.
//
// Public surface:
//   schema  — env.tmf v0 layout (coord = SHAKE(name)[:16], one section/secret, sealed manifest)
//   store   — init/set/get/list/rm/rotate + the compose-reader (verify-before-decrypt, K3, fail-closed)
//   arena   — SealArena: in-memory zero-wiped fail-closed store (vault discipline, source-agnostic)
//   anchor  — key custody: local passphrase->Argon2id; prod via core-config SecretConfigSource kms/vault
//   runtime — boot loader: anchor -> compose-read -> arena, fail-closed
export * from "./schema.js";
export * from "./store.js";
export * from "./arena.js";
export * from "./anchor.js";
export * from "./runtime.js";
export { setMlockHook, tryMlock } from "./mlock.js";
