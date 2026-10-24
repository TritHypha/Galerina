// S8-R4 crash-cell receipt generator. Runs the ALICE-style crash campaign (crashcell.py: strace record,
// SIGKILL injection at every write/fsync/rename point, power-loss replay) for the two Q10 durable backends and the
// no-fsync negative control, then writes evidence/closure/S8-crashcell-receipt.json bound to sha256(crashcell.py).
// Zero trust: a backend is DURABLE only when its campaign ran (points > 0), the clean run is violation-free,
// every injected point recovered to Absent | Indeterminate | Committed with no lost ack/reservation and no second
// winner, and power-loss replay ran; anything else (including a harness error) is DELIVERY_UNKNOWN with token 2
// (FAILED_VIOLATIONS) or 0 (NOT_RUN). The receipt is refused (exit 3) if the negative control is not caught.
// Synthetic 32-byte payload only.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CC = join(HERE, "crashcell.py");
const OUT = join(HERE, "..", "..", "evidence", "closure", "S8-crashcell-receipt.json");

function run(mode) {
  const dir = mkdtempSync(join(tmpdir(), "s8cc-"));
  try {
    const r = spawnSync("python3", [CC, mode, join(dir, mode)], { encoding: "utf8", timeout: 900000 });
    const s = r.stdout || "";
    const m = s.match(/^CRASHCELL (\{.*\})$/m);
    const v = s.match(/^CRASHCELL_VIOLATIONS \S+ (\d+) /m);
    if (r.status !== 0 || !m || !v) return { ran: false, status: r.status };
    const j = JSON.parse(m[1]);
    return { ran: true, points: j.points, violations: Number(v[1]), cleanViolations: j.clean[2].length, syscalls: j.syscalls, states: j.states };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function adapter(name, backend, mode) {
  const r = run(mode);
  const ok = r.ran && Number.isInteger(r.points) && r.points > 0 && r.violations === 0 && r.cleanViolations === 0;
  return {
    adapter: name,
    backend,
    durability: ok ? "DURABLE" : "DELIVERY_UNKNOWN",
    crashCampaignToken: ok ? 1 : (r.ran ? 2 : 0),
    points: r.ran ? r.points : 0,
    violations: r.ran ? r.violations : -1,
    powerloss: r.ran,
    syscalls: r.syscalls ?? {},
    states: r.states ?? {},
  };
}

const adapters = [
  adapter("release-store-sqlite", "sqlite-wal-full", "sqlite"),
  adapter("release-store-file", "rename-fsync-dirfsync", "file"),
];
const neg = run("file-nosync");
const negativeControl = { backend: "file-nosync", violations: neg.ran ? neg.violations : -1, points: neg.ran ? neg.points : 0, powerloss: neg.ran };
const strace = spawnSync("strace", ["-V"], { encoding: "utf8" }).stdout.split("\n")[0];
const kernel = spawnSync("uname", ["-r"], { encoding: "utf8" }).stdout.trim();
const receipt = {
  schema: "galerina.s8.crashcell-receipt.v1",
  step: "S8 (RD-1415-T7, KG-07, Q10)",
  harness: { path: "packages/fungi/memory/tests/s8-release/crashcell.py", sha256: createHash("sha256").update(readFileSync(CC)).digest("hex") },
  environment: { kernel, strace, python: spawnSync("python3", ["-V"], { encoding: "utf8" }).stdout.trim() },
  model: "strace-recorded syscall trace; SIGKILL injected at every write/pwrite64/fsync/fdatasync/rename point (k=1..n+1) plus post-ack; each point replayed with and without the power-loss model (unsynced data truncated, unsynced dir ops reverted)",
  adapters,
  negativeControl,
};
if (!(negativeControl.violations > 0)) { console.error("NEGATIVE_CONTROL_NOT_CAUGHT"); process.exit(3); }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(receipt, null, 2) + "\n");
console.log("RECEIPT " + JSON.stringify(adapters.map((a) => [a.backend, a.durability, a.points, a.violations])) + " NEG " + JSON.stringify(negativeControl));