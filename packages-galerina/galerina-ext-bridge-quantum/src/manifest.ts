// manifest.ts — the ffsim bridge's signed-manifest. Uses the shared (extended)
// BridgeManifest: domain:"quantum", determinismMode:"tolerance", and the three required
// pins — validateManifestShape enforces fail-closed (any missing pin → invalid).
import { validateManifestShape, type BridgeManifest } from "../../galerina-inference-bridge-contract/dist/index.js";

export interface FfsimManifestInputs {
  readonly packageHash: string;          // sha256 of the built TS package
  readonly backendArtifactHash: string;  // sha256(venv lock + ffsim wheel + ffsim_worker.py)
  readonly pinnedEnvHash: string;        // sha256(venv lock)
  readonly ffsimVersion: string;         // recorded in layoutVersion provenance
  readonly tolerance: number;            // reproducibility band (Hartree)
  readonly certificationProfile?: "dev" | "certified";
}

/** Construct the ffsim BridgeManifest (precision OMITTED — N/A for a quantum backend). */
export function buildFfsimManifest(i: FfsimManifestInputs): BridgeManifest {
  return {
    bridgeId: "ffsim-quantum-v1",
    packageName: "@galerina/ext-bridge-quantum",
    packageHash: i.packageHash,
    sourceEngine: "qiskit-community/ffsim",
    layoutVersion: "ffsim-job-v1",
    hardwareIdentity: "py-ffsim-oop",
    determinismMode: "tolerance",
    certificationProfile: i.certificationProfile ?? "dev",
    domain: "quantum",
    tolerance: i.tolerance,
    pinnedEnvHash: i.pinnedEnvHash,
    backendArtifactHash: i.backendArtifactHash,
  };
}

/** Validate an ffsim manifest against the shared shape rules (incl. the tolerance fail-closed pins). */
export function validateFfsimManifest(m: BridgeManifest): { ok: boolean; reason?: string } {
  return validateManifestShape(m);
}
