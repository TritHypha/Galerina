// env-detect.ts — honest probe for an importable ffsim. Mirrors the cpp bridge's
// hardware-detect: if python or ffsim is absent, report available:false with a reason —
// never pretend. Phase 1 governance is fully testable WITHOUT ffsim installed.
import { spawnSync } from "node:child_process";

export interface FfsimEnv {
  readonly available: boolean;
  readonly pythonVersion?: string;
  readonly ffsimVersion?: string;
  readonly reason?: string;
}

/** Probe `python --version` then `import ffsim`. Injection-safe (argv array, shell:false). */
export function detectFfsim(pythonBin = "python"): FfsimEnv {
  let py;
  try {
    py = spawnSync(pythonBin, ["--version"], { encoding: "utf8", timeout: 5000, shell: false });
  } catch {
    return { available: false, reason: `cannot invoke '${pythonBin}'` };
  }
  if (!py || py.status !== 0) {
    return { available: false, reason: `'${pythonBin} --version' failed` };
  }
  const pythonVersion = (py.stdout || py.stderr || "").trim();
  const probe = spawnSync(pythonBin, ["-c", "import ffsim; print(ffsim.__version__)"], { encoding: "utf8", timeout: 15000, shell: false });
  if (!probe || probe.status !== 0) {
    return { available: false, pythonVersion, reason: "ffsim not importable in this environment" };
  }
  return { available: true, pythonVersion, ffsimVersion: (probe.stdout || "").trim() };
}
