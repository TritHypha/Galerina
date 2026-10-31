// MR23 liveness table: running 100, dead mid-request 106, dead idle 153,
// self-contradicting or out-of-range readings refuse, foreign classes 111/110.
import { test } from "node:test";
import { liveness, expectPacked, CUSTODIAN_GONE, RUNNING, SIGKILL_MID, SIGKILL_IDLE, EXIT0_IDLE, EXIT1_MID, label } from "./mr23-harness.mjs";

test("running child with detail 0 is 100 whether idle or in flight", () => {
  expectPacked(liveness(RUNNING), 100, label(RUNNING));
  expectPacked(liveness({ ...RUNNING, inFlight: 1 }), 100, "running in flight");
});

test("running child with a non-zero detail is 106 (reading contradicts itself)", () => {
  for (const d of [1, -1, 9]) {
    expectPacked(liveness({ exitKind: 0, detail: d }), 106, `running detail ${d}`);
  }
});

test("SIGKILL mid-request is 106 UNKNOWN: the reply never came", () => {
  expectPacked(liveness(SIGKILL_MID), 106, label(SIGKILL_MID));
  expectPacked(liveness(EXIT1_MID), 106, label(EXIT1_MID));
  expectPacked(liveness({ exitKind: 1, detail: 0, inFlight: 1 }), 106, "clean exit mid-request");
});

test("death while idle is 153 CUSTODIAN_GONE, a clean exit 0 included (never 141)", () => {
  expectPacked(liveness(SIGKILL_IDLE), CUSTODIAN_GONE, label(SIGKILL_IDLE));
  expectPacked(liveness(EXIT0_IDLE), CUSTODIAN_GONE, label(EXIT0_IDLE));
  expectPacked(liveness({ exitKind: 1, detail: 255 }), CUSTODIAN_GONE, "exit 255 idle");
  expectPacked(liveness({ exitKind: 2, detail: 64 }), CUSTODIAN_GONE, "signal 64 idle");
});

test("out-of-range exit status, signal, kind or flight flag is 110", () => {
  const rows = [
    [{ exitKind: 2, detail: 0 }, "signal 0"],
    [{ exitKind: 2, detail: 65 }, "signal 65"],
    [{ exitKind: 2, detail: -9, inFlight: 1 }, "signal -9 in flight"],
    [{ exitKind: 1, detail: 256 }, "exit 256"],
    [{ exitKind: 1, detail: -1 }, "exit -1"],
    [{ exitKind: 3 }, "kind 3"],
    [{ exitKind: -1 }, "kind -1"],
    [{ exitKind: 2, detail: 9, inFlight: 2 }, "inFlight 2"],
  ];
  for (const [o, l] of rows) expectPacked(liveness(o), 110, l);
});

test("unlisted classes are 111, a listed foreign tag 110, before any value is read", () => {
  expectPacked(liveness({ ...SIGKILL_IDLE, exitClass: 99 }), 111, "exit class");
  expectPacked(liveness({ ...SIGKILL_IDLE, detailClass: 99 }), 111, "detail class");
  expectPacked(liveness({ ...SIGKILL_IDLE, inFlightClass: 99 }), 111, "flight class");
  expectPacked(liveness({ ...RUNNING, exitClass: 1 }), 110, "exit tag 1");
});
