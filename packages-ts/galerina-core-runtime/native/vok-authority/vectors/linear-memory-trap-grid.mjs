// Shared grid + row encoding for the VOK linear-memory trap-parity vectors
// (MEM-R9). Inputs only: expected answers are taken from SLIDE's model by the
// generator, and checked against the real WebAssembly engine by the pin test.
//
// Row text form (one per line, decimal integers, single spaces):
//   access <i32|i64> <address> <offset> <width> <memoryBytes> | STATUS FAILURE
//   range  <i32|i64> <start> <length> <memoryBytes>           | STATUS FAILURE
//   copy   <i32|i64> <dst> <src> <length> <memoryBytes>       | STATUS FAILURE
//   grow   <i32|i64> <currentPages> <deltaPages> <max|->      | STATUS FAILURE <result> <pages>
//   div    <op> <bits> <a> <b>                                | STATUS FAILURE [value]

export const VECTOR_SCHEMA = "galerina.vok.linear-memory-trap-vectors.v1";
const PAGE = 65_536n;
const U32 = 1n << 32n;
const U64 = 1n << 64n;

function uniq(values) {
  return [...new Set(values.map(String))].map(BigInt).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

function accessRows(indexType, memories, widths, offsets, addressFor) {
  const rows = [];
  const limit = indexType === "i32" ? U32 : U64;
  for (const memoryBytes of memories) {
    for (const width of widths) {
      for (const offset of offsets) {
        for (const address of uniq(addressFor(memoryBytes, width)).filter((a) => a >= 0n && a < limit)) {
          rows.push({
            call: "checkLinearAccess",
            request: { indexType, address, staticOffset: offset, width, memoryBytes },
            input: `access ${indexType} ${address} ${offset} ${width} ${memoryBytes}`,
            engine: true,
          });
        }
      }
    }
  }
  return rows;
}

export function buildGrid() {
  const rows = [];
  // 5.1 / 5.2: wrap-around, last-byte wide access, offset carry (memory32).
  rows.push(...accessRows("i32", [0n, PAGE, 2n * PAGE], [1n, 2n, 4n, 8n, 16n], [0n, 1n, 0x20n, 0xFFFFFFFFn],
    (m, w) => [0n, 1n, m - w - 1n, m - w, m - w + 1n, m - 1n, m, 0xFFFFFFF0n, U32 - w, U32 - 1n]));
  // H15: memory64 offsets past 2^32 and near 2^64 never wrap.
  rows.push(...accessRows("i64", [PAGE], [1n, 8n], [0n, 0x20n, U32, U64 - 1n],
    (m, w) => [0n, m - w, m - w + 1n, U32, U64 - 16n, U64 - 1n]));
  // Bulk ranges (memory.fill) and copies (memory.copy), zero-length edge.
  for (const start of [0n, 1n, PAGE - 1n, PAGE, PAGE + 1n, U32 - 1n]) {
    for (const length of [0n, 1n, 2n, PAGE, U32 - 1n]) {
      rows.push({
        call: "checkLinearRange",
        request: { indexType: "i32", start, length, memoryBytes: PAGE },
        input: `range i32 ${start} ${length} ${PAGE}`,
        engine: true,
      });
    }
  }
  for (const destination of [0n, PAGE - 1n, PAGE, U32 - 1n]) {
    for (const source of [0n, PAGE - 1n, PAGE, U32 - 1n]) {
      for (const length of [0n, 1n, 2n]) {
        rows.push({
          call: "checkLinearCopy",
          request: { indexType: "i32", destination, source, length, memoryBytes: PAGE },
          input: `copy i32 ${destination} ${source} ${length} ${PAGE}`,
          engine: true,
        });
      }
    }
  }
  // 5.3: memory.grow past the declared or implied maximum returns -1.
  for (const maxPages of [undefined, 1n, 2n, 3n]) {
    for (const currentPages of [0n, 1n, 2n]) {
      for (const deltaPages of [0n, 1n, 2n, 65_536n, U32 - 1n]) {
        const request = { indexType: "i32", currentPages, deltaPages };
        if (maxPages !== undefined) request.maxPages = maxPages;
        const fits = currentPages + deltaPages <= 8n;
        const valid = maxPages === undefined || currentPages <= maxPages;
        rows.push({
          call: "checkMemoryGrow",
          request,
          input: `grow i32 ${currentPages} ${deltaPages} ${maxPages === undefined ? "-" : maxPages}`,
          // Large successful grows are model-only (no multi-GiB allocation in CI).
          engine: valid && (fits || currentPages + deltaPages > (maxPages ?? 65_536n)),
        });
      }
    }
  }
  // 5.4 / H16: integer division traps, including MIN / -1.
  for (const bits of [32n, 64n]) {
    const min = -(1n << (bits - 1n));
    const max = (1n << (bits - 1n)) - 1n;
    const values = [0n, 1n, -1n, 2n, -2n, 7n, -7n, min, max];
    for (const op of ["div_s", "div_u", "rem_s", "rem_u"]) {
      for (const a of values) {
        for (const b of values) {
          rows.push({
            call: "checkIntegerDivision",
            request: { op, bits, a, b },
            input: `div ${op} ${bits} ${a} ${b}`,
            engine: true,
          });
        }
      }
    }
  }
  // Refusals (shape), model and VOK only.
  const refusals = [
    ["checkLinearAccess", { indexType: "i32", address: 0n, staticOffset: 0n, width: 3n, memoryBytes: PAGE }, `access i32 0 0 3 ${PAGE}`],
    ["checkLinearAccess", { indexType: "i32", address: U32, staticOffset: 0n, width: 1n, memoryBytes: PAGE }, `access i32 ${U32} 0 1 ${PAGE}`],
    ["checkLinearAccess", { indexType: "i32", address: 0n, staticOffset: U32, width: 1n, memoryBytes: PAGE }, `access i32 0 ${U32} 1 ${PAGE}`],
    ["checkLinearAccess", { indexType: "i32", address: 0n, staticOffset: 0n, width: 1n, memoryBytes: PAGE + 1n }, `access i32 0 0 1 ${PAGE + 1n}`],
    ["checkLinearAccess", { indexType: "i32", address: 0n, staticOffset: 0n, width: 1n, memoryBytes: (65_537n) * PAGE }, `access i32 0 0 1 ${65_537n * PAGE}`],
    ["checkLinearAccess", { indexType: "i64", address: U64, staticOffset: 0n, width: 1n, memoryBytes: PAGE }, `access i64 ${U64} 0 1 ${PAGE}`],
    ["checkLinearRange", { indexType: "i32", start: 0n, length: U32, memoryBytes: PAGE }, `range i32 0 ${U32} ${PAGE}`],
    ["checkLinearCopy", { indexType: "i32", destination: U32, source: 0n, length: 0n, memoryBytes: PAGE }, `copy i32 ${U32} 0 0 ${PAGE}`],
    ["checkMemoryGrow", { indexType: "i32", currentPages: 3n, deltaPages: 0n, maxPages: 2n }, "grow i32 3 0 2"],
    ["checkMemoryGrow", { indexType: "i32", currentPages: 0n, deltaPages: 0n, maxPages: 65_537n }, "grow i32 0 0 65537"],
    ["checkMemoryGrow", { indexType: "i32", currentPages: 0n, deltaPages: U32 }, `grow i32 0 ${U32} -`],
    ["checkIntegerDivision", { op: "div_s", bits: 32n, a: 1n << 31n, b: 1n }, `div div_s 32 ${1n << 31n} 1`],
    ["checkIntegerDivision", { op: "div_s", bits: 16n, a: 1n, b: 1n }, "div div_s 16 1 1"],
  ];
  for (const [call, request, input] of refusals) rows.push({ call, request, input, engine: false });
  return rows;
}

export function outcomeTail(outcome) {
  const parts = [outcome.status, outcome.failureId];
  if (outcome.status === "GROWN" || outcome.status === "GROW_REFUSED") parts.push(String(outcome.result), String(outcome.pages));
  if (outcome.status === "VALUE") parts.push(String(outcome.value));
  return parts.join(" ");
}

export function renderRowsText(doc, jsonSha256) {
  const lines = [`# ${doc.schema} rows=${doc.rowCount} json-sha256=${jsonSha256} source-sha256=${doc.sourceSha256}`];
  for (const row of doc.rows) lines.push(`${row.input} | ${row.expect}`);
  return `${lines.join("\n")}\n`;
}
