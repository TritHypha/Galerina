// Deno WebGPU float32 matrix multiply
// Run with: deno run --allow-env bench-deno-webgpu.ts --size 256

const size = parseInt(Deno.args.find(a => a.startsWith("--size"))?.split("=")[1] ?? Deno.args[Deno.args.indexOf("--size") + 1] ?? "128");
const iterations = parseInt(Deno.args.find(a => a.startsWith("--iterations"))?.split("=")[1] ?? Deno.args[Deno.args.indexOf("--iterations") + 1] ?? "10");

if (!navigator.gpu) {
  console.log(JSON.stringify({ runtime: "deno-webgpu", error: "WebGPU not available", benchmark: "matrix-multiply-v1" }));
  Deno.exit(0);
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  console.log(JSON.stringify({ runtime: "deno-webgpu", error: "No GPU adapter", benchmark: "matrix-multiply-v1" }));
  Deno.exit(0);
}
const device = await adapter.requestDevice();
const n = size;
const N = n * n * 4;  // float32 bytes

// Init matrices on CPU
const aData = new Float32Array(n * n);
const bData = new Float32Array(n * n);
for (let i = 0; i < n * n; i++) {
  aData[i] = (i % n) * 0.001 + 0.1;
  bData[i] = ((n * n - i) % n) * 0.001 + 0.1;
}

const aBuffer = device.createBuffer({ size: N, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
const bBuffer = device.createBuffer({ size: N, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
const cBuffer = device.createBuffer({ size: N, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
const readBuffer = device.createBuffer({ size: N, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

device.queue.writeBuffer(aBuffer, 0, aData);
device.queue.writeBuffer(bBuffer, 0, bData);

const shaderCode = `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let row = id.x;
  let col = id.y;
  let N = ${n}u;
  if (row >= N || col >= N) { return; }
  var sum = 0.0;
  for (var k = 0u; k < N; k++) {
    sum += A[row * N + k] * B[k * N + col];
  }
  C[row * N + col] = sum;
}
`;

const shader = device.createShaderModule({ code: shaderCode });
const pipeline = device.createComputePipeline({
  layout: "auto",
  compute: { module: shader, entryPoint: "main" },
});
const bg = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: aBuffer } },
    { binding: 1, resource: { buffer: bBuffer } },
    { binding: 2, resource: { buffer: cBuffer } },
  ],
});

// Warmup
const enc0 = device.createCommandEncoder();
const p0 = enc0.beginComputePass();
p0.setPipeline(pipeline); p0.setBindGroup(0, bg);
p0.dispatchWorkgroups(Math.ceil(n/8), Math.ceil(n/8));
p0.end();
device.queue.submit([enc0.finish()]);
await device.queue.onSubmittedWorkDone();

const t0 = performance.now();
for (let i = 0; i < iterations; i++) {
  const enc = device.createCommandEncoder();
  const p = enc.beginComputePass();
  p.setPipeline(pipeline); p.setBindGroup(0, bg);
  p.dispatchWorkgroups(Math.ceil(n/8), Math.ceil(n/8));
  p.end();
  device.queue.submit([enc.finish()]);
}
await device.queue.onSubmittedWorkDone();
const elapsedMs = performance.now() - t0;

// Read result for checksum
const enc2 = device.createCommandEncoder();
enc2.copyBufferToBuffer(cBuffer, 0, readBuffer, 0, N);
device.queue.submit([enc2.finish()]);
await readBuffer.mapAsync(GPUMapMode.READ);
const result = new Float32Array(readBuffer.getMappedRange().slice(0));
readBuffer.unmap();

const gflops = 2 * n * n * n * iterations / (elapsedMs / 1000) / 1e9;
console.log(JSON.stringify({
  runtime: "deno-webgpu",
  benchmark: "matrix-multiply-v1",
  device: "gpu (WebGPU)",
  matrixSize: n,
  iterations,
  checksum: result[0],
  elapsedMs: Number(elapsedMs.toFixed(3)),
  iterationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(2)),
  gflops: Number(gflops.toFixed(3)),
  notes: ["Deno WebGPU WGSL compute shader — 8×8 workgroups"],
}));
device.destroy();
