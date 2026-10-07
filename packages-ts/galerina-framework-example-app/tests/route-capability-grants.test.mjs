import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNLISTED = Object.freeze(["network", "storage", "secret", "inference", "database"]);

function readUtf8(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function readJson(rel) {
  return JSON.parse(readUtf8(rel));
}

describe("example-app least-capability grants (L19; L20-L21 HOLD)", () => {
  it("pins empty capabilities at every grant site", () => {
    assert.deepEqual(readJson("App.manifest").capabilities, []);
    assert.deepEqual(readJson("galerina-package.json").capabilities, []);
    assert.deepEqual(readJson("packages/greeting/package.fungi.json").capabilities, []);
    assert.deepEqual(readJson("packages/greeting/dist/greeting.fuse.json").capabilities, []);
    assert.deepEqual(readJson("packages/greeting/dist/greeting.lmanifest.json").fuse.capabilities, []);
  });

  it("fungi flows stay pure with no effects block", () => {
    for (const rel of ["src/App.fungi", "src/flows/greeting.fungi", "packages/greeting/src/index.fungi"]) {
      const text = readUtf8(rel);
      const code = text.split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");
      assert.equal(/effects\s*\{/.test(code), false, rel);
      assert.match(code, /^pure flow /m);
    }
  });

  it("host declares exactly one GET /hello greeting route", () => {
    const server = readUtf8("host/server.ts");
    assert.equal((server.match(/path: config\.greeting\.route/g) ?? []).length, 1);
    assert.equal((server.match(/handler: "greeting"/g) ?? []).length, 1);
    assert.match(server, /routes: \[route\]/);
    assert.equal((server.match(/method: "GET"/g) ?? []).length, 1);
    const config = readJson("config/app.config.json");
    assert.equal(config.greeting.route, "/hello");
  });

  it("refuses unlisted capabilities against the closed empty grant set", () => {
    const granted = Object.freeze([...readJson("App.manifest").capabilities]);
    assert.deepEqual(granted, []);
    for (const cap of UNLISTED) {
      assert.equal(granted.includes(cap), false, cap);
    }
  });

  it("does not edit framework-app-kernel (L20-L21 HOLD)", () => {
    const server = readUtf8("host/server.ts");
    assert.match(server, /from "\.\.\/\.\.\/galerina-framework-app-kernel\/dist\/index\.js"/);
    assert.equal(server.includes("src/kernel.ts"), false);
  });
});
