// MEM-R1 mutants: each edit to a copy of the compiled provider must turn the
// matching scenario red; the landed provider keeps it green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linuxOnly, loadProvider, replaceOnce } from "./mr1-harness.mjs";
import {
  borrowedViewIsWipedAfterReturn,
  followUpAfterFrameFaultIsQuarantined,
  oversizeFrameFailsClosed,
  staleEpochQuarantines,
  zeroFrameFailsClosed,
} from "./mr1-scenarios.mjs";

const MUTANTS = [
  {
    name: "no-kill-on-frame-fault",
    edit: (s) => replaceOnce(s, "killCustodian();", ";"),
    check: followUpAfterFrameFaultIsQuarantined,
  },
  {
    name: "no-max-frame-cap",
    edit: (s) => replaceOnce(s, "respLen > MAX_FRAME", "false"),
    check: oversizeFrameFailsClosed,
  },
  {
    name: "accept-zero-frame",
    edit: (s) => replaceOnce(s, "!(respLen > 0) || ", ""),
    check: zeroFrameFailsClosed,
  },
  {
    name: "accept-stale-epoch",
    edit: (s) => replaceOnce(s, "if (epoch < lastEpoch)", "if (false)"),
    check: staleEpochQuarantines,
  },
  {
    name: "skip-view-wipe",
    edit: (s) => replaceOnce(s, "intrinsicApply(intrinsicFill, backing.subarray(0, data.length), [0]);", ""),
    check: borrowedViewIsWipedAfterReturn,
  },
];

for (const m of MUTANTS) {
  test(`MR1 mutant ${m.name}: red on mutant, green on landed`, async (t) => {
    if (!linuxOnly(t)) return;
    const mutant = await loadProvider(m.edit);
    assert.equal(m.check(mutant), false, `${m.name} mutant must go red`);
    const landed = await loadProvider();
    assert.equal(m.check(landed), true, `${m.name} landed must stay green`);
  });
}
