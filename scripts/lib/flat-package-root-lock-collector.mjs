import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

// Canonical bytes come only from stage 0. Live files are mandatory witnesses,
// not a fallback content authority. No Git filters or checkout writes are run.
const MAX_FILE = 16 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;
const MAX_FILES = 40000;
const ATTRIBUTES = ["text", "eol", "filter", "working-tree-encoding", "ident"];
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function refuse(message) { throw new Error(`REFUSED: ${message}`); }
function decode(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { refuse("Git inventory is not UTF-8"); }
}
function sameStat(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.size === b.size
    && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function exists(path) {
  try { lstatSync(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
function validatePath(path) {
  if (!path || /[\\:<>"|?*\x00-\x1f\x7f]/.test(path)
    || path.split("/").some(part => !part || part === "." || part === ".."
      || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    refuse(`invalid tracked path: ${JSON.stringify(path)}`);
  }
}
function regular(path, limit = MAX_FILE) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit) refuse(`not a bounded regular file: ${path}`);
  const real = realpathSync(path);
  const bytes = readFileSync(path);
  const middle = lstatSync(path);
  const again = readFileSync(path);
  const after = lstatSync(path);
  if (bytes.length > limit || !sameStat(before, middle) || !sameStat(middle, after)
    || realpathSync(path) !== real || !bytes.equals(again)) refuse(`file changed while reading: ${path}`);
  return { bytes, stat: after, real, hash: digest(bytes) };
}

export function collectCanonicalPackageFiles(repoRoot) {
  try { return collect(repoRoot); }
  catch (error) {
    if (error.message.startsWith("REFUSED:")) throw error;
    refuse(`${error.code ?? "collection error"}: ${error.message}`);
  }
}

function collect(repoRoot) {
  const root = realpathSync(repoRoot);
  const deadline = Date.now() + 90000;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_ATTR_NOSYSTEM: "1", GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_NO_LAZY_FETCH: "1" });
  function git(args, input, maxBuffer = 32 * 1024 * 1024) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) refuse("collector deadline exceeded");
    const result = spawnSync("git", ["--no-optional-locks", "-c", `safe.directory=${root}`,
      "-c", "core.attributesFile=", "-c", "core.fsmonitor=false", "-C", root, ...args], {
      env, input, timeout: Math.min(10000, remaining), maxBuffer, windowsHide: true,
    });
    if (result.error || result.signal || result.status !== 0) {
      refuse(`Git ${args[0]} failed (status=${result.status}, signal=${result.signal}, error=${result.error?.code ?? "none"})`);
    }
    return result.stdout;
  }
  function location(args) { return resolve(root, decode(git(args)).trim()); }
  function binding() {
    const pointer = join(root, ".git"), stat = lstatSync(pointer);
    if (stat.isSymbolicLink()) refuse("symlinked Git binding");
    const pointerHash = stat.isFile() ? regular(pointer).hash : null;
    if (!stat.isFile() && !stat.isDirectory()) refuse("invalid Git binding");
    return { top: realpathSync(location(["rev-parse", "--show-toplevel"])),
      gitDir: location(["rev-parse", "--absolute-git-dir"]),
      commonDir: location(["rev-parse", "--git-common-dir"]),
      indexPath: location(["rev-parse", "--git-path", "index"]), pointerHash };
  }
  const firstBinding = binding();
  if (firstBinding.top !== root) refuse("Git worktree root mismatch");
  const { gitDir, commonDir, indexPath } = firstBinding;
  function configuration() {
    const raw = git(["config", "--null", "--list"]);
    for (const row of decode(raw).split("\0").filter(Boolean)) {
      if (/^include(?:if\..*)?\.path\n/i.test(row)) refuse("unsupported local config include");
    }
    const files = [...new Set([join(commonDir, "config"), join(gitDir, "config.worktree")])]
      .map(path => exists(path) ? { path, hash: regular(path).hash } : { path, hash: null });
    return JSON.stringify({ effective: digest(raw), files });
  }
  const firstConfiguration = configuration();
  const firstIndex = regular(indexPath, 32 * 1024 * 1024);
  const witnesses = new Map();
  let witnessBytes = 0;
  const absent = new Set();
  function guardedPath(path) {
    validatePath(path);
    const absolute = resolve(root, ...path.split("/"));
    if (relative(root, absolute).startsWith(`..${sep}`) || relative(root, absolute) === "..") refuse(`path escape: ${path}`);
    let current = root;
    for (const part of path.split("/").slice(0, -1)) {
      current = join(current, part);
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(current) !== current) refuse(`redirected directory: ${path}`);
    }
    return absolute;
  }
  function witness(path) {
    const absolute = guardedPath(path);
    const state = regular(absolute);
    if (state.real !== absolute) refuse(`redirected file: ${path}`);
    witnessBytes += state.bytes.length;
    if (witnessBytes > MAX_TOTAL) refuse("worktree byte budget exceeded");
    witnesses.set(path, { stat: state.stat, real: state.real, hash: state.hash });
    return state.bytes;
  }
  // Local info attributes are not versioned authority. Refuse overrides instead
  // of silently accepting a machine-specific clean/smudge policy.
  const infoPaths = [...new Set([join(gitDir, "info/attributes"), join(commonDir, "info/attributes")])];
  function infoState() {
    return infoPaths.map(path => {
      if (!exists(path)) return null;
      const value = regular(path);
      if (value.bytes.length !== 0) refuse("unsupported info/attributes override");
      return { hash: value.hash, real: value.real, stat: value.stat };
    });
  }
  const initialInfo = JSON.stringify(infoState());
  const inventoryArgs = ["ls-files", "--stage", "-z", "--", "packages-ts", ".gitattributes"];
  const inventory = git(inventoryArgs);
  const entries = new Map(), folded = new Set(), prefixes = new Map();
  for (const row of decode(inventory).split("\0").filter(Boolean)) {
    const match = /^(\d{6}) ([0-9a-f]{40}|[0-9a-f]{64}) (\d)\t(.+)$/s.exec(row);
    if (!match) refuse("invalid stage inventory record");
    const [, mode, oid, stage, path] = match;
    validatePath(path);
    if (stage !== "0") refuse(`nonzero index stage: ${path}`);
    if (mode !== "100644" && mode !== "100755") refuse(`unsupported index mode ${mode}: ${path}`);
    if (path !== ".gitattributes" && !path.startsWith("packages-ts/")) refuse(`unexpected index path: ${path}`);
    const key = path.toLowerCase();
    if (folded.has(key)) refuse(`tracked path case collision: ${path}`);
    folded.add(key); entries.set(path, { path, oid });
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join("/"), foldedPrefix = prefix.toLowerCase();
      if (prefixes.has(foldedPrefix) && prefixes.get(foldedPrefix) !== prefix) refuse(`tracked ancestor case collision: ${path}`);
      prefixes.set(foldedPrefix, prefix);
    }
  }
  if (entries.size === 0 || entries.size > MAX_FILES) refuse("empty or oversized package inventory");
  const paths = [...entries.keys()].sort(ordinal);
  for (const path of paths) {
    if (path.startsWith("packages-ts/") && path.split("/").length > 2
      && !exists(join(root, "packages-ts", path.split("/")[1]))) refuse(`missing package peer: ${path.split("/")[1]}`);
  }
  // Include every ancestor attributes file, even when untracked/ignored.
  const attributePaths = new Set([".gitattributes", "packages-ts/.gitattributes"]);
  for (const path of paths) {
    let parent = dirname(path).replaceAll("\\", "/");
    while (parent !== ".") {
      attributePaths.add(`${parent}/.gitattributes`);
      parent = dirname(parent).replaceAll("\\", "/");
    }
  }
  for (const path of attributePaths) {
    if (exists(guardedPath(path))) {
      if (!entries.has(path)) refuse(`untracked attribute file: ${path}`);
    } else if (entries.has(path)) refuse(`missing attribute file: ${path}`);
    else absent.add(path);
  }
  function peers() {
    const packageRoot = guardedPath("packages-ts/placeholder");
    return readdirSync(dirname(packageRoot), { withFileTypes: true }).flatMap(entry => {
      if (entry.isSymbolicLink()) refuse(`symlinked direct package peer: ${entry.name}`);
      return entry.isDirectory() && !entry.name.startsWith(".") ? [entry.name] : [];
    }).sort(ordinal);
  }
  const directories = peers();
  const indexedPeers = [...new Set(paths.filter(path => path.startsWith("packages-ts/") && path.split("/").length > 2)
    .map(path => path.split("/")[1]))].sort(ordinal);
  if (JSON.stringify(directories) !== JSON.stringify(indexedPeers)) refuse("live/index package peer inventory mismatch");
  for (const directory of directories) {
    if (!entries.has(`packages-ts/${directory}/package.json`)) refuse(`peer lacks tracked package.json: ${directory}`);
  }
  const input = Buffer.from(paths.join("\0") + "\0");
  const attrArgs = ["check-attr", "--cached", "-z", "--stdin", ...ATTRIBUTES];
  const rawAttributes = git(attrArgs, input);
  const fields = decode(rawAttributes).split("\0");
  if (fields.pop() !== "" || fields.length !== paths.length * ATTRIBUTES.length * 3) refuse("incomplete attribute coverage");
  const attributes = new Map(paths.map(path => [path, {}]));
  for (let i = 0; i < fields.length; i += 3) {
    const [path, name, value] = fields.slice(i, i + 3);
    const record = attributes.get(path);
    if (!record || !ATTRIBUTES.includes(name) || Object.hasOwn(record, name)) refuse("invalid attribute coverage");
    record[name] = value;
  }
  const eolArgs = ["ls-files", "--eol", "-z", "--", "packages-ts", ".gitattributes"];
  function indexText() {
    return decode(git(eolArgs)).split("\0").filter(Boolean).map(row => {
      const tab = row.indexOf("\t"), match = /^i\/(\S*)\s/.exec(row);
      if (tab < 0 || !match) refuse("invalid index text classification");
      return [row.slice(tab + 1), match[1]];
    }).sort((a, b) => ordinal(a[0], b[0]));
  }
  const eolState = indexText(), textKinds = new Map(eolState);
  if (textKinds.size !== paths.length || paths.some(path => !textKinds.has(path))) refuse("incomplete index text coverage");
  const oids = [...new Set(paths.map(path => entries.get(path).oid))];
  const objectInput = Buffer.from(oids.join("\n") + "\n");
  const checks = decode(git(["cat-file", "--batch-check"], objectInput)).trimEnd().split("\n");
  let total = 0;
  if (checks.length !== oids.length) refuse("incomplete object coverage");
  const sizes = checks.map((row, i) => {
    const match = /^([0-9a-f]+) blob (\d+)$/.exec(row);
    if (!match || match[1] !== oids[i]) refuse("index object is missing or not a blob");
    const size = Number(match[2]); total += size;
    if (!Number.isSafeInteger(size) || size > MAX_FILE || total > MAX_TOTAL) refuse("object byte budget exceeded");
    return size;
  });
  const objects = git(["cat-file", "--batch"], objectInput, MAX_TOTAL + MAX_FILES * 128);
  const blobs = new Map();
  let offset = 0;
  for (let i = 0; i < oids.length; i++) {
    const end = objects.indexOf(10, offset);
    if (end < 0 || decode(objects.subarray(offset, end)) !== `${oids[i]} blob ${sizes[i]}`) refuse("object header changed");
    offset = end + 1;
    const bytes = objects.subarray(offset, offset + sizes[i]); offset += sizes[i];
    if (bytes.length !== sizes[i] || objects[offset++] !== 10) refuse("truncated object bytes");
    const oid = createHash(oids[i].length === 40 ? "sha1" : "sha256")
      .update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (oid !== oids[i]) refuse("object identity mismatch");
    blobs.set(oids[i], bytes);
  }
  if (offset !== objects.length) refuse("unexpected trailing object bytes");
  for (const path of paths) {
    if (Date.now() > deadline) refuse("collector deadline exceeded");
    const attrs = attributes.get(path);
    for (const name of ["filter", "working-tree-encoding", "ident"]) {
      if (!["unspecified", "unset"].includes(attrs[name])) refuse(`unsupported ${name} attribute: ${path}`);
    }
    if (!["unspecified", "unset", "set", "auto"].includes(attrs.text)
      || !["unspecified", "unset", "lf", "crlf"].includes(attrs.eol)) refuse(`unsupported text/eol attribute: ${path}`);
    const canonical = blobs.get(entries.get(path).oid);
    const working = witness(path);
    const kind = textKinds.get(path);
    const text = attrs.text !== "unset" && (attrs.text === "set" || attrs.text === "auto" || ["lf", "crlf"].includes(attrs.eol));
    const lfOnly = !canonical.includes(13) && !canonical.includes(0) && ["lf", "none"].includes(kind);
    // Byte projection only, never decode/re-encode package content or normalize
    // arbitrary CRs. Binary, mixed and lone-CR canonical blobs stay exact-only.
    if (attrs.eol === "lf" && text && working.includes(13)) refuse(`unsupported LF worktree projection: ${path}`);
    if (working.equals(canonical)) continue;
    if (!text || !lfOnly || attrs.eol === "lf") refuse(`worktree differs from canonical projection: ${path}`);
    const projected = Buffer.alloc(canonical.length + canonical.filter(byte => byte === 10).length);
    let cursor = 0;
    for (const byte of canonical) { if (byte === 10) projected[cursor++] = 13; projected[cursor++] = byte; }
    if (!working.equals(projected)) refuse(`worktree differs from canonical projection: ${path}`);
  }
  // Re-observe every witness; early-file changes must not disappear behind the
  // per-read stability check. This is a bounded observation, not an atomic FS lock.
  for (const [path, before] of witnesses) {
    if (Date.now() > deadline) refuse("collector deadline exceeded");
    const after = regular(guardedPath(path));
    if (!sameStat(before.stat, after.stat) || before.real !== after.real || before.hash !== after.hash) refuse(`file drift: ${path}`);
  }
  for (const path of absent) if (exists(guardedPath(path))) refuse(`attribute inventory drift: ${path}`);
  if (JSON.stringify(peers()) !== JSON.stringify(directories)) refuse("package inventory drift");
  if (JSON.stringify(infoState()) !== initialInfo) refuse("info attribute drift");
  if (!git(inventoryArgs).equals(inventory) || !git(attrArgs, input).equals(rawAttributes)
    || JSON.stringify(indexText()) !== JSON.stringify(eolState)) refuse("index or attribute drift");
  const lastIndex = regular(indexPath, 32 * 1024 * 1024);
  if (!sameStat(firstIndex.stat, lastIndex.stat) || firstIndex.hash !== lastIndex.hash) refuse("index changed during collection");
  if (JSON.stringify(binding()) !== JSON.stringify(firstBinding)) refuse("Git binding changed during collection");
  if (configuration() !== firstConfiguration) refuse("Git configuration drift");
  if (Date.now() > deadline) refuse("collector deadline exceeded");
  return directories.map(directory => {
    const prefix = `packages-ts/${directory}/`;
    return { directory, files: paths.filter(path => path.startsWith(prefix))
      .map(path => ({ path: path.slice(prefix.length), bytes: blobs.get(entries.get(path).oid) })) };
  });
}
