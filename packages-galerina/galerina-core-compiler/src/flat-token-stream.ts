// =============================================================================
// Galerina Flat Token Stream
//
// Instead of: Token[] (array of objects — heap allocated, pointer-heavy)
// Store: parallel Int32Arrays with stride-4 layout:
//   [kindId0, start0, end0, hash0, kindId1, start1, end1, hash1, ...]
//
// Benefits:
//   CPU prefetcher loves sequential access — all kind IDs in one cache line
//   Zero heap allocation per token (just fills pre-allocated buffer)
//   Compatible with WASM linear memory layout
// =============================================================================

export const TOKEN_STRIDE = 4; // 4 Int32 per token: kindId, start, end, hash

export interface FlatTokenStream {
  readonly data:  Int32Array;  // kindId, start, end, hash × tokenCount
  readonly count: number;
  readonly source: string;
}

export function tokenStreamKind(ts: FlatTokenStream, i: number): number {
  return ts.data[i * TOKEN_STRIDE + 0] ?? 0;
}
export function tokenStreamStart(ts: FlatTokenStream, i: number): number {
  return ts.data[i * TOKEN_STRIDE + 1] ?? 0;
}
export function tokenStreamEnd(ts: FlatTokenStream, i: number): number {
  return ts.data[i * TOKEN_STRIDE + 2] ?? 0;
}
export function tokenStreamValue(ts: FlatTokenStream, i: number): string {
  return ts.source.slice(
    ts.data[i * TOKEN_STRIDE + 1],
    ts.data[i * TOKEN_STRIDE + 2],
  );
}

/** Convert the existing Token[] to a flat stream */
export function toFlatTokenStream(tokens: readonly { kind: string; kindId: number; start: number; end: number }[], source: string): FlatTokenStream {
  const data = new Int32Array(tokens.length * TOKEN_STRIDE);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === undefined) continue;
    data[i * TOKEN_STRIDE + 0] = t.kindId ?? 0;
    data[i * TOKEN_STRIDE + 1] = t.start;
    data[i * TOKEN_STRIDE + 2] = t.end;
    data[i * TOKEN_STRIDE + 3] = 0; // hash — future use
  }
  return { data, count: tokens.length, source };
}
