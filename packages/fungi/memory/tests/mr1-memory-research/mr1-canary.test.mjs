// MEM-R1 gap 1.3: a synthetic canary never appears in any refusal message,
// error string, or provider status across every fault mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANARY, assertNoCanary, bytes, capture, linuxOnly, loadProvider, open } from "./mr1-harness.mjs";

const MODES = ["trunc-get", "zero-get", "huge-get", "kill-get", "quar-get", "odd-status-get"];

for (const mode of MODES) {
  test(`MR1 canary: ${mode} refusal surfaces carry no canary bytes`, async (t) => {
    if (!linuxOnly(t)) return;
    const mod = await loadProvider();
    const p = open(mod, mode);
    try {
      p.put("mr1", bytes(CANARY));
      const r = capture(() => p.use("mr1", () => {}));
      assert.equal(r.thrown, true, mode + " must refuse");
      assertNoCanary(String(r.error), mode + " String(error)");
      assertNoCanary(String(r.error.message), mode + " message");
      assertNoCanary(JSON.stringify(p.status()), mode + " status");
      const again = capture(() => p.use("mr1", () => {}));
      if (again.thrown) assertNoCanary(String(again.error), mode + " follow-up");
    } finally {
      p.dispose();
    }
  });
}
