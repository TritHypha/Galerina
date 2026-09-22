/**
 * Closed Tower product-line profiles (RD-1295).
 *
 * `tower.governance.v1` (frozen §6.2) is kernel + governance; its closed set is
 * GOVERNANCE_ALLOWED_STEMS. The governance subpath is the §6.10 `cli-check`
 * composition: kernel-free governance modules only. Extra loaded modules are a
 * TCB violation. Canonical identities are realpaths under dist/, not basenames.
 */

/** Frozen RD-1295 §6.2; admitted by governanceAllowedFiles in load-graph. */
export const TOWER_PROFILE_GOVERNANCE = "tower.governance.v1" as const;

/** Implemented kernel-free composition (RD-1295 §6.10). */
export const TOWER_COMPOSITION_CLI_CHECK = "cli-check" as const;

/** Dist stems admitted for cli-check. Kernel (`tower-runtime`, …) is excluded. */
export const CLI_CHECK_ALLOWED_STEMS: readonly string[] = Object.freeze([
  "governance",
  "product-profiles",
  "trit-gates",
  "three-valued-governance",
  "epistemic-type-state",
  "ai-governance",
  "compiled-policy",
  "gate-cache",
  "governance-enforcer",
]);

/** @deprecated Use CLI_CHECK_ALLOWED_STEMS. Kept as the cli-check set, not §6.2. */
export const GOVERNANCE_PROFILE_MODULES: readonly string[] = CLI_CHECK_ALLOWED_STEMS;

export const CLI_CHECK_PERMITTED_EXTERNALS: readonly string[] = Object.freeze([
  "node:crypto",
]);

/** Dist stems admitted for tower.kernel.v1. */
export const KERNEL_ALLOWED_STEMS: readonly string[] = Object.freeze([
  "kernel",
  "tower-runtime",
  "plugin-sandbox",
  "plugin-manifest",
  "audit-logger",
  "bridge-attestation",
]);

export const KERNEL_PERMITTED_EXTERNALS: readonly string[] = Object.freeze([
  "node:crypto",
  "node:fs",
  "node:path",
  "node:util",
]);

/** Exact §6.2 union, without a new entry module or an implicit full barrel. */
export const GOVERNANCE_ALLOWED_STEMS: readonly string[] = Object.freeze([
  ...new Set([...KERNEL_ALLOWED_STEMS, ...CLI_CHECK_ALLOWED_STEMS]),
]);

export const TPL_ALLOWED_STEMS: readonly string[] = Object.freeze([
  "tpl", "tpl-simulator", "trit-gates",
]);
export const PHOTONIC_ALLOWED_STEMS: readonly string[] = Object.freeze([
  "photonic", "photonic-admission", "substrate-model", "substrate-snapshot",
  "substrate-erasure", "deadzone-dispatcher", "three-valued-governance", "trit-gates",
]);
export const CUSTODY_ALLOWED_STEMS: readonly string[] = Object.freeze([
  "custody", "lease", "quorum", "key-rotation", "capability-grant", "bridge-attestation",
  "registry-key-rotation", "registry-public-verifier", "snapshot-key-provider",
  "three-valued-governance", "trit-gates",
]);
export const DATAPLANE_ALLOWED_STEMS: readonly string[] = Object.freeze([
  "dataplane", "data-plane-border", "partial-return", "transport-fsm",
  "three-valued-governance", "trit-gates",
]);
/** Existing inference uses the TPL stub and signed-capability verification seam. */
export const INFERENCE_ALLOWED_STEMS: readonly string[] = Object.freeze([
  "inference", "product-constructors", "hybrid-engine", "precision-strategy",
  "bridge/interface", "bridge/stub-provider", "tower-runtime", "plugin-sandbox",
  "plugin-manifest", "audit-logger", "bridge-attestation", "capability-grant",
  "compiled-policy", "governance-enforcer", "tpl-simulator", "trit-gates",
]);
export const PRODUCT_STEMS = Object.freeze({
  kernel: KERNEL_ALLOWED_STEMS,
  governance: CLI_CHECK_ALLOWED_STEMS,
  inference: INFERENCE_ALLOWED_STEMS,
  tpl: TPL_ALLOWED_STEMS,
  photonic: PHOTONIC_ALLOWED_STEMS,
  custody: CUSTODY_ALLOWED_STEMS,
  dataplane: DATAPLANE_ALLOWED_STEMS,
});
export type TowerProductEntry = keyof typeof PRODUCT_STEMS;

/** Frozen RD-1295 §6.10 declared compositions. Any other union is refused. */
export const TOWER_COMPOSITION_IDS = Object.freeze([
  "cli-check",
  "certified",
  "air-gap",
  "photonic",
  "registry",
  "api-data",
  "full-lab",
] as const);
export type TowerCompositionId = (typeof TOWER_COMPOSITION_IDS)[number];

function clusters(...ids: TowerProductEntry[]): readonly TowerProductEntry[] {
  return Object.freeze(ids);
}

export const COMPOSITION_CLUSTERS: Readonly<Record<TowerCompositionId, readonly TowerProductEntry[]>> = Object.freeze({
  "cli-check": clusters("governance"),
  certified: clusters("kernel", "governance", "inference"),
  "air-gap": clusters("kernel", "governance", "inference", "tpl"),
  photonic: clusters("governance", "photonic"),
  registry: clusters("kernel", "custody"),
  "api-data": clusters("governance", "dataplane"),
  "full-lab": clusters("kernel", "governance", "inference", "tpl", "photonic", "custody", "dataplane"),
});

export function compositionClusters(id: string): readonly TowerProductEntry[] {
  if (!Object.hasOwn(COMPOSITION_CLUSTERS, id)) {
    throw new Error(`ERR_TOWER_COMPOSITION_UNKNOWN: undeclared union '${id}'`);
  }
  return COMPOSITION_CLUSTERS[id as TowerCompositionId];
}
export const PRODUCT_EXTERNALS: Readonly<Record<TowerProductEntry, readonly string[]>> = Object.freeze({
  kernel: KERNEL_PERMITTED_EXTERNALS,
  governance: CLI_CHECK_PERMITTED_EXTERNALS,
  inference: KERNEL_PERMITTED_EXTERNALS,
  tpl: Object.freeze([]),
  photonic: Object.freeze(["node:crypto", "node:util/types"]),
  custody: Object.freeze(["node:crypto"]),
  dataplane: Object.freeze([]),
});

/** Kernel must not load these Tower stems. */
export const KERNEL_FORBIDDEN_MODULES: readonly string[] = Object.freeze([
  "tpl-simulator",
  "photonic-admission",
  "substrate-model",
  "substrate-snapshot",
  "substrate-erasure",
  "deadzone-dispatcher",
  "hybrid-engine",
  "precision-strategy",
  "lease",
  "quorum",
  "key-rotation",
  "capability-grant",
  "registry-key-rotation",
  "registry-public-verifier",
  "snapshot-key-provider",
  "data-plane-border",
  "partial-return",
  "transport-fsm",
]);

/** Modules that must not appear in the cli-check / governance load set. */
export const GOVERNANCE_FORBIDDEN_MODULES: readonly string[] = Object.freeze([
  "hybrid-engine",
  "precision-strategy",
  "tpl-simulator",
  "photonic-admission",
  "substrate-model",
  "substrate-snapshot",
  "substrate-erasure",
  "deadzone-dispatcher",
  "tower-runtime",
  "plugin-sandbox",
  "plugin-manifest",
  "audit-logger",
  "lease",
  "quorum",
  "key-rotation",
  "capability-grant",
  "bridge-attestation",
  "registry-key-rotation",
  "registry-public-verifier",
  "snapshot-key-provider",
  "data-plane-border",
  "partial-return",
  "transport-fsm",
]);

export function moduleStem(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  return base.replace(/\.(js|ts|mjs|cjs)$/, "");
}

export function forbiddenProfileModules(
  loadedFiles: readonly string[],
  forbidden: readonly string[] = GOVERNANCE_FORBIDDEN_MODULES,
): readonly string[] {
  const found = new Set<string>();
  for (const file of loadedFiles) {
    const stem = moduleStem(file);
    if (forbidden.includes(stem)) found.add(stem);
  }
  return [...found].sort();
}
