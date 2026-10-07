#!/usr/bin/env node
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODE = process.argv[2];

function fungiString(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_000_000) {
    throw new TypeError("SECRETS_GATEWAY_WIT must be a non-empty bounded string");
  }
  if (!value.startsWith("\npackage galerina:secrets-vault@0.1.0;\n")) {
    throw new Error("SECRETS_GATEWAY_WIT has an unexpected package/version header");
  }

  let encoded = "";
  for (const character of value) {
    const point = character.codePointAt(0);
    if (character === "\\") encoded += "\\\\";
    else if (character === '"') encoded += '\\"';
    else if (character === "\n") encoded += "\\u{000A}";
    else if (character === "\r") encoded += "\\u{000D}";
    else if (character === "\t") encoded += "\\u{0009}";
    else if (point < 0x20 || point > 0x7e) encoded += `\\u{${point.toString(16).toUpperCase().padStart(4, "0")}}`;
    else encoded += character;
  }
  return encoded;
}

function outputPath(relativePath) {
  const target = resolve(ROOT, relativePath);
  if (!target.startsWith(`${ROOT}/`) && !target.startsWith(`${ROOT}\\`)) {
    throw new Error(`output escapes repository root: ${relativePath}`);
  }
  const stats = lstatSync(target);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`refusing non-regular output target: ${relativePath}`);
  }
  return target;
}

async function main() {
  if (MODE !== "--check" && MODE !== "--write") {
    process.stderr.write("usage: node scripts/generate-secrets-gateway-wit.mjs <--check|--write>\n");
    return 2;
  }
  const oraclePath = resolve(ROOT, "packages-ts/galerina-ext-secrets-vault/dist/types.js");
  const { SECRETS_GATEWAY_WIT } = await import(pathToFileURL(oraclePath).href);
  const encoded = fungiString(SECRETS_GATEWAY_WIT);
  const outputs = [
    {
      relative: "packages-ts/galerina-ext-secrets-vault/src/self-hosted/secrets-gateway-wit.fungi",
      contents: `@version 1\n/// Non-authorizing interface candidate; no WIT build/runtime consumer is wired.\n/// TypeScript oracle: packages-ts/galerina-ext-secrets-vault/src/types.ts#SECRETS_GATEWAY_WIT\npure flow secretsGatewayWit() -> String {\n  return "${encoded}"\n}\n`,
    },
    {
      relative: "packages/fungi/products/galerina-ext-secrets-vault/secrets-gateway-wit.fungi",
      contents: `@version 1\n\n/// Non-authorizing interface candidate; no WIT build/runtime consumer is wired.\n/// TypeScript oracle: packages-ts/galerina-ext-secrets-vault/src/types.ts#SECRETS_GATEWAY_WIT\npure flow secretsGatewayWit() -> String\ncontract { intent { "Return the exact vendor-agnostic secrets gateway WIT interface text." } }\n{\n  return "${encoded}"\n}\n`,
    },
  ].map((output) => ({ ...output, target: outputPath(output.relative) }));

  if (MODE === "--write") {
    for (const output of outputs) writeFileSync(output.target, output.contents, "utf8");
    process.stdout.write(`generated ${outputs.length} Fungi WIT mirrors from SECRETS_GATEWAY_WIT\n`);
    return 0;
  }

  const drift = outputs.filter((output) => readFileSync(output.target, "utf8") !== output.contents);
  if (drift.length > 0) {
    for (const output of drift) process.stderr.write(`drift: ${output.relative}\n`);
    return 1;
  }
  process.stdout.write(`verified ${outputs.length} Fungi WIT mirrors against SECRETS_GATEWAY_WIT\n`);
  return 0;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
