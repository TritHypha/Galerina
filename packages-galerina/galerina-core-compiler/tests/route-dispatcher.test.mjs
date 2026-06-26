import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";

import { serve } from "../dist/index.js";

async function withServer(source, fn) {
  const server = await serve(source, "test.spore", { port: 0 });
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

function makeRequest(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(body, "utf8");
    const req = http.request({
      host: "127.0.0.1",
      port,
      method,
      path,
      headers: payload === undefined ? {} : {
        "Content-Type": "application/json",
        "Content-Length": String(payload.length),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

describe("Route dispatcher", () => {
  it("GET /hello returns 200", async () => {
    const source = `
flow sayHello(request: String) -> Result<String, ApiError> {
  return Ok("hello")
}
route GET "/hello" { flow sayHello }
`;
    await withServer(source, async (server) => {
      const res = await makeRequest(server.port, "GET", "/hello");
      assert.equal(res.status, 200);
      assert.ok(res.body.includes("hello"));
    });
  });

  it("unknown route returns 404", async () => {
    const source = `
flow sayHello(request: String) -> Result<String, ApiError> { return Ok("hello") }
route GET "/hello" { flow sayHello }
`;
    await withServer(source, async (server) => {
      const res = await makeRequest(server.port, "GET", "/unknown");
      assert.equal(res.status, 404);
    });
  });

  it("wrong method returns 405", async () => {
    const source = `
flow sayHello(request: String) -> Result<String, ApiError> { return Ok("hello") }
route GET "/hello" { flow sayHello }
`;
    await withServer(source, async (server) => {
      const res = await makeRequest(server.port, "POST", "/hello");
      assert.equal(res.status, 405);
    });
  });

  it("POST route receives body", async () => {
    const source = `
flow echoBody(request: String) -> Result<String, ApiError> {
  return Ok("received")
}
route POST "/echo" { flow echoBody }
`;
    await withServer(source, async (server) => {
      const res = await makeRequest(server.port, "POST", "/echo", JSON.stringify({ value: "x" }));
      assert.equal(res.status, 200);
      assert.ok(res.body.includes("received"));
    });
  });

  it("path parameter is extracted", async () => {
    const source = `
flow getUser(request: String) -> Result<String, ApiError> {
  return Ok(request.params.id)
}
route GET "/users/{id}" { flow getUser }
`;
    await withServer(source, async (server) => {
      const res = await makeRequest(server.port, "GET", "/users/42");
      assert.equal(res.status, 200);
      assert.ok(res.body.includes("42"));
    });
  });

  it("flow returning Err maps to error status", async () => {
    const source = `
flow missing(request: String) -> Result<String, ApiError> {
  return Err(ApiError.notFound("missing"))
}
route GET "/missing" { flow missing }
`;
    await withServer(source, async (server) => {
      const res = await makeRequest(server.port, "GET", "/missing");
      assert.equal(res.status, 404);
    });
  });

  it("query string is available", async () => {
    const source = `
flow search(request: String) -> Result<String, ApiError> {
  return Ok(request.query.q)
}
route GET "/search" { flow search }
`;
    await withServer(source, async (server) => {
      const res = await makeRequest(server.port, "GET", "/search?q=hello");
      assert.equal(res.status, 200);
      assert.ok(res.body.includes("hello"));
    });
  });

  it("server refuses to start with compiler errors", async () => {
    const source = `
flow bad(request: UnknownType) -> String {
  return "x"
}
route GET "/bad" { flow bad }
`;
    await assert.rejects(() => serve(source, "test.spore", { port: 0 }));
  });
});
