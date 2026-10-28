// MEM-R2 killing mutants: each mutant weakens one check in a scratch copy of
// the compiled provider (the frozen TS source is never edited) and the
// matching MEM-R2 scenario must turn false.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linuxOnly, loadProvider, replaceOnce } from "./mr2-harness.mjs";
import {
  epochHugeQuarantines,
  epochWrongLengthRefused,
  escapeRefusalIsGeneric,
  getUnlistedNeverCallsBack,
  hasByteTwoNeverPresent,
  nestedLeasesAreWipedIndependently,
  statusUnlistedQuarantines,
} from "./mr2-scenarios.mjs";

const MUTANTS = [
  {
    id: "MR2-M1 has reads any non-zero byte as present",
    edit: (s) => replaceOnce(s, "present = data[0] === 1;", "present = data[0] !== 0;"),
    scenario: hasByteTwoNeverPresent,
  },
  {
    id: "MR2-M2 epoch accepts frames of 8 or more bytes",
    edit: (s) => replaceOnce(s, "data.length !== 8", "data.length < 8"),
    scenario: (mod) => epochWrongLengthRefused(mod, "epoch-long"),
  },
  {
    id: "MR2-M3 epoch drops the safe-integer check",
    edit: (s) => replaceOnce(s, "!Number.isSafeInteger(epoch) || epoch < 0", "epoch < 0"),
    scenario: epochHugeQuarantines,
  },
  {
    id: "MR2-M4 status ignores the reply status",
    edit: (s) => replaceOnce(s, "status !== ST_OK || quarantinedBit || quarantined", "quarantinedBit || quarantined"),
    scenario: statusUnlistedQuarantines,
  },
  {
    id: "MR2-M5 get decoder treats unlisted status 9 as OK",
    edit: (s) => replaceOnce(
      s,
      "const { status, data } = rpc(OP_GET, nameBytes);",
      "const { status: rawStatus, data } = rpc(OP_GET, nameBytes); const status = rawStatus === 9 ? ST_OK : rawStatus;",
    ),
    scenario: getUnlistedNeverCallsBack,
  },
  {
    id: "MR2-M6 lease slot is never wiped on return",
    edit: (s) => replaceOnce(s, "if (detached || !slot.wipe())", "if (detached || !true)"),
    scenario: nestedLeasesAreWipedIndependently,
  },
  {
    id: "MR2-M7 escape refusal names the secret",
    edit: (s) => replaceOnce(
      s,
      'throw new Error("SecretArenaProvider: callback return/async escape channel is forbidden");',
      'throw new Error("SecretArenaProvider: callback return/async escape channel is forbidden for " + name);',
    ),
    scenario: escapeRefusalIsGeneric,
  },
];

test("MR2 mutants: baseline provider passes every scenario", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  for (const m of MUTANTS) assert.equal(await m.scenario(mod), true, `baseline ${m.id}`);
});

for (const m of MUTANTS) {
  test(`MR2 mutant killed: ${m.id}`, async (t) => {
    if (!linuxOnly(t)) return;
    const mod = await loadProvider(m.edit);
    let held;
    try {
      held = await m.scenario(mod);
    } catch {
      held = false;
    }
    assert.equal(held, false, `${m.id} survived`);
  });
}
