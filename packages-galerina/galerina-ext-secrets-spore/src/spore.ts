// spore.ts — single import seam onto the shipped @galerina/ext-spore engine.
//
// The whole package is a THIN orchestration layer: it owns NO crypto and NO container
// bytes. Every byte primitive comes from @galerina/ext-spore (writeSpore/readSpore, seal/open,
// buildContext, KEM_PROFILE 0x02, COMMIT_MODE.CTX). We re-export only what the
// orchestration needs so there is exactly ONE place that names the engine.
//
// Resolution: once this package is absorbed into packages-galerina/galerina-ext-secrets-spore
// the workspace resolves "@galerina/ext-spore" to its built dist. During in-staging build +
// test we resolve the same dist through a path alias (see tsconfig paths / the test
// loader shim). NO new crypto dependency is introduced here.
export {
  writeSpore,
  readSpore,
  seal,
  open,
  buildContext,
  keygen,
  KEM_PROFILE,
  AEAD_SUITE,
  DEM_MODE,
  COMMIT_MODE,
  SporeError,
  SporeCryptoError,
} from "@galerina/ext-spore";
export type { SporeSection, SporeReadResult, SealResult, AeadContextFields } from "@galerina/ext-spore";
