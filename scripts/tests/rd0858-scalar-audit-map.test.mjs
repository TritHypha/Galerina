import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const generatorPath = join(root, "scripts", "generate-rd0858-scalar-audit-map.mjs");
const auditMapPath = join(root, "docs", "audit-map.json");

const loadGenerator = () => import(pathToFileURL(generatorPath).href);

describe("RD-0858 scalar audit-map generator", () => {
  it("derives one stable implementation build from the fixed executable closure", async () => {
    const generator = await loadGenerator();
    const first = generator.buildAuditMapCandidate();
    const second = generator.buildAuditMapCandidate();
    assert.deepEqual(second, first);
    assert.match(first.implementationCommit, /^[0-9a-f]{40}$/u);
    assert.match(first.planDigest, /^[0-9a-f]{64}$/u);
  });

  it("reads the governing plan from exact committed Git bytes", async () => {
    const generator = await loadGenerator();
    const committed = Buffer.from("approved plan\n", "utf8");
    const calls = [];
    const actual = generator.readCommittedPlanBytes((...args) => {
      calls.push(args);
      return committed;
    });

    assert.deepEqual(actual, committed);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "git");
    assert.deepEqual(calls[0][1], ["show", `HEAD:${generator.GOVERNING_PLAN_RELATIVE}`]);
    assert.equal(calls[0][2].cwd, root);
    assert.equal(calls[0][2].encoding, null);

    const committedPlan = spawnSync(
      "git",
      ["show", `HEAD:${generator.GOVERNING_PLAN_RELATIVE}`],
      { cwd: root, encoding: null, timeout: 30_000 },
    );
    assert.equal(committedPlan.status, 0, committedPlan.stderr?.toString("utf8"));
    assert.equal(
      generator.buildAuditMapCandidate().planDigest,
      createHash("sha256").update(committedPlan.stdout).digest("hex"),
    );

    for (const runner of [
      () => Buffer.alloc(0),
      () => "not bytes",
      () => {
        throw new Error("git failed");
      },
    ]) {
      assert.throws(() => generator.readCommittedPlanBytes(runner), /PLAN_REFUSED/u);
    }
  });

  it("binds every audit to the implementation without manufacturing executable-plan approval", async () => {
    const generator = await loadGenerator();
    const candidate = generator.buildAuditMapCandidate();
    const decoded = JSON.parse(candidate.bytes.toString("utf8"));
    const locator = `git://galerina/${candidate.implementationCommit}`;
    assert.equal(decoded.subject.locator, locator);
    assert.deepEqual(decoded.approval, {
      status: "DRAFT", planDigest: null, authority: null, evidence: null,
    }, "a governing-document hash is not approval of this executable audit plan");
    assert.ok(decoded.audits.length > 0);
    assert.ok(decoded.audits.every((audit) => audit.build === locator));
  });

  it("emits canonical LF JSON without machine-local paths", async () => {
    const generator = await loadGenerator();
    const { bytes } = generator.buildAuditMapCandidate();
    const text = bytes.toString("utf8");
    assert.equal(text.endsWith("\n"), true);
    assert.equal(text.includes("\r"), false);
    assert.doesNotMatch(text, /(?:^|["\s])[A-Za-z]:[\\/]/u);
    assert.deepEqual(Buffer.from(`${JSON.stringify(JSON.parse(text), null, 2)}\n`, "utf8"), bytes);
  });

  it("admits only the exact LF or whole-file CRLF checkout projection", async () => {
    const generator = await loadGenerator();
    const canonical = Buffer.from("{\n  \"status\": \"PASS\"\n}\n", "utf8");
    const crlf = Buffer.from("{\r\n  \"status\": \"PASS\"\r\n}\r\n", "utf8");

    assert.doesNotThrow(() => generator.assertAuditMapCheckoutProjection(canonical, canonical));
    assert.doesNotThrow(() => generator.assertAuditMapCheckoutProjection(canonical, crlf));
    for (const refused of [
      Buffer.from("{\r\n  \"status\": \"PASS\"\n}\r\n", "utf8"),
      Buffer.from("{\r  \"status\": \"PASS\"\r}\r", "utf8"),
      Buffer.from("{\n  \"status\": \"PASS\" \n}\n", "utf8"),
      Buffer.alloc(0),
      "not bytes",
    ]) {
      assert.throws(
        () => generator.assertAuditMapCheckoutProjection(canonical, refused),
        /FIXED_POINT_REFUSED/u,
      );
    }
  });

  it("matches the committed map and passes its bounded self-test", () => {
    for (const mode of ["--check", "--self-test"]) {
      const result = spawnSync(process.execPath, [generatorPath, mode], {
        cwd: root,
        encoding: "utf8",
        timeout: 130_000,
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /PASS|fixed.point|byte.identical/i);
    }
  });

  it("refuses caller-selected paths, builds, and unknown modes", () => {
    for (const args of [
      ["--output", "other.json"],
      ["--build", "0".repeat(40)],
      ["--check", "other.json"],
      ["--unknown"],
    ]) {
      const result = spawnSync(process.execPath, [generatorPath, ...args], {
        cwd: root,
        encoding: "utf8",
        timeout: 130_000,
      });
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}\n${result.stderr}`, /ARGUMENT|MODE|LOCATOR|refus/i);
    }
  });

  it("keeps the generated view present for Git custody", async () => {
    assert.ok((await readFile(auditMapPath)).byteLength > 0);
  });
});
