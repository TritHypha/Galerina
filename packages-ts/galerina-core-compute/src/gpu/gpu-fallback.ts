// GPU fallback helpers (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. CPU is the only executable fallback
// under the v1 freeze.

import type { GpuFallbackPlan, GpuFallbackReason } from "./gpu-types.js";

export function cpuGpuFallback(reason: GpuFallbackReason): GpuFallbackPlan {
  return Object.freeze({ target: "cpu", reason });
}
