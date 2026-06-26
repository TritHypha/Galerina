// limits.ts — the pure-TS PRE-SPAWN limit gate (Hardened Border Stage 2 — "Interrogate").
// Deny-by-default: a job is admitted only if it satisfies EVERY ceiling. This runs BEFORE
// any subprocess exists; a breach is a distinct, audited error code and NO worker spawns.
import { subspaceDim, stateVectorBytes } from "./subspace.js";
import { QUANTUM_OPS, type QuantumJob, type QuantumLimits } from "./quantum-contract.js";

export type LimitVerdict = { ok: true } | { ok: false; errorCode: string; reason: string };

const BYTES_PER_MB = 1024 * 1024;

/** Validate a job against its limits. Fail-closed: Infinity (un-representable) fails every `<=`. */
export function checkJobLimits(job: QuantumJob, limits: QuantumLimits): LimitVerdict {
  if (!QUANTUM_OPS.includes(job.op)) {
    return { ok: false, errorCode: "ERR_UNKNOWN_OP", reason: `op '${String(job.op)}' is not in the permitted set` };
  }
  if (!Number.isInteger(job.norb) || job.norb <= 0) {
    return { ok: false, errorCode: "ERR_INVALID_ORBITALS", reason: `norb must be a positive integer (got ${job.norb})` };
  }
  if (job.norb > limits.maxOrbitals) {
    return { ok: false, errorCode: "ERR_ORBITALS_EXCEEDED", reason: `norb ${job.norb} > max_orbitals ${limits.maxOrbitals}` };
  }
  const [na, nb] = job.nelec;
  if (!Number.isInteger(na) || !Number.isInteger(nb) || na < 0 || nb < 0 || na > job.norb || nb > job.norb) {
    return { ok: false, errorCode: "ERR_INVALID_NELEC", reason: `nelec (${na},${nb}) out of range for norb ${job.norb}` };
  }
  if (!Number.isInteger(job.seed) || job.seed < 0) {
    return { ok: false, errorCode: "ERR_INVALID_SEED", reason: `seed must be a non-negative integer (got ${job.seed})` };
  }
  // The REAL governor — the FCI subspace dimension (§6). Infinity (overflow) fails fail-closed.
  const dim = subspaceDim(job.norb, job.nelec);
  if (!(dim <= limits.maxSubspaceDim)) {
    return { ok: false, errorCode: "ERR_SUBSPACE_TOO_LARGE", reason: `subspaceDim ${dim} > max_subspace_dim ${limits.maxSubspaceDim}` };
  }
  const mb = stateVectorBytes(job.norb, job.nelec) / BYTES_PER_MB;
  if (!(mb <= limits.maxMemoryMB)) {
    return { ok: false, errorCode: "ERR_MEMORY_EXCEEDED", reason: `state-vector ~${Math.round(mb)}MB > max_memory ${limits.maxMemoryMB}MB` };
  }
  // Params must be FINITE numbers (or arrays of them). No NaN/Inf/strings reach the worker.
  for (const [k, v] of Object.entries(job.params)) {
    const vals = Array.isArray(v) ? v : [v];
    for (const x of vals) {
      if (typeof x !== "number" || !Number.isFinite(x)) {
        return { ok: false, errorCode: "ERR_INVALID_PARAMS", reason: `param '${k}' must be finite number(s)` };
      }
    }
  }
  const steps = typeof job.params["trotter_steps"] === "number" ? job.params["trotter_steps"] : undefined;
  if (limits.maxTrotterSteps !== undefined && steps !== undefined && steps > limits.maxTrotterSteps) {
    return { ok: false, errorCode: "ERR_TROTTER_STEPS_EXCEEDED", reason: `trotter_steps ${steps} > max ${limits.maxTrotterSteps}` };
  }
  const shots = typeof job.params["shots"] === "number" ? job.params["shots"] : undefined;
  if (limits.maxShots !== undefined && shots !== undefined && shots > limits.maxShots) {
    return { ok: false, errorCode: "ERR_SHOTS_EXCEEDED", reason: `shots ${shots} > max ${limits.maxShots}` };
  }
  return { ok: true };
}
