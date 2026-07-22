//! dss-host library surface.
//!
//! The reusable TCB logic that the integration tests — and, at `#102`, the real instantiate path —
//! gate a module load on. The Milestone-0 fuel proof lives in the bin (`main.rs`); this lib exposes
//! F3, the per-module `#173` admission re-verify.
pub mod admission;
