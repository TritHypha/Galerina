/**
 * gpu-compute Deno WebGPU benchmark
 *
 * Runs the REAL GPU-parallel version of the gpu-compute workload:
 *   kernel(i) = i*2+1  over 100,000 elements, reduced to a sum with
 *   overflow wrap at 1,000,000,000.
 *
 * Uses Deno's built-in navigator.gpu (WebGPU API — no npm imports needed).
 * Falls back to a graceful JSON error if WebGPU is not available.
 *
 * Output JSON matches the other benchmark runners.
 *
 * Algorithm notes:
 *   The sequential wrap rule "if acc > 1e9 { acc -= 1e9 }" is equivalent to:
 *     result = ((rawSum - 1) % 1e9) + 1   when rawSum > 0
 *   where rawSum = sum of all kernel(i) without per-step clamping.
 *   For 100,000 elements: rawSum = 10,000,000,000 — overflows u32, so we
 *   accumulate as u64 {lo, hi} u32 pair. Buffer is padded to next power-of-2
 *   (131,072) so the stride-based tree reduction covers every element.
 */

const ELEMENTS = 100_000;
const DEFAULT_ITERATIONS = 1;

// Next power of 2 >= ELEMENTS for clean binary tree reduction
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

const PAD = nextPow2(ELEMENTS); // 131072

// ---------------------------------------------------------------------------
// WGSL — Map shader
// kernel(i) = i*2+1, stored as u64 pair {lo, hi} in a flat u32 array.
// Slots with i >= ELEMENTS are zero-filled (they contribute 0 to the sum).
// Buffer layout: [lo0, hi0, lo1, hi1, ...]  — 2 u32s per slot, PAD slots total.
// ---------------------------------------------------------------------------
const MAP_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> data: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i: u32 = gid.x;
  if (i >= ${PAD}u) { return; }
  // Only real elements get kernel(i); padding slots get 0
  if (i < ${ELEMENTS}u) {
    data[i * 2u]     = i * 2u + 1u;   // lo word (max 199999 — fits in u32)
    data[i * 2u + 1u] = 0u;            // hi word
  } else {
    data[i * 2u]     = 0u;
    data[i * 2u + 1u] = 0u;
  }
}
`;

// ---------------------------------------------------------------------------
// WGSL — Reduce shader
// Binary tree reduction over u64 pairs. Each pass halves the active count.
// With PAD = power-of-2, stride sequence 1,2,4,...,PAD/2 covers all elements.
// ---------------------------------------------------------------------------
const REDUCE_SHADER = /* wgsl */ `
struct Params { half_n: u32 }   // number of active pairs this pass

@group(0) @binding(0) var<storage, read_write> data: array<u32>;
@group(0) @binding(1) var<uniform>             params: Params;

fn u64_add(alo: u32, ahi: u32, blo: u32, bhi: u32) -> vec2<u32> {
  let lo    = alo + blo;
  let carry = select(0u, 1u, lo < alo);
  let hi    = ahi + bhi + carry;
  return vec2<u32>(lo, hi);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.half_n) { return; }

  // Element 'idx' absorbs element 'idx + half_n' (the right sibling in this pass)
  let a = idx;
  let b = idx + params.half_n;

  let alo = data[a * 2u];
  let ahi = data[a * 2u + 1u];
  let blo = data[b * 2u];
  let bhi = data[b * 2u + 1u];

  let r             = u64_add(alo, ahi, blo, bhi);
  data[a * 2u]      = r.x;
  data[a * 2u + 1u] = r.y;
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseIntFlag(name: string, fallback: number): number {
  const idx = Deno.args.indexOf(name);
  if (idx < 0) return fallback;
  const v = parseInt(Deno.args[idx + 1] ?? "", 10);
  return isNaN(v) ? fallback : v;
}

/**
 * Convert GPU raw sum to the sequential-wrap result that CPU runners produce.
 * CPU: acc += kernel(i); if (acc > 1e9) acc -= 1e9;   (left-fold, sequential)
 * Equivalent (when rawSum > 0): ((rawSum - 1) % 1e9) + 1
 */
function sequentialWrapResult(rawSumLo: number, rawSumHi: number): number {
  const rawSum = BigInt(rawSumHi) * 0x1_0000_0000n + BigInt(rawSumLo);
  if (rawSum === 0n) return 0;
  return Number(((rawSum - 1n) % 1_000_000_000n) + 1n);
}

// ---------------------------------------------------------------------------
// Single GPU dispatch: map + binary-tree reduce + readback
// ---------------------------------------------------------------------------
async function dispatchOnce(
  device: GPUDevice,
  elements: number,
  pad: number,
  mapPipeline: GPUComputePipeline,
  mapBindGroup: GPUBindGroup,
  reducePipeline: GPUComputePipeline,
  reduceBindGroup: GPUBindGroup,
  uniformBuffer: GPUBuffer,
  dataBuffer: GPUBuffer,
  stagingBuffer: GPUBuffer,
): Promise<{ resultLo: number; resultHi: number; dispatchMs: number }> {
  const encoder = device.createCommandEncoder();

  // --- Map pass: fill all PAD slots ---
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(mapPipeline);
    pass.setBindGroup(0, mapBindGroup);
    pass.dispatchWorkgroups(Math.ceil(pad / 64));
    pass.end();
  }

  // Submit the map pass first
  const tDispatch0 = performance.now();
  device.queue.submit([encoder.finish()]);

  // --- Binary tree reduction: one submit per pass so writeBuffer is flushed ---
  // (writeBuffer is a queue operation; if batched in one command buffer the
  //  uniform would have the last-written value for ALL passes.)
  let halfN = pad / 2;
  while (halfN >= 1) {
    // Write this pass's half_n to the uniform buffer BEFORE encoding the pass
    const uniformData = new Uint32Array([halfN]);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(reducePipeline);
    pass.setBindGroup(0, reduceBindGroup);
    pass.dispatchWorkgroups(Math.ceil(halfN / 64));
    pass.end();
    device.queue.submit([enc.finish()]);

    halfN = Math.floor(halfN / 2);
  }

  // Copy result u64 (8 bytes) to staging and wait for all GPU work
  const copyEnc = device.createCommandEncoder();
  copyEnc.copyBufferToBuffer(dataBuffer, 0, stagingBuffer, 0, 8);
  device.queue.submit([copyEnc.finish()]);
  await device.queue.onSubmittedWorkDone();
  const dispatchMs = performance.now() - tDispatch0;

  // Readback
  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint32Array(stagingBuffer.getMappedRange());
  const resultLo = mapped[0];
  const resultHi = mapped[1];
  stagingBuffer.unmap();

  return { resultLo, resultHi, dispatchMs };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const elements = parseIntFlag("--elements", ELEMENTS);
  const pad = nextPow2(elements);
  const iterations = parseIntFlag(
    "--operations",
    parseIntFlag("--iterations", DEFAULT_ITERATIONS),
  );

  // --- Check WebGPU availability ---
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) {
    console.log(
      JSON.stringify(
        {
          runtime: "deno-webgpu",
          benchmark: "gpu-compute-v1",
          device: "unavailable",
          elements,
          iterations,
          result: null,
          elapsedMs: null,
          operationsPerSecond: null,
          error: "WebGPU not available (navigator.gpu is undefined)",
          notes: ["Run with: deno run --unstable-webgpu bench-deno-webgpu.ts"],
        },
        null,
        2,
      ),
    );
    return;
  }

  // --- Adapter & Device ---
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch (_) {
    adapter = null;
  }

  if (!adapter) {
    console.log(
      JSON.stringify(
        {
          runtime: "deno-webgpu",
          benchmark: "gpu-compute-v1",
          device: "unavailable",
          elements,
          iterations,
          result: null,
          elapsedMs: null,
          operationsPerSecond: null,
          error:
            "No WebGPU adapter found (GPU driver or Vulkan may be missing)",
          notes: [
            "Ensure Vulkan-capable GPU and up-to-date drivers are present.",
          ],
        },
        null,
        2,
      ),
    );
    return;
  }

  const device = await adapter.requestDevice();

  // Get adapter label (Deno 2.x: adapter.info is a synchronous property)
  let deviceLabel = "gpu (WebGPU)";
  try {
    const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
    if (info) {
      deviceLabel =
        (info as GPUAdapterInfo & { description?: string }).description ||
        info.device ||
        info.vendor ||
        "gpu (WebGPU)";
    }
  } catch (_) {
    // ignore
  }

  // --- Compile shaders ---
  const mapModule = device.createShaderModule({ code: MAP_SHADER });
  const reduceModule = device.createShaderModule({ code: REDUCE_SHADER });

  const mapPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: mapModule, entryPoint: "main" },
  });
  const reducePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: reduceModule, entryPoint: "main" },
  });

  // --- Buffers ---
  // data: PAD u64 pairs = pad * 8 bytes
  const dataBuffer = device.createBuffer({
    size: pad * 8,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  });

  // staging: 8 bytes for the u64 result
  const stagingBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // uniform: half_n (u32) = 4 bytes
  const uniformBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Bind groups
  const mapBindGroup = device.createBindGroup({
    layout: mapPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: dataBuffer } }],
  });

  const reduceBindGroup = device.createBindGroup({
    layout: reducePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: dataBuffer } },
      { binding: 1, resource: { buffer: uniformBuffer } },
    ],
  });

  // Count reduce passes (log2(pad))
  const numReducePasses = Math.log2(pad);

  // --- Warmup ---
  await dispatchOnce(
    device, elements, pad,
    mapPipeline, mapBindGroup,
    reducePipeline, reduceBindGroup,
    uniformBuffer, dataBuffer, stagingBuffer,
  );

  // --- Timed run ---
  const t0 = performance.now();
  let gpuDispatchMs = 0;
  let finalLo = 0;
  let finalHi = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const { resultLo, resultHi, dispatchMs } = await dispatchOnce(
      device, elements, pad,
      mapPipeline, mapBindGroup,
      reducePipeline, reduceBindGroup,
      uniformBuffer, dataBuffer, stagingBuffer,
    );
    finalLo = resultLo;
    finalHi = resultHi;
    gpuDispatchMs += dispatchMs;
  }

  const elapsedMs = performance.now() - t0;
  const totalElements = iterations * elements;

  // Apply sequential-wrap formula to match CPU runners
  const result = sequentialWrapResult(finalLo, finalHi);
  const rawSum = BigInt(finalHi) * 0x1_0000_0000n + BigInt(finalLo);

  const output = {
    runtime: "deno-webgpu",
    benchmark: "gpu-compute-v1",
    device: `gpu (WebGPU — ${deviceLabel})`,
    elements,
    iterations,
    result,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    gpuDispatchMs: Number(gpuDispatchMs.toFixed(3)),
    operationsPerSecond: Number(
      (totalElements / (elapsedMs / 1000)).toFixed(0),
    ),
    notes: [
      "Real GPU parallel execution via WebGPU (Deno built-in navigator.gpu).",
      `Map: ${Math.ceil(pad / 64)} workgroups × 64 threads; ${elements} real elements, ${pad - elements} zero-padded to power-of-2.`,
      `Reduce: ${numReducePasses} binary-tree passes with u64 carry; rawSum = ${rawSum}.`,
      "result = ((rawSum-1) % 1e9) + 1 — equivalent to the sequential CPU wrap algorithm.",
      "elapsedMs = wall time incl. GPU readback; gpuDispatchMs = GPU submit+wait only.",
      `Adapter: ${deviceLabel}`,
    ],
  };

  console.log(JSON.stringify(output, null, 2));

  // Cleanup
  dataBuffer.destroy();
  stagingBuffer.destroy();
  uniformBuffer.destroy();
  device.destroy();
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.log(
    JSON.stringify(
      {
        runtime: "deno-webgpu",
        benchmark: "gpu-compute-v1",
        device: "error",
        result: null,
        elapsedMs: null,
        operationsPerSecond: null,
        error: String(err),
        notes: ["Unexpected error during WebGPU benchmark."],
      },
      null,
      2,
    ),
  );
});
