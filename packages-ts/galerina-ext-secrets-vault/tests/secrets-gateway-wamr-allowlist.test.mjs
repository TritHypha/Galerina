import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { SECRETS_GATEWAY_WIT } from "../dist/types.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const fungiPath = resolve(packageRoot, "src/self-hosted/secrets-gateway-wit.fungi");
const typesPath = resolve(packageRoot, "src/types.ts");
const hostCPath = resolve(
  repoRoot,
  "packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_secrets_gateway_host.c",
);

const PACKAGE = "galerina:secrets-vault@0.1.0";
const INTERFACE = "secrets-gateway";
const IMPORT_MODULE = "galerina:secrets-vault/secrets-gateway@0.1.0";
const RESOURCES = [
  "authenticated-request",
  "signet-grant",
  "secret-lease",
  "cleanup-receipt",
  "verification-result",
  "release-receipt",
];
const ENUMS = new Set([
  "lifecycle-state",
  "refusal",
  "accounting-state",
  "release-state",
]);
const WASM_KIND = {
  WASM_I32: "i32",
  WASM_I64: "i64",
  WASM_F32: "f32",
  WASM_F64: "f64",
};
const SIG_KIND = { i: "i32", I: "i64", f: "f32", F: "f64" };

function maskWitComments(source) {
  return source
    .replace(/\/\/\/[^\n]*/g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function matchingBrace(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("unclosed WIT block");
}

function blockBody(source, kind, name) {
  const pattern = new RegExp(`(?:^|\\s)${kind}\\s+${name}\\s*\\{`);
  const match = source.match(pattern);
  assert.ok(match, `expected ${kind} ${name}`);
  const open = source.indexOf("{", match.index);
  return source.slice(open + 1, matchingBrace(source, open));
}

function flattenType(type) {
  const trimmed = type.replace(/\s+/g, " ").trim();
  const borrow = trimmed.match(/^borrow<\s*([A-Za-z][A-Za-z0-9-]*)\s*>$/);
  if (borrow) {
    assert.ok(RESOURCES.includes(borrow[1]), `unknown borrow resource ${borrow[1]}`);
    return ["i32"];
  }
  const result = trimmed.match(/^result<\s*([^,>]+)\s*,\s*([^>]+)\s*>$/);
  if (result) {
    const ok = flattenType(result[1].trim());
    const err = flattenType(result[2].trim());
    const payload = [];
    for (let index = 0; index < Math.max(ok.length, err.length); index += 1) {
      payload.push(ok[index] ?? err[index]);
    }
    return ["i32", ...payload];
  }
  if (ENUMS.has(trimmed) || RESOURCES.includes(trimmed)) return ["i32"];
  if (trimmed === "u64") return ["i64"];
  if (trimmed === "memory-accounting") {
    return ["i32", "i64", "i64", "i64", "i64"];
  }
  throw new Error(`ungrounded WIT type: ${trimmed}`);
}

function flattenLower(params, results) {
  const MAX_FLAT_RESULTS = 1;
  if (results.length > MAX_FLAT_RESULTS) {
    return { params: [...params, "i32"], results: [] };
  }
  return { params, results };
}

function parseFuncSig(text) {
  const match = text.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*func\s*\(([\s\S]*?)\)\s*(->\s*[^;]+)?\s*;$/);
  assert.ok(match, `malformed func: ${text}`);
  const params = match[2]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const field = part.match(/^[A-Za-z][A-Za-z0-9-]*\s*:\s*(.+)$/);
      assert.ok(field, `malformed param ${part}`);
      return flattenType(field[1]);
    })
    .flat();
  const results = match[3] ? flattenType(match[3].replace(/^->\s*/, "").trim()) : [];
  return { name: match[1], params, results };
}

function topLevelDecls(body) {
  const decls = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (body[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        decls.push(body.slice(start, index + 1));
      }
    }
  }
  return decls;
}

function expectedRows(wit) {
  const code = maskWitComments(wit);
  assert.match(code, new RegExp(`package\\s+${PACKAGE}\\s*;`));
  const iface = blockBody(code, "interface", INTERFACE);
  const rows = [];

  for (const resource of RESOURCES) {
    const resourceDecl = new RegExp(`(?:^|\\s)resource\\s+${resource}(?:\\s*;|\\s*\\{)`);
    assert.match(iface, resourceDecl, `WIT must declare resource ${resource}`);
    rows.push({
      kind: "drop",
      resource,
      wit: "",
      core: `[resource-drop]${resource}`,
      params: "i32",
      results: "",
    });
  }

  const resourceBlocks = [...iface.matchAll(/(?:^|\s)resource\s+([A-Za-z][A-Za-z0-9-]*)\s*\{/g)];
  for (const match of resourceBlocks) {
    const name = match[1];
    const open = iface.indexOf("{", match.index);
    const body = iface.slice(open + 1, matchingBrace(iface, open));
    const funcs = body
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => parseFuncSig(`${part};`));
    for (const func of funcs) {
      const lowered = flattenLower(["i32", ...func.params], func.results);
      rows.push({
        kind: "method",
        resource: name,
        wit: func.name,
        core: `[method]${name}.${func.name}`,
        params: lowered.params.join(","),
        results: lowered.results.join(","),
      });
    }
  }

  let stripped = iface;
  for (const decl of topLevelDecls(iface)) {
    stripped = stripped.replace(decl, " ");
  }
  const ifaceFuncs = [...stripped.matchAll(/([A-Za-z][A-Za-z0-9-]*)\s*:\s*func\s*\(([\s\S]*?)\)\s*(->\s*[^;]+)?\s*;/g)];
  assert.equal(ifaceFuncs.length, 4, "secrets-gateway must have four interface functions");
  for (const match of ifaceFuncs) {
    const func = parseFuncSig(match[0]);
    const lowered = flattenLower(func.params, func.results);
    rows.push({
      kind: "iface",
      resource: "",
      wit: func.name,
      core: func.name,
      params: lowered.params.join(","),
      results: lowered.results.join(","),
    });
  }

  const world = blockBody(code, "world", "auth-service");
  assert.match(world, /export\s+handle\s*:/);
  assert.doesNotMatch(
    rows.map((row) => row.core).join("\n"),
    /^handle$/m,
    "world export handle is not a guest import",
  );
  return rows;
}

function parseContractTable(source) {
  const begin = source.indexOf("CONTRACT_TABLE_BEGIN");
  const end = source.indexOf("CONTRACT_TABLE_END");
  assert.ok(begin >= 0 && end > begin, "C file must contain a CONTRACT_TABLE");
  const block = source.slice(begin, end);
  const rows = [];
  for (const line of block.split("\n")) {
    const match = line.match(
      /^\s*\*\s*ROW\|(iface|method|drop)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\s*$/,
    );
    if (!match) continue;
    rows.push({
      kind: match[1],
      resource: match[2],
      wit: match[3],
      core: match[4],
      params: match[5],
      results: match[6].trim(),
    });
  }
  return rows;
}

function rowKey(row) {
  return [row.kind, row.resource, row.wit, row.core, row.params, row.results].join("|");
}

function enforcedKey(row) {
  return [row.core, row.params, row.results].join("|");
}

function decodeFungiReturn(source) {
  const match = source.match(/return\s+"((?:\\u\{[0-9a-fA-F]{1,6}\}|\\.|[^"\\])*)"/);
  assert.ok(match, "Fungi oracle must return a string literal");
  const jsonString = `"${match[1].replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_escape, digits) => {
    const codepoint = Number.parseInt(digits, 16);
    if (codepoint <= 0xffff) return `\\u${codepoint.toString(16).padStart(4, "0")}`;
    const adjusted = codepoint - 0x10000;
    const high = 0xd800 + (adjusted >> 10);
    const low = 0xdc00 + (adjusted & 0x3ff);
    return `\\u${high.toString(16).padStart(4, "0")}\\u${low.toString(16).padStart(4, "0")}`;
  })}"`;
  return JSON.parse(jsonString);
}

function replaceOnce(source, search, replacement) {
  const index = source.indexOf(search);
  assert.ok(index >= 0, `missing tamper needle: ${search}`);
  assert.equal(source.indexOf(search, index + 1), -1, `tamper needle not unique: ${search}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

function parseImportModule(source) {
  const match = source.match(
    /static\s+const\s+char\s+k_import_module\s*\[\s*\]\s*=\s*"([^"]+)"/,
  );
  assert.ok(match, "k_import_module string is missing");
  return match[1];
}

function parseKindArrays(source) {
  const arrays = new Map();
  const pattern =
    /static\s+const\s+uint8_t\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*\]\s*=\s*\{([^}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    const types = match[2]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((token) => {
        assert.ok(WASM_KIND[token], `unknown wasm kind ${token}`);
        return WASM_KIND[token];
      });
    arrays.set(match[1], types);
  }
  return arrays;
}

function resolveKinds(arrays, name, count) {
  if (name === "NULL") {
    assert.equal(count, 0, "NULL kind pointer must have count 0");
    return [];
  }
  const types = arrays.get(name);
  assert.ok(types, `unresolved kind array ${name}`);
  assert.equal(types.length, count, `kind array ${name} length drifted from count`);
  return types;
}

function parseBraceArray(source, marker) {
  const begin = source.indexOf(marker);
  assert.ok(begin >= 0, `missing ${marker}`);
  const open = source.indexOf("{", begin);
  assert.ok(open > begin, `missing initializer for ${marker}`);
  return source.slice(open + 1, matchingBrace(source, open));
}

function parseKContracts(source) {
  const arrays = parseKindArrays(source);
  const body = parseBraceArray(
    source,
    "static const wamr_function_import_contract_t k_contracts[]",
  );
  const rows = [];
  const pattern =
    /\{\s*k_import_module\s*,\s*"([^"]+)"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\d+)\s*,\s*(NULL|[A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\d+)\s*\}/g;
  for (const match of body.matchAll(pattern)) {
    const params = resolveKinds(arrays, match[2], Number(match[3]));
    const results = resolveKinds(arrays, match[4], Number(match[5]));
    rows.push({
      core: match[1],
      params: params.join(","),
      results: results.join(","),
    });
  }
  assert.ok(rows.length > 0, "k_contracts[] parsed empty");
  return rows;
}

function parseWamrSignature(signature) {
  const match = signature.match(/^\(([^)]*)\)(.*)$/);
  assert.ok(match, `malformed WAMR signature ${signature}`);
  const kinds = (text) =>
    [...text].map((ch) => {
      assert.ok(SIG_KIND[ch], `unknown signature char ${ch}`);
      return SIG_KIND[ch];
    });
  return {
    params: kinds(match[1]).join(","),
    results: kinds(match[2]).join(","),
  };
}

function parseSgNatives(source) {
  const body = parseBraceArray(source, "static NativeSymbol sg_natives[]");
  const rows = [];
  const pattern =
    /\{\s*"([^"]+)"\s*,\s*\(void\s*\*\)\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*"([^"]+)"\s*,\s*NULL\s*\}/g;
  for (const match of body.matchAll(pattern)) {
    const signature = parseWamrSignature(match[2]);
    rows.push({
      core: match[1],
      params: signature.params,
      results: signature.results,
    });
  }
  assert.ok(rows.length > 0, "sg_natives[] parsed empty");
  return rows;
}

function assertEnforcedMatchesWit(source, expected) {
  assert.equal(parseImportModule(source), IMPORT_MODULE);
  const expectedKeys = expected.map(enforcedKey).sort();
  const contracts = parseKContracts(source).map(enforcedKey).sort();
  const natives = parseSgNatives(source).map(enforcedKey).sort();
  assert.deepEqual(contracts, expectedKeys, "k_contracts[] drifted from WIT lowering");
  assert.deepEqual(natives, expectedKeys, "sg_natives[] drifted from WIT lowering");
}

function expectEnforcedDrift(source, expected) {
  assert.throws(() => assertEnforcedMatchesWit(source, expected));
}

describe("secrets-gateway WIT to WAMR allowlist drift", () => {
  it("keeps the C contract table aligned with types.ts and the Fungi oracle", () => {
    const typesSource = readFileSync(typesPath, "utf8");
    assert.match(typesSource, /export const SECRETS_GATEWAY_WIT = `/);
    const fungiWit = decodeFungiReturn(readFileSync(fungiPath, "utf8"));
    assert.equal(fungiWit, SECRETS_GATEWAY_WIT);

    const fromTs = expectedRows(SECRETS_GATEWAY_WIT);
    const fromFungi = expectedRows(fungiWit);
    assert.deepEqual(fromTs.map(rowKey).sort(), fromFungi.map(rowKey).sort());

    const hostC = readFileSync(hostCPath, "utf8");
    assert.match(hostC, new RegExp(`"${IMPORT_MODULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    const fromC = parseContractTable(hostC);
    assert.deepEqual(
      fromC.map(rowKey).sort(),
      fromTs.map(rowKey).sort(),
      "C CONTRACT_TABLE drifted from WIT lowering",
    );

    for (const row of fromTs) {
      const literal = `"${row.core}"`;
      assert.ok(hostC.includes(literal), `C contracts must contain ${literal}`);
    }
    assert.doesNotMatch(hostC, /"handle"/);
    assertEnforcedMatchesWit(hostC, fromTs);
  });

  it("fails closed when the C table drops a resource-drop implied by WIT", () => {
    const hostC = readFileSync(hostCPath, "utf8");
    const stripped = hostC.replace(
      "* ROW|drop|secret-lease||[resource-drop]secret-lease|i32|\n",
      "",
    );
    assert.notEqual(stripped, hostC);
    const fromTs = expectedRows(SECRETS_GATEWAY_WIT).map(rowKey).sort();
    const fromC = parseContractTable(stripped).map(rowKey).sort();
    assert.notDeepEqual(fromC, fromTs);
  });

  it("fails closed on a struct-only param-type change", () => {
    const hostC = readFileSync(hostCPath, "utf8");
    const withArray = replaceOnce(
      hostC,
      "static const uint8_t k_i32x5[] = { WASM_I32, WASM_I32, WASM_I32, WASM_I32, WASM_I32 };",
      "static const uint8_t k_i32x5[] = { WASM_I32, WASM_I32, WASM_I32, WASM_I32, WASM_I32 };\nstatic const uint8_t k_i64[] = { WASM_I64 };",
    );
    const tampered = replaceOnce(
      withArray,
      '{ k_import_module, "[method]secret-lease.state", k_i32, 1, k_i32, 1 }',
      '{ k_import_module, "[method]secret-lease.state", k_i64, 1, k_i32, 1 }',
    );
    expectEnforcedDrift(tampered, expectedRows(SECRETS_GATEWAY_WIT));
  });

  it("fails closed on a struct-only name change", () => {
    const hostC = readFileSync(hostCPath, "utf8");
    const tampered = replaceOnce(
      hostC,
      '{ k_import_module, "[method]secret-lease.state", k_i32, 1, k_i32, 1 }',
      '{ k_import_module, "[method]secret-lease.stateX", k_i32, 1, k_i32, 1 }',
    );
    expectEnforcedDrift(tampered, expectedRows(SECRETS_GATEWAY_WIT));
  });

  it("fails closed on a natives-only signature change", () => {
    const hostC = readFileSync(hostCPath, "utf8");
    const tampered = replaceOnce(
      hostC,
      '{ "[method]secret-lease.state", (void *)sg_stub_i_i, "(i)i", NULL }',
      '{ "[method]secret-lease.state", (void *)sg_stub_i_i, "(i)", NULL }',
    );
    expectEnforcedDrift(tampered, expectedRows(SECRETS_GATEWAY_WIT));
  });

  it("fails closed on an extra 15th enforced row", () => {
    const hostC = readFileSync(hostCPath, "utf8");
    const tampered = replaceOnce(
      hostC,
      '{ k_import_module, "[resource-drop]release-receipt", k_i32, 1, NULL, 0 },',
      '{ k_import_module, "[resource-drop]release-receipt", k_i32, 1, NULL, 0 },\n    { k_import_module, "evil-extra", k_i32, 1, NULL, 0 },',
    );
    expectEnforcedDrift(tampered, expectedRows(SECRETS_GATEWAY_WIT));
  });
});
