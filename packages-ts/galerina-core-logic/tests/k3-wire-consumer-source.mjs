import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const K3_WIRE_FUNGI = join(HERE, "..", "src", "self-hosted", "k3-wire.fungi");

export function twinSourceWithK3Wire(twinSrc) {
  const k3 = readFileSync(K3_WIRE_FUNGI, "utf8").replace(/^\uFEFF/u, "");
  const twin = twinSrc.replace(/^\uFEFF/u, "").replace(/^import[^\n]*k3-wire\.fungi[^\n]*\r?\n/m, "");
  const stripped = twin.replace(/^@version 1\r?\n/, "");
  return `${k3}\n${stripped}`;
}
