import assert from "node:assert/strict";
import { test } from "node:test";
import { valueStateLoopStateKey } from "../../dist/value-state-loop-key.js";

function makeCapturedState({ tainted = false, shadowed = [] } = {}) {
  const expression = { kind: "identifier", value: "payload" };
  const payload = {
    name: "payload",
    safetyPrefix: undefined,
    typeName: "String",
    tainted,
    secretControlDerived: false,
    secretValueExpressions: [],
  };
  const captured = {
    expression,
    bindings: new Map([["payload", payload]]),
    shadowedResultConstructors: new Set(shadowed),
  };
  const result = {
    name: "result",
    safetyPrefix: undefined,
    typeName: "String",
    secretControlDerived: false,
    secretValueExpressions: [captured],
    secretValueUnknown: false,
    tainted: false,
    embeddingDerived: false,
    consumed: false,
  };
  return [new Map([["result", result]])];
}

test("loop state keys distinguish captured binding facts inside nested Maps", () => {
  assert.notEqual(
    valueStateLoopStateKey(makeCapturedState({ tainted: false }), 0),
    valueStateLoopStateKey(makeCapturedState({ tainted: true }), 0),
  );
});

test("loop state keys distinguish nested shadowed-constructor Sets", () => {
  assert.notEqual(
    valueStateLoopStateKey(makeCapturedState(), 0),
    valueStateLoopStateKey(makeCapturedState({ shadowed: ["Ok"] }), 0),
  );
});

test("loop state keys are stable for structurally equivalent captures", () => {
  assert.equal(
    valueStateLoopStateKey(makeCapturedState({ tainted: true, shadowed: ["Err", "Ok"] }), 0),
    valueStateLoopStateKey(makeCapturedState({ tainted: true, shadowed: ["Ok", "Err"] }), 0),
  );
});

test("loop state keys distinguish captured declaration-token identity", () => {
  const makeState = (identity) => {
    const payload = {
      name: "payload",
      typeName: "SecureString",
      declarationIdentity: identity,
      secretValueExpressions: [],
      secretValueUnknown: false,
    };
    const captured = {
      expression: { kind: "identifier", value: "payload" },
      bindings: new Map([["payload", payload]]),
      shadowedResultConstructors: new Set(),
    };
    return [new Map([["result", {
      name: "result",
      typeName: "SecureString",
      secretValueExpressions: [captured],
      secretValueUnknown: false,
    }]])];
  };
  const token = {};

  assert.equal(valueStateLoopStateKey(makeState(token), 0), valueStateLoopStateKey(makeState(token), 0));
  assert.notEqual(valueStateLoopStateKey(makeState({}), 0), valueStateLoopStateKey(makeState({}), 0));
});

function makeCyclicCapturedState(tainted = false) {
  const binding = {
    name: "node",
    safetyPrefix: undefined,
    typeName: "String",
    secretControlDerived: false,
    secretValueUnknown: false,
    tainted,
    embeddingDerived: false,
    consumed: false,
  };
  const captured = {
    expression: { kind: "identifier", value: "node" },
    bindings: new Map([["node", binding]]),
    shadowedResultConstructors: new Set(),
  };
  binding.secretValueExpressions = [captured];
  return [new Map([["node", binding]])];
}

test("loop state keys encode recursive provenance without losing nested binding facts", () => {
  assert.equal(
    valueStateLoopStateKey(makeCyclicCapturedState(false), 0),
    valueStateLoopStateKey(makeCyclicCapturedState(false), 0),
  );
  assert.notEqual(
    valueStateLoopStateKey(makeCyclicCapturedState(false), 0),
    valueStateLoopStateKey(makeCyclicCapturedState(true), 0),
  );
});

test("loop state keys use a total order for distinct Unicode Map keys and Set entries", () => {
  const composed = "\u00e9";
  const decomposed = "e\u0301";
  const mapState = (names) => {
    const bindings = new Map(names.map((name) => [name, {
      name,
      safetyPrefix: undefined,
      typeName: "String",
      tainted: name === composed,
      secretControlDerived: false,
      secretValueExpressions: [],
    }]));
    const result = {
      name: "result",
      safetyPrefix: undefined,
      typeName: "String",
      secretValueExpressions: [{
        expression: { kind: "identifier", value: composed },
        bindings,
        shadowedResultConstructors: new Set(),
      }],
    };
    return [new Map([["result", result]])];
  };
  const setState = (names) => {
    const result = {
      name: "result",
      safetyPrefix: undefined,
      typeName: "String",
      secretValueExpressions: [{
        expression: { kind: "identifier", value: "payload" },
        bindings: new Map(),
        shadowedResultConstructors: new Set(names),
      }],
    };
    return [new Map([["result", result]])];
  };

  assert.equal(valueStateLoopStateKey(mapState([composed, decomposed]), 0),
    valueStateLoopStateKey(mapState([decomposed, composed]), 0));
  assert.equal(valueStateLoopStateKey(setState([composed, decomposed]), 0),
    valueStateLoopStateKey(setState([decomposed, composed]), 0));
});
