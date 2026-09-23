import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeFile } from "../dist/index.js";

const PREFIX = `secure flow f(readonly request: Request): Response
{
  contract {
    intent { "t" }
    effects { database.write network.inbound }
  }
`;

test("hostile: a gate in a comment does not certify the sink as gated", () => {
  const src = `${PREFIX}
  unsafe let rawName: String = request.body.name
  // validate.input(rawName)
  DB.insert({ name: rawName })
  return { ok: true }
}
`;
  const result = analyzeFile(src, "comment-gate.fungi");
  assert.equal(result.ungatedSinkReached, true);
});

test("hostile: a gate after the sink does not certify the sink as gated", () => {
  const src = `${PREFIX}
  unsafe let rawName: String = request.body.name
  DB.insert({ name: rawName })
  let safeName = validate.input(rawName)?
  return { ok: true }
}
`;
  const result = analyzeFile(src, "late-gate.fungi");
  assert.equal(result.ungatedSinkReached, true);
});

test("a gate before the sink still clears the sink", () => {
  const src = `${PREFIX}
  unsafe let rawName: String = request.body.name
  let safeName = validate.input(rawName)?
  DB.insert({ name: safeName })
  return { ok: true }
}
`;
  const result = analyzeFile(src, "prior-gate.fungi");
  assert.equal(result.ungatedSinkReached, false);
});
