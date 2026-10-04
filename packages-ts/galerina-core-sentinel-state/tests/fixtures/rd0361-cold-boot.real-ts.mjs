// rd0361-cold-boot.real-ts.mjs: RD-0361 S6b real-.ts adapter for the cold-boot frozen set.
// Drives the REAL shipped ColdBootOrchestrator.restore() over a REAL StateSerializer + AtomicWriter in a
// throwaway temp dir. restore() itself recomputes the verdict from locally verified facts and refuses an
// authority that disagrees ("decision disagreed with locally verified facts"), so the real verdict is the
// one candidate (+1 or -1) a probing authority can return without that refusal. The probe also asserts it
// was asked about exactly the realised (snapshotPresent, integrityOk) facts. The HMAC key is a fixed
// non-secret test pattern, as in the package's own tests. NON_AUTHORIZING.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AtomicWriter, ColdBootOrchestrator, RESTORE_VERDICT_EXPORT_NAME, RESTORE_VERDICT_PACKAGE_IDENTITY, StateSerializer,
} from "../../dist/index.js";

export const source = "packages-ts/galerina-core-sentinel-state/src/cold-boot.ts";
const TEST_KEY = new Uint8Array(32).fill(0x31);

function realRestoreVerdict(present, integrity) {
  const dir = mkdtempSync(join(tmpdir(), "rd0361-coldboot-"));
  try {
    const serializer = new StateSerializer({ hmacKey: TEST_KEY });
    const writer = new AtomicWriter(dir);
    const asked = [];
    const authority = (candidate) => ({
      packageIdentity: RESTORE_VERDICT_PACKAGE_IDENTITY,
      exportName: RESTORE_VERDICT_EXPORT_NAME,
      restoreVerdict: (p, i) => { asked.push([p, i]); return candidate; },
    });
    if (present) {
      new ColdBootOrchestrator(serializer, writer, authority(1)).checkpoint("snap", { v: 1 }, 5);
      if (!integrity) {
        const snap = writer.read("snap");
        writer.write("snap", { ...snap, hmac: (snap.hmac[0] === "0" ? "1" : "0") + snap.hmac.slice(1) });
      }
    }
    const accepted = [];
    for (const candidate of [1, -1]) {
      asked.length = 0;
      let refusedAsDisagreement = false;
      try {
        new ColdBootOrchestrator(serializer, writer, authority(candidate)).restore("snap");
      } catch (err) {
        refusedAsDisagreement = /decision disagreed with locally verified facts/.test(String(err && err.message));
      }
      if (asked.length !== 1 || asked[0][0] !== present || asked[0][1] !== integrity) {
        throw new Error(`realisation failed: restore asked ${JSON.stringify(asked)} for (${present}, ${integrity})`);
      }
      if (!refusedAsDisagreement) accepted.push(candidate);
    }
    if (accepted.length !== 1) throw new Error(`real restore accepted ${JSON.stringify(accepted)}; expected exactly one verdict`);
    return accepted[0];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The real restore() only ever asks (false, false) when no snapshot exists, so (absent, integrity-ok)
// has no real counterpart and is skipped, never compared.
export const adapters = {
  restoreVerdict: { covers: (present, integrity) => present === true || integrity === false, run: realRestoreVerdict },
};
export const uncovered = {};
export const gaps = [
  "restoreVerdict: (snapshotPresent = false, integrityOk = true) is unreachable: with no snapshot the real restore() asks (false, false)",
];
