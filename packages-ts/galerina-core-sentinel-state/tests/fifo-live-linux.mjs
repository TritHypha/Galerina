import { lstatSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { refuseSnapshotSpecialFile, SecurityTrap } from "../dist/index.js";

if (process.platform !== "linux") {
  console.error("linux-only FIFO observation");
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "lss-fifo-"));
const fifo = join(dir, "ckpt.fifo");
const mk = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
if (mk.status !== 0) {
  console.error(mk.stderr);
  process.exit(1);
}
const st = lstatSync(fifo);
if (st.isFIFO() !== true) {
  console.error("lstat isFIFO was not true");
  process.exit(1);
}
try {
  refuseSnapshotSpecialFile(st, "ckpt");
  console.error("refuseSnapshotSpecialFile did not throw");
  process.exit(1);
} catch (err) {
  if (err instanceof SecurityTrap && err.code === "LSS-FIFO-001") {
    console.log("LSS-FIFO-001");
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
}

void pathToFileURL;
