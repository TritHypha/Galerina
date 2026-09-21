import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FUNGI_VOID, callStdlib } from "../dist/index.js";

function ctx() {
  return {
    recordEffect: () => {},
    resolveIdentifier: () => undefined,
    callFlow: async () => FUNGI_VOID,
    applyFn: async (_fn, arg) => arg,
  };
}

describe("C19-B compiler Json.parse / json.decode governed codec", () => {
  it("still decodes an integer object", async () => {
    const result = await callStdlib(
      "json.decode",
      undefined,
      [{ __tag: "string", value: '{"a":1}' }],
      ctx(),
    );
    assert.equal(result?.__tag, "ok");
    assert.equal(result?.value.__tag, "record");
    assert.equal(result?.value.fields.get("a")?.__tag, "int");
    assert.equal(result?.value.fields.get("a")?.value, 1);
  });

  it("binds Json.parse to the same governed codec", async () => {
    const result = await callStdlib(
      "Json.parse",
      undefined,
      [{ __tag: "string", value: "true" }],
      ctx(),
    );
    assert.equal(result?.__tag, "ok");
    assert.equal(result?.value.__tag, "bool");
    assert.equal(result?.value.value, true);
  });

  it("refuses a JSON float instead of emitting IEEE", async () => {
    const result = await callStdlib(
      "json.decode",
      undefined,
      [{ __tag: "string", value: "0.1" }],
      ctx(),
    );
    assert.equal(result?.__tag, "err");
    assert.match(result?.error.value, /DecodeError/);
  });

  it("refuses duplicate keys", async () => {
    const result = await callStdlib(
      "json.decode",
      undefined,
      [{ __tag: "string", value: '{"a":1,"a":2}' }],
      ctx(),
    );
    assert.equal(result?.__tag, "err");
    assert.match(result?.error.value, /duplicate/i);
  });

  it("wraps a protected input as protected Json and refuses encoding it", async () => {
    const decoded = await callStdlib(
      "json.decode",
      undefined,
      [{ __tag: "protected", baseType: "String", value: { __tag: "string", value: '{"k":1}' } }],
      ctx(),
    );
    assert.equal(decoded?.__tag, "ok");
    assert.equal(decoded?.value.__tag, "protected");
    assert.equal(decoded?.value.baseType, "Json");
    const encoded = await callStdlib("json.encode", undefined, [decoded.value], ctx());
    assert.equal(encoded?.__tag, "err");
    assert.match(encoded?.error.value, /EncodeError/);
  });

  it("refuses encoding a redacted value as JSON null", async () => {
    const encoded = await callStdlib(
      "json.encode",
      undefined,
      [{ __tag: "redacted", baseType: "Email" }],
      ctx(),
    );
    assert.equal(encoded?.__tag, "err");
    assert.match(encoded?.error.value, /EncodeError/);
  });

  it("refuses encoding Decimal as a JSON number", async () => {
    const encoded = await callStdlib(
      "json.encode",
      undefined,
      [{ __tag: "decimal", value: "0.1" }],
      ctx(),
    );
    assert.equal(encoded?.__tag, "err");
    assert.match(encoded?.error.value, /Decimal|integer/i);
  });

  it("encodes a clean record without JSON.stringify any", async () => {
    const encoded = await callStdlib(
      "json.encode",
      undefined,
      [{ __tag: "record", fields: new Map([["name", { __tag: "string", value: "test" }]]) }],
      ctx(),
    );
    assert.equal(encoded?.__tag, "string");
    assert.equal(encoded?.value, '{"name":"test"}');
  });
});
