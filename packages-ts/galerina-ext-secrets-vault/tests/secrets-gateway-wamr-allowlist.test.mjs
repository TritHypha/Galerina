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
});
