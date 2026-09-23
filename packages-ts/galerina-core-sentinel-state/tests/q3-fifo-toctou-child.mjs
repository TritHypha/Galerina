// Supervised child: real AtomicWriter.read/scrub against a disposable snapshot.
// Parent must spawn with a kill deadline. Exit 0 = LSS-FIFO-001.
// Exit 3 = unexpected success. Exit 1 = other error. Exit 4 = missing snapshot.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AtomicWriter, SecurityTrap } from "../dist/index.js";

const dir = process.env.Q3_DIR;
const name = process.env.Q3_NAME;
const op = process.env.Q3_OP ?? "read";
if (typeof dir !== "string" || typeof name !== "string") {
  console.error("Q3_DIR and Q3_NAME required");
  process.exit(2);
}

if (process.env.Q3_PLANT === "1") {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.snap`), "{\"a\":7}", { flag: "w" });
}

const w = new AtomicWriter(dir);
try {
  if (op === "scrub") {
    w.scrub(name);
    console.log("SCRUB_OK");
    process.exit(3);
  }
  const got = w.read(name);
  console.log("READ_OK", JSON.stringify(got));
  process.exit(got === null ? 4 : 3);
} catch (err) {
  const code = err instanceof SecurityTrap ? err.code : (err && err.code);
  console.log("CODE", code);
  console.log("NAME", err && err.name);
  if (code === "LSS-FIFO-001") process.exit(0);
  console.error(err);
  process.exit(1);
}
