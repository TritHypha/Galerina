// @galerina/core-sentinel-state (LSS) — the Tower's Checkpointing & Persistence Engine.
//
// Atomic, cryptographically-verified state snapshots for cold-boot recovery.
// Citizen Protocol v1.5.

export { SecurityTrap, HardenedBorderViolation } from "./errors.js";
export { StateSerializer } from "./state-serializer.js";
export type { Snapshot } from "./state-serializer.js";
export { AtomicWriter } from "./atomic-writer.js";
export { ColdBootOrchestrator } from "./cold-boot.js";
