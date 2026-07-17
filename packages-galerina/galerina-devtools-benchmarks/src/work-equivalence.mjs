// =============================================================================
// work-equivalence.mjs — single source of truth for shape-only benchmark lanes
// =============================================================================
// Some benchmark families are NAMED for a heap operation (allocate a record,
// build a tree) but the .fungi source preserves only the recursion/loop SHAPE
// and elides the allocation itself (see each benchmark.fungi header). For those
// lanes, cross-runtime throughput is shape-parity data, NOT a work-equivalent
// speed comparison — node/rust allocate real objects while the Galerina lanes
// bind scalars / count only. A raw `N× slower` ratio against a native runtime is
// therefore a measurement artifact, not a performance result (RD-0446; the
// "996% of node" figure was debunked 2026-07-16 — honest work-equivalent WASM is
// 47–94% of native).
//
// This map is consumed by BOTH the benchmark WATCHER (bench-guard.mjs, via
// history.mjs → diff-latest.json) AND the public report (compare.mjs §1 + §1.5),
// so it lives here, in one place, and neither can drift from the other.
//
// `kind` distinguishes WHY a lane is not a cross-runtime signal (RD-0446):
//  - "elided": the WASM/fungi lane does LESS work than node/rust (allocation
//    elided → scalar binds / count-only). The flow-local bump-arena (RD-0446 §a)
//    makes it work-equivalent, after which its shape-only tag drops.
//  - "fused-vs-materialised": a REAL optimisation difference (fusion vs
//    materialisation), NOT elided work. Kept + labelled as such (RD-0446 §b
//    reframe), never cited as a raw ratio; the true work-equivalent number needs
//    a materialised variant (recommended follow-on).
export const WORK_EQUIVALENCE = {
  "record-allocation": { kind: "elided", lanes: ["wasm", "galerinaGoverned", "galerinaManifest", "galerinaPassive"], note: "fungi lane binds scalars (WASM: register locals) — node/rust allocate real records" },
  "binary-trees": { kind: "elided", lanes: ["wasm", "galerinaGoverned", "galerinaManifest", "galerinaPassive"], note: "COUNT-ONLY form (documented in-corpus) — heap node elided, recursion shape + checksum preserved" },
  "collection-pipeline": { kind: "fused-vs-materialised", lanes: ["wasm", "galerinaGoverned", "galerinaManifest", "galerinaPassive"], note: "fused while-loop (documented in-corpus) — node materializes filter/map arrays; a REAL optimisation, not elided work" },
};

/** True if `benchId` has any shape-only lane (i.e. its cross-runtime ratios are not work-equivalent). */
export function isShapeOnlyBench(benchId) {
  return WORK_EQUIVALENCE[benchId] !== undefined;
}

/**
 * The shape-only classification for one lane of one benchmark, or null if that
 * lane IS work-equivalent for that benchmark.
 * Returns { kind, note } — kind ∈ {"elided","fused-vs-materialised"}.
 */
export function shapeOnlyLane(benchId, lane) {
  const we = WORK_EQUIVALENCE[benchId];
  return we && we.lanes.includes(lane) ? { kind: we.kind, note: we.note } : null;
}
