// =============================================================================
// Governance Verifier — every plugin import requires an access { grant } contract.
//
// Both `import plugin safe` and `import plugin assimilate` are Toxic-Border, deny-by-default
// edges (import-governance handover, package-standard §6.5): FUNGI-ASSIMILATE-003 fires when
// the access { grant } contract is missing. Previously ONLY the assimilate form was checked,
// so a grantless `import plugin safe` slipped through fail-open — this is that regression
// fixture (the ZT-43 redness proof for the safe-plugin gap).
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkEffects, verifyGovernance } from "../../dist/index.js";

function verify(source) {
  const parsed = parseProgram(source, "test.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, "dev");
}
const has = (r, code) => r.diagnostics.some((d) => d.code === code);
const CODE = "FUNGI-ASSIMILATE-003";
const flow = `\npure flow f() -> Int { return 1 }\n`;

describe("plugin imports require an access { grant } contract (FUNGI-ASSIMILATE-003)", () => {
  it("grantless `import plugin safe` -> FUNGI-ASSIMILATE-003 (the closed gap)", () => {
    const r = verify(`@version 1\nimport plugin safe "./p.fungi" as P${flow}`);
    assert.ok(has(r, CODE), `expected ${CODE} but got: [${r.diagnostics.map((d) => d.code).join(", ")}]`);
  });

  it("granted `import plugin safe` -> no FUNGI-ASSIMILATE-003", () => {
    const r = verify(`@version 1\nimport plugin safe "./p.fungi" as P { contract { access { grant network.outbound } } }${flow}`);
    assert.ok(!has(r, CODE), `unexpected ${CODE}: [${r.diagnostics.map((d) => d.code).join(", ")}]`);
  });

  it("grantless `import plugin assimilate` -> FUNGI-ASSIMILATE-003 (unchanged)", () => {
    const r = verify(`@version 1\nimport plugin assimilate "./q.fungi" as Q${flow}`);
    assert.ok(has(r, CODE), `expected ${CODE} but got: [${r.diagnostics.map((d) => d.code).join(", ")}]`);
  });

  it("granted `import plugin assimilate` -> no FUNGI-ASSIMILATE-003", () => {
    const r = verify(`@version 1\nimport plugin assimilate "./q.fungi" as Q { contract { access { grant network.outbound } } }${flow}`);
    assert.ok(!has(r, CODE), `unexpected ${CODE}: [${r.diagnostics.map((d) => d.code).join(", ")}]`);
  });
});
