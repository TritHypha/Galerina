import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";
import {
  classifyPath,
  TAG_AUTH_VERIFY,
  TAG_UNNORMALISABLE,
  TAG_PUBLIC_HELLO,
  TAG_PUBLIC_FIXTURE,
  TAG_PUBLIC_OTHER,
} from "./rfc3986.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const GATE = join(MEM, "src", "serve-gate.fungi");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const RFC = join(HERE, "rfc3986.mjs");
const GALERINA = join(REPO, "galerina.mjs");
const IMPORT_LINE = "\nimport \"./c-boundary.fungi\"\n";

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: dirname(file) });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  if (!m) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_ABSENT", value: 0 };
  }
  const value = Number(m[1]);
  if (Number.isSafeInteger(value) !== true) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_NOT_SAFE_INTEGER", value: 0 };
  }
  return { status: r.status, text, present: true, reason: "INVOKE_VALUE_PRESENT", value };
}

function flattenGate() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const gate = readFileSync(GATE, "utf8");
  assert.equal(gate.includes(IMPORT_LINE), true, "landed source must import c-boundary");
  const parts = gate.split(IMPORT_LINE);
  assert.equal(parts.length, 2, "import line must occur once");
  let rest = parts[0] + parts[1];
  const marker = "@version 1";
  const first = rest.indexOf(marker);
  assert.notEqual(first, -1, "gate version marker");
  rest = rest.slice(first + marker.length);
  const dir = mkdtempSync(join(tmpdir(), "kg01-flat-"));
  const file = uniqueFungiFile(dir);
  writeFileSync(file, boundary + "\n" + rest);
  return { dir, file };
}

function invokePath(pathClass) {
  const flat = flattenGate();
  try {
    return invoke(flat.file, "pathProtection", [pathClass]);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function expectPacked(r, expected, label) {
  assert.equal(r.status, 0, label + " status " + r.reason + " " + r.text);
  assert.equal(r.present, true, label + " " + r.reason + " " + r.text);
  assert.equal(r.value, expected, label + " " + r.text);
}

function withFileMutant(path, from, to, label, fn) {
  const orig = readFileSync(path, "utf8");
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, label + " needle");
  writeFileSync(path, mutant);
  try {
    return fn();
  } finally {
    writeFileSync(path, orig);
  }
}

const VECTORS = Object.freeze([
  { input: "/auth/verify", tag: TAG_AUTH_VERIFY },
  { input: "/auth/verify/", tag: TAG_UNNORMALISABLE },
  { input: "/AUTH/verify", tag: TAG_UNNORMALISABLE },
  { input: "/auth/%76erify", tag: TAG_AUTH_VERIFY },
  { input: "/auth/verify%2f", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%2F", tag: TAG_UNNORMALISABLE },
  { input: "/auth\\verify", tag: TAG_UNNORMALISABLE },
  { input: "/../auth/verify", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%00", tag: TAG_UNNORMALISABLE },
  { input: "/auth/v%C3%A9rify", tag: TAG_UNNORMALISABLE },
  { input: "/auth/v\u00e9rify", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%C0%AF", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%zz", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify?v=1&v=2", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify?a=1&a=2", tag: TAG_AUTH_VERIFY },
  { input: "/auth//verify/../verify%2F?x=1", tag: TAG_UNNORMALISABLE },
  { input: "/hello", tag: TAG_PUBLIC_HELLO },
  { input: "/fixture", tag: TAG_PUBLIC_FIXTURE },
  { input: "/public", tag: TAG_PUBLIC_OTHER },
  { input: "/auth/verify?x=1", tag: TAG_AUTH_VERIFY },
  { input: "/auth/./verify", tag: TAG_AUTH_VERIFY },
  { input: "/auth/foo/../verify", tag: TAG_AUTH_VERIFY },
  { input: "/auth%2Fverify", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%3F", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%23", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%26", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%5C", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%3Fx=1", tag: TAG_UNNORMALISABLE },
  { input: "", tag: TAG_UNNORMALISABLE },
  { input: "auth/verify", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify/extra", tag: TAG_UNNORMALISABLE },
  { input: "/", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify?object=1&object=2", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify?version=1&version=2", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify?v=1", tag: TAG_AUTH_VERIFY },
  { input: "/HELLO", tag: TAG_UNNORMALISABLE },
  { input: "/hello/", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify#frag", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%2", tag: TAG_UNNORMALISABLE },
  { input: "//auth/verify", tag: TAG_UNNORMALISABLE },
  { input: "/auth//verify", tag: TAG_UNNORMALISABLE },
  { input: "/../../auth/verify", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify%01", tag: TAG_UNNORMALISABLE },
  { input: "/auth/verify?object=1", tag: TAG_AUTH_VERIFY },
]);

const FUNGI_PATH = {
  0: 1,
  6: 2,
  7: 0,
  8: 0,
  9: 0,
};

test("KG-01 host-contract table has at least 40 vectors", () => {
  assert.equal(VECTORS.length >= 40, true, String(VECTORS.length));
});

test("KG-01 RFC 3986 vectors map to closed tags", () => {
  let i = 0;
  while (i < VECTORS.length) {
    const row = VECTORS[i];
    const tag = classifyPath(row.input);
    assert.equal(tag, row.tag, row.input);
    i = i + 1;
  }
});

test("KG-01 refusing inputs never produce public tags 7-9", () => {
  let i = 0;
  while (i < VECTORS.length) {
    const row = VECTORS[i];
    if (row.tag === TAG_UNNORMALISABLE) {
      const tag = classifyPath(row.input);
      assert.notEqual(tag, TAG_PUBLIC_HELLO, row.input);
      assert.notEqual(tag, TAG_PUBLIC_FIXTURE, row.input);
      assert.notEqual(tag, TAG_PUBLIC_OTHER, row.input);
      assert.notEqual(tag, TAG_AUTH_VERIFY, row.input);
    }
    i = i + 1;
  }
});

test("KG-01 .fungi pathProtection matches host-contract tags", () => {
  const seen = {};
  let i = 0;
  while (i < VECTORS.length) {
    const tag = VECTORS[i].tag;
    if (seen[tag] !== true) {
      seen[tag] = true;
      const expected = FUNGI_PATH[tag];
      assert.equal(expected !== undefined, true, "fungi tag " + String(tag));
      expectPacked(invokePath(tag), expected, "pathClass " + String(tag));
    }
    i = i + 1;
  }
  expectPacked(invokePath(99), 12, "unlisted 99");
});

test("KG-01 required synthetic double-slash dot percent query is UNKNOWN", () => {
  assert.equal(classifyPath("/auth//verify/../verify%2F?x=1"), TAG_UNNORMALISABLE);
});

test("mutant m1a decode before split goes RED then restore", async () => {
  assert.equal(classifyPath("/auth/verify%3Fx=1"), TAG_UNNORMALISABLE);
  const orig = readFileSync(RFC, "utf8");
  const from = "  const parts = splitComponents(input);";
  const to = "  const decodedFirst = decodeURIComponent(input);\n  const parts = splitComponents(decodedFirst);";
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "m1a needle");
  writeFileSync(RFC, mutant);
  try {
    const url = pathToFileURL(RFC).href + "?m1a=" + String(Date.now());
    const mod = await import(url);
    assert.equal(mod.classifyPath("/auth/verify%3Fx=1"), TAG_AUTH_VERIFY, "m1a RED");
  } finally {
    writeFileSync(RFC, orig);
  }
});

test("mutant m1b decode %2F goes RED then restore", async () => {
  assert.equal(classifyPath("/auth%2Fverify"), TAG_UNNORMALISABLE);
  const orig = readFileSync(RFC, "utf8");
  const from = "      if (RESERVED_HEX[upper] === true) {\n        return { ok: false, path: \"\" };\n      }";
  const to = "      if (RESERVED_HEX[upper] === true) {\n        out.push(String.fromCharCode(parseInt(upper, 16)));\n        i = i + 3;\n        continue;\n      }";
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "m1b needle");
  writeFileSync(RFC, mutant);
  try {
    const url = pathToFileURL(RFC).href + "?m1b=" + String(Date.now());
    const mod = await import(url);
    assert.equal(mod.classifyPath("/auth%2Fverify"), TAG_AUTH_VERIFY, "m1b RED");
  } finally {
    writeFileSync(RFC, orig);
  }
});

test("mutant m1c lowercase the path goes RED then restore", async () => {
  assert.equal(classifyPath("/AUTH/verify"), TAG_UNNORMALISABLE);
  const orig = readFileSync(RFC, "utf8");
  const from = "  const listed = CLOSED[dots.path];";
  const to = "  const listed = CLOSED[dots.path.toLowerCase()];";
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "m1c needle");
  writeFileSync(RFC, mutant);
  try {
    const url = pathToFileURL(RFC).href + "?m1c=" + String(Date.now());
    const mod = await import(url);
    assert.equal(mod.classifyPath("/AUTH/verify"), TAG_AUTH_VERIFY, "m1c RED");
  } finally {
    writeFileSync(RFC, orig);
  }
});

test("mutant m1d strip the trailing slash goes RED then restore", async () => {
  assert.equal(classifyPath("/auth/verify/"), TAG_UNNORMALISABLE);
  const orig = readFileSync(RFC, "utf8");
  const from = "  const listed = CLOSED[dots.path];";
  const to = "  let stripped = dots.path;\n  if (stripped.length > 1 && stripped.endsWith(\"/\")) stripped = stripped.slice(0, -1);\n  const listed = CLOSED[stripped];";
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "m1d needle");
  writeFileSync(RFC, mutant);
  try {
    const url = pathToFileURL(RFC).href + "?m1d=" + String(Date.now());
    const mod = await import(url);
    assert.equal(mod.classifyPath("/auth/verify/"), TAG_AUTH_VERIFY, "m1d RED");
  } finally {
    writeFileSync(RFC, orig);
  }
});

test("mutant m1e accept backslash goes RED then restore", async () => {
  assert.equal(classifyPath("/auth\\verify"), TAG_UNNORMALISABLE);
  const orig = readFileSync(RFC, "utf8");
  const from = "    if (ch === \"\\\\\") {\n      return { ok: false, path: \"\" };\n    }";
  const to = "    if (ch === \"\\\\\") {\n      out.push(\"/\");\n      i = i + 1;\n      continue;\n    }";
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "m1e needle");
  writeFileSync(RFC, mutant);
  try {
    const url = pathToFileURL(RFC).href + "?m1e=" + String(Date.now());
    const mod = await import(url);
    assert.equal(mod.classifyPath("/auth\\verify"), TAG_AUTH_VERIFY, "m1e RED");
  } finally {
    writeFileSync(RFC, orig);
  }
});

test("mutant m1f clamp dot-segment escape at root goes RED then restore", async () => {
  assert.equal(classifyPath("/../auth/verify"), TAG_UNNORMALISABLE);
  const orig = readFileSync(RFC, "utf8");
  const from = "    if (seg === \"..\") {\n      if (out.length === 0) {\n        return { ok: false, path: \"\" };\n      }\n      out.pop();";
  const to = "    if (seg === \"..\") {\n      if (out.length === 0) {\n        i = i + 1;\n        continue;\n      }\n      out.pop();";
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "m1f needle");
  writeFileSync(RFC, mutant);
  try {
    const url = pathToFileURL(RFC).href + "?m1f=" + String(Date.now());
    const mod = await import(url);
    assert.equal(mod.classifyPath("/../auth/verify"), TAG_AUTH_VERIFY, "m1f RED");
  } finally {
    writeFileSync(RFC, orig);
  }
});

test("mutant m1g last-wins duplicate version key goes RED then restore", async () => {
  assert.equal(classifyPath("/auth/verify?v=1&v=2"), TAG_UNNORMALISABLE);
  const orig = readFileSync(RFC, "utf8");
  const from = "    if (VERSION_KEY[key] === true) {\n      if (seen[key] === true) {\n        return true;\n      }\n      seen[key] = true;\n    }";
  const to = "    if (VERSION_KEY[key] === true) {\n      seen[key] = true;\n    }";
  const mutant = orig.replace(from, to);
  assert.notEqual(mutant, orig, "m1g needle");
  writeFileSync(RFC, mutant);
  try {
    const url = pathToFileURL(RFC).href + "?m1g=" + String(Date.now());
    const mod = await import(url);
    assert.equal(mod.classifyPath("/auth/verify?v=1&v=2"), TAG_AUTH_VERIFY, "m1g RED");
  } finally {
    writeFileSync(RFC, orig);
  }
});

test("mutant m1h .fungi default arm returns 0 goes RED then restore", () => {
  expectPacked(invokePath(99), 12, "live 99");
  withFileMutant(
    GATE,
    "  if pathClass == 9 {\n    return 0\n  }\n  return 12\n}",
    "  if pathClass == 9 {\n    return 0\n  }\n  return 0\n}",
    "m1h",
    () => {
      const red = invokePath(99);
      assert.equal(red.value, 0, "m1h RED " + red.text);
    },
  );
  expectPacked(invokePath(99), 12, "restore 99");
});
