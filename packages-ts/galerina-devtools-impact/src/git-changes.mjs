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
  let sha;
  try {
    sha = execFileSync("git", ["rev-parse", "--verify", `${base}^{commit}`], common)
      .toString("utf8")
      .trim();
  } catch {
    throw new Error("Git base must resolve to a commit");
  }
  if (!/^[0-9a-f]{40,64}$/i.test(sha)) {
    throw new Error("Git base must resolve to a commit");
  }
  const tracked = execFileSync("git", [
    "diff", "--name-only", "-z", "--no-ext-diff", "--diff-filter=ACMRTUXB", sha, "--",
  ], common);
  const untracked = execFileSync("git", [
    "ls-files", "--others", "--exclude-standard", "-z", "--",
  ], common);
  return [...new Set([...zeroSeparated(tracked), ...zeroSeparated(untracked)])]
    .sort((left, right) => left.localeCompare(right));
}
