import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const utf8 = new TextDecoder("utf-8", { fatal: true });
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 8_388_608;
const MAX_TOTAL_BYTES = 134_217_728;

class AuditFailure extends Error {
  constructor(kind, code, message) {
    super(message);
    this.kind = kind;
    this.code = code;
  }
}

function fail(kind, code, message) {
  throw new AuditFailure(kind, code, message);
}

function insideRoot(candidate) {
  const rel = relative(repositoryRoot, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function exactPath(relativePath, expectedType) {
  if (typeof relativePath !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(relativePath)
      || relativePath.includes("//") || relativePath.split("/").some((part) => part === "." || part === "..")) {
    fail("REFUSED", "PATH_INVALID", "path is not one exact repository-relative locator");
  }
  const path = resolve(repositoryRoot, ...relativePath.split("/"));
  if (!insideRoot(path)) fail("REFUSED", "PATH_ESCAPE", "path escapes the repository");
  let stat;
  try { stat = lstatSync(path); }
  catch { fail("REFUSED", "PATH_MISSING", `required path is unavailable: ${relativePath}`); }
  if (stat.isSymbolicLink()) fail("REFUSED", "PATH_LINK", `linked path refused: ${relativePath}`);
  if (expectedType === "file" && !stat.isFile()) fail("REFUSED", "PATH_TYPE", `regular file required: ${relativePath}`);
  if (expectedType === "directory" && !stat.isDirectory()) fail("REFUSED", "PATH_TYPE", `directory required: ${relativePath}`);
  return { path, stat };
}

function digestRows(rows) {
  const hash = createHash("sha256");
  for (const [path, bytes] of rows) {
    hash.update(path, "utf8");
    hash.update("\0", "utf8");
    hash.update(bytes);
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

function readBounded(relativePath) {
  const { path, stat } = exactPath(relativePath, "file");
  if (stat.size > MAX_FILE_BYTES) fail("REFUSED", "FILE_TOO_LARGE", `file exceeds ceiling: ${relativePath}`);
  let bytes;
  try { bytes = readFileSync(path); }
  catch { fail("REFUSED", "READ_FAILED", `file read failed: ${relativePath}`); }
  let text;
  try { text = utf8.decode(bytes); }
  catch { fail("REFUSED", "UTF8_INVALID", `file is not UTF-8: ${relativePath}`); }
  return { bytes, text };
}

function scanFungiRoot(relativeRoot, inspect = () => {}) {
  const { path: root } = exactPath(relativeRoot, "directory");
  const pending = [[relativeRoot, root]];
  const rows = [];
  let totalBytes = 0;
  while (pending.length > 0) {
    const [currentRelative, current] = pending.pop();
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
    catch { fail("REFUSED", "DIRECTORY_READ_FAILED", `directory read failed: ${currentRelative}`); }
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      const childRelative = `${currentRelative}/${entry.name}`;
      const child = resolve(current, entry.name);
      if (!insideRoot(child)) fail("REFUSED", "PATH_ESCAPE", "walk escaped the repository");
      if (entry.isSymbolicLink()) fail("REFUSED", "PATH_LINK", `linked corpus entry refused: ${childRelative}`);
      if (entry.isDirectory()) { pending.push([childRelative, child]); continue; }
      if (!entry.isFile() || !entry.name.endsWith(".fungi")) continue;
      if (rows.length >= MAX_FILES) fail("REFUSED", "FILE_COUNT_REFUSED", "corpus file ceiling exceeded");
      const { bytes, text } = readBounded(childRelative);
      totalBytes += bytes.length;
      if (totalBytes > MAX_TOTAL_BYTES) fail("REFUSED", "TOTAL_BYTES_REFUSED", "corpus byte ceiling exceeded");
      inspect(childRelative, text);
      rows.push([childRelative, bytes]);
    }
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  if (rows.length === 0) fail("FINDING", "CORPUS_EMPTY", `no .fungi files in ${relativeRoot}`);
  return { files: rows.length, bytes: totalBytes, digest: digestRows(rows) };
}

function receipt(check, result) {
  return Object.freeze({
    schema: "rd0873-read-only-audit.v1",
    authorizing: false,
    verdict: "PASS",
    check,
    files: result.files,
    bytes: result.bytes,
    digest: result.digest,
  });
}

export function auditCorpus(check, relativeRoot) {
  return receipt(check, scanFungiRoot(relativeRoot));
}

export function auditStaticSnippets() {
  let flowSnippets = 0;
  const inspect = (_path, text) => {
    flowSnippets += [...text.matchAll(/\bflow\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/gu)].length;
  };
  const left = scanFungiRoot("packages/fungi", inspect);
  const right = scanFungiRoot("packages-ts/galerina-core-compiler/src/self-hosted", inspect);
  if (flowSnippets === 0) fail("FINDING", "STATIC_SNIPPETS_EMPTY", "no static flow snippets were observed");
  return receipt("static-snippets", {
    files: left.files + right.files,
    bytes: left.bytes + right.bytes,
    digest: digestRows([[left.digest, Buffer.from(right.digest)], ["flow-snippets", Buffer.from(String(flowSnippets))]]),
  });
}

export function auditGeneratedState() {
  const paths = ["build/code-index/code-index.json", "build/code-registry/registry.json"];
  const rows = [];
  let totalBytes = 0;
  for (const path of paths) {
    const { bytes, text } = readBounded(path);
    try { JSON.parse(text); }
    catch { fail("FINDING", "GENERATED_JSON_INVALID", `generated JSON is invalid: ${path}`); }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) fail("REFUSED", "TOTAL_BYTES_REFUSED", "generated-state byte ceiling exceeded");
    rows.push([path, bytes]);
  }
  return receipt("generated-state", { files: rows.length, bytes: totalBytes, digest: digestRows(rows) });
}

export function auditFinalState() {
  const paths = [
    "governance/rd0873-native-fungi-audit-map.json",
    "scripts/tests/rd0873-native-fungi-audit-map.test.mjs",
    "tools/bounded-tool-batch-policy.json",
    "tools/rd0873-read-only-audit-lib.mjs",
    "tools/rd0873-corpus-packages-fungi.mjs",
    "tools/rd0873-corpus-self-hosted.mjs",
    "tools/rd0873-static-snippets.mjs",
    "tools/rd0873-generated-state.mjs",
    "tools/rd0873-final-check.mjs",
  ];
  const rows = [];
  let totalBytes = 0;
  for (const path of paths) {
    const { bytes } = readBounded(path);
    if (bytes.length === 0) fail("FINDING", "FINAL_FILE_EMPTY", `integration file is empty: ${path}`);
    totalBytes += bytes.length;
    rows.push([path, bytes]);
  }
  return receipt("final-check", { files: rows.length, bytes: totalBytes, digest: digestRows(rows) });
}

export function runAudit(callback) {
  try {
    process.stdout.write(`${JSON.stringify(callback())}\n`);
    process.exitCode = 0;
  } catch (error) {
    if (error instanceof AuditFailure && error.kind === "FINDING") {
      process.stdout.write(`${JSON.stringify({ schema: "rd0873-read-only-audit.v1", authorizing: false, verdict: "FINDING", code: error.code })}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`REFUSED: ${error instanceof AuditFailure ? error.code : "EXECUTION_REFUSED"}\n`);
    process.exitCode = 2;
  }
}
