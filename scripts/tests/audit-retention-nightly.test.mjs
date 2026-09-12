import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRetentionReceipt } from "../lib/retention-receipt.mjs";

const clean = [
  "== subject ==",
  "",
  "    heapUsed          1.00 KB/iter       40.0 KB       4.00 KB/iter   within band",
  "    external          0.00 KB/iter        0.0 KB       4.00 KB/iter   within band",
  "    arrayBuffers      0.00 KB/iter        0.0 KB       4.00 KB/iter   within band",
  "    rss               2.00 KB/iter       80.0 KB      24.00 KB/iter   corroboration only",
  "    durationUs       -0.00 ms/iter      -0.1 ms/iter       4.10 ms/iter   symptom only",
  "    -> no leak detected on the measured channels",
].join("\n");

const leak = clean.replace(
  "within band",
  "★ OVER BAND",
).replace(
  "    -> no leak detected on the measured channels",
  "    -> LEAK: heapUsed",
);

test("accepts complete status-consistent clean and leak receipts", () => {
  assert.equal(parseRetentionReceipt({ status: 0, stdout: clean }).ok, true);
  assert.equal(parseRetentionReceipt({ status: 1, stdout: leak }).leak, true);
});

test("rejects timeout and unexpected child statuses", () => {
  for (const status of [null, 2, 3]) {
    const result = parseRetentionReceipt({ status, stdout: clean });
    assert.equal(result.ok, false);
  }
});

test("rejects missing, malformed, or status-inconsistent receipts", () => {
  const cases = [
    clean.replace("== subject ==", ""),
    clean.replace("    external          0.00 KB/iter        0.0 KB       4.00 KB/iter   within band\n", ""),
    clean.replace("    -> no leak detected on the measured channels", "    -> maybe"),
    clean.replace("1.00 KB/iter", "garbage KB/iter"),
    clean.replace("1.00 KB/iter", "NaN KB/iter"),
    clean.replace("1.00 KB/iter", `${"9".repeat(400)} KB/iter`),
    clean.replace("within band", "corroboration only"),
    clean.replace("within band", "★ OVER BAND"),
    clean.replace("4.10 ms/iter", "Infinity ms/iter"),
    { status: 0, stdout: leak },
    { status: 1, stdout: clean },
  ];
  for (const candidate of cases) {
    const result = typeof candidate === "string"
      ? parseRetentionReceipt({ status: 0, stdout: candidate })
      : parseRetentionReceipt(candidate);
    assert.equal(result.ok, false);
  }
});
