import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative } from "node:path";

export function pathIsSymlink(file) {
  try {
    readlinkSync(file);
    return true;
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "EINVAL" || err.code === "UNKNOWN")) {
      // missing path, or not a reparse point
    } else {
      throw err;
    }
  }
  try {
    return lstatSync(file).isSymbolicLink();
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw err;
  }
}

export function refuseLinkedPath(filePath, code, root) {
  let current = filePath;
  for (;;) {
    if (pathIsSymlink(current)) {
      throw new Error(`${code}_LINKED`);
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
    const rel = relative(root, current);
    if (rel === "" || rel === ".." || rel.startsWith("..")) break;
  }
}

export function admitOutputDir(dir, code, root) {
  const fromRoot = relative(root, dir);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`${code}_OUTSIDE_ROOT`);
  }
  refuseLinkedPath(dir, code, root);
  mkdirSync(dir, { recursive: true });
  if (pathIsSymlink(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`${code}_LINKED`);
  }
  const resolved = realpathSync.native(dir);
  const rootReal = realpathSync.native(root);
  const rel = relative(rootReal, resolved);
  if (rel.startsWith("..") || isAbsolute(rel) || !rel.replace(/\\/g, "/").startsWith("build/")) {
    throw new Error(`${code}_ESCAPED`);
  }
  return resolved;
}

export function writeOutputFile(filePath, content, code, root) {
  refuseLinkedPath(filePath, code, root);
  writeFileSync(filePath, content);
}

export function copyOutputFile(from, to, code, root) {
  refuseLinkedPath(to, code, root);
  copyFileSync(from, to);
}
