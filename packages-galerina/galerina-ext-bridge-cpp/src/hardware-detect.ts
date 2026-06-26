/**
 * hardware-detect.ts — real CPU + NVIDIA GPU capability detection
 *
 * The bridge needs to know what silicon is actually present so it can select the
 * correct BitNet kernel family (TL1 ARM / TL2 x86) and decide whether a GPU path
 * is even possible. Detection is honest: where Node cannot truly probe a feature
 * (e.g. AVX2 instruction support), the result is marked as inferred-from-arch.
 */

import { spawnSync } from "node:child_process";
import { arch, cpus } from "node:os";

export interface CpuCapability {
  readonly arch: string;            // "x64" | "arm64" | ...
  readonly cores: number;
  readonly model: string;
  /** BitNet kernel family for this arch (matches bitnet.cpp build flags). */
  readonly kernelFamily: "tl1" | "tl2" | "scalar";
  /** SIMD support is inferred from arch (Node cannot probe AVX2 directly). */
  readonly simd: "avx2-assumed" | "neon-assumed" | "none";
}

export interface GpuCapability {
  readonly available: boolean;
  readonly name?: string;
  readonly memoryMiB?: number;
  readonly driver?: string;
  /** Whether a CUDA BitNet kernel could run here (requires compiled kernel — see native/). */
  readonly cudaKernelReady: boolean;
}

export function detectCpu(): CpuCapability {
  const a = arch();
  const list = cpus();
  const model = list[0]?.model ?? "unknown";
  let kernelFamily: CpuCapability["kernelFamily"];
  let simd: CpuCapability["simd"];
  if (a === "x64") { kernelFamily = "tl2"; simd = "avx2-assumed"; }
  else if (a === "arm64") { kernelFamily = "tl1"; simd = "neon-assumed"; }
  else { kernelFamily = "scalar"; simd = "none"; }
  return { arch: a, cores: list.length, model, kernelFamily, simd };
}

export function detectGpu(): GpuCapability {
  // Probe via nvidia-smi. Absent / non-NVIDIA machines return { available: false }.
  try {
    const r = spawnSync(
      "nvidia-smi",
      ["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"],
      { encoding: "utf-8", timeout: 5000 },
    );
    if (r.status !== 0 || !r.stdout?.trim()) {
      return { available: false, cudaKernelReady: false };
    }
    const first = r.stdout.trim().split("\n")[0]!;
    const parts = first.split(",").map((s) => s.trim());
    const name = parts[0];
    const memoryMiB = parts[1] ? parseInt(parts[1], 10) : undefined;
    const driver = parts[2];
    return {
      available: true,
      ...(name !== undefined ? { name } : {}),
      ...(memoryMiB !== undefined && !Number.isNaN(memoryMiB) ? { memoryMiB } : {}),
      ...(driver !== undefined ? { driver } : {}),
      // CUDA kernel is a documented seam (native/README.md). GPU present ≠ kernel built.
      cudaKernelReady: false,
    };
  } catch {
    return { available: false, cudaKernelReady: false };
  }
}
