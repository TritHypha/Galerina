// Generate the VOK copy of the SLIDE linear-memory trap-parity vectors
// (MEM-R9, gap map 5.4 / H16).
//
//   node linear-memory-trap-vectors.gen.mjs --slide <SLIDE checkout> [--check]
//
// Every expected answer comes from SLIDE's reference model
// src/linear-memory-bounds.mjs (SLIDE main 8f62c0c or later); nothing here
// computes a verdict itself. The grid and the row encoding live in
// linear-memory-trap-grid.mjs so the pin test can rebuild them. --check
// rewrites nothing and exits 1 when the committed files differ.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildGrid, outcomeTail, renderRowsText, VECTOR_SCHEMA } from "./linear-memory-trap-grid.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const JSON_NAME = "linear-memory-trap-vectors.json";
export const ROWS_NAME = "linear-memory-trap-vectors.rows.txt";

export async function deriveFromSlide(slideRoot) {
  const modelPath = join(resolve(slideRoot), "src", "linear-memory-bounds.mjs");
  const modelBytes = readFileSync(modelPath);
  const model = await import(pathToFileURL(modelPath).href);
  const rows = buildGrid().map((row) => {
    const outcome = model[row.call](row.request);
    return { input: row.input, expect: outcomeTail(outcome), engine: row.engine };
  });
  const doc = {
    schema: VECTOR_SCHEMA,
    source: "SLIDE src/linear-memory-bounds.mjs",
    sourceSha256: createHash("sha256").update(modelBytes).digest("hex"),
    rowCount: rows.length,
    rows,
  };
  const jsonText = `${JSON.stringify(doc, null, 2)}\n`;
  const rowsText = renderRowsText(doc, createHash("sha256").update(jsonText).digest("hex"));
  return { doc, jsonText, rowsText };
}

async function main(argv) {
  const at = argv.indexOf("--slide");
  const slideRoot = at >= 0 ? argv[at + 1] : process.env.SLIDE_ROOT;
  if (!slideRoot) {
    console.error("need --slide <SLIDE checkout> or SLIDE_ROOT");
    return 2;
  }
  const { jsonText, rowsText, doc } = await deriveFromSlide(slideRoot);
  const jsonPath = join(here, JSON_NAME);
  const rowsPath = join(here, ROWS_NAME);
  if (argv.includes("--check")) {
    const same = readFileSync(jsonPath, "utf8") === jsonText && readFileSync(rowsPath, "utf8") === rowsText;
    console.log(same ? `LMB_VECTORS_MATCH rows=${doc.rowCount}` : "LMB_VECTORS_DRIFT");
    return same ? 0 : 1;
  }
  writeFileSync(jsonPath, jsonText);
  writeFileSync(rowsPath, rowsText);
  console.log(`LMB_VECTORS_WRITTEN rows=${doc.rowCount} source=${doc.sourceSha256.slice(0, 16)}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
