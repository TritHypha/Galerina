// MR7 through the wired steps: a release or re-alloc read whose reply cannot
// be read now quarantines in the same packed value (MR6 kept the state).
import { test } from "node:test";
import { releaseStep, reallocStep, expectPacked, ST } from "./mr7-harness.mjs";

test("release with a malformed wipe reply is 1101", () => {
  expectPacked(releaseStep({ wipeClass: 1 }), 1101, "wipe class 1");
});

test("release with a malformed read-back is 1101", () => {
  expectPacked(releaseStep({ readbackClass: 1 }), 1101, "read-back class 1");
});

test("release with an unlisted read-back class is 1111", () => {
  expectPacked(releaseStep({ readbackClass: 11 }), 1111, "read-back class 11");
});

test("release with an unlisted freed token is 1111", () => {
  expectPacked(releaseStep({ freed: 2 }), 1111, "freed 2");
});

test("malformed release in Quarantined stays Quarantined", () => {
  expectPacked(releaseStep({ stateToken: ST.quarantined, readbackClass: 1 }), 1101, "q read-back 1");
});

test("clean release still 1000", () => {
  expectPacked(releaseStep(), 1000, "clean");
});

test("re-alloc read with a malformed length reply is 1101", () => {
  expectPacked(reallocStep({ lenClass: 1 }), 1101, "len class 1");
});

test("re-alloc read with an unlisted residue class is 1111", () => {
  expectPacked(reallocStep({ nonZeroClass: 11 }), 1111, "non-zero class 11");
});