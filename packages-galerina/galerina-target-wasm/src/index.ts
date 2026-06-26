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
