import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_CLI_PROMOTE_001,
  FUNGI_CLI_PROMOTE_002,
  FUNGI_CLI_PROMOTE_003,
  FUNGI_CLI_PROMOTE_004,
  PROMOTE_EXIT_OK,
  PROMOTE_EXIT_USAGE,
  PROMOTE_EXIT_VALIDATION,
  parsePromoteArgs,
  runPromoteCommand,
} from "../dist/index.js";

const HASH_A = "sha256:" + "a".repeat(64);

function ctx(args) {
  return Object.freeze({ cwd: ".", env: "development", args });
}

describe("promote command", () => {
  it("parses admitted flags and refuses live/equals/positional/unknown", () => {
    const ok = parsePromoteArgs([
      "--from", "staging", "--to", "production", "--hash", HASH_A, "--target", "node", "--json",
    ]);
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.options.fromEnvironment, "staging");
    assert.equal(ok.options.json, true);

    const live = parsePromoteArgs(["--live"]);
    assert.equal(live.ok, false);
    if (!live.ok) assert.equal(live.result.error?.code, FUNGI_CLI_PROMOTE_004);

    const eq = parsePromoteArgs(["--from=staging"]);
    assert.equal(eq.ok, false);
    if (!eq.ok) assert.equal(eq.result.error?.code, FUNGI_CLI_PROMOTE_001);

    const pos = parsePromoteArgs(["staging", "production"]);
    assert.equal(pos.ok, false);

    const miss = parsePromoteArgs(["--from", "staging"]);
    assert.equal(miss.ok, false);
    if (!miss.ok) assert.equal(miss.result.error?.code, FUNGI_CLI_PROMOTE_002);
  });

  it("runPromoteCommand admits a closed plan and refuses bad domains without echo", async () => {
    const ok = await runPromoteCommand(ctx([
      "--from", "staging", "--to", "production", "--hash", HASH_A, "--target", "node",
    ]));
    assert.equal(ok.ok, true);
    assert.equal(ok.code, PROMOTE_EXIT_OK);

    const bad = await runPromoteCommand(ctx([
      "--from", "staging", "--to", "staging", "--hash", HASH_A, "--target", "node",
    ]));
    assert.equal(bad.ok, false);
    assert.equal(bad.code, PROMOTE_EXIT_VALIDATION);
    assert.equal(bad.error?.code, FUNGI_CLI_PROMOTE_003);
    assert.equal(JSON.stringify(bad).includes("staging"), false);

    const usage = await runPromoteCommand(ctx(["--apply"]));
    assert.equal(usage.code, PROMOTE_EXIT_USAGE);
  });

  it("json mode reports diagnostic codes without echoing hash tokens on refuse", async () => {
    const ok = await runPromoteCommand(ctx([
      "--from", "test", "--to", "staging", "--hash", HASH_A, "--target", "wasm", "--json",
    ]));
    assert.equal(ok.ok, true);
    assert.ok(ok.message.includes('"admitted":true'));

    const badHash = "not-a-real-hash-token-xyz";
    const bad = await runPromoteCommand(ctx([
      "--from", "test", "--to", "staging", "--hash", badHash, "--target", "wasm", "--json",
    ]));
    assert.equal(bad.ok, false);
    assert.equal(JSON.stringify(bad).includes(badHash), false);
  });
});
