// Proof I/O seam (TODO pass, Grok 2026-10-05; owner may revisit).

/** Injected by the host: readFile returns the exact bytes (or UTF-8 text) of a file; now returns an ISO-8601 UTC timestamp. */
export interface ProofIo {
  readonly readFile: (path: string) => Promise<Uint8Array | string>;
  readonly now: () => string;
}
