/**
 * BK-1 (2026-07-03) — the O(1) allowedEffectsMask must FAIL CLOSED on an effect it can't represent.
 *
 * JS bitwise is 32-bit signed, so EffectFlags cannot give all ~44 canonical effects a distinct bit.
 * The OLD behavior silently skipped an unmapped effect → it contributed bit 0 = "no authority required",
 * so `effectsSubset([payment.charge], [audit.write])` returned TRUE (a latent privilege-escalation
 * fail-open). The fix: an unmapped effect sets the UnmappedEffect SENTINEL, so the subset check fails
 * closed. Per-effect precision for unmapped effects is the authoritative string-name check's job.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { effectsToFlags, effectsSubset, EffectFlags } from "../dist/type-registry.js";

describe("BK-1 effect-mask fail-closed sentinel", () => {
  it("an unmapped canonical effect gets a NON-ZERO mask (the sentinel), never bit 0", () => {
    for (const e of ["payment.charge", "crypto.sign", "shell.execute", "native.call", "ledger.mutate", "email.send"]) {
      const m = effectsToFlags([e]);
      assert.notEqual(m, 0, `${e} must not map to bit 0 (authority-free)`);
      assert.equal((m & EffectFlags.UnmappedEffect) !== 0, true, `${e} sets the UnmappedEffect sentinel`);
    }
  });

  it("requiring an unmapped effect is NOT satisfied by an unrelated mapped declaration (fail-closed)", () => {
    const req = effectsToFlags(["payment.charge"]);
    assert.equal(effectsSubset(req, effectsToFlags(["audit.write"])), false,
      "payment.charge ⊄ [audit.write] — was a fail-open true before BK-1");
    assert.equal(effectsSubset(req, effectsToFlags(["database.read", "network.outbound"])), false,
      "payment.charge ⊄ [mapped effects with no unmapped] — fail-closed");
  });

  it("a mapped required effect still checks precisely (no regression)", () => {
    assert.equal(effectsSubset(effectsToFlags(["database.read"]), effectsToFlags(["database.read", "audit.write"])), true);
    assert.equal(effectsSubset(effectsToFlags(["database.write"]), effectsToFlags(["database.read"])), false);
  });

  it("declaring the same unmapped effect satisfies its own requirement", () => {
    const req = effectsToFlags(["crypto.sign"]);
    assert.equal(effectsSubset(req, effectsToFlags(["crypto.sign"])), true);
  });
});
