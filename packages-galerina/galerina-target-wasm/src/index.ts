export interface WasmTarget {
  readonly runtime: "browser" | "edge" | "server" | "standalone";
  readonly features: readonly string[];
}

export interface WasmArtefact {
  readonly path: string;
  readonly target: WasmTarget;
  readonly exports: readonly string[];
  readonly imports: readonly string[];
}

export interface WasmTargetReport {
  readonly artefacts: readonly WasmArtefact[];
  readonly warnings: readonly string[];
}

// ── runtime contract helpers ──────────────────────────────────────────────────
// The interfaces above are the type contract; the helpers below enforce it at
// runtime for artefacts that arrive as untrusted parsed JSON. Fail-closed
// validators returning typed diagnostics, mirroring the green sibling target
// packages (target-cpu, target-ai-accelerator).

export type WasmDiagnosticSeverity = "warning" | "error";

export interface WasmDiagnostic {
  readonly code: string;
  readonly severity: WasmDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const WASM_RUNTIMES: readonly WasmTarget["runtime"][] = ["browser", "edge", "server", "standalone"];

function wasmDiagnostic(
  code: string,
  severity: WasmDiagnosticSeverity,
  message: string,
  path?: string,
): WasmDiagnostic {
  return { code, severity, message, ...(path === undefined ? {} : { path }) };
}

// An artefact must name a path, target a known runtime, and export something — a
// module with no exports can never be called (warning; it may be import-only glue,
// so not a hard error).
export function validateWasmArtefact(
  artefact: WasmArtefact,
  path = "artefact",
): readonly WasmDiagnostic[] {
  const diagnostics: WasmDiagnostic[] = [];

  if (artefact.path.trim().length === 0) {
    diagnostics.push(wasmDiagnostic(
      "Galerina_WASM_ARTEFACT_PATH_REQUIRED",
      "error",
      "Wasm artefact requires a path.",
      `${path}.path`,
    ));
  }

  if (!WASM_RUNTIMES.includes(artefact.target.runtime)) {
    diagnostics.push(wasmDiagnostic(
      "Galerina_WASM_RUNTIME_INVALID",
      "error",
      `Wasm target runtime must be one of: ${WASM_RUNTIMES.join(", ")}.`,
      `${path}.target.runtime`,
    ));
  }

  if (artefact.exports.length === 0) {
    diagnostics.push(wasmDiagnostic(
      "Galerina_WASM_ARTEFACT_NO_EXPORTS",
      "warning",
      "Wasm artefact declares no exports; nothing can be invoked from it.",
      `${path}.exports`,
    ));
  }

  return diagnostics;
}

// Build a wasm target report, validating every artefact and lifting warnings.
export function createWasmTargetReport(input: {
  readonly artefacts: readonly WasmArtefact[];
}): { readonly report: WasmTargetReport; readonly diagnostics: readonly WasmDiagnostic[] } {
  const diagnostics: WasmDiagnostic[] = [];
  const warnings: string[] = [];

  input.artefacts.forEach((artefact, index) => {
    for (const d of validateWasmArtefact(artefact, `artefacts.${index}`)) {
      diagnostics.push(d);
      if (d.severity === "warning") warnings.push(d.message);
    }
  });

  return { report: { artefacts: input.artefacts, warnings }, diagnostics };
}
