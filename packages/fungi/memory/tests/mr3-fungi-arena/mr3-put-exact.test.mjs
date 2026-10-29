// MR3: arenaPutExact layers the H11 reply-length rule and a reply-buffer wipe
// on top of arenaPut. The TS reference never wipes the put reply buffer; the
// .fungi target wipes it on every exit and a failed/unknown wipe wins over ok.
import { test } from "node:test";
import { putExact, expectPacked } from "./mr3-harness.mjs";

test("MR3 put: clean reply, clean wipes is 100", () => {
  expectPacked(putExact(), 100, "ok");
});

test("MR3 put: failed reply wipe (117) wins over ok", () => {
  expectPacked(putExact({ replyWipeToken: 1 }), 117, "reply wipe failed");
});

test("MR3 put: unknown reply wipe (106) wins over ok", () => {
  expectPacked(putExact({ replyWipeToken: 2 }), 106, "reply wipe unknown");
});

test("MR3 put: extra reply bytes with failed reply wipe reports 117, not ok", () => {
  expectPacked(putExact({ replyLen: 3, replyWipeToken: 1 }), 117, "extra + wipe failed");
});

test("MR3 put: unlisted reply wipe token is 111", () => {
  expectPacked(putExact({ replyWipeToken: 9 }), 111, "unlisted wipe");
});

test("MR3 put: unlisted reply length class is 111 (never read as zero)", () => {
  expectPacked(putExact({ replyLenClass: 11 }), 111, "unlisted len class");
});

test("MR3 put: arenaPut refusals pass through before the reply is read", () => {
  expectPacked(putExact({ nameLen: 64, valueLen: 1, replyLen: 5 }), 123, "over cap");
  expectPacked(putExact({ highBit: 1, replyLen: 5 }), 125, "high bit");
  expectPacked(putExact({ stateToken: 2, replyLen: 5 }), 141, "disposed");
  expectPacked(putExact({ stateToken: 1 }), 106, "quarantined");
});
