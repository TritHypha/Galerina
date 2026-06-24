// tmf.ts — single import seam onto the shipped @logicn/ext-tmf engine.
//
// The whole package is a THIN orchestration layer: it owns NO crypto and NO container
// bytes. Every byte primitive comes from @logicn/ext-tmf (writeTmf/readTmf, seal/open,
// buildContext, KEM_PROFILE 0x02, COMMIT_MODE.CTX). We re-export only what the
// orchestration needs so there is exactly ONE place that names the engine.
//
// Resolution: once this package is absorbed into packages-logicn/logicn-ext-secrets-tmf
// the workspace resolves "@logicn/ext-tmf" to its built dist. During in-staging build +
// test we resolve the same dist through a path alias (see tsconfig paths / the test
// loader shim). NO new crypto dependency is introduced here.
export {
  writeTmf,
  readTmf,
  seal,
  open,
  buildContext,
  keygen,
  KEM_PROFILE,
  AEAD_SUITE,
  DEM_MODE,
  COMMIT_MODE,
  TmfError,
  TmfCryptoError,
} from "@logicn/ext-tmf";
export type { TmfSection, TmfReadResult, SealResult, AeadContextFields } from "@logicn/ext-tmf";
