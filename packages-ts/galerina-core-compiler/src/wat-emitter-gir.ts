import { STDLIB_CAPABILITY_MAP } from "./stdlib-registry.js";
import { found, none, type Lookup, type WATImport } from "./wat-emitter-types.js";

/**
 * Parse `module:name` host import strings. Missing `:` is a named skip
 * (`none("missing-colon")`), never null/undefined/NaN.
 */
export function wasmImportStringToWATImport(wasmImport: string, effect: string): Lookup<WATImport> {
  const colonIdx = wasmImport.indexOf(":");
  if (colonIdx === -1) return none("missing-colon");
  const module = wasmImport.slice(0, colonIdx);
  const name = wasmImport.slice(colonIdx + 1);
  return found({
    module,
    name,
    effect,
    type: { params: ["i32", "i32"], results: ["i32"] },
  });
}

/**
 * Returns WATImport entries for the given declared effect names, resolved
 * through STDLIB_CAPABILITY_MAP. Malformed wasmImport strings (no `:`) are
 * omitted via the named none skip — same observable import set as before.
 */
export function getWATImportsForEffects(effects: readonly string[]): WATImport[] {
  const importsByKey = new Map<string, WATImport>();
  for (const effect of effects) {
    for (const [, entry] of STDLIB_CAPABILITY_MAP) {
      if (entry.requiredEffects.includes(effect) && entry.wasmImport) {
        const key = entry.wasmImport;
        if (!importsByKey.has(key)) {
          const parsed = wasmImportStringToWATImport(entry.wasmImport, effect);
          if (parsed.kind === "found") importsByKey.set(key, parsed.value);
        }
      }
    }
  }
  return Array.from(importsByKey.values());
}
