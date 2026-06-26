// _tmp.mjs — unique temp subdir per test run.
//
// Uniqueness is derived from process.pid + a monotonic counter (NOT Date.now /
// Math.random), so concurrent test files never collide and runs are reproducible
// within a process.

let counter = 0;

export function tmpDir() {
  counter += 1;
  return `build/lss-test-${process.pid}-${counter}`;
}
