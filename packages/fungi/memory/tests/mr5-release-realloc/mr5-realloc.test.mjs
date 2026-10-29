// MR5 re-alloc read (gap 2.4): a slot handed out again after release reads
// all zero, only after a committed release, only at exactly the next
// generation, over the whole length.
import { test } from "node:test";
import { realloc, release, nextGeneration, slotCheck, expectPacked, GEN_MAX_LIVE } from "./mr5-harness.mjs";

test("MR5-A1 committed release then full zero read is 100", () => {
  expectPacked(realloc(), 100, "zero read");
  expectPacked(realloc({ readLen: 1, expectedLen: 1 }), 100, "one byte");
});

test("MR5-A2 any residue byte is 117", () => {
  expectPacked(realloc({ nonZeroCount: 1 }), 117, "one residue byte");
  expectPacked(realloc({ nonZeroCount: 32 }), 117, "all residue");
  expectPacked(realloc({ nonZeroCount: -1 }), 106, "negative count");
  expectPacked(realloc({ nonZeroClass: 9 }), 110, "unlisted class");
});

test("MR5-A3 no zero claim without a committed release", () => {
  for (const v of [117, 106, 150, 140, 111, 0, 101]) {
    expectPacked(realloc({ releaseVerdict: v }), 106, "release verdict " + v);
  }
  expectPacked(realloc({ releaseVerdict: 117, nonZeroCount: 0 }), 106, "zero read after failed wipe is still UNKNOWN");
});

test("MR5-A4 generation must be exactly prior + 1", () => {
  expectPacked(realloc({ priorGeneration: 3, slotGeneration: 3 }), 150, "same generation");
  expectPacked(realloc({ priorGeneration: 3, slotGeneration: 5 }), 150, "skipped generation");
  expectPacked(realloc({ priorGeneration: 4, slotGeneration: 3 }), 150, "backwards");
  expectPacked(realloc({ priorGeneration: GEN_MAX_LIVE - 1, slotGeneration: GEN_MAX_LIVE }), 100, "last generation");
  expectPacked(realloc({ priorGeneration: GEN_MAX_LIVE, slotGeneration: 1 }), 140, "wrap refused");
  expectPacked(realloc({ priorGeneration: 0, slotGeneration: 1 }), 140, "prior 0");
  expectPacked(realloc({ priorGeneration: 3, slotGeneration: 0 }), 140, "slot 0");
});

test("MR5-A5 the read must cover the whole slot", () => {
  expectPacked(realloc({ readLen: 31 }), 106, "short read");
  expectPacked(realloc({ readLen: 33 }), 106, "long read");
  expectPacked(realloc({ readLen: 0, expectedLen: 0 }), 106, "empty read proves nothing");
  expectPacked(realloc({ lenClass: 9 }), 110, "unlisted length class");
});

test("MR5-A6 release -> next generation -> zero read chain; old handle stays dead", () => {
  const r = release({ slotGeneration: 7, handleGeneration: 7 });
  expectPacked(r, 100, "release 7");
  const g = nextGeneration({ slotGeneration: 7, handleGeneration: 7 });
  expectPacked(g, 8, "bump to 8");
  expectPacked(realloc({ releaseVerdict: r.value, priorGeneration: 7, slotGeneration: g.value }), 100, "new slot reads zero");
  expectPacked(slotCheck(g.value, 7), 150, "use after release with the old handle");
  expectPacked(slotCheck(g.value, g.value), 100, "new handle admitted");
});
