import { createHybridEngine, type HybridInferenceEngine } from "./hybrid-engine.js";
import { compilePolicy } from "./compiled-policy.js";

/** The named inference products exclude analog photonic configuration. */
export type TowerProductOptions = Omit<NonNullable<Parameters<typeof createHybridEngine>[0]>, "photonic">;

export interface TowerProduct<P extends "tower.certified.v1" | "tower.dev.v1"> {
  readonly profile: P;
  readonly engine: HybridInferenceEngine;
}

function refusePhotonic(options: TowerProductOptions): void {
  if ("photonic" in options) {
    throw new Error("ERR_PROFILE_PHOTONIC_FORBIDDEN: declare a photonic composition separately");
  }
}

/** Construction names a policy, not a production certification or admission receipt. */
export function createCertifiedTower(options: TowerProductOptions = {}): TowerProduct<"tower.certified.v1"> {
  if (options.allowUnsignedLoad === true) {
    throw new Error("ERR_CERTIFIED_UNSIGNED_LOAD_FORBIDDEN: certified tower forbids allowUnsignedLoad");
  }
  if (options.certified === false) throw new Error("ERR_PROFILE_CONTRADICTION: certified product cannot opt out");
  refusePhotonic(options);
  const policy = compilePolicy(options.governance ?? {}, true);
  if (policy.certifiedTrap) throw new Error(`${policy.certifiedTrap.code}: certified policy refused`);
  const gov = options.governance;
  if (!Array.isArray(gov?.approvedModels) || gov.approvedModels.some((model) => typeof model !== "string" || model.trim() === "")
    || typeof gov.maxNewTokens !== "number" || !Number.isSafeInteger(gov.maxNewTokens) || gov.maxNewTokens < 0
    || typeof gov.maxTokenCost !== "string" || gov.maxTokenCost.trim() === ""
    || gov.denyHostNativeFallback !== true) {
    throw new Error("ERR_CERTIFIED_INVALID_POLICY: certified fields must contain valid models, token budget, cost declaration and host-native denial");
  }
  if (options.governance?.allowHostNativeFallback === true) {
    throw new Error("ERR_CERTIFIED_HOST_NATIVE_OPEN: certified product forbids host-native opt-in");
  }
  const engine = createHybridEngine({...options, certified:true, allowUnsignedLoad:false});
  return Object.freeze({profile:"tower.certified.v1", engine});
}

/** Development relaxations must each be explicit; this product is never certified. */
export function createDevTower(options: TowerProductOptions = {}): TowerProduct<"tower.dev.v1"> {
  if (options.certified === true) throw new Error("ERR_PROFILE_CONTRADICTION: dev product cannot be certified");
  refusePhotonic(options);
  const engine = createHybridEngine({...options, certified:false, allowUnsignedLoad:options.allowUnsignedLoad === true});
  return Object.freeze({profile:"tower.dev.v1", engine});
}
