import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_DIGEST_MAX_ITEMS,
  AI_DIGEST_MAX_TEXT,
  aiErrorDigest,
  aiProjectDigest,
  aiRouteDigest,
  aiSafePath,
  aiSafeText,
  aiTypeDigest,
} from "../dist/index.js";

describe("AI digests (W01 G2, owner may revisit)", () => {
  it("redacts paths, tokens, key=value secrets and opaque blobs", () => {
    const raw = "failed at C:\\Users\\alex\\app\\main.fungi and /home/alex/app/x.fungi with Bearer abc.def password=hunter2 and AKIAABCDEFGHIJKLMNOPQRSTUVWXYZ012345"; // path-leak-audit:allow gitleaks:allow
    const out = aiSafeText(raw);
    for (const leaked of ["alex", "hunter2", "abc.def", "AKIA"]) assert.equal(out.includes(leaked), false, leaked);
    assert.match(out, /<path>/);
    assert.match(out, /Bearer <redacted>/);
    assert.match(out, /password=<redacted>/);
    assert.match(out, /<blob>/);
  });

  it("caps text length and strips control characters", () => {
    const out = aiSafeText(`a\u0000b\n${"x ".repeat(400)}`);
    assert.ok(out.length <= AI_DIGEST_MAX_TEXT);
    assert.ok(out.endsWith("..."));
    assert.equal(/[\u0000-\u001f]/.test(out), false);
  });

  it("keeps only repository-relative paths", () => {
    assert.equal(aiSafePath("packages-ts/galerina-devtools-graph-algorithms/src/index.ts"), "packages-ts/galerina-devtools-graph-algorithms/src/index.ts");
    assert.equal(aiSafePath("src/app.fungi"), "src/app.fungi");
    assert.equal(aiSafePath("./src/app.fungi"), "src/app.fungi");
    assert.equal(aiSafePath("D:/work/app.fungi"), "<absolute>");
    assert.equal(aiSafePath("/srv/app.fungi"), "<absolute>");
    assert.equal(aiSafePath("src/../../etc/passwd"), "<outside>");
    assert.equal(aiSafePath(""), "<unknown>");
    assert.equal(aiSafePath("~/app/main.fungi"), "<absolute>"); // path-leak-audit:allow
    assert.equal(aiSafePath("file:///srv/app.fungi"), "<absolute>"); // path-leak-audit:allow
    assert.equal(aiSafeText("see ~/app/secret.env and file:///srv/x.fungi now").includes("~/"), false); // path-leak-audit:allow
    assert.equal(aiSafeText("see file:///srv/x.fungi now").includes("file:"), false); // path-leak-audit:allow
  });

  it("L1006 error digest is sorted, one line per diagnostic and redacted", () => {
    const digest = aiErrorDigest([
      { code: "FUNGI-W1", severity: "warning", message: "unused", source: { path: "src/b.fungi", line: 3 } },
      { code: "FUNGI-E2", severity: "error", message: "token=sekrit leaked", path: "src/a.fungi" },
      { code: "FUNGI-E1", severity: "error", message: "secret value", redacted: true, source: { path: "src/a.fungi", line: 9 } },
      { code: "bad code!", severity: "critical", message: "x" },
    ]);
    assert.deepEqual(digest.text.split("\n"), [
      "errors 4",
      "C <invalid-name> - x",
      "E FUNGI-E2 src/a.fungi token=<redacted> leaked",
      "E FUNGI-E1 src/a.fungi:9 <redacted>",
      "W FUNGI-W1 src/b.fungi:3 unused",
    ]);
    assert.equal(digest.json.truncated, 0);
  });

  it("caps lists at 50 items with an explicit truncated count", () => {
    const many = Array.from({ length: AI_DIGEST_MAX_ITEMS + 7 }, (_, i) => ({ code: `C${String(i).padStart(3, "0")}`, severity: "info", message: "m" }));
    const digest = aiErrorDigest(many);
    assert.equal(digest.json.items.length, AI_DIGEST_MAX_ITEMS);
    assert.equal(digest.json.truncated, 7);
    assert.ok(digest.text.endsWith("... 7 more"));
  });

  it("L1007 project digest reads only allow-listed fields", () => {
    const input = {
      name: "orders-api",
      version: "1.2.0",
      packages: ["@galerina/core-network", "@galerina/auth", "@galerina/auth"],
      targets: ["js"],
      flowCount: 4,
      routeCount: 3,
      diagnostics: { errors: 1, warnings: 2 },
      env: { DATABASE_URL: "postgres://user:pw@db/orders" }, // gitleaks:allow
      secrets: ["STRIPE_KEY"],
    };
    const digest = aiProjectDigest(input);
    const all = JSON.stringify(digest);
    for (const leaked of ["DATABASE_URL", "postgres", "STRIPE_KEY"]) assert.equal(all.includes(leaked), false, leaked);
    assert.deepEqual(digest.json.packages.items, ["@galerina/auth", "@galerina/core-network"]);
    assert.equal(digest.text.split("\n")[0], "project orders-api@1.2.0");
    assert.equal(aiProjectDigest({ name: "x y", flowCount: -1, version: "1 2" }).json.flowCount, 0);
    assert.equal(aiProjectDigest({ name: "x y" }).json.name, "<invalid-name>");
  });

  it("L1008 route digest drops query strings and never assumes auth=none", () => {
    const digest = aiRouteDigest([
      { method: "post", path: "/orders?api_key=abc", auth: "required" },
      { method: "GET", path: "/health" },
      { method: "TRACE", path: "no-slash", auth: "maybe" },
    ]);
    assert.deepEqual(digest.text.split("\n"), [
      "routes 3",
      "GET /health auth=unknown",
      "POST /orders auth=required",
      "INVALID <invalid-path> auth=unknown",
    ]);
    assert.equal(JSON.stringify(digest).includes("abc"), false);
  });

  it("L1009 type digest shows secret fields as SecureString only", () => {
    const digest = aiTypeDigest([
      { name: "User", kind: "record", fields: [{ name: "id", type: "Int" }, { name: "password", type: "String", secret: true }] },
      { name: "Account", kind: "record" },
    ]);
    assert.deepEqual(digest.text.split("\n"), ["types 2", "record Account{}", "record User{id:Int,password:SecureString}"]);
  });

  it("is deterministic for the same input in any order", () => {
    const a = aiRouteDigest([{ method: "GET", path: "/b" }, { method: "GET", path: "/a" }]);
    const b = aiRouteDigest([{ method: "GET", path: "/a" }, { method: "GET", path: "/b" }]);
    assert.equal(a.text, b.text);
  });
});
