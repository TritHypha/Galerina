// MR4 has/status/epoch/put replies wired through arenaStep. Put goes through
// arenaPutExact, so an extra reply byte is UNKNOWN plus quarantine.
import { test } from "node:test";
import { hasStep, statusStep, epochStep, putStep, expectStep, ST } from "./mr4-harness.mjs";

test("MR4-R1 has: clean reply ok+Active; malformed or quarantined 106+Quarantined", () => {
  expectStep(hasStep(), 100, ST.active, "has ok");
  expectStep(hasStep({ dataLen: 0 }), 106, ST.quarantined, "has len 0");
  expectStep(hasStep({ stateToken: ST.quarantined }), 106, ST.quarantined, "has q");
});

test("MR4-R2 status: unlisted byte 121+Quarantined", () => {
  expectStep(statusStep(), 100, ST.active, "status ok");
  expectStep(statusStep({ dataByte: 9 }), 121, ST.quarantined, "status byte 9");
});

test("MR4-R3 epoch: wrong length 140 and backwards 139 quarantine", () => {
  expectStep(epochStep(), 100, ST.active, "epoch ok");
  expectStep(epochStep({ dataLen: 7 }), 140, ST.quarantined, "epoch len 7");
  expectStep(epochStep({ epochValue: 0, lastEpoch: 1 }), 139, ST.quarantined, "epoch back");
});

test("MR4-P1 put: exact reply ok; extra reply byte 106+Quarantined; high bit refused, Active kept", () => {
  expectStep(putStep(), 100, ST.active, "put ok");
  expectStep(putStep({ replyLen: 1 }), 106, ST.quarantined, "put extra");
  expectStep(putStep({ highBit: 1 }), 125, ST.active, "put high bit");
});