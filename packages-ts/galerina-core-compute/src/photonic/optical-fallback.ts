// Optical fallback helpers (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. CPU is the default executable fallback
// under the v1 freeze; network_io / cluster_runtime are named planning targets only.

import type { OpticalFallbackPlan, OpticalFallbackReason, OpticalFallbackTarget } from "./optical-types.js";

export function opticalFallback(
  target: OpticalFallbackTarget,
  reason: OpticalFallbackReason,
): OpticalFallbackPlan {
  return Object.freeze({ target, reason });
}

export function cpuOpticalFallback(reason: OpticalFallbackReason): OpticalFallbackPlan {
  return opticalFallback("cpu", reason);
}