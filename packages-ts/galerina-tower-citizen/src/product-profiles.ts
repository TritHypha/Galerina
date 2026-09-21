/**
 * Closed Tower product-line profiles (RD-1295). Membership is filename stems
 * under src/, not export names. Extra loaded modules are a TCB violation.
 */

export const TOWER_PROFILE_GOVERNANCE = "tower.governance.v1" as const;
export const TOWER_COMPOSITION_CLI_CHECK = "cli-check" as const;

/** Runtime modules admitted for governance / cli-check. */
export const GOVERNANCE_PROFILE_MODULES: readonly string[] = Object.freeze([
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
