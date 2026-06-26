/**
 * P9 #143 — BYTE-PARITY: the self-hosted `lexer.spore` tokenize produces an IDENTICAL
 * token stream when run through the Stage-A interpreter AND compiled to real WASM and
 * executed through the #105 admission gate. This is the P9 self-hosting bootstrap gate:
 * the same governed source, two independent backends, byte-for-byte equal output.
 *
 * The WASM path goes .spore → WAT → real-wabt module → Ed25519-attested #105 admission →
 * execute → reconstruct tokens from linear memory. The interpreter path runs the same
 * `tokenize` flow directly. Both are normalised to [{kind, value}] and compared.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import * as L from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
let SRC = readFileSync(join(__dir, "../src/self-hosted/lexer.spore"), "utf8");
if (SRC.charCodeAt(0) === 0xFEFF) SRC = SRC.slice(1);
const prog = L.parseProgram(SRC, "lexer.spore");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "lexer", prog.ast, true));
const ENUMS = L.buildEnumVariants(prog.ast).get("TokenKind") || [];

function normInterp(v) {
  const items = v?.value?.items ?? [];
  return items.map((rec) => {
    const f = rec.fields;
    const kind = f.get("kind");
    const val = f.get("value");
    return { kind: kind?.name ?? kind?.value ?? "?", value: val?.value ?? "" };
  });
}

async function runInterp(input) {
  const args = new Map([["source", { __tag: "string", value: input }]]);
  const res = await L.executeFlow("tokenize", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  return normInterp(res.value);
}

async function runWasm(input) {
  const asm = await L.assembleWAT(WAT);
  assert.ok(asm.valid && asm.diagnostics.length === 0, "lexer wabt-assembles: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime();
  let maxH = 0;
  for (const e of L.getInternedStrings()) { host.seedString(e.handle, e.value); if (e.handle > maxH) maxH = e.handle; }
  const srcH = maxH + 1;
  host.seedString(srcH, input);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  const res = host.readResult(instance.exports.tokenize(srcH));
  const ptrs = res?.tag === "ok" ? (host.readArray(res.value) || []) : [];
  return ptrs.map((p) => ({ kind: ENUMS[host.readRecordField(p, 0)] ?? "?", value: host.readString(host.readRecordField(p, 1)) }));
}

// Corpus spanning every token class the active lexer recognises.
const CORPUS = [
  "pure flow add",
  "let x = 1",
  "x + y",
  "a == b",
  "pure flow f(a: Int) -> Int",
  "return a",
  "if x >= 10",
  "mut total = 0",
  "a != b && c || d",
  "x.field",
  "arr.append(item)",
  "secure flow g",
  // #189: string-heavy lexer paths (scanString / scanCharLit / scanComment) —
  // exercise char_to_string, str_concat, toInt().unwrapOr, escape handling.
  'x = "hi"',
  'msg = "hello world"',
  "c = 'a'",
  "x // line comment",
  "/* block */ y",
  'name = "with spaces" + suffix',
  'x = "a\\nb"',      // escaped newline inside a string (scanString backslash branch)
  'q = "tab\\there"', // escaped tab
  "nl = '\\n'",       // escaped char literal
];

describe("P9 #143: tokenize byte-parity (Stage-A interpreter == Stage-B WASM)", () => {
  for (const input of CORPUS) {
    it(`identical token stream for ${JSON.stringify(input)}`, async () => {
      const [i, w] = await Promise.all([runInterp(input), runWasm(input)]);
      assert.deepEqual(w, i, `WASM token stream must equal interpreter token stream for ${JSON.stringify(input)}`);
      assert.equal(w[w.length - 1]?.kind, "Eof", "stream ends with Eof");
    });
  }
});
