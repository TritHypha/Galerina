import { readFileSync } from "node:fs";
import { pins, PROFILE_PATH } from "./harness.mjs";

const mutants = {
  M1: ["let pointPlusOverflow: Int = 21", "let pointPlusOverflow: Int = 0"],
  M2: ["let backwardsReading: Int = 22", "let backwardsReading: Int = 0"],
  M3: ["let crossEpoch: Int = 23", "let crossEpoch: Int = 1"],
  M4: ["let remainingUnknown: Int = 23", "let remainingUnknown: Int = 0"],
  M5: ["readForeignLength(classTag, reading, 2147483647)", "readForeignSafeInteger(classTag, reading)"],
  M6: ["let backwardsReading: Int = 22", "while reading < lastTicks {\n        return 0\n      }\n      let backwardsReading: Int = 22"],
};

const id = process.argv[2];
const pair = mutants[id];
if (pair === undefined) {
  process.exit(2);
}
const orig = readFileSync(PROFILE_PATH, "utf8");
const at = orig.indexOf(pair[0]);
if (at < 0 || orig.indexOf(pair[0], at + pair[0].length) >= 0) {
  process.exit(2);
}
const mutant = orig.slice(0, at) + pair[1] + orig.slice(at + pair[0].length);
try {
  pins(mutant);
} catch {
  process.exit(1);
}
process.exit(0);
