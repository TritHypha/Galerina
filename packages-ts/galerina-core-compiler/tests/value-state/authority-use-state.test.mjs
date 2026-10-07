import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkValueStates, parseProgram } from "../../dist/index.js";

const diagnostics = (source) => {
  const parsed = parseProgram(`@version 1\n${source}`, "authority-use-state.test.fungi");
  const parseErrors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  assert.deepEqual(parseErrors, [], `fixture must parse cleanly: ${JSON.stringify(parseErrors)}`);
  return checkValueStates(parsed.ast, "production").diagnostics;
};

const codes = (source) => diagnostics(source).map((diagnostic) => String(diagnostic.code));

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
