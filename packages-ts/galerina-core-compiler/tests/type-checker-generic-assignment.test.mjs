import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

function typeErrors(source) {
  const parsed = parseProgram(source, "generic-assignment.fungi");
  return checkTypes(parsed.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error");
}

describe("FUNGI-TYPE-002 generic assignment compatibility", () => {
  it("rejects a mismatched generic Option payload", () => {
    const errors = typeErrors(`
pure flow read(a: Array<Int>) -> String {
  let value: Option<String> = a.get(0)
  return "ok"
}
`);

    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-002"),
      `Expected FUNGI-TYPE-002, got: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("preserves numeric widening inside generic collections", () => {
    const errors = typeErrors(`
pure flow values() -> Array<Float> {
  let values: Array<Float> = [1, 2]
  return values
}
`);

    assert.ok(
      !errors.some((error) => error.code === "FUNGI-TYPE-002"),
      `Unexpected FUNGI-TYPE-002: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("rejects a mismatched generic payload in a flow return", () => {
    const errors = typeErrors(`
pure flow read(a: Array<Int>) -> Option<String> {
  return a.get(0)
}
`);

    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-008"),
      `Expected FUNGI-TYPE-008, got: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("rejects a mismatched generic payload at a flow call site", () => {
    const errors = typeErrors(`
pure flow accept(value: Option<String>) -> Void {
  return
}

pure flow caller(a: Array<Int>) -> Void {
  accept(a.get(0))
  return
}
`);

    assert.ok(
      errors.some((error) => error.code === "FUNGI-TYPE-005"),
      `Expected FUNGI-TYPE-005, got: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("defers an inferred Auto payload at a concrete generic call boundary", () => {
    const errors = typeErrors(`
pure flow accept(value: Array<String>) -> Void {
  return
}

pure flow caller(value: Array<Auto>) -> Void {
  accept(value)
  return
}
`);

    assert.deepEqual(
      errors,
      [],
      `Array<Auto> is a deferred payload, not a concrete Array<String> mismatch: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("retains algebraic constructor payloads at a valid return boundary", () => {
    const errors = typeErrors(`
pure flow optionValue() -> Option<Int> {
  return Some(1)
}

pure flow okValue() -> Result<Int, String> {
  return Ok(1)
}

pure flow errValue() -> Result<Int, String> {
  return Err("failed")
}
`);

    assert.deepEqual(errors, [], `valid constructor payloads must remain typed: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("refuses mismatched algebraic constructor payloads at a return boundary", () => {
    const errors = typeErrors(`
pure flow badOption() -> Option<Int> {
  return Some("wrong")
}

pure flow badOk() -> Result<Int, String> {
  return Ok("wrong")
}

pure flow badErr() -> Result<Int, String> {
  return Err(1)
}
`);

    assert.equal(
      errors.filter((error) => error.code === "FUNGI-TYPE-008").length,
      3,
      `each mismatched constructor payload must be refused: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("resolves a named Result alias before checking constructor payloads", () => {
    const errors = typeErrors(`
type AliasResult = Result<Int, String>

pure flow good() -> AliasResult {
  return Ok(1)
}

pure flow bad() -> AliasResult {
  return Ok("wrong")
}
`);

    assert.equal(
      errors.filter((error) => error.code === "FUNGI-TYPE-008").length,
      1,
      `named algebraic aliases must retain their payload contract: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("resolves a named Result alias through error propagation", () => {
    const errors = typeErrors(`
type Saved = Result<Int, String>
type Processed = Result<Int, String>

pure flow save() -> Saved {
  return Ok(1)
}

pure flow process() -> Processed {
  let value = save()?
  return Ok(value)
}
`);

    assert.deepEqual(errors, [], `error propagation must expose the aliased Ok payload: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("retains Array<T> and Option<T> through bounded list methods", () => {
    const errors = typeErrors(`
pure flow listMethods() -> Array<Int> {
  let values: Array<Int> = [1, 2]
  let first: Option<Int> = values.first()
  let last: Option<Int> = values.last()
  let appended: Array<Int> = values.append(3)
  return appended
}
`);

    assert.deepEqual(errors, [], `bounded list-method returns must retain their element type: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("refuses mismatched Array<T> and Option<T> list-method payloads", () => {
    const errors = typeErrors(`
pure flow badListMethods() -> Array<Int> {
  let values: Array<Int> = [1, 2]
  let first: Option<String> = values.first()
  let last: Option<String> = values.last()
  let appended: Array<String> = values.append(3)
  return values
}
`);

    assert.equal(
      errors.filter((error) => error.code === "FUNGI-TYPE-002").length,
      3,
      `each list-method payload mismatch must be refused: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("retains Map<K,V> through bounded map methods", () => {
    const errors = typeErrors(`
pure flow mapMethods() -> Map<String, Int> {
  let values: Map<String, Int> = Map.empty()
  let keys: Array<String> = values.keys()
  let entries: Array<Int> = values.values()
  let updated: Map<String, Int> = values.set("one", 1)
  let removed: Map<String, Int> = updated.remove("one")
  return removed
}
`);

    assert.deepEqual(errors, [], `bounded map-method returns must retain their key/value types: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("refuses mismatched Map<K,V> method returns", () => {
    const errors = typeErrors(`
pure flow badMapMethods() -> Map<String, Int> {
  let values: Map<String, Int> = Map.empty()
  let keys: Array<Int> = values.keys()
  let entries: Array<String> = values.values()
  let updated: Map<String, String> = values.set("one", 1)
  let removed: Array<Int> = updated.remove("one")
  return values
}
`);

    assert.equal(
      errors.filter((error) => error.code === "FUNGI-TYPE-002").length,
      4,
      `each map-method return mismatch must be refused: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("retains Set<T> through bounded set methods", () => {
    const errors = typeErrors(`
pure flow setMethods() -> Set<String> {
  let values: Set<String> = Set.empty()
  let items: Array<String> = values.toList()
  let added: Set<String> = values.add("one")
  let merged: Set<String> = added.union(values)
  let removed: Set<String> = merged.remove("one")
  let present: Bool = removed.contains("one")
  return removed
}
`);

    assert.deepEqual(errors, [], `bounded set-method returns must retain their element type: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("refuses mismatched Set<T> method returns", () => {
    const errors = typeErrors(`
pure flow badSetMethods() -> Set<String> {
  let values: Set<String> = Set.empty()
  let items: Array<Int> = values.toList()
  let added: Set<Int> = values.add("one")
  let removed: Array<Int> = values.remove("one")
  return values
}
`);

    assert.equal(
      errors.filter((error) => error.code === "FUNGI-TYPE-002").length,
      3,
      `each set-method return mismatch must be refused: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("infers bounded Array static constructor returns", () => {
    const errors = typeErrors(`
pure flow arrayConstructors() -> Array<Int> {
  let empty: Array<String> = Array.empty()
  let values: Array<Int> = Array.of(1, 2, 3)
  let range: Array<Int> = Array.range(0, 3)
  return values
}
`);

    assert.deepEqual(errors, [], `bounded Array constructors must retain admitted element types: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("refuses mismatched Array static constructor returns", () => {
    const errors = typeErrors(`
pure flow badArrayConstructors() -> Array<String> {
  let values: Array<String> = Array.of(1, 2)
  let range: Array<String> = Array.range(0, 3)
  return values
}
`);

    assert.equal(
      errors.filter((error) => error.code === "FUNGI-TYPE-002").length,
      2,
      `each Array constructor mismatch must be refused: ${errors.map((error) => error.code).join(", ")}`,
    );
  });

  it("infers bounded Option.sequence and Result.sequence returns", () => {
    const errors = typeErrors(`
pure flow sequenceConstructors() -> Option<Array<Int>> {
  let options: Array<Option<Int>> = []
  let results: Array<Result<Int, String>> = []
  let combinedOptions: Option<Array<Int>> = Option.sequence(options)
  let combinedResults: Result<Array<Int>, String> = Result.sequence(results)
  return combinedOptions
}
`);

    assert.deepEqual(errors, [], `sequence constructors must preserve admitted payload types: ${errors.map((error) => error.code).join(", ")}`);
  });

  it("refuses mismatched Option.sequence and Result.sequence returns", () => {
    const errors = typeErrors(`
pure flow badSequenceConstructors() -> Option<Array<Int>> {
  let options: Array<Option<Int>> = []
  let results: Array<Result<Int, String>> = []
  let combinedOptions: Option<Array<String>> = Option.sequence(options)
  let combinedResults: Result<Array<String>, Int> = Result.sequence(results)
  return combinedOptions
}
`);

    assert.equal(
      errors.filter((error) => error.code === "FUNGI-TYPE-002").length,
      2,
      `each sequence constructor mismatch must be refused: ${errors.map((error) => error.code).join(", ")}`,
    );
  });
});
