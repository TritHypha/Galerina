# Native Addon Contract — bitnet_addon.node

This directory documents the **C++ N-API seam** that turns `@galerina/ext-bridge-cpp`
from a simulator-backed bridge into a native-SIMD bridge. Until the addon is
compiled, the bridges run the byte-faithful `TPLSimulator` from
`@galerina/tower-citizen` and report `nativeAvailable: false`.

## Source

The kernels come from Microsoft BitNet (MIT) at `C:\wwwprojects\BitNet`:

- `src/ggml-bitnet-mad.cpp` — I2_S ternary multiply-accumulate (the T-MAC)
- `src/ggml-bitnet-lut.cpp` — TL1/TL2 lookup-table kernels
- `include/ggml-bitnet.h` — `ggml_bitnet_init/free/set_n_threads/mul_mat_task_compute`

## The contract (`BitNetNativeAddon` in `addon-loader.ts`)

```ts
interface BitNetNativeAddon {
  init(): void;                         // → ggml_bitnet_init()
  free(): void;                         // → ggml_bitnet_free()
  setThreads(n: number): void;          // → ggml_bitnet_set_n_threads(n)
  tmac(packedWeights: Int32Array,       // I2_S packed trits (zero-copy WASM view)
       activations: Int32Array,
       count: number,
       scale: number,                   // i2_scale
       offset: number): number;         // → scaled accumulator (bit-identical to simulator)
  hasCuda(): boolean;
}
```

## Build (Stage B)

```bash
# cmake-js wrapping ggml-bitnet, linking the TL2 (x86) or TL1 (ARM) kernel
npm install -g cmake-js
cmake-js compile   # outputs build/Release/bitnet_addon.node
```

The loader (`addon-loader.ts`) searches:
- `build/Release/bitnet_addon.node`
- `native/build/Release/bitnet_addon.node`
- `prebuilds/bitnet_addon-<platform>-<arch>.node`

## Mandatory: Determinism

`tmac()` MUST return a value **bit-identical** to the `TPLSimulator` reference.
`BitNetCpuBridge` cross-checks the first 8 calls and throws
`CITIZEN_STANDARD_VIOLATION` on any mismatch (Bridge Standard 1).

## GPU (CUDA) seam

`C:\wwwprojects\BitNet\gpu\` holds the CUDA kernel. When compiled and exposed via
`hasCuda() === true`, `BitNetGpuBridge.nativeAvailable` flips to `true` and the
GPU path activates. Until then the GPU bridge detects the device (real, via
`nvidia-smi`) but executes on the deterministic simulator.
