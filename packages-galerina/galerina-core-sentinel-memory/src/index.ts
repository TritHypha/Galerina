// index.ts — public surface of Galerina Sentinel Memory (LSM).
//
// Citizen Protocol v1.2. Pure TypeScript over ArrayBuffer / SharedArrayBuffer
// (WASM-linear-memory-compatible). No native mmap/mlock — see ARCHITECTURE_ISSUES.md.

export { SecurityTrap, HardenedBorderViolation } from "./errors.js";
export { ALIGN_BYTES, MemoryValidator } from "./memory-validator.js";
export {
  StaticMemoryPool,
  type Segment,
  type Block,
  type PoolConfig,
} from "./static-memory-pool.js";
export { SegmentationController } from "./segmentation-controller.js";
export { TPLStateBuffer } from "./tpl-state-buffer.js";
export {
  PhotonicBridgeInterface,
  LocalSramBus,
  type MemoryChannel,
} from "./photonic-bridge-interface.js";
