/**
 * @galerina/ext-bridge-cpp — native CPU/GPU execution bridges for the Tower
 *
 * The first real implementations of the InferenceBridge contract defined in
 * @galerina/tower-citizen. Brings BitNet ternary kernels (MIT, C:\wwwprojects\BitNet)
 * to the governed runtime, with the native addon as a documented seam and the
 * TPLSimulator as the deterministic fallback.
 */

export { BitNetCpuBridge } from "./bitnet-cpu-bridge.js";
export { BitNetGpuBridge } from "./bitnet-gpu-bridge.js";
export { detectCpu, detectGpu } from "./hardware-detect.js";
export type { CpuCapability, GpuCapability } from "./hardware-detect.js";
export { loadNativeAddon } from "./addon-loader.js";
export type { BitNetNativeAddon, AddonLoadResult } from "./addon-loader.js";

import { BitNetCpuBridge } from "./bitnet-cpu-bridge.js";
import { BitNetGpuBridge } from "./bitnet-gpu-bridge.js";
import type { InferenceBridge, BridgeRegistry } from "@galerina/inference-bridge-contract";

/**
 * Build the best available ternary bridge for this machine:
 *   - GPU bridge if an NVIDIA GPU with a ready CUDA kernel is present
 *   - otherwise the CPU bridge (native SIMD if compiled, else simulator)
 *
 * This is the "self-registration" entry point: the Tower's HybridEngine asks for
 * the ternary bridge and gets whichever the hardware supports.
 */
export function selectTernaryBridge(): InferenceBridge {
  const gpu = new BitNetGpuBridge();
  if (gpu.nativeAvailable) return gpu; // CUDA kernel ready
  return new BitNetCpuBridge();        // CPU path (native or simulator)
}

/**
 * Build a BridgeRegistry the Tower's HybridInferenceEngine can consume directly:
 *
 *   import { createHybridEngine } from "@galerina/tower-citizen";
 *   import { createCppBridgeRegistry } from "@galerina/ext-bridge-cpp";
 *   const engine = createHybridEngine({ bridges: createCppBridgeRegistry() });
 *
 * This is the concrete Brain→Brawn wiring: the engine routes ternary ops to this
 * package's BitNet bridge (native SIMD when compiled, the determinism-checked
 * simulator otherwise) instead of the in-package stub. Techniques this package
 * does not implement (fp4/fp8/fp16) are simply absent — the engine handles a
 * missing technique by running it on the host-native path.
 */
export function createCppBridgeRegistry(): BridgeRegistry {
  const ternary = selectTernaryBridge();
  return new Map([[ternary.technique, ternary]]) as BridgeRegistry;
}
