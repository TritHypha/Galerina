import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_SRP_001,
  FUNGI_APPK_SRP_002,
  FUNGI_APPK_SRP_003,
  FUNGI_APPK_SRP_004,
  SCOPE_ROLE_POLICY_SCHEMA,
  createScopeRolePolicy,
  readScopeRolePolicy,
} from "../dist/scope-role-policy.js";

function role(id, scopes) {
  return { id, scopes };
}

function basePolicy(overrides = {}) {
  return {
    schema: SCOPE_ROLE_POLICY_SCHEMA,
    name: "OrdersRoles",
    defaultDecision: "deny",
    admittedScopes: ["orders.read", "orders.write"],
    roles: [role("clerk", ["orders.read"]), role("manager", ["orders.read", "orders.write"])],
    ...overrides,
  };
}

describe("scope role policy model", () => {
  it("admits a closed role→scope grant table", () => {
    const result = readScopeRolePolicy(basePolicy());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.schema, SCOPE_ROLE_POLICY_SCHEMA);
    assert.equal(result.value.name, "OrdersRoles");
    assert.equal(result.value.defaultDecision, "deny");
    assert.equal(result.value.admittedScopes.length, 2);
    assert.equal(result.value.roles.length, 2);
    assert.equal(result.value.roles[0]?.id, "clerk");
    assert.deepEqual(result.value.roles[1]?.scopes, ["orders.read", "orders.write"]);
    assert.equal(result.value.diagnostics.length, 0);
  });

  it("refuses getters, symbols, and unknown keys without echo", () => {
    const hostile = basePolicy();
    Object.defineProperty(hostile, "secret", {
      get() {
        throw new Error("getter-ran");
      },
      enumerable: true,
    });
    const fromGetter = createScopeRolePolicy(hostile);
    assert.equal(fromGetter.diagnostics[0]?.code, FUNGI_APPK_SRP_001);
    assert.equal(fromGetter.diagnostics.some((d) => /getter|secret/i.test(d.message)), false);

    const withSymbol = { ...basePolicy(), [Symbol("x")]: 1 };
    const fromSymbol = createScopeRolePolicy(withSymbol);
    assert.equal(fromSymbol.diagnostics[0]?.code, FUNGI_APPK_SRP_001);

    const unknownKey = { ...basePolicy(), extra: "nope" };
    const fromUnknown = createScopeRolePolicy(unknownKey);
    assert.equal(fromUnknown.diagnostics[0]?.code, FUNGI_APPK_SRP_001);
    assert.equal(fromUnknown.diagnostics.some((d) => d.message.includes("extra")), false);
  });

  it("refuses allow default, wildcards, and bad tokens without echo", () => {
    const allow = createScopeRolePolicy(basePolicy({ defaultDecision: "allow" }));
    assert.equal(allow.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_002), true);
    assert.equal(allow.diagnostics.some((d) => d.message.includes("allow")), false);

    const star = createScopeRolePolicy(
      basePolicy({ admittedScopes: ["orders.read", "orders.*"] }),
    );
    assert.equal(star.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_002), true);
    assert.equal(star.diagnostics.some((d) => d.message.includes("*")), false);

    const anyTok = createScopeRolePolicy(
      basePolicy({ admittedScopes: ["any"] }),
    );
    assert.equal(anyTok.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_002), true);
    assert.equal(anyTok.diagnostics.some((d) => /\bany\b/.test(d.message)), false);
  });

  it("refuses empty roles, duplicate ids, and scopes outside admitted set", () => {
    const empty = createScopeRolePolicy(basePolicy({ roles: [] }));
    assert.equal(empty.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_003), true);

    const dup = createScopeRolePolicy(
      basePolicy({
        roles: [role("clerk", ["orders.read"]), role("clerk", ["orders.write"])],
      }),
    );
    assert.equal(dup.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_003), true);

    const outside = createScopeRolePolicy(
      basePolicy({
        roles: [role("clerk", ["orders.admin"])],
      }),
    );
    assert.equal(outside.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_003), true);
    assert.equal(outside.diagnostics.some((d) => d.message.includes("orders.admin")), false);

    const emptyScopes = createScopeRolePolicy(
      basePolicy({
        roles: [role("clerk", [])],
      }),
    );
    assert.equal(emptyScopes.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_003), true);
  });

  it("refuses unsorted admittedScopes / roles and dense-array violations", () => {
    const unsortedScopes = createScopeRolePolicy(
      basePolicy({ admittedScopes: ["orders.write", "orders.read"] }),
    );
    assert.equal(unsortedScopes.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_002), true);

    const unsortedRoles = createScopeRolePolicy(
      basePolicy({
        roles: [role("manager", ["orders.read"]), role("clerk", ["orders.read"])],
      }),
    );
    assert.equal(unsortedRoles.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_003), true);

    const sparse = [];
    sparse[0] = "orders.read";
    sparse[2] = "orders.write";
    const sparseList = createScopeRolePolicy(basePolicy({ admittedScopes: sparse }));
    assert.equal(sparseList.diagnostics.some((d) => d.code === FUNGI_APPK_SRP_004), true);
  });

  it("never throws on flipping proxies", () => {
    let flips = 0;
    const proxy = new Proxy(basePolicy(), {
      get(target, prop, receiver) {
        flips += 1;
        if (flips > 3 && prop === "roles") return null;
        return Reflect.get(target, prop, receiver);
      },
      getOwnPropertyDescriptor(target, prop) {
        flips += 1;
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
      ownKeys(target) {
        flips += 1;
        return Reflect.ownKeys(target);
      },
    });
    assert.doesNotThrow(() => createScopeRolePolicy(proxy));
  });
});
