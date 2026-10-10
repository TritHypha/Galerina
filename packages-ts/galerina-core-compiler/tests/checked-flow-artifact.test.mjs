import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";
import * as scalar from "../dist/rd0858-scalar-compiler-entry.js";
import { readFileSync } from "node:fs";

const sha256 = (digit) => `sha256:${digit.repeat(64)}`;

const checkedAst = () => ({
  kind: "pureFlowDecl",
  value: "scalarOracle",
  flags: 33,
  children: [
    {
      kind: "paramDecl",
      value: "subject: Verdict",
      children: [{ kind: "typeRef", value: "Verdict", children: [] }],
    },
    { kind: "typeRef", value: "String", children: [] },
    {
      kind: "contractDecl",
      children: [{ kind: "identifier", value: "effects:block", children: [] }],
    },
    {
      kind: "block",
      children: [{
        kind: "checkExpr",
        children: [
          { kind: "identifier", value: "subject", children: [] },
          ...[["deny", "deny"], ["ambig", "ambig"], ["if", "allow"]].map(([arm, value]) => ({
            kind: "checkArm",
            value: arm,
            children: [{
              kind: "block",
              children: [{
                kind: "returnStmt",
                children: [{ kind: "stringLiteral", value: `"${value}"`, children: [] }],
              }],
            }],
          })),
        ],
      }],
    },
  ],
});

const artifact = () => ({
  schema: "galerina.rd0858.checked-flow.v1",
  hashAlgorithm: "sha256",
  productId: "galerina",
  packageId: "rd0858-unit4-scalar-oracle",
  flowLocator: "rd0858/unit4/scalar-oracle",
  flowName: "scalarOracle",
  languageVersion: 1,
  runtimeProfile: "scalar-1",
  sourceCanonicalization: "UTF8_NO_BOM_LF_NFC_V1",
  sourceDigest: sha256("0"),
  compilerPackageId: "@galerina/core-compiler",
  compilerVersion: "1.0.0-beta.2",
  compilerPackageGraphDigest: sha256("1"),
  checkerSetId: "galerina.strict-checks.v1",
  checkerSetDigest: sha256("2"),
  generatorId: "rd0858-scalar-oracle-generator.v1",
  generatorSourceDigest: sha256("3"),
  qualifier: "pure",
  parameters: [{ name: "subject", type: "Verdict" }],
  returnType: "String",
  declaredEffects: [],
  checkedAst: checkedAst(),
});

const call = (name, ...args) => {
  assert.equal(typeof L[name], "function", `${name} must be exported`);
  return L[name](...args);
};

describe("RD-0858 scalar producer structure projection", () => {
  const source = readFileSync(new URL("../../../packages/fungi/products/galerina/rd0858-unit4-scalar-oracle/scalar-oracle.fungi", import.meta.url), "utf8");
  const identity = () => ({ sourceDigest:sha256("0"), compilerVersion:"1.0.0-beta.2",
    compilerPackageGraphDigest:sha256("1"), checkerSetDigest:sha256("2"), generatorSourceDigest:sha256("3") });
  const snapshot = () => {
    const parsed = L.parseProgram(source, "scalar-projection.fungi", {requireVersionHeader:true});
    assert.deepEqual(parsed.diagnostics.filter(d => d.severity === "error"), []);
    return structuredClone(L.snapshotCheckedFlow(parsed.flows[0], parsed.ast.children[0]).ast);
  };
  const project = ast => {
    assert.equal(typeof scalar.projectRd0858ScalarSnapshot, "function");
    return scalar.projectRd0858ScalarSnapshot(ast);
  };
  const refused = ast => assert.throws(() => project(ast), error =>
    error.name === "Rd0858ScalarCompilerRefusal" && error.code === "TYPE_PROJECTION");
  const deepFrozen = value => {
    if (value === null || typeof value !== "object") return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) deepFrozen(child);
  };

  it("builds the real exact source and retains the existing encode/decode/verify contract", () => {
    const built = scalar.buildRd0858ScalarArtifact(source, identity());
    assert.deepEqual(built.artifact, artifact());
    assert.deepEqual(built.bytes, L.encodeCheckedFlowArtifact(artifact()));
    assert.deepEqual(L.decodeCheckedFlowArtifact(built.bytes), artifact());
    assert.deepEqual(scalar.verifyRd0858ScalarArtifact(source, built.bytes, identity()), {
      artifactDigest:L.digestCheckedFlowArtifact(built.bytes), sourceDigest:sha256("0"),
    });
    const substituted = new Uint8Array(built.bytes);
    substituted[substituted.length - 2] ^= 1;
    assert.throws(() => scalar.verifyRd0858ScalarArtifact(source, substituted, identity()), /PAIR_BYTES/);
  });

  it("projects only the proven closed profile without mutating its input", () => {
    const ast = snapshot();
    const before = structuredClone(ast);
    const output = project(ast);
    assert.deepEqual(output, checkedAst());
    assert.deepEqual(ast, before);
    deepFrozen(output);
    ast.children[0].children[0].typeStructure.name = "SecureString";
    assert.deepEqual(output, checkedAst());
  });

  for (const [role, getType] of [
    ["parameter", ast => ast.children[0].children[0]],
    ["result", ast => ast.children[1]],
  ]) {
    for (const [label, mutate] of [
      ["absent", node => { delete node.typeStructure; }],
      ["undefined", node => { node.typeStructure = undefined; }],
      ["null", node => { node.typeStructure = null; }],
      ["conflicting name", node => { node.typeStructure.name = "SecureString"; }],
      ["conflicting text", node => { node.value = "SecureString"; }],
      ["generic bit", node => { node.typeStructure.generic = true; }],
      ["extra argument", node => { node.typeStructure.args.push({kind:"payload"}); }],
      ["payload kind", node => { node.typeStructure = {kind:"payload"}; }],
      ["unexpected field", node => { node.typeStructure.authorizing = true; }],
      ["hidden field", node => { Object.defineProperty(node.typeStructure, "hidden", {value:true}); }],
      ["symbol field", node => { node.typeStructure[Symbol("hidden")] = true; }],
      ["inherited evidence", node => { node.typeStructure = Object.create(node.typeStructure); }],
    ]) {
      it(`refuses ${role} ${label} at the actual projection boundary`, () => {
        const ast = snapshot();
        mutate(getType(ast));
        refused(ast);
      });
    }
  }

  for (const [label, mutate] of [
    ["swapped type roles", ast => { [ast.children[0].children[0], ast.children[1]] = [ast.children[1], ast.children[0].children[0]]; }],
    ["additional type position", ast => { ast.children[3].children.push(ast.children[1]); }],
    ["metadata outside type position", ast => { ast.typeStructure = ast.children[1].typeStructure; }],
    ["unknown AST field", ast => { ast.children[3].extension = "hidden"; }],
    ["unknown array field", ast => { ast.children.hidden = "hidden"; }],
    ["wrong root identity", ast => { ast.value = "other"; }],
    ["wrong flags", ast => { ast.flags = 1; }],
    ["changed terminal", ast => { ast.children[3].children[0].children[1].children[0].children[0].children[0].value = '"allow"'; }],
    ["cycle", ast => { ast.children[3].children = [ast]; }],
    ["oversized child array", ast => { ast.children.length = 1000000; }],
  ]) {
    it(`refuses ${label} instead of silently projecting it away`, () => {
      const ast = snapshot();
      mutate(ast);
      refused(ast);
    });
  }

  it("refuses accessors without invoking them", () => {
    const ast = snapshot();
    let reads = 0;
    Object.defineProperty(ast.children[1].typeStructure, "name", {
      enumerable:true, get() { reads++; return "String"; },
    });
    refused(ast);
    assert.equal(reads, 0);
  });

  it("contains hostile descriptor access as a typed projection refusal", () => {
    const ast = snapshot();
    ast.children[1].typeStructure = new Proxy({}, { ownKeys() { throw new Error("hostile"); } });
    refused(ast);
  });

  it("keeps the codec closed to metadata even after adding the producer adapter", () => {
    const value = artifact();
    value.checkedAst.children[1].typeStructure = {kind:"type", name:"String", generic:false, args:[]};
    assert.throws(() => L.encodeCheckedFlowArtifact(value), error => error.code === "AST_UNKNOWN_FIELD");
  });
});

describe("RD-0858 closed checked-flow artifact", () => {
  it("exports the frozen codec bounds", () => {
    assert.equal(L.CHECKED_FLOW_ARTIFACT_MAX_BYTES, 262_144);
    assert.equal(L.CHECKED_FLOW_ARTIFACT_MAX_DEPTH, 64);
    assert.equal(L.CHECKED_FLOW_ARTIFACT_MAX_VALUES, 16_384);
    assert.equal(L.CHECKED_FLOW_ARTIFACT_MAX_AST_NODES, 8_192);
  });

  it("round-trips one exact canonical artifact with one terminal LF", () => {
    const bytes = call("encodeCheckedFlowArtifact", artifact());
    assert.equal(bytes.at(-1), 0x0a);
    assert.notEqual(bytes.at(-2), 0x0a);
    assert.deepEqual(call("decodeCheckedFlowArtifact", bytes), artifact());
  });

  it("uses fixed schema order independent of caller key order", () => {
    const expected = call("encodeCheckedFlowArtifact", artifact());
    const reversed = Object.fromEntries(Object.entries(artifact()).reverse());
    assert.deepEqual(call("encodeCheckedFlowArtifact", reversed), expected);
    assert.match(call("digestCheckedFlowArtifact", expected), /^sha256:[0-9a-f]{64}$/);
  });

  it("refuses missing, unknown and identity-neighbour fields", () => {
    const { schema: _schema, ...missing } = artifact();
    assert.throws(() => call("encodeCheckedFlowArtifact", missing), /SCHEMA|field|refus/i);
    assert.throws(
      () => call("encodeCheckedFlowArtifact", { ...artifact(), authorizing: true }),
      /UNKNOWN|field|refus/i,
    );
    assert.throws(
      () => call("encodeCheckedFlowArtifact", { ...artifact(), productId: "trametes" }),
      /IDENTITY|product|refus/i,
    );
  });

  it("refuses duplicate fields before object construction", () => {
    const source = new TextDecoder().decode(call("encodeCheckedFlowArtifact", artifact()));
    const duplicate = source.replace(
      '"schema":"galerina.rd0858.checked-flow.v1",',
      '"schema":"galerina.rd0858.checked-flow.v1","schema":"galerina.rd0858.checked-flow.v1",',
    );
    assert.throws(
      () => call("decodeCheckedFlowArtifact", new TextEncoder().encode(duplicate)),
      /DUPLICATE|canonical|refus/i,
    );
  });

  it("refuses non-canonical bytes, CRLF, BOM and trailing data", () => {
    const canonical = new TextDecoder().decode(call("encodeCheckedFlowArtifact", artifact()));
    for (const neighbour of [
      canonical.replace(/\n$/, "\r\n"),
      `\ufeff${canonical}`,
      canonical.replace(/\n$/, " \n"),
      canonical.replace('"schema":', '"schema" :'),
    ]) {
      assert.throws(
        () => call("decodeCheckedFlowArtifact", new TextEncoder().encode(neighbour)),
        /CANONICAL|UTF8|JSON|refus/i,
      );
    }
  });

  it("refuses NFD strings rather than normalizing silently", () => {
    const current = artifact();
    current.checkedAst.children[3].children[0].children[1].children[0].value = "de\u0301ny";
    assert.throws(
      () => call("encodeCheckedFlowArtifact", current),
      /NFC|CANONICAL|STRING|refus/i,
    );
  });

  it("refuses hostile accessors and Proxies", () => {
    const hostile = new Proxy(artifact(), {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    });
    assert.throws(
      () => call("encodeCheckedFlowArtifact", hostile),
      /ACCESS|OBJECT|refus/i,
    );
  });

  it("refuses unsafe numbers and non-closed AST fields", () => {
    assert.throws(
      () => call("encodeCheckedFlowArtifact", { ...artifact(), languageVersion: 1.5 }),
      /INTEGER|VERSION|refus/i,
    );
    const current = artifact();
    current.checkedAst.location = { file: "source.fungi", line: 1, column: 1 };
    assert.throws(
      () => call("encodeCheckedFlowArtifact", current),
      /AST|UNKNOWN|field|refus/i,
    );
  });

  it("refuses top-level versus checked-AST contract mismatch", () => {
    assert.throws(
      () => call("encodeCheckedFlowArtifact", { ...artifact(), flowName: "other" }),
      /IDENTITY|AST|flow|refus/i,
    );
    assert.throws(
      () => call("encodeCheckedFlowArtifact", { ...artifact(), returnType: "Bool" }),
      /CONTRACT|AST|return|refus/i,
    );
  });

  it("refuses surplus root and block nodes outside the exact scalar body", () => {
    const surplusRoot = artifact();
    surplusRoot.checkedAst.children.push({ kind: "identifier", value: "surplus" });
    assert.throws(
      () => call("encodeCheckedFlowArtifact", surplusRoot),
      /AST|CONTRACT|UNKNOWN|refus/i,
    );

    const surplusBlock = artifact();
    surplusBlock.checkedAst.children[3].children.push({ kind: "identifier", value: "surplus" });
    assert.throws(
      () => call("encodeCheckedFlowArtifact", surplusBlock),
      /AST|CONTRACT|UNKNOWN|refus/i,
    );
  });

  it("refuses excessive depth and AST node count", () => {
    const deep = artifact();
    let cursor = deep.checkedAst;
    for (let index = 0; index < 65; index += 1) {
      const child = { kind: "block", children: [] };
      cursor.children = [child];
      cursor = child;
    }
    assert.throws(() => call("encodeCheckedFlowArtifact", deep), /DEPTH|BOUND|refus/i);

    const wide = artifact();
    wide.checkedAst.children = Array.from(
      { length: L.CHECKED_FLOW_ARTIFACT_MAX_AST_NODES },
      () => ({ kind: "identifier", value: "x" }),
    );
    assert.throws(() => call("encodeCheckedFlowArtifact", wide), /NODE|BOUND|refus/i);
  });

  it("refuses artifacts above the byte ceiling", () => {
    const current = artifact();
    current.checkedAst.children[3].children[0].children[1].children[0].value = "x".repeat(262_144);
    assert.throws(() => call("encodeCheckedFlowArtifact", current), /BYTE|BOUND|refus/i);
  });
});
