import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const PROFILE = join(MEM, "src", "monotonic-time.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const IMPORT_LINE = "import \"./c-boundary.fungi\"";

export const PROFILE_PATH = PROFILE;

export function flattenText(profileText) {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const parts = profileText.split(IMPORT_LINE);
  if (parts.length !== 2) {
    throw new Error("import line must occur once");
  }
  let rest = parts[0] + parts[1];
  const marker = "@version 1";
  const first = rest.indexOf(marker);
  if (first < 0) {
    throw new Error("version marker missing");
  }
  rest = rest.slice(first + marker.length);
  return boundary + "\n" + rest;
}

function parseInvoke(ran) {
  const text = (ran.stdout || "") + (ran.stderr || "");
  const matched = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  if (!matched) {
    return { status: ran.status, present: false, value: 0 };
  }
  const value = Number(matched[1]);
  if (Number.isSafeInteger(value) !== true) {
    return { status: ran.status, present: false, value: 0 };
  }
  return { status: ran.status, present: true, value };
}

export function pins(profileText) {
  const dir = mkdtempSync(join(tmpdir(), "q46-flat-"));
  const file = uniqueFungiFile(dir);
  try {
    writeFileSync(file, flattenText(profileText));
    const built = spawnSync(process.execPath, [GALERINA, "build", file], { encoding: "utf8", cwd: REPO });
    if (built.status !== 0) {
      throw new Error("build status " + String(built.status));
    }
    const expectValue = (flow, args, value) => {
      const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
      const ran = parseInvoke(spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO }));
      if (ran.status !== 0 || ran.present !== true || ran.value !== value) {
        throw new Error(flow + " expected " + value);
      }
    };
    expectValue("mintFromClock", [0, 100, 1, 0, 0, 0], 0);
    expectValue("mintFromClock", [0, 50, 1, 1, 1, 100], 22);
    expectValue("mintFromClock", [0, 100, 1, 2, 0, 0], 11);
    expectValue("mintFromClock", [3, 1, 1, 0, 0, 0], 3);
    expectValue("mintFromClock", [11, 1, 1, 0, 0, 0], 11);
    expectValue("mintFromClock", [0, 100, 2, 1, 1, 200], 23);
    expectValue("mintFromClock", [0, -5, 1, 0, 0, 0], 9);
    expectValue("pointMinusPointReason", [2, 10, 1, 10], 23);
    expectValue("pointMinusPointReason", [1, 5, 1, 10], 22);
    expectValue("pointMinusPointReason", [1, 2147483647, 1, -1], 22);
    expectValue("pointMinusPointTicks", [1, 5, 1, 10], -1);
    expectValue("pointMinusPointTicks", [1, 10, 1, 10], 0);
    expectValue("pointPlusDurationReason", [2147483641, 7], 21);
    expectValue("pointPlusDurationTicks", [1, 2147483640, 7], 2147483647);
    expectValue("pointPlusDurationTicks", [1, 2147483641, 7], -1);
    expectValue("durationPlusDurationReason", [2147483647, 1], 21);
    expectValue("durationPlusDurationTicks", [2147483647, 1], -1);
    expectValue("pointPlusPoint", [1, 1, 1, 1], 25);
    expectValue("durationMinusPoint", [1, 1, 1], 25);
    expectValue("comparePoints", [1, 1, 2, 1], 23);
    expectValue("comparePoints", [1, 1, 1, 2], 1);
    expectValue("comparePoints", [1, 2, 1, 1], 2);
    expectValue("comparePoints", [1, 2, 1, 2], 0);
    expectValue("compareDurations", [-1, 1], 22);
    expectValue("remainingReason", [1, 10, 1, 10], 26);
    expectValue("remainingReason", [1, 11, 1, 10], 26);
    expectValue("remainingReason", [1, 9, 2, 10], 23);
    expectValue("remainingReason", [1, 9, 1, 10], 0);
    expectValue("remainingTicks", [1, 9, 1, 10], 1);
    expectValue("remainingTicks", [1, 10, 1, 10], -1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
