// rd0361-cold-boot.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the cold-boot twin.
// Oracle = the reference spec in rd0361-cold-boot-execution.test.mjs, copied verbatim
// (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-sentinel-state/src/self-hosted",
  file: "cold-boot.fungi",
  module: "cold-boot",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-core-sentinel-state/tests/rd0361-cold-boot-execution.test.mjs",
});
export const signatures = Object.freeze([{ name: "restoreVerdict", params: ["bool", "bool"], returns: "k3" }]);
export const reference = Object.freeze({
  restoreVerdict: (present, integrity) => (!present ? -1 : !integrity ? -1 : 1),
});
export function cases() {
  const rows = [];
  for (const p of [false, true]) for (const i of [false, true]) rows.push({ id: `restore-${p ? 1 : 0}${i ? 1 : 0}`, export: "restoreVerdict", args: [p, i] });
  return rows;
}
