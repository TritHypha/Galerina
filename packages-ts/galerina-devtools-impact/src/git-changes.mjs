import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

function zeroSeparated(buffer) {
  return buffer.toString("utf8")
    .split("\0")
    .map((value) => value.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

export function discoverChangedPaths(rootValue, base = "HEAD") {
  const root = resolve(rootValue);
  if (typeof base !== "string" || base === "" || base.includes("\0") || base.startsWith("-")) {
    throw new Error("Git base must be a non-empty ref string");
  }
  const common = {
    cwd: root,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  };
  const tracked = execFileSync("git", [
    "diff", "--name-only", "-z", "--diff-filter=ACMRTUXB", base, "--",
  ], common);
  const untracked = execFileSync("git", [
    "ls-files", "--others", "--exclude-standard", "-z", "--",
  ], common);
  return [...new Set([...zeroSeparated(tracked), ...zeroSeparated(untracked)])]
    .sort((left, right) => left.localeCompare(right));
}
