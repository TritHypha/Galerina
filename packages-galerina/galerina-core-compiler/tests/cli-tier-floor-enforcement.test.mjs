/**
 * SPORE-TIER-001 / SPORE-VALUESTATE-008 — CLI-level enforcement through the user-facing galerina.mjs.
 *
 * The effect-checker logic is unit-tested (tier-floor-spore-tier-001.test.mjs); THIS test proves the
 * WIRING through `galerina.mjs` so a regression in the CLI plumbing (e.g. reverting the production-gated
 * surface/exit, or dropping the dev-mode warning) is caught automatically:
 *   (1) dev `check`            → surfaces SPORE-TIER-001 + SPORE-VALUESTATE-008 as WARNINGS, exit 0
 *   (2) production `build`     → FAILS CLOSED (exit 1) on the under-declared tier floor
 *   (3) plain dev `build`      → must NOT trip the production fail-closed floor
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..", "..");
const CLI = join(REPO, "galerina.mjs");

// A guarded flow that performs an outbound HTTP POST (network.outbound, a secure-required effect)
// but is declared `guarded`, not `secure` — the canonical SPORE-TIER-001 under-declaration. The bare
// boundary param `order` reaching http.post is the SPORE-VALUESTATE-008 trigger.
const UNDER_DECLARED = `guarded flow pushOrder(order: Order) -> Result<Unit, Error>
  contract { effects { network.outbound } }
{
  let r = http.post("https://api.example.com/orders", order)?
  return Ok(unit)
}
`;

const run = (args, env, dir) =>
  spawnSync("node", [CLI, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });
const out = (r) => (r.stdout ?? "") + (r.stderr ?? "");

test("SPORE-TIER-001/008 enforced through galerina.mjs: dev check WARNS, prod build FAILS CLOSED, dev build does not", () => {
  const dir = mkdtempSync(join(tmpdir(), "galerina-tier-cli-"));
  try {
    const spore = join(dir, "under.spore");
    writeFileSync(spore, UNDER_DECLARED);

    // (1) dev `check` — surfaces both warnings, exit 0 (warnings are non-fatal).
    const chk = run(["check", spore], {}, dir);
    assert.equal(chk.status, 0, `dev check should exit 0: ${out(chk)}`);
    assert.match(out(chk), /SPORE-TIER-001/, "dev check surfaces the tier warning");
    assert.match(out(chk), /SPORE-VALUESTATE-008/, "dev check surfaces the boundary warning");

    // (2) production `build` — fail-closed (exit 1) on the tier floor (exits before signing, no keys needed).
    const prod = run(["build", spore], { GALERINA_PROFILE: "production" }, dir);
    assert.equal(prod.status, 1, `production build should fail closed: ${out(prod)}`);
    assert.match(out(prod), /SPORE-TIER-001/, "production build fails with the tier floor");

    // (3) plain dev `build` — must NOT trip the production fail-closed floor.
    const dev = run(["build", spore], {}, dir);
    assert.ok(
      !/fail-closed under GALERINA_PROFILE=production/.test(out(dev)),
      `dev build must not fail-closed on the tier floor: ${out(dev)}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
