import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as compiler from "../../dist/index.js";
const { checkValueStates, checkTypes, parseProgram } = compiler;

const parseClean = (source) => {
  const parsed = parseProgram(`@version 1\n${source}`, "authority-use-state.test.fungi");
  const parseErrors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  assert.deepEqual(parseErrors, [], `fixture must parse cleanly: ${JSON.stringify(parseErrors)}`);
  return parsed.ast;
};

const diagnostics = (source) => checkValueStates(parseClean(source), "production").diagnostics;
const codes = (source) => diagnostics(source).map((diagnostic) => String(diagnostic.code));

// Removing either declaration hook must fail these tests even though the
// hallmark assay already refuses its separate direct Lease parameter.
describe("Secret lease declaration carriers", () => {
  const declaration = 'type Lease = Authority<"galerina.secret.lease.v1">';
  const exact = (line, column) => ({
    code: "FUNGI-AFFINE-005", name: "SECRET_LEASE_RUNTIME_UNWIRED", severity: "error",
    file: "authority-use-state.test.fungi", line, column,
  });
  const check = (source, mode, expected) => {
    const ast = parseClean(source);
    assert.deepEqual(compiler.resolveSymbols(ast).diagnostics, [], "symbol prerequisite");
    assert.deepEqual(checkTypes(ast).diagnostics, [], "type prerequisite");
    assert.deepEqual(checkValueStates(ast, mode).diagnostics.map((d) => ({
      code: d.code, name: d.name, severity: d.severity,
      file: d.location?.file, line: d.location?.line, column: d.location?.column,
    })), expected);
    return ast;
  };
  for (const mode of ["production", "development"]) {
    for (const kind of ["resource", "record"]) {
      for (const carrier of ["Lease", "String"]) {
        it(`${mode}: ${kind} List<${carrier}> has exactly the field refusal`, () => {
          const ast = check(`${declaration}\n${kind} Envelope {\n  item: List<${carrier}>\n}`, mode,
            carrier === "Lease" ? [exact(4, 3)] : []);
          const node = ast.children.find((n) => n.kind === `${kind}Decl`);
          assert.equal(node?.children?.[0]?.kind, "paramDecl");
          assert.equal(node?.children?.[0]?.value, `item: List<${carrier}>`);
        });
      }
    }
    for (const carrier of ["Lease", "String"]) {
      for (const use of [false, true]) {
        it(`${mode}: hallmark ${carrier}, wrapper parameter=${use}, refuses carrier independently of assay`, () => {
          const source = `${declaration}\nhallmark WrappedLease of ${carrier} {\n  gate: flow assayWrappedLease\n}\npure flow assayWrappedLease(raw: ${carrier}) -> Result<WrappedLease, String> {\n  contract { intent "Reject this carrier at the assay." }\n  return Err("not admitted")\n}\n`
            + (use ? 'pure flow observe(value: WrappedLease) -> Bool {\n  contract { intent "Observe the wrapped parameter." }\n  return true\n}' : '');
          const ast = check(source, mode, carrier === "Lease" ? [exact(3, 26), exact(6, 29)] : []);
          const hallmark = ast.children.find((n) => n.kind === "hallmarkDecl");
          assert.equal(hallmark?.children?.[0]?.kind, "typeRef");
          assert.equal(hallmark?.children?.[0]?.value, carrier);
          if (use) {
            const observe = ast.children.find((n) => n.kind === "pureFlowDecl" && n.value === "observe");
            assert.equal(observe?.children?.[0]?.value, "value: WrappedLease");
          }
        });
      }
      it(`${mode}: direct ${carrier} parameter remains a discriminating control`, () => {
        check(`${declaration}\npure flow observe(value: ${carrier}) -> Bool {\n  contract { intent "Direct parameter control." }\n  return true\n}`, mode,
          carrier === "Lease" ? [exact(3, 19)] : []);
      });
    }
  }
  it("public diagnostic export is the emitting module's single owner", async () => {
    const owner = await import("../../dist/value-state-checker.js");
    assert.ok(owner.FUNGI_AFFINE_005, "005 is owned by the emitter, not a duplicate barrel literal");
    assert.strictEqual(compiler.FUNGI_AFFINE_005, owner.FUNGI_AFFINE_005);
    assert.deepEqual(Object.fromEntries(["code", "name", "severity"].map((k) => [k, owner.FUNGI_AFFINE_005[k]])), {
      code: "FUNGI-AFFINE-005", name: "SECRET_LEASE_RUNTIME_UNWIRED", severity: "error",
    });
  });
});

// These controls catch loss of annotation bytes before the lease detector, not
// merely missing 005 implementation. The parser must retain the complete type.
describe("Secret lease annotation extraction", () => {
  const declaration = 'type Lease = Authority<"galerina.secret.lease.v1">';
  const nodes = (node) => [node, ...(node.children ?? []).flatMap(nodes)];
  const leaseDiagnostics = (ast, mode = "production") =>
    checkValueStates(ast, mode).diagnostics.filter((d) => d.code === "FUNGI-AFFINE-005");
  const assertLeaseAt = (ast, line) => {
    const actual = leaseDiagnostics(ast);
    assert.equal(actual.length, 1);
    assert.equal(actual[0].location?.line, line);
    assert.equal(actual[0].severity, "error");
    assert.equal(actual[0].name, "SECRET_LEASE_RUNTIME_UNWIRED");
  };

  for (const keyword of ["let", "mut", "readonly"]) {
    for (const payload of ["x=y", "x source_from y"]) {
      for (const [tail, expected] of [["Lease", 1], ["String", 0]]) {
        it(`${keyword}: quoted ${payload} preserves the ${tail} type argument`, () => {
          const type = `Map<Brand<String,"${payload}">,${tail}>`;
          const ast = parseClean(`${declaration}\nflow f() -> Bool {\n  ${keyword} value: ${type} = acquire()\n  return true\n}`);
          const local = nodes(ast).find((node) => node.kind === `${keyword}Decl`);
          assert.equal(local?.value, `value: ${type}`);
          if (expected) assertLeaseAt(ast, 4);
          else assert.deepEqual(leaseDiagnostics(ast), []);
        });
      }
    }
  }

  for (const suffix of ["", " source_from Network.HttpRequest"]) {
    for (const [tail, expected] of [["Lease", 1], ["String", 0]]) {
      it(`parameter: quoted source_from retains ${tail}, real origin=${suffix !== ""}`, () => {
        const type = `Map<Brand<String,"x source_from y">,${tail}>`;
        const ast = parseClean(`${declaration}\nflow f(value: ${type}${suffix}) -> Bool { return true }`);
        const parameter = nodes(ast).find((node) => node.kind === "paramDecl");
        assert.equal(parameter?.children?.[0]?.value, type);
        if (expected) assertLeaseAt(ast, 3);
        else assert.deepEqual(leaseDiagnostics(ast), []);
      });
    }
  }

  for (const [suffix, expected] of [["", 0], [" source_from Network.HttpRequest", 1]]) {
    it(`only a real origin taints a parameter, origin=${suffix !== ""}`, () => {
      const ast = parseClean(`flow f(value: Brand<String,"x source_from Network.HttpRequest">${suffix}) -> Bool {\n  AuditLog.write(value)\n  return true\n}`);
      const sink = checkValueStates(ast, "production").diagnostics.filter((d) => d.code === "FUNGI-VALUESTATE-003");
      assert.equal(sink.length, expected);
      if (expected) assert.equal(sink[0].location?.line, 3);
    });
  }

  for (const mode of ["production", "development"]) {
    it(`reserved lease refusal is active in ${mode}`, () => {
      const ast = parseClean(`${declaration}\nflow f(value: Lease) -> Bool { return true }`);
      const actual = leaseDiagnostics(ast, mode);
      assert.equal(actual.length, 1);
      assert.equal(actual[0].location?.line, 3);
      assert.deepEqual(
        { code: actual[0].code, name: actual[0].name, severity: actual[0].severity },
        { code: "FUNGI-AFFINE-005", name: "SECRET_LEASE_RUNTIME_UNWIRED", severity: "error" },
      );
      assert.ok(compiler.FUNGI_AFFINE_005, "refusal has an exported diagnostic owner");
      for (const key of ["code", "name", "severity"]) {
        assert.equal(actual[0][key], compiler.FUNGI_AFFINE_005[key], key);
      }
    });
  }
});

describe("Secret lease type positions and arity", () => {
  for (const type of ["Brand<String,Lease>", "Vector<Float32,4>", "Matrix<Float32,2,4>", "Tensor<Float32,[1,2]>"]) {
    it(`valid generic carrier remains parser/type clean: ${type}`, () => {
      const ast = parseClean(`type Lease = Authority<"galerina.secret.lease.v1">\nflow f(value: ${type}) -> Bool { return true }`);
      assert.deepEqual(checkTypes(ast).diagnostics, []);
      for (const mode of ["production", "development"]) assert.deepEqual(checkValueStates(ast, mode).diagnostics, []);
    });
  }
  const cases = [
    ["Brand element", "Brand<Lease,Tag>", true],
    ["Brand nominal tag", "Brand<String,Lease>", false],
    ["Authority nominal tag", "Authority<Lease>", false],
    ["Tensor element", "Tensor<Lease,[1,2]>", true],
    ["Tensor shape", "Tensor<Float32,[Lease,2]>", false],
    ["Vector element", "Vector<Lease,4>", true],
    ["Vector dimension", "Vector<Float32,Lease>", false],
    ["Matrix element", "Matrix<Lease,2,4>", true],
    ["Matrix dimensions", "Matrix<Float32,Lease,Lease>", false],
    ["Money tag", "Money<Lease>", false],
    ["Embedding dimension", "Embedding<Lease>", false],
    ["quoted type-looking payload", 'List<"Brand<Lease>">', false],
    ["ordinary type position", "List<Lease>", true],
  ];
  for (const [name, type, expected] of cases) {
    it(name, () => {
      const ast = parseClean(`type Lease = Authority<"galerina.secret.lease.v1">\nflow f(value: ${type}) -> Bool { return true }`);
      const found = checkValueStates(ast, "production").diagnostics.filter((d) => d.code === "FUNGI-AFFINE-005");
      assert.equal(found.length, expected ? 1 : 0);
      if (expected) assert.equal(found[0].location?.line, 3);
    });
  }

  for (const type of ['Authority<"other",Lease>', "Brand<String,Tag,Lease>", "Option<String,Lease>"]) {
    it(`surplus position does not infer a lease: ${type}`, () => {
      const ast = parseClean(`type Lease = Authority<"galerina.secret.lease.v1">\nflow f(value: ${type}) -> Bool { return true }`);
      assert.ok(checkTypes(ast).diagnostics.some((d) => d.code === "FUNGI-TYPE-009"));
      assert.deepEqual(checkValueStates(ast, "production").diagnostics.filter((d) => d.code === "FUNGI-AFFINE-005"), []);
    });
  }

  it("a valid type position still rejects an unknown type", () => {
    const ast = parseClean("flow f(value: Result<Int,MadeUpErrorXyz>) -> Bool { return true }");
    assert.ok(checkTypes(ast).diagnostics.some((d) => d.code === "FUNGI-TYPE-001"));
  });
});

describe("Transitive non-secret Authority preserves transfer boundaries", () => {
  const forward = 'type Alias2 = Alias1\ntype Alias1 = Lease\ntype Lease = Authority<"slide.vok.lease.v1">';
  const reverse = 'type Lease = Authority<"slide.vok.lease.v1">\ntype Alias1 = Lease\ntype Alias2 = Alias1';
  for (const [name, aliases] of [["forward", forward], ["reverse", reverse]]) {
    it(`${name} chain consumes exactly once`, () => {
      const result = diagnostics(`${aliases}\nflow f(value: Alias2) -> Bool {\n consume.once(value)\n consume.twice(value)\n return true\n}`);
      const reuse = result.filter((d) => d.code === "FUNGI-AFFINE-002");
      assert.equal(reuse.length, 1);
      assert.equal(reuse[0].location?.line, 7);
      assert.deepEqual(result.filter((d) => d.code === "FUNGI-AFFINE-005"), []);
    });
  }
  it("a single transfer is not a reuse", () => {
    assert.deepEqual(codes(`${forward}\nflow f(value: Alias2) -> Bool { consume.once(value)\n return true }`).filter((c) => c.startsWith("FUNGI-AFFINE-")), []);
  });
  it("moving an alias consumes the source, not the new binding", () => {
    const result = diagnostics(`${forward}\nflow f(value: Alias2) -> Bool {\n let moved = value\n consume.once(moved)\n consume.twice(value)\n return true\n}`);
    const reuse = result.filter((d) => d.code === "FUNGI-AFFINE-002");
    assert.equal(reuse.length, 1);
    assert.equal(reuse[0].location?.line, 8);
  });
  it("refused persistence does not consume an aliased authority", () => {
    const result = diagnostics(`${forward}\nflow f(value: Alias2) -> Bool {\n json.encode(value)\n consume.once(value)\n consume.twice(value)\n return true\n}`);
    assert.deepEqual(result.filter((d) => d.code === "FUNGI-AFFINE-003").map((d) => d.location?.line), [6]);
    assert.deepEqual(result.filter((d) => d.code === "FUNGI-AFFINE-002").map((d) => d.location?.line), [8]);
  });
  it("an alias cannot be contained in a record", () => {
    const result = diagnostics(`${forward}\nrecord Envelope { lease: Alias2 }`);
    assert.deepEqual(result.filter((d) => d.code === "FUNGI-AFFINE-004").map((d) => d.location?.line), [5]);
  });
  for (const aliases of ["type A = B\ntype B = String", "type A = B\ntype B = A"]) {
    it(`unseeded aliases are not Authority: ${aliases.replaceAll("\n", "; ")}`, () => {
      assert.deepEqual(codes(`${aliases}\nflow f(value: A) -> Bool {\n consume.once(value)\n consume.twice(value)\n return true\n}`).filter((c) => c.startsWith("FUNGI-AFFINE-")), []);
    });
  }
});

describe("Authority<Tag> use state", () => {
  it("fails closed for the secret-lease authority until a cleanup runtime is wired", () => {
    const result = diagnostics(`type SecretLeaseAlias = SecretLease
type SecretLease = Authority<"galerina.secret.lease.v1">
secure flow acceptUnwiredSecretLease(lease: SecretLeaseAlias) -> Bool {
  return true
}`);
    assert.ok(result.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed when an unwired secret lease is created in a flow", () => {
    assert.ok(codes(`type SecretLease = Authority<"galerina.secret.lease.v1">
secure flow createUnwiredSecretLease() -> Bool {
  let lease: SecretLease = acquire()
  return true
  }`).includes("FUNGI-AFFINE-005"));
  });

  it("fails closed for direct secret-lease types without a named alias", () => {
    const parameter = diagnostics(`secure flow acceptDirectSecretLease(lease: Authority<"galerina.secret.lease.v1">) -> Bool {
  return true
}`);
    assert.ok(parameter.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));

    const local = diagnostics(`secure flow createDirectSecretLease() -> Bool {
  let lease: Authority<"galerina.secret.lease.v1"> = acquire()
  return true
}`);
    assert.ok(local.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed when a secret lease is nested in a declared container type", () => {
    const direct = diagnostics(`secure flow acceptNestedSecretLease(leases: List<Authority<"galerina.secret.lease.v1">>) -> Bool {
  return true
}`);
    assert.ok(direct.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));

    const aliased = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
type SecretLeaseList = List<SecretLease>
secure flow acceptAliasedNestedSecretLease(leases: SecretLeaseList) -> Bool {
  return true
}`);
    assert.ok(aliased.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed for an unquoted secret-lease parameter", () => {
    const unquotedParameter = diagnostics(`secure flow acceptUnquotedSecretLease(lease: Authority<galerina.secret.lease.v1>) -> Bool {
  return true
}`);
    assert.ok(unquotedParameter.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed for a postfix-qualified secret-lease local", () => {
    const qualifiedLocal = diagnostics(`secure flow createQualifiedSecretLease() -> Bool {
  let lease: Authority<"galerina.secret.lease.v1"> secret = acquire()
  return true
}`);
    assert.ok(qualifiedLocal.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed for governance-qualified secret-lease types", () => {
    const direct = diagnostics(`secure flow protectedSecretLease(lease: protected Authority<"galerina.secret.lease.v1">) -> Bool {
  return true
}`);
    assert.ok(direct.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));

    const directRedacted = diagnostics(`secure flow redactedDirectSecretLease(lease: redacted Authority<"galerina.secret.lease.v1">) -> Bool {
  return true
}`);
    assert.ok(directRedacted.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));

    const aliased = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
secure flow redactedSecretLease(lease: redacted SecretLease) -> Bool {
  return true
}`);
    assert.ok(aliased.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));

    const protectedAlias = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
secure flow protectedAliasedSecretLease(lease: protected SecretLease) -> Bool {
  return true
}`);
    assert.ok(protectedAlias.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed for a mutable secret-lease local", () => {
    const mutableLocal = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
secure flow createMutableSecretLease() -> Bool {
  mut lease: SecretLease = acquire()
  return true
}`);
    assert.ok(mutableLocal.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed for a readonly secret-lease local", () => {
    const readonlyLocal = diagnostics(`secure flow createReadonlySecretLease() -> Bool {
  readonly lease: Authority<"galerina.secret.lease.v1"> = acquire()
  return true
}`);
    assert.ok(readonlyLocal.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed for source_from secret-lease parameters", () => {
    const sourceFromParameter = diagnostics(`secure flow acceptSourcedSecretLease(lease: Authority<"galerina.secret.lease.v1"> source_from Network.HttpRequest) -> Bool {
  return true
}`);
    assert.ok(sourceFromParameter.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("does not confuse source_from inside an alias name with the parameter origin clause", () => {
    const parameter = diagnostics(`type Lease_source_from_X = Authority<"galerina.secret.lease.v1">
secure flow acceptSuffixedAlias(lease: Lease_source_from_X) -> Bool {
  return true
}`);
    assert.ok(parameter.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));

    const local = diagnostics(`type Lease_source_from_X = Authority<"galerina.secret.lease.v1">
secure flow createSuffixedAlias() -> Bool {
  let lease: Lease_source_from_X = acquire()
  return true
}`);
    assert.ok(local.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed for secret-lease helper-function parameters", () => {
    const parameter = diagnostics(`secure flow helperBoundary() -> Bool {
  fn acceptSecretLease(lease: Authority<"galerina.secret.lease.v1">) -> Bool { return true }
  return true
}`);
    assert.ok(parameter.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed for secret-lease helper-function return types", () => {
    const result = diagnostics(`secure flow helperReturnBoundary() -> Bool {
  fn makeSecretLease() -> Authority<"galerina.secret.lease.v1"> { return acquire() }
  return true
}`);
    assert.ok(result.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed for secret-lease flow return types", () => {
    const result = diagnostics(`secure flow returnSecretLease() -> Authority<"galerina.secret.lease.v1"> {
  return acquire()
}`);
    assert.ok(result.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("fails closed when a record declares a secret-lease field", () => {
    const result = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
record SecretEnvelope { lease: List<SecretLease> }
secure flow recordBoundary() -> Bool { return true }`);
    assert.ok(result.some((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"));
  });

  it("does not apply the secret-lease runtime hold to other Authority tags", () => {
    const unrelatedTags = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
secure flow unrelatedTags(
  slideLease: Authority<"slide.vok.lease.v1">,
  nearMatchSuffix: Authority<"galerina.secret.lease.v1.other">,
  nearMatchPrefix: Authority<"x.galerina.secret.lease.v1">,
  aliasTextInsideOtherTag: Authority<"other.SecretLease">,
  bareTagLooksLikeAlias: Authority<SecretLease>,
  authorityTextInsideString: Brand<String, "Authority<galerina.secret.lease.v1>">
) -> Bool {
  return true
}`);
    assert.deepEqual(unrelatedTags.filter((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"), []);

    assert.deepEqual(codes(`type Lease = Authority<"slide.vok.lease.v1">
secure flow useOtherLease(lease: Lease) -> Bool {
  consume.once(lease)
  return true
}`).filter((code) => code === "FUNGI-AFFINE-005"), []);
  });

  it("does not resolve nominal brand tag payloads as secret-lease type aliases", () => {
    const direct = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
secure flow brandedTag(tag: Brand<String, SecretLease>) -> Bool {
  return true
}`);
    assert.deepEqual(direct.filter((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"), []);

    const aliased = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
type BrandedTag = Brand<String, SecretLease>
secure flow brandedTagAlias(tag: BrandedTag) -> Bool {
  return true
}`);
    assert.deepEqual(aliased.filter((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"), []);
  });

  it("does not parse type-like text inside a quoted generic payload", () => {
    const result = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
secure flow quotedPayload(value: List<"Brand<SecretLease>">) -> Bool {
  return true
}`);
    assert.deepEqual(result.filter((diagnostic) => diagnostic.code === "FUNGI-AFFINE-005"), []);
  });

  it("refuses a second call transfer", () => {
    assert.ok(codes(`
type Lease = Authority<"slide.vok.lease.v1">
secure flow useTwice(lease: Lease) -> Bool {
  consume.primary(lease)
  consume.secondary(lease)
  return true
}`).includes("FUNGI-AFFINE-002"));
  });

  it("preserves consume-once tracking through a second type alias", () => {
    const result = diagnostics(`type SecretLeaseAlias2 = SecretLeaseAlias1
type SecretLeaseAlias1 = SecretLease
type SecretLease = Authority<"galerina.secret.lease.v1">
secure flow useSecretLeaseTwice(lease: SecretLeaseAlias2) -> Bool {
  consume.primary(lease)
  consume.secondary(lease)
  return true
}`);
    const reuse = result.filter((diagnostic) => diagnostic.code === "FUNGI-AFFINE-002");
    assert.equal(reuse.length, 1);
    assert.equal(reuse[0].location?.line, 7);
  });

  it("permits one consume through a transitive alias", () => {
    const result = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
type SecretLeaseAlias = SecretLease
secure flow consumeSecretLeaseOnce(lease: SecretLeaseAlias) -> Bool {
  consume.primary(lease)
  return true
}`);
    assert.deepEqual(result.filter((diagnostic) => diagnostic.code === "FUNGI-AFFINE-002"), []);
  });

  it("does not promote an ordinary alias chain to authority", () => {
    const result = diagnostics(`type LabelAlias2 = LabelAlias1
type LabelAlias1 = String
secure flow ordinary(value: LabelAlias2) -> Bool {
  consume.primary(value)
  consume.secondary(value)
  return true
}`);
    assert.deepEqual(result.filter((diagnostic) => diagnostic.code === "FUNGI-AFFINE-002"), []);
  });

  it("moves on rebinding and refuses the consumed source", () => {
    assert.ok(codes(`
type Lease = Authority<"slide.vok.lease.v1">
secure flow moveThenReuse(lease: Lease) -> Bool {
  let moved: Lease = lease
  consume.primary(moved)
  consume.secondary(lease)
  return true
}`).includes("FUNGI-AFFINE-002"));
  });

  it("does not mark an ordinary value as authority", () => {
    const affineCodes = codes(`
secure flow ordinary(value: String) -> Bool {
  consume.primary(value)
  consume.secondary(value)
  return true
}`).filter((code) => code === "FUNGI-AFFINE-002");
    assert.deepEqual(affineCodes, []);
  });

  it("refuses reuse after returning an authority value", () => {
    assert.ok(codes(`
type Lease = Authority<"slide.vok.lease.v1">
secure flow returnThenReuse(lease: Lease) -> Lease {
  return lease
  consume.secondary(lease)
}`).includes("FUNGI-AFFINE-002"));
  });

  it("cannot hide authority in a nested list argument", () => {
    assert.ok(codes(`
type Lease = Authority<"slide.vok.lease.v1">
secure flow nestedDuplicate(lease: Lease) -> Bool {
  consume.wrapper([lease, lease])
  return true
}`).includes("FUNGI-AFFINE-004"));
  });
});

describe("Authority<Tag> persistence boundary", () => {
  const expectPersistenceRefusal = (statement) => {
    assert.ok(codes(`
type Lease = Authority<"slide.vok.lease.v1">
secure flow persist(lease: Lease) -> Bool {
  ${statement}
  return true
}`).includes("FUNGI-AFFINE-003"));
  };

  it("refuses JSON serialization", () => {
    expectPersistenceRefusal("json.encode(lease)");
  });

  it("refuses a nested authority value at serialization", () => {
    expectPersistenceRefusal("json.encode([lease])");
  });

  it("refuses persistence through a second type alias", () => {
    const result = diagnostics(`type SecretLease = Authority<"galerina.secret.lease.v1">
type SecretLeaseAlias = SecretLease
secure flow persistSecretLease(lease: SecretLeaseAlias) -> Bool {
  json.encode(lease)
  return true
}`);
    const persistence = result.filter((diagnostic) => diagnostic.code === "FUNGI-AFFINE-003");
    assert.equal(persistence.length, 1);
    assert.equal(persistence[0].location?.line, 5);
  });

  it("refuses database persistence", () => {
    expectPersistenceRefusal("database.write(lease)");
  });

  it("refuses vault persistence", () => {
    expectPersistenceRefusal("Vault.write(lease)");
  });

  it("refuses audit persistence", () => {
    expectPersistenceRefusal("AuditLog.write(lease)");
  });

  it("does not treat a forbidden persistence attempt as a valid transfer", () => {
    const result = codes(`
type Lease = Authority<"slide.vok.lease.v1">
secure flow refuseThenTransfer(lease: Lease) -> Bool {
  json.encode(lease)
  consume.primary(lease)
  consume.secondary(lease)
  return true
}`);
    assert.ok(result.includes("FUNGI-AFFINE-003"));
    assert.equal(result.filter((code) => code === "FUNGI-AFFINE-002").length, 1);
  });
});

describe("Authority<Tag> containment boundary", () => {
  it("refuses an authority field in an ordinary record declaration", () => {
    assert.ok(codes(`
type Lease = Authority<"slide.vok.lease.v1">
record Envelope { lease: Lease }
`).includes("FUNGI-AFFINE-004"));
  });

  it("refuses an authority nested in a list binding", () => {
    assert.ok(codes(`
type Lease = Authority<"slide.vok.lease.v1">
secure flow wrap(lease: Lease) -> Bool {
  let envelope = [lease]
  return true
}
`).includes("FUNGI-AFFINE-004"));
  });

  it("refuses authority containment through a second type alias", () => {
    assert.ok(codes(`
type SecretLease = Authority<"galerina.secret.lease.v1">
type SecretLeaseAlias = SecretLease
record Envelope { lease: SecretLeaseAlias }
`).includes("FUNGI-AFFINE-004"));
  });

  it("refuses an authority nested in a record literal", () => {
    assert.ok(codes(`
type Lease = Authority<"slide.vok.lease.v1">
secure flow wrap(lease: Lease) -> Bool {
  let envelope = { lease: lease }
  return true
}
`).includes("FUNGI-AFFINE-004"));
  });
});
