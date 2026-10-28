import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const at = (...parts) => join(ROOT, ...parts);

const K3_BYTE_ADMIT = 0x01;
const K3_BYTE_DENY = 0xff;
const K3_BYTE_UNKNOWN = 0x80;
const K3_WIRE_ADMIT = 1;
const K3_WIRE_DENY = -1;
const K3_WIRE_UNKNOWN = -128;

function k3DecodeUnsignedByte(u8) {
  if (u8 === K3_BYTE_ADMIT) return K3_WIRE_ADMIT;
  if (u8 === K3_BYTE_DENY) return K3_WIRE_DENY;
  if (u8 === K3_BYTE_UNKNOWN) return K3_WIRE_UNKNOWN;
  return null;
}

it("K3-COPIES wat-emitter emits i32.const -128 for Verdict.Unknown", () => {
  const src = readFileSync(at("packages-ts/galerina-core-compiler/src/wat-emitter.ts"), "utf8");
  assert.match(src, /\(i32\.const -128\) \(; Verdict\.Unknown ;\)/);
  assert.doesNotMatch(src, /\(i32\.const 0\) \(; Verdict\.Unknown ;\)/);
});

it("K3-COPIES interpreter Unknown messages use -128", () => {
  const src = readFileSync(at("packages-ts/galerina-core-compiler/src/interpreter.ts"), "utf8");
  assert.match(src, /Unknown\(-128\)/);
  assert.doesNotMatch(src, /Unknown\(0\)/);
});

it("K3-COPIES hardening-residency UNKNOWN is -128", () => {
  const src = readFileSync(at("packages-ts/galerina-core-compiler/src/hardening-residency.ts"), "utf8");
  assert.match(src, /UNKNOWN:\s*-128/);
  assert.doesNotMatch(src, /UNKNOWN:\s*0\s+as const/);
});

it("K3-COPIES inference-governance does not document INDETERMINATE = 0", () => {
  const src = readFileSync(at("packages-ts/galerina-tower-citizen/src/self-hosted/inference-governance.fungi"), "utf8");
  assert.doesNotMatch(src, /INDETERMINATE\s*=\s*0/);
});

it("K3C-2 sign-extends unsigned 0x80 to wire UNKNOWN -128", () => {
  const signed = new Int8Array([K3_BYTE_UNKNOWN])[0];
  assert.equal(signed, K3_WIRE_UNKNOWN);
  assert.equal((K3_BYTE_UNKNOWN << 24) >> 24, K3_WIRE_UNKNOWN);
});

it("K3C-2 load8_s of unsigned 0x80 is signed -128", () => {
  const buf = new Uint8Array([K3_BYTE_UNKNOWN]);
  assert.equal(new DataView(buf.buffer).getInt8(0), K3_WIRE_UNKNOWN);
});

it("K3C-2 serializes wire UNKNOWN as unsigned 0x80", () => {
  const buf = new Uint8Array(1);
  new DataView(buf.buffer).setInt8(0, K3_WIRE_UNKNOWN);
  assert.equal(buf[0], K3_BYTE_UNKNOWN);
  assert.equal(k3DecodeUnsignedByte(buf[0]), K3_WIRE_UNKNOWN);
});

it("K3C-2 unsigned-read codec: 0x01=+1 0xFF=-1 0x80=UNKNOWN else fail-closed", () => {
  assert.equal(k3DecodeUnsignedByte(K3_BYTE_ADMIT), K3_WIRE_ADMIT);
  assert.equal(k3DecodeUnsignedByte(K3_BYTE_DENY), K3_WIRE_DENY);
  assert.equal(k3DecodeUnsignedByte(K3_BYTE_UNKNOWN), K3_WIRE_UNKNOWN);
  const refuse = [];
  for (let u8 = 0; u8 < 256; u8++) {
    const got = k3DecodeUnsignedByte(u8);
    if (u8 === K3_BYTE_ADMIT || u8 === K3_BYTE_DENY || u8 === K3_BYTE_UNKNOWN) {
      assert.notEqual(got, null, `named byte 0x${u8.toString(16)} must decode`);
      continue;
    }
    if (got !== null) refuse.push(u8);
    assert.equal(got, null, `0x${u8.toString(16)} must fail closed`);
  }
  assert.equal(refuse.length, 0);
});
