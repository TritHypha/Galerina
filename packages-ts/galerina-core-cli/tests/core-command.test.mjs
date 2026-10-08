import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runCli } from "../dist/index.js";

describe("Galerina core command integrations", () => {
  it("runs check and run through galerina-core", async () => {
    const cwd = await createProject();
    const check = await runCli(["check", "src"], cwd);
    const run = await runCli(["run", "src/hello.fungi"], cwd);

    assert.equal(check.ok, true);
    assert.match(check.details?.join("\n") ?? "", /Core command: Galerina check/);
    assert.match(check.details?.join("\n") ?? "", /Galerina check: 0 errors/);
    assert.equal(run.ok, true);
    assert.match(run.details?.join("\n") ?? "", /hello from Galerina/);
  });

  it("runs closed-shape build admission and reports through galerina-core", async () => {
    const cwd = await createProject();
    // build is the closed-shape CLI (14-pass pipeline not admitted); see build-command.test.mjs
    const build = await runCli(
      ["build", "--workspace", "apps/demo", "--target", "node", "--out", "dist"],
      cwd,
    );
    const reports = await runCli(["reports", "src", "--out", ".build-dev"], cwd);

    assert.equal(build.ok, false);
    assert.equal(build.code, 4);
    assert.match(build.message, /Build refused/);
    assert.equal(JSON.stringify(build).includes("apps/demo"), false);
    assert.equal(reports.ok, true);
    assert.match(reports.details?.join("\n") ?? "", /Development outputs wrote/);
    assert.match(
      await readFile(join(cwd, ".build-dev", "app.ai-context.json"), "utf8"),
      /nextActions/,
    );
  });

  it("runs routes and security checks through galerina-core", async () => {
    const cwd = await createProject();
    const routes = await runCli(["routes", "src/api.fungi"], cwd);
    const security = await runCli(["security:check", "src"], cwd);

    assert.equal(routes.ok, true);
    assert.match(routes.details?.join("\n") ?? "", /"\/orders"/);
    assert.match(routes.details?.join("\n") ?? "", /createOrder/);
    assert.equal(security.ok, true);
    assert.match(security.message, /security diagnostics/);
  });
});

async function createProject() {
  const cwd = await mkdtemp(join(tmpdir(), "galerina-core-cli-core-"));
  await writeFile(
    join(cwd, "src", "placeholder"),
    "",
    "utf8",
  ).catch(async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(cwd, "src"), { recursive: true });
  });
  await writeFile(
    join(cwd, "src", "hello.fungi"),
    `secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
`,
    "utf8",
  );
  await writeFile(
    join(cwd, "src", "api.fungi"),
    `record CreateOrderRequest {
  customerId: String
}

record CreateOrderResponse {
  id: String
}

api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder
  }
}

secure flow createOrder(req: Request) -> Result<Response, ApiError> {
  return JsonResponse(req)
}
`,
    "utf8",
  );

  return cwd;
}
