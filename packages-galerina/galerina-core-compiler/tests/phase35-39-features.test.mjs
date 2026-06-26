/**
 * Phases 33A, 35, 36, 37, 39 — Tier Telemetry, Password API, Argon2id,
 * Hash Migration, GovernanceSignature
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

import {
  parseProgram, executeFlow,
  buildProofGraph, computeExecutionSignature,
  signProofGraph, verifyGovernanceSignature, generateGovernanceKeyPair,
} from "../dist/index.js";

// ── Phase 33A: Tier telemetry ─────────────────────────────────────────────────

describe("Phase 33A: execution tier telemetry", () => {
  const INT_SRC = "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }";
  const STR_SRC = "pure flow id(s: String) -> String contract { effects {} } { return s }";

  it("integer pure flow with pureFastPath → bytecode tier", async () => {
    const prog = parseProgram(INT_SRC, "t.spore");
    const args = new Map([["a",{__tag:"int",value:3}],["b",{__tag:"int",value:4}]]);
    const r = await executeFlow("add", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    assert.equal(r.executionTier, "bytecode");
    assert.equal(r.value.value, 7);
  });

  it("second call → cache tier (LRU hit)", async () => {
    const prog = parseProgram(INT_SRC, "t.spore");
    const args = new Map([["a",{__tag:"int",value:3}],["b",{__tag:"int",value:4}]]);
    await executeFlow("add", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    const r2 = await executeFlow("add", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    assert.equal(r2.executionTier, "cache");
    assert.equal(r2.fallbackReason, "cache-hit");
  });

  it("string pure flow with pureFastPath → sync tier (not bytecode)", async () => {
    const prog = parseProgram(STR_SRC, "t.spore");
    const r = await executeFlow("id", new Map([["s",{__tag:"string",value:"hi"}]]), prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    assert.equal(r.executionTier, "sync");
  });

  it("governed flow (no pureFastPath) → tree tier", async () => {
    const prog = parseProgram(INT_SRC, "t.spore");
    const r = await executeFlow("add", new Map([["a",{__tag:"int",value:1}],["b",{__tag:"int",value:2}]]), prog.ast, prog.flows);
    assert.equal(r.executionTier, "tree");
  });

  it("executionTier is always a string when present", async () => {
    const prog = parseProgram(INT_SRC, "t.spore");
    const r = await executeFlow("add", new Map([["a",{__tag:"int",value:0}],["b",{__tag:"int",value:0}]]), prog.ast, prog.flows);
    assert.ok(["cache","bytecode","sync","egraph","tree"].includes(r.executionTier ?? "tree"));
  });
});

// ── Phase 35: Password.verify facade ─────────────────────────────────────────

describe("Phase 35: Password.verify — stable facade", () => {
  const VER_SRC = "secure flow v(p: String, h: String) -> Bool contract { effects { crypto.verify } } { return Password.verify(p, h) }";
  const HASH_SRC = "secure flow h(p: String) -> String contract { effects { crypto.verify } } { return Password.hash(p) }";
  const NEEDS_SRC = "pure flow n(h: String) -> Bool contract { effects {} } { return Password.needsMigration(h) }";

  it("Password.verify with bcrypt hash — correct password", async () => {
    const hash = bcrypt.hashSync("secret123", 10);
    const prog = parseProgram(VER_SRC, "t.spore");
    const r = await executeFlow("v", new Map([["p",{__tag:"string",value:"secret123"}],["h",{__tag:"string",value:hash}]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("Password.verify with bcrypt hash — wrong password", async () => {
    const hash = bcrypt.hashSync("secret123", 10);
    const prog = parseProgram(VER_SRC, "t.spore");
    const r = await executeFlow("v", new Map([["p",{__tag:"string",value:"wrong"}],["h",{__tag:"string",value:hash}]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: false });
  });

  it("Password.needsMigration returns true for bcrypt hash", async () => {
    const bHash = bcrypt.hashSync("x", 10);
    const prog = parseProgram(NEEDS_SRC, "t.spore");
    const r = await executeFlow("n", new Map([["h",{__tag:"string",value:bHash}]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("Password.hash returns a non-empty string", async () => {
    const prog = parseProgram(HASH_SRC, "t.spore");
    const r = await executeFlow("h", new Map([["p",{__tag:"string",value:"mypassword"}]]), prog.ast, prog.flows);
    assert.equal(r.value.__tag, "string");
    assert.ok(r.value.value.length > 10);
  });
});

// ── Phase 36: Argon2id ────────────────────────────────────────────────────────

describe("Phase 36: Argon2id verification", () => {
  const A2_VER_SRC = "secure flow v(p: String, h: String) -> Bool contract { effects { crypto.verify } } { return Argon2.verify(p, h) }";
  const A2_HASH_SRC = "secure flow h(p: String) -> String contract { effects { crypto.verify } } { return Argon2.hash(p) }";

  it("Argon2.hash produces $argon2id$ prefix", async () => {
    const prog = parseProgram(A2_HASH_SRC, "t.spore");
    const r = await executeFlow("h", new Map([["p",{__tag:"string",value:"testpw"}]]), prog.ast, prog.flows);
    assert.equal(r.value.__tag, "string");
    assert.ok(r.value.value.startsWith("$argon2"), `expected $argon2 prefix, got: ${r.value.value?.slice(0,15)}`);
  });

  it("Argon2.verify correct password → true", async () => {
    const hashProg = parseProgram(A2_HASH_SRC, "t.spore");
    const hashR = await executeFlow("h", new Map([["p",{__tag:"string",value:"hunter2"}]]), hashProg.ast, hashProg.flows);
    const hash = hashR.value.value;
    const prog = parseProgram(A2_VER_SRC, "t.spore");
    const r = await executeFlow("v", new Map([["p",{__tag:"string",value:"hunter2"}],["h",{__tag:"string",value:hash}]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("Password.verify auto-routes to Argon2id for $argon2 hashes", async () => {
    const hashProg = parseProgram("secure flow h(p: String) -> String contract { effects { crypto.verify } } { return Argon2.hash(p) }", "t.spore");
    const hashR = await executeFlow("h", new Map([["p",{__tag:"string",value:"mypass"}]]), hashProg.ast, hashProg.flows);
    const hash = hashR.value.value;
    const verProg = parseProgram("secure flow v(p: String, h: String) -> Bool contract { effects { crypto.verify } } { return Password.verify(p, h) }", "t.spore");
    const r = await executeFlow("v", new Map([["p",{__tag:"string",value:"mypass"}],["h",{__tag:"string",value:hash}]]), verProg.ast, verProg.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("Password.needsMigration returns false for Argon2id hash", async () => {
    const hashProg = parseProgram("secure flow h(p: String) -> String contract { effects { crypto.verify } } { return Argon2.hash(p) }", "t.spore");
    const hashR = await executeFlow("h", new Map([["p",{__tag:"string",value:"x"}]]), hashProg.ast, hashProg.flows);
    const prog = parseProgram("pure flow n(h: String) -> Bool contract { effects {} } { return Password.needsMigration(h) }", "t.spore");
    const r = await executeFlow("n", new Map([["h",{__tag:"string",value:hashR.value.value}]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: false });
  });
});

// ── Phase 37: Hash migration ──────────────────────────────────────────────────

describe("Phase 37: automatic hash migration", () => {
  const MIG_SRC = "secure flow m(p: String, h: String) -> Response contract { effects { crypto.verify } } { return Password.migrate(p, h) }";

  it("migrate bcrypt → Argon2id on correct password", async () => {
    const bHash = bcrypt.hashSync("correct", 10);
    const prog = parseProgram(MIG_SRC, "t.spore");
    const r = await executeFlow("m", new Map([["p",{__tag:"string",value:"correct"}],["h",{__tag:"string",value:bHash}]]), prog.ast, prog.flows);
    assert.equal(r.value.__tag, "record");
    assert.deepEqual(r.value.fields.get("migrated"), { __tag: "bool", value: true });
    const newHash = r.value.fields.get("newHash")?.value ?? "";
    assert.ok(newHash.startsWith("$argon2"), `newHash should be argon2, got: ${newHash.slice(0,15)}`);
  });

  it("migrate returns migrated=false on wrong password", async () => {
    const bHash = bcrypt.hashSync("correct", 10);
    const prog = parseProgram(MIG_SRC, "t.spore");
    const r = await executeFlow("m", new Map([["p",{__tag:"string",value:"wrong"}],["h",{__tag:"string",value:bHash}]]), prog.ast, prog.flows);
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

  it("signProofGraph produces algorithm=lln.gov.sig.v1", () => {
    const kp = generateGovernanceKeyPair("k1");
    const sig = computeExecutionSignature(1,2,3,4,5,1,0,false);
    const pg = buildProofGraph("myFlow", sig, [], [], "2026-01-01T00:00:00Z");
    const signed = signProofGraph(pg, kp);
    assert.equal(signed.governanceSignature?.algorithm, "lln.gov.sig.v1");
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
