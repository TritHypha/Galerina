import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const PROFILE = join(MEM, "src", "adapter-profile.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const IMPORT_LINE = "import \"./c-boundary.fungi\"";

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO });
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

function flattenProfile() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const profile = readFileSync(PROFILE, "utf8");
  assert.equal(profile.includes(IMPORT_LINE), true, "landed source must import c-boundary");
  const parts = profile.split(IMPORT_LINE);
  assert.equal(parts.length, 2, "import line must occur once");
  let rest = parts[0] + parts[1];
  const marker = "@version 1";
  const first = rest.indexOf(marker);
  assert.notEqual(first, -1, "profile version marker");
  rest = rest.slice(first + marker.length);
  const dir = mkdtempSync(join(tmpdir(), "q44-flat-"));
  const file = join(dir, "flat.fungi");
  writeFileSync(file, boundary + "\n" + rest);
  return { dir, file };
}

function classify(args) {
  const flat = flattenProfile();
  try {
    return invoke(flat.file, "classifyAdapter", args);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function tableOf(args) {
  const flat = flattenProfile();
  try {
    return invoke(flat.file, "tableForClass", args);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function expectPacked(r, expected, label) {
  assert.equal(r.status, 0, label + " status " + r.reason + " " + r.text);
  assert.equal(r.present, true, label + " " + r.reason + " " + r.text);
  assert.equal(r.value, expected, label + " " + r.text);
}

function replaceOnce(s, from, to) {
  const i = s.indexOf(from);
  assert.notEqual(i, -1, "needle missing");
  const j = s.indexOf(from, i + from.length);
  assert.equal(j, -1, "needle not unique");
  return s.slice(0, i) + to + s.slice(i + from.length);
}

function withMutant(from, to, runRed) {
  const orig = readFileSync(PROFILE, "utf8");
  const mutant = replaceOnce(orig, from, to);
  writeFileSync(PROFILE, mutant);
  try {
    runRed();
  } finally {
    writeFileSync(PROFILE, orig);
  }
}

test("c-boundary helper still maps classTag 0..10 and unlisted 11", () => {
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [0, 4]), 0, "ok");
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [3, 0]), 3, "NaN");
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [11, 0]), 11, "unlisted");
});

test("closed-sum IN_PROCESS_BOUND selects Q07 when host-import plus AUDITED_NO_BUFFERING", () => {
  expectPacked(classify([0, 0, 0, 0]), 0, "in-process Q07");
  expectPacked(tableOf([0, 0]), 0, "table Q07");
});

test("closed-sum OUT_OF_PROCESS_UNBOUND selects DU-only for UNAUDITED and AUDITED_BUFFERS", () => {
  expectPacked(classify([0, 0, 0, 1]), 1, "UNAUDITED");
  expectPacked(classify([0, 0, 0, 2]), 1, "AUDITED_BUFFERS");
  expectPacked(tableOf([0, 1]), 1, "table DU-only");
});

test("closed-sum unlisted observation class refuses 11", () => {
  expectPacked(tableOf([0, 2]), 11, "unlisted class 2");
  expectPacked(tableOf([0, 9]), 11, "unlisted class 9");
  expectPacked(classify([0, 0, 0, 9]), 11, "unlisted audit");
});

test("SharedArrayBuffer refuses ADAPTER_CLASS_NOT_ADMITTED", () => {
  expectPacked(classify([0, 1, 0, 0]), 2, "SAB");
});

test("shared WebAssembly.Memory refuses ADAPTER_CLASS_NOT_ADMITTED", () => {
  expectPacked(classify([0, 2, 0, 0]), 2, "shared wasm memory");
});

test("MessagePort copy refuses ADAPTER_CLASS_NOT_ADMITTED", () => {
  expectPacked(classify([0, 3, 0, 0]), 2, "MessagePort copy");
});

test("MessagePort transfer refuses ADAPTER_CLASS_NOT_ADMITTED", () => {
  expectPacked(classify([0, 4, 0, 0]), 2, "MessagePort transfer");
});

test("mmap refuses ADAPTER_CLASS_NOT_ADMITTED", () => {
  expectPacked(classify([0, 5, 0, 0]), 2, "mmap");
});

test("descriptor passing refuses ADAPTER_CLASS_NOT_ADMITTED", () => {
  expectPacked(classify([0, 6, 0, 0]), 2, "fd passing");
});

test("native hand-off is OUT_OF_PROCESS_UNBOUND even with AUDITED_NO_BUFFERING", () => {
  expectPacked(classify([0, 7, 0, 0]), 1, "native audited");
  expectPacked(classify([0, 7, 0, 1]), 1, "native UNAUDITED");
});

test("unknown kind refuses UNKNOWN_ADAPTER_KIND distinct from NOT_ADMITTED", () => {
  expectPacked(classify([0, 8, 0, 0]), 3, "kind 8");
  expectPacked(classify([0, 99, 0, 0]), 3, "kind 99");
});

test("raw non-c-boundary classTag refuses RAW_VALUE_REFUSED", () => {
  expectPacked(classify([3, 0, 0, 0]), 4, "kind NaN class");
  expectPacked(classify([1, 0, 0, 0]), 4, "kind Null class");
  expectPacked(classify([0, 0, 7, 0]), 4, "audit NonInteger class");
  expectPacked(tableOf([10, 0]), 4, "table WrongType class");
});

test("unlisted classTag refuses 11 not RAW", () => {
  expectPacked(classify([12, 0, 0, 0]), 11, "kind unlisted tag");
  expectPacked(classify([0, 0, 12, 0]), 11, "audit unlisted tag");
});

test("UNAUDITED and AUDITED_BUFFERS never yield IN_PROCESS_BOUND", () => {
  const rows = [
    [0, 0, 0, 1],
    [0, 0, 0, 2],
    [0, 7, 0, 1],
    [0, 7, 0, 2],
  ];
  let i = 0;
  while (i < rows.length) {
    const r = classify(rows[i]);
    assert.notEqual(r.value, 0, "row " + String(i) + " " + r.text);
    i = i + 1;
  }
});

test("landed source check admits import; standalone build refuses FUNGI-NAME-001", () => {
  const check = spawnSync(
    process.execPath,
    [GALERINA, "check", PROFILE, "--strict-types", "--strict-governance"],
    { encoding: "utf8", cwd: REPO }
  );
  assert.equal(check.status, 0, check.stdout + check.stderr);
  const build = spawnSync(
    process.execPath,
    [GALERINA, "build", PROFILE],
    { encoding: "utf8", cwd: REPO }
  );
  const text = (build.stdout || "") + (build.stderr || "");
  assert.notEqual(build.status, 0, "standalone build must refuse import CALL");
  assert.equal(text.includes("FUNGI-NAME-001"), true, text);
});

test("mutant default-to-in-process on unlisted class goes red", () => {
  withMutant("let unlistedClassDefault: Int = 11", "let unlistedClassDefault: Int = 0", () => {
    const r = tableOf([0, 2]);
    assert.equal(r.value, 0, r.text);
    assert.notEqual(r.value, 11, "unlisted must not default to in-process");
  });
});

test("mutant admit SharedArrayBuffer goes red", () => {
  withMutant("let sabRefuse: Int = 2", "let sabRefuse: Int = 0", () => {
    const r = classify([0, 1, 0, 0]);
    assert.equal(r.value, 0, r.text);
  });
});

test("mutant merge NOT_ADMITTED with unlisted goes red", () => {
  withMutant("let sabRefuse: Int = 2", "let sabRefuse: Int = 11", () => {
    const r = classify([0, 1, 0, 0]);
    assert.equal(r.value, 11, r.text);
    assert.notEqual(r.value, 2, "merged codes");
  });
});

test("mutant UNAUDITED admitted as in-process goes red", () => {
  withMutant("let unauditedSelectsDu: Int = 1", "let unauditedSelectsDu: Int = 0", () => {
    const r = classify([0, 0, 0, 1]);
    assert.equal(r.value, 0, r.text);
  });
});

test("mutant native hand-off as in-process goes red", () => {
  withMutant("let nativeSelectsDu: Int = 1", "let nativeSelectsDu: Int = 0", () => {
    const r = classify([0, 7, 0, 0]);
    assert.equal(r.value, 0, r.text);
  });
});

test("mutant DU-only table returning COMMITTED-capable code goes red", () => {
  withMutant("let duOnlyTable: Int = 1", "let duOnlyTable: Int = 0", () => {
    const r = tableOf([0, 1]);
    assert.equal(r.value, 0, r.text);
    const c = classify([0, 0, 0, 1]);
    assert.equal(c.value, 0, c.text);
  });
});
