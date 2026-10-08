/**
 * Phases 33A, 35, 36, 37, 39 — Tier Telemetry, Password API, Argon2id,
 * Hash Migration, GovernanceSignature
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

import {
  parseProgram, executeFlow, run as runRuntime,
  buildProofGraph, computeExecutionSignature,
  signProofGraph, verifyGovernanceSignature, generateGovernanceKeyPair,
  createNodePasswordKdfProvider,
} from "../dist/index.js";

const kdf = { cryptoProvider: createNodePasswordKdfProvider() };

// ── Phase 33A: Tier telemetry ─────────────────────────────────────────────────

describe("Phase 33A: execution tier telemetry", () => {
  const INT_SRC = "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }";
  const STR_SRC = "pure flow id(s: String) -> String contract { effects {} } { return s }";

  it("integer pure flow with pureFastPath → bytecode tier", async () => {
    const prog = parseProgram(INT_SRC, "t.fungi");
    const args = new Map([["a",{__tag:"int",value:3}],["b",{__tag:"int",value:4}]]);
    const r = await executeFlow("add", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    assert.equal(r.executionTier, "bytecode");
    assert.equal(r.value.value, 7);
  });

  it("second call → cache tier (LRU hit)", async () => {
    const prog = parseProgram(INT_SRC, "t.fungi");
    const args = new Map([["a",{__tag:"int",value:3}],["b",{__tag:"int",value:4}]]);
    await executeFlow("add", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    const r2 = await executeFlow("add", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    assert.equal(r2.executionTier, "cache");
    assert.equal(r2.fallbackReason, "cache-hit");
  });

  it("string pure flow with pureFastPath → sync tier (not bytecode)", async () => {
    const prog = parseProgram(STR_SRC, "t.fungi");
    const r = await executeFlow("id", new Map([["s",{__tag:"string",value:"hi"}]]), prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    assert.equal(r.executionTier, "sync");
  });

  it("governed flow (no pureFastPath) → tree tier", async () => {
    const prog = parseProgram(INT_SRC, "t.fungi");
    const r = await executeFlow("add", new Map([["a",{__tag:"int",value:1}],["b",{__tag:"int",value:2}]]), prog.ast, prog.flows);
    assert.equal(r.executionTier, "tree");
  });

  it("executionTier is always a string when present", async () => {
    const prog = parseProgram(INT_SRC, "t.fungi");
    const r = await executeFlow("add", new Map([["a",{__tag:"int",value:0}],["b",{__tag:"int",value:0}]]), prog.ast, prog.flows);
    assert.ok(["cache","bytecode","sync","egraph","tree"].includes(r.executionTier ?? "tree"));
  });
});

// ── Phase 35: Password.verify facade ─────────────────────────────────────────

describe("Phase 35: Password.verify — stable facade", () => {
  const VER_SRC = "secure flow v(p: String, h: String) -> Bool contract { effects { crypto.verify } } { return Password.verify(p, h) }";
  const BYTE_VER_SRC = "secure flow v(p: Bytes, h: String) -> Bool contract { effects { crypto.verify } } { return Password.verify(p, h) }";
  const HASH_SRC = "secure flow h(p: String) -> String contract { effects { crypto.verify } } { return Password.hash(p) }";
  const NEEDS_SRC = "pure flow n(h: String) -> Bool contract { effects {} } { return Password.needsMigration(h) }";

  it("Password.verify with bcrypt hash — correct password", async () => {
    const hash = bcrypt.hashSync("secret123", 10);
    const prog = parseProgram(VER_SRC, "t.fungi");
    const r = await executeFlow("v", new Map([["p",{__tag:"string",value:"secret123"}],["h",{__tag:"string",value:hash}]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("Password.verify with bcrypt hash — wrong password", async () => {
    const hash = bcrypt.hashSync("secret123", 10);
    const prog = parseProgram(VER_SRC, "t.fungi");
    const r = await executeFlow("v", new Map([["p",{__tag:"string",value:"wrong"}],["h",{__tag:"string",value:hash}]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.deepEqual(r.value, { __tag: "bool", value: false });
  });

  it("Password.verify refuses bcrypt inputs over 72 UTF-8 bytes before provider use", async () => {
    let calls = 0;
    const provider = {
      schema: "fungi.security.crypto-provider.v1",
      async invoke() {
        calls += 1;
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const prog = parseProgram(VER_SRC, "t.fungi");
    const run = (password) => executeFlow("v", new Map([
      ["p", { __tag: "string", value: password }],
      ["h", { __tag: "string", value: "$2b$fixture" }],
    ]), prog.ast, prog.flows, undefined, undefined, { cryptoProvider: provider });

    const exactLimit = await run("x".repeat(72));
    assert.deepEqual(exactLimit.value, { __tag: "bool", value: true });
    assert.equal(calls, 1, "the exact bcrypt byte limit remains usable");

    const asciiOverflow = await run("x".repeat(73));
    assert.equal(asciiOverflow.value.__tag, "err");
    const utf8Overflow = await run("x".repeat(71) + "é");
    assert.equal(utf8Overflow.value.__tag, "err", "limits count UTF-8 bytes, not characters");
    assert.equal(calls, 1, "over-limit verification must be refused before provider use");
  });

  it("legacy BCrypt.verify and Password.migrate cannot bypass the bcrypt byte limit", async () => {
    let calls = 0;
    const provider = {
      schema: "fungi.security.crypto-provider.v1",
      async invoke() {
        calls += 1;
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const overLimit = "x".repeat(73);
    const bcryptProg = parseProgram(
      "secure flow v(p: String, h: String) -> Bool contract { effects { crypto.verify } } { return BCrypt.verify(p, h) }",
      "t.fungi",
    );
    const directBcrypt = await executeFlow("v", new Map([
      ["p", { __tag: "string", value: overLimit }],
      ["h", { __tag: "string", value: "$2b$fixture" }],
    ]), bcryptProg.ast, bcryptProg.flows, undefined, undefined, { cryptoProvider: provider });
    assert.equal(directBcrypt.value.__tag, "err");

    const migrateProg = parseProgram(
      "secure flow m(p: String, h: String) -> Response contract { effects { crypto.verify } } { return Password.migrate(p, h) }",
      "t.fungi",
    );
    const migrate = await executeFlow("m", new Map([
      ["p", { __tag: "string", value: overLimit }],
      ["h", { __tag: "string", value: "$2b$fixture" }],
    ]), migrateProg.ast, migrateProg.flows, undefined, undefined, { cryptoProvider: provider });
    assert.equal(migrate.value.__tag, "err");
    assert.equal(calls, 0, "legacy entry points must refuse before provider use");
  });

  it("Password.verify forwards Bytes without converting them to text", async () => {
    const plaintextBytes = new Uint8Array([0x00, 0x80, 0xff]);
    let seen;
    const byteProvider = {
      schema: "fungi.security.crypto-provider.v2",
      async invoke(request) {
        seen = request;
        request.plaintextBytes.fill = () => request.plaintextBytes;
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const prog = parseProgram(BYTE_VER_SRC, "t.fungi");
    const r = await executeFlow("v", new Map([
      ["p", { __tag: "bytes", value: plaintextBytes }],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]), prog.ast, prog.flows, undefined, undefined, { cryptoProviderV2: byteProvider });

    assert.deepEqual(r.value, { __tag: "bool", value: true });
    assert.equal(seen.op, "password-verify-bytes");
    assert.notStrictEqual(seen.plaintextBytes, plaintextBytes);
    assert.deepEqual(plaintextBytes, new Uint8Array([0x00, 0x80, 0xff]));
    assert.deepEqual(Array.from(seen.plaintextBytes), [0, 0, 0], "provider transfer copy must be cleared after completion");
    assert.equal(Object.hasOwn(seen, "plaintext"), false);
  });

  it("Password.verify stages Buffer bytes without aliasing caller storage", async () => {
    const plaintextBytes = Buffer.from([0x01, 0x02, 0x03]);
    let providerBytes;
    const byteProvider = {
      schema: "fungi.security.crypto-provider.v2",
      async invoke(request) {
        providerBytes = request.plaintextBytes;
        providerBytes[0] = 0xff;
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const prog = parseProgram(BYTE_VER_SRC, "t.fungi");
    const r = await executeFlow("v", new Map([
      ["p", { __tag: "bytes", value: plaintextBytes }],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]), prog.ast, prog.flows, undefined, undefined, { cryptoProviderV2: byteProvider });

    assert.deepEqual(r.value, { __tag: "bool", value: true });
    assert.deepEqual(plaintextBytes, Buffer.from([0x01, 0x02, 0x03]), "provider writes and cleanup must not alter caller bytes");
    assert.deepEqual(Array.from(providerBytes), [0, 0, 0], "owned provider transfer must be cleared after completion");
  });

  it("Password.verify ignores an overridden Bytes.slice when staging provider input", async () => {
    const plaintextBytes = new Uint8Array([0x01, 0x02, 0x03]);
    plaintextBytes.slice = () => new Uint8Array(1025).fill(0xa5);
    let providerBytes;
    const byteProvider = {
      schema: "fungi.security.crypto-provider.v2",
      async invoke(request) {
        providerBytes = Array.from(request.plaintextBytes);
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const prog = parseProgram(BYTE_VER_SRC, "t.fungi");
    const r = await executeFlow("v", new Map([
      ["p", { __tag: "bytes", value: plaintextBytes }],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]), prog.ast, prog.flows, undefined, undefined, { cryptoProviderV2: byteProvider });

    assert.deepEqual(r.value, { __tag: "bool", value: true });
    assert.deepEqual(providerBytes, [0x01, 0x02, 0x03], "provider receives the checked source bytes, not an attacker-sized replacement");
  });

  it("Password.verify refuses byte and UTF-8 text inputs over 1024 bytes before provider use", async () => {
    let calls = 0;
    const byteProvider = {
      schema: "fungi.security.crypto-provider.v2",
      async invoke() {
        calls += 1;
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const prog = parseProgram(BYTE_VER_SRC, "t.fungi");
    const tooManyBytes = await executeFlow("v", new Map([
      ["p", { __tag: "bytes", value: new Uint8Array(1025) }],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]), prog.ast, prog.flows, undefined, undefined, { cryptoProviderV2: byteProvider });
    assert.equal(tooManyBytes.value.__tag, "err");

    const textProg = parseProgram(VER_SRC, "t.fungi");
    const tooManyUtf8Bytes = await executeFlow("v", new Map([
      ["p", { __tag: "string", value: "😀".repeat(257) }],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]), textProg.ast, textProg.flows, undefined, undefined, { cryptoProviderV2: byteProvider });
    assert.equal(tooManyUtf8Bytes.value.__tag, "err");
    assert.equal(calls, 0, "oversize input must be refused before crossing the provider boundary");
  });

  it("Password.verify uses the intrinsic Uint8Array extent instead of an overridden byteLength", async () => {
    let calls = 0;
    const byteProvider = {
      schema: "fungi.security.crypto-provider.v2",
      async invoke() {
        calls += 1;
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const oversized = new Uint8Array(1025);
    Object.defineProperty(oversized, "byteLength", { value: 3 });
    const prog = parseProgram(BYTE_VER_SRC, "t.fungi");

    const result = await executeFlow("v", new Map([
      ["p", { __tag: "bytes", value: oversized }],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]), prog.ast, prog.flows, undefined, undefined, { cryptoProviderV2: byteProvider });

    assert.equal(result.value.__tag, "err");
    assert.equal(calls, 0, "the provider must not see bytes beyond the owner-approved limit");
  });

  it("Password.verify rejects non-Uint8Array values tagged as Bytes before provider use", async () => {
    let calls = 0;
    const byteProvider = {
      schema: "fungi.security.crypto-provider.v2",
      async invoke() {
        calls += 1;
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const iterable = {
      byteLength: 3,
      *[Symbol.iterator]() {
        yield* new Uint8Array(1025).fill(0xa5);
      },
    };
    const prog = parseProgram(BYTE_VER_SRC, "t.fungi");

    const result = await executeFlow("v", new Map([
      ["p", { __tag: "bytes", value: iterable }],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]), prog.ast, prog.flows, undefined, undefined, { cryptoProviderV2: byteProvider });

    assert.equal(result.value.__tag, "err");
    assert.equal(calls, 0, "an arbitrary iterable must not cross the byte-provider boundary");
  });

  it("Password.verify captures a Bytes payload once before validating and staging it", async () => {
    let payloadReads = 0;
    let providerBytes;
    const checkedBytes = new Uint8Array([0x01, 0x02, 0x03]);
    const substitutedBytes = new Uint8Array([0xa5, 0xa5, 0xa5]);
    const byteValue = {
      __tag: "bytes",
      get value() {
        payloadReads += 1;
        return payloadReads === 1 ? checkedBytes : substitutedBytes;
      },
    };
    const byteProvider = {
      schema: "fungi.security.crypto-provider.v2",
      async invoke(request) {
        providerBytes = Array.from(request.plaintextBytes);
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const prog = parseProgram(BYTE_VER_SRC, "t.fungi");

    const result = await executeFlow("v", new Map([
      ["p", byteValue],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]), prog.ast, prog.flows, undefined, undefined, { cryptoProviderV2: byteProvider });

    assert.deepEqual(result.value, { __tag: "bool", value: true });
    assert.equal(payloadReads, 1, "validation and staging must use one captured payload identity");
    assert.deepEqual(providerBytes, [0x01, 0x02, 0x03], "provider receives only the bytes whose brand and size were checked");
  });

  it("Password.verify applies the host-configured byte limit and refuses invalid policy", async () => {
    let calls = 0;
    const byteProvider = {
      schema: "fungi.security.crypto-provider.v2",
      async invoke() {
        calls += 1;
        return { ok: true, kind: "verify", matches: true };
      },
    };
    const prog = parseProgram(BYTE_VER_SRC, "t.fungi");
    const args = new Map([
      ["p", { __tag: "bytes", value: new Uint8Array([1, 2, 3]) }],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]);

    const belowConfiguredLimit = await executeFlow(
      "v", args, prog.ast, prog.flows, undefined, undefined,
      { cryptoProviderV2: byteProvider, maxPasswordVerifyBytes: 2 },
    );
    assert.equal(belowConfiguredLimit.value.__tag, "err");
    assert.equal(calls, 0, "over-limit bytes must be refused before provider use");

    const atConfiguredLimit = await executeFlow(
      "v", args, prog.ast, prog.flows, undefined, undefined,
      { cryptoProviderV2: byteProvider, maxPasswordVerifyBytes: 3 },
    );
    assert.deepEqual(atConfiguredLimit.value, { __tag: "bool", value: true });
    assert.equal(calls, 1);

    const invalidPolicy = await executeFlow(
      "v", args, prog.ast, prog.flows, undefined, undefined,
      { cryptoProviderV2: byteProvider, maxPasswordVerifyBytes: 0 },
    );
    assert.equal(invalidPolicy.value.__tag, "err");
    assert.equal(calls, 1, "invalid policy must be refused before provider use");

    const aboveOwnerApprovedCeiling = await executeFlow(
      "v",
      new Map([
        ["p", { __tag: "bytes", value: new Uint8Array(1025) }],
        ["h", { __tag: "string", value: "$argon2id$fixture" }],
      ]),
      prog.ast,
      prog.flows,
      undefined,
      undefined,
      { cryptoProviderV2: byteProvider, maxPasswordVerifyBytes: 1025 },
    );
    assert.equal(aboveOwnerApprovedCeiling.value.__tag, "err");
    assert.equal(calls, 1, "configuration must not raise the owner-approved ceiling before sign-off");

    const frameworkRuntime = await runRuntime(
      BYTE_VER_SRC,
      "t.fungi",
      "v",
      args,
      { cryptoProviderV2: byteProvider, maxPasswordVerifyBytes: 2 },
    );
    assert.equal(frameworkRuntime.execution?.value.__tag, "err");
    assert.equal(calls, 1, "RuntimeOptions must carry the host policy to Password.verify");
  });

  it("byte verification does not fall back to a v1 text provider", async () => {
    const prog = parseProgram(BYTE_VER_SRC, "t.fungi");
    const r = await executeFlow("v", new Map([
      ["p", { __tag: "bytes", value: new Uint8Array([0x00, 0xff]) }],
      ["h", { __tag: "string", value: "$argon2id$fixture" }],
    ]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.equal(r.value.__tag, "err");
    assert.match(r.value.error.value, /injected CryptoProvider/u);
  });

  it("Password.needsMigration returns true for bcrypt hash", async () => {
    const bHash = bcrypt.hashSync("x", 10);
    const prog = parseProgram(NEEDS_SRC, "t.fungi");
    const r = await executeFlow("n", new Map([["h",{__tag:"string",value:bHash}]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("Password.hash returns a non-empty string", async () => {
    const prog = parseProgram(HASH_SRC, "t.fungi");
    const r = await executeFlow("h", new Map([["p",{__tag:"string",value:"mypassword"}]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.equal(r.value.__tag, "string");
    assert.ok(r.value.value.length > 10);
  });
});

// ── Phase 36: Argon2id ────────────────────────────────────────────────────────

describe("Phase 36: Argon2id verification", () => {
  const A2_VER_SRC = "secure flow v(p: String, h: String) -> Bool contract { effects { crypto.verify } } { return Argon2.verify(p, h) }";
  const A2_HASH_SRC = "secure flow h(p: String) -> String contract { effects { crypto.verify } } { return Argon2.hash(p) }";

  it("Argon2.hash produces $argon2id$ prefix", async () => {
    const prog = parseProgram(A2_HASH_SRC, "t.fungi");
    const r = await executeFlow("h", new Map([["p",{__tag:"string",value:"testpw"}]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.equal(r.value.__tag, "string");
    assert.ok(r.value.value.startsWith("$argon2"), `expected $argon2 prefix, got: ${r.value.value?.slice(0,15)}`);
  });

  it("Argon2.verify correct password → true", async () => {
    const hashProg = parseProgram(A2_HASH_SRC, "t.fungi");
    const hashR = await executeFlow("h", new Map([["p",{__tag:"string",value:"hunter2"}]]), hashProg.ast, hashProg.flows, undefined, undefined, kdf);
    const hash = hashR.value.value;
    const prog = parseProgram(A2_VER_SRC, "t.fungi");
    const r = await executeFlow("v", new Map([["p",{__tag:"string",value:"hunter2"}],["h",{__tag:"string",value:hash}]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("Password.verify auto-routes to Argon2id for $argon2 hashes", async () => {
    const hashProg = parseProgram("secure flow h(p: String) -> String contract { effects { crypto.verify } } { return Argon2.hash(p) }", "t.fungi");
    const hashR = await executeFlow("h", new Map([["p",{__tag:"string",value:"mypass"}]]), hashProg.ast, hashProg.flows, undefined, undefined, kdf);
    const hash = hashR.value.value;
    const verProg = parseProgram("secure flow v(p: String, h: String) -> Bool contract { effects { crypto.verify } } { return Password.verify(p, h) }", "t.fungi");
    const r = await executeFlow("v", new Map([["p",{__tag:"string",value:"mypass"}],["h",{__tag:"string",value:hash}]]), verProg.ast, verProg.flows, undefined, undefined, kdf);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("Password.needsMigration returns false for Argon2id hash", async () => {
    const hashProg = parseProgram("secure flow h(p: String) -> String contract { effects { crypto.verify } } { return Argon2.hash(p) }", "t.fungi");
    const hashR = await executeFlow("h", new Map([["p",{__tag:"string",value:"x"}]]), hashProg.ast, hashProg.flows, undefined, undefined, kdf);
    const prog = parseProgram("pure flow n(h: String) -> Bool contract { effects {} } { return Password.needsMigration(h) }", "t.fungi");
    const r = await executeFlow("n", new Map([["h",{__tag:"string",value:hashR.value.value}]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: false });
  });
});

// ── Phase 37: Hash migration ──────────────────────────────────────────────────

describe("Phase 37: automatic hash migration", () => {
  const MIG_SRC = "secure flow m(p: String, h: String) -> Response contract { effects { crypto.verify } } { return Password.migrate(p, h) }";

  it("migrate bcrypt → Argon2id on correct password", async () => {
    const bHash = bcrypt.hashSync("correct", 10);
    const prog = parseProgram(MIG_SRC, "t.fungi");
    const r = await executeFlow("m", new Map([["p",{__tag:"string",value:"correct"}],["h",{__tag:"string",value:bHash}]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.equal(r.value.__tag, "record");
    assert.deepEqual(r.value.fields.get("migrated"), { __tag: "bool", value: true });
    const newHash = r.value.fields.get("newHash")?.value ?? "";
    assert.ok(newHash.startsWith("$argon2"), `newHash should be argon2, got: ${newHash.slice(0,15)}`);
  });

  it("migrate returns migrated=false on wrong password", async () => {
    const bHash = bcrypt.hashSync("correct", 10);
    const prog = parseProgram(MIG_SRC, "t.fungi");
    const r = await executeFlow("m", new Map([["p",{__tag:"string",value:"wrong"}],["h",{__tag:"string",value:bHash}]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.deepEqual(r.value.fields.get("migrated"), { __tag: "bool", value: false });
  });
});

// ── Phase 39: GovernanceSignature ────────────────────────────────────────────

describe("Phase 39: GovernanceSignature (Ed25519)", () => {
  it("generates an Ed25519 key pair", () => {
    const kp = generateGovernanceKeyPair("test-key");
    assert.equal(kp.algorithm, "ed25519");
    assert.equal(kp.keyId, "test-key");
    assert.ok(kp.privateKey instanceof Uint8Array && kp.privateKey.length > 0);
    assert.ok(kp.publicKey instanceof Uint8Array && kp.publicKey.length > 0);
  });

  it("signProofGraph produces algorithm=fungi.gov.sig.v1", () => {
    const kp = generateGovernanceKeyPair("k1");
    const sig = computeExecutionSignature(1,2,3,4,5,1,0,false);
    const pg = buildProofGraph("myFlow", sig, [], [], "2026-01-01T00:00:00Z");
    const signed = signProofGraph(pg, kp);
    assert.equal(signed.governanceSignature?.algorithm, "fungi.gov.sig.v1");
    assert.equal(signed.governanceSignature?.signerKeyId, "k1");
    assert.ok(signed.governanceSignature?.signature.length ?? 0 > 10);
  });

  it("verifyGovernanceSignature returns true for correct key", () => {
    const kp = generateGovernanceKeyPair("k2");
    const sig = computeExecutionSignature(1,2,3,4,5,1,0,false);
    const pg = buildProofGraph("flow2", sig, [], [], "2026-01-01T00:00:00Z");
    const signed = signProofGraph(pg, kp);
    assert.equal(verifyGovernanceSignature(signed, kp.publicKey), true);
  });

  it("verifyGovernanceSignature returns false for wrong key", () => {
    const kp1 = generateGovernanceKeyPair("k3");
    const kp2 = generateGovernanceKeyPair("k4");
    const sig = computeExecutionSignature(2,2,2,2,2,1,0,false);
    const pg = buildProofGraph("flow3", sig, [], [], "2026-01-01T00:00:00Z");
    const signed = signProofGraph(pg, kp1);
    assert.equal(verifyGovernanceSignature(signed, kp2.publicKey), false);
  });

  it("verifyGovernanceSignature returns false for tampered flowName", () => {
    const kp = generateGovernanceKeyPair("k5");
    const sig = computeExecutionSignature(3,3,3,3,3,1,0,false);
    const pg = buildProofGraph("legitFlow", sig, [], [], "2026-01-01T00:00:00Z");
    const signed = signProofGraph(pg, kp);
    const tampered = { ...signed, flowName: "maliciousFlow" };
    assert.equal(verifyGovernanceSignature(tampered, kp.publicKey), false);
  });

  it("unsigned ProofGraph returns false from verifyGovernanceSignature", () => {
    const kp = generateGovernanceKeyPair("k6");
    const sig = computeExecutionSignature(0,0,0,0,0,0,0,false);
    const pg = buildProofGraph("unsignedFlow", sig, [], [], "2026-01-01T00:00:00Z");
    assert.equal(verifyGovernanceSignature(pg, kp.publicKey), false);
  });
});
