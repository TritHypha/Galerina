// S2 (closure path X-H1): one build name per tmp program, never a shared fixed name.
// A fixed root such as flat.fungi made every suite write build/flat.{wasm,wat,lmanifest};
// suites running in the same checkout then read each other's manifest (FUNGI-MANIFEST-TAMPER).
// The name is the mkdtemp folder's own unique basename. Anything else is refused (fail-closed).
import { basename, dirname, join } from "node:path";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const NAMES = new Set();
const SAFE = /^[A-Za-z0-9_-]+-[A-Za-z0-9]{6}$/;

export function uniqueFungiFile(dir) {
  if (typeof dir !== "string") {
    throw new Error("S2_UNIQUE_BUILD_NAME_REFUSED: tmp dir is not a string");
  }
  const name = basename(dir);
  if (SAFE.test(name) !== true) {
    throw new Error("S2_UNIQUE_BUILD_NAME_REFUSED: tmp dir basename is not a mkdtemp name: " + name);
  }
  if (NAMES.has(name)) {
    throw new Error("S2_UNIQUE_BUILD_NAME_REFUSED: build name reused in this process: " + name);
  }
  NAMES.add(name);
  return join(dir, name + ".fungi");
}

export function buildNamesUsed() {
  return [...NAMES];
}

process.on("exit", () => {
  for (const name of NAMES) {
    for (const ext of [".wasm", ".wat", ".lmanifest", ".lmanifest.json", ".dot", ".svg"]) {
      rmSync(join(REPO, "build", name + ext), { force: true });
    }
  }
});