import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const EVIDENCE = join(MEM, "evidence", "33-u2-serve-gate", "ts-differential.txt");
const PIN = "dc0f9c8c4f1365f0228cda213b2ecd001400463e";
const TS_PATH = "packages-ts/galerina-core-compiler/src/serve-secret-gate.ts";
const TS_SHA = "5be17ebf6387d6f9396e571c3cbc47dd3b61a6989a4cf1f3de9b06408bae0df2";

function normalizeDeclaredRoutePath(path) {
  const noQuery = path.split("?")[0] ?? path;
  const segments = noQuery.split(/(\{[^{}]*\})/g);
  const out = [];
  let i = 0;
  while (i < segments.length) {
    const segment = segments[i];
    if (/^\{[^{}]+\}$/u.test(segment)) {
      out.push(segment);
    } else {
      try {
        out.push(decodeURIComponent(segment).toLowerCase());
      } catch {
        return null;
      }
    }
    i = i + 1;
  }
  let joined = out.join("");
  while (joined.length > 1 && joined.endsWith("/")) {
    joined = joined.slice(0, -1);
  }
  return joined;
}

function isProtectedAuthVerifyRoute(route) {
  const normalized = normalizeDeclaredRoutePath(route.path);
  if (normalized === "/auth/verify") {
    return true;
  }
  if (route.method !== "POST") {
    return false;
  }
  if (route.pathPattern.test("/auth/verify")) {
    return true;
  }
  if (normalized === null) {
    return false;
  }
  return false;
}

function isSecretBearingEffectName(name) {
  const head = (name.split(".")[0] ?? name).toLowerCase();
  const namespaces = [
    "secret", "secrets", "vault", "kms", "env", "keystore", "keyring", "hsm", "secretmanager", "secretstore",
  ];
  return namespaces.includes(head);
}

test("F5 TS pin sha256 and INTENDED_DIVERGENCE rows from frozen oracle", () => {
  const shown = spawnSync("git", ["show", PIN + ":" + TS_PATH], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
  assert.equal(shown.status, 0, shown.stderr);
  const sha = createHash("sha256").update(shown.stdout, "utf8").digest("hex");
  assert.equal(sha, TS_SHA);
  assert.equal(shown.stdout.includes("function normalizeDeclaredRoutePath"), true);
  assert.equal(shown.stdout.includes("if (normalized === null) return false"), true);

  const tsCanonical = isProtectedAuthVerifyRoute({
    path: "/auth/verify",
    method: "POST",
    pathPattern: /^$/,
  });
  const tsSlash = isProtectedAuthVerifyRoute({
    path: "/auth/verify/",
    method: "POST",
    pathPattern: /^$/,
  });
  const tsCase = isProtectedAuthVerifyRoute({
    path: "/Auth/Verify",
    method: "POST",
    pathPattern: /^$/,
  });
  const tsPercent = isProtectedAuthVerifyRoute({
    path: "/auth/%76erify",
    method: "POST",
    pathPattern: /^$/,
  });
  const tsGet = isProtectedAuthVerifyRoute({
    path: "/auth/verify",
    method: "GET",
    pathPattern: /^$/,
  });
  const tsHello = isProtectedAuthVerifyRoute({
    path: "/hello",
    method: "GET",
    pathPattern: /^$/,
  });
  const tsFixture = isProtectedAuthVerifyRoute({
    path: "/__fixture/auth/verify",
    method: "POST",
    pathPattern: /^$/,
  });
  const tsBadPercent = isProtectedAuthVerifyRoute({
    path: "/auth/%zz",
    method: "POST",
    pathPattern: /^$/,
  });
  const tsNulGet = isProtectedAuthVerifyRoute({
    path: "/auth/%zz",
    method: "GET",
    pathPattern: /^$/,
  });
  const tsSecret = isSecretBearingEffectName("secret.read");
  const tsVault = isSecretBearingEffectName("vault.write");
  const tsFake = isSecretBearingEffectName("totally.fake.effect");
  const tsCrypto = isSecretBearingEffectName("crypto.verify");

  assert.equal(tsCanonical, true);
  assert.equal(tsSlash, true);
  assert.equal(tsCase, true);
  assert.equal(tsPercent, true);
  assert.equal(tsGet, true);
  assert.equal(tsHello, false);
  assert.equal(tsFixture, false);
  assert.equal(tsBadPercent, false);
  assert.equal(tsNulGet, false);
  assert.equal(tsSecret, true);
  assert.equal(tsVault, true);
  assert.equal(tsFake, false);
  assert.equal(tsCrypto, false);

  const rows = [
    { row: "POST /auth/verify", ts: "protected", fungi: 101, verdict: "PRESERVED" },
    { row: "POST /auth/verify/", ts: "protected", fungi: 101, verdict: "PRESERVED" },
    { row: "POST /Auth/Verify", ts: "protected", fungi: 101, verdict: "PRESERVED" },
    { row: "POST /auth/%76erify", ts: "protected", fungi: 101, verdict: "PRESERVED" },
    { row: "GET /auth/verify", ts: "protected", fungi: 101, verdict: "PRESERVED" },
    { row: "GET /hello", ts: "admit", fungi: 100, verdict: "PRESERVED" },
    { row: "POST /__fixture/auth/verify", ts: "admit", fungi: 100, verdict: "PRESERVED" },
    { row: "POST /auth/%zz unnormalisable", ts: "not-protected", fungi: 102, verdict: "INTENDED_DIVERGENCE" },
    { row: "GET /auth/%zz unnormalisable", ts: "not-protected", fungi: 102, verdict: "INTENDED_DIVERGENCE" },
    { row: "secret.read", ts: "secret-bearing refuse", fungi: 103, verdict: "PRESERVED" },
    { row: "vault.write", ts: "secret-bearing refuse", fungi: 103, verdict: "PRESERVED" },
    { row: "totally.fake.effect", ts: "unrecognised refuse / not secret-namespace", fungi: 104, verdict: "INTENDED_DIVERGENCE" },
    { row: "crypto.verify fixture", ts: "not secret-bearing", fungi: 100, verdict: "PRESERVED" },
  ];

  const evidence = readFileSync(EVIDENCE, "utf8");
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const listed = row.verdict === "PRESERVED" || row.verdict === "INTENDED_DIVERGENCE" || row.verdict === "NEEDS_LANGUAGE" || row.verdict === "UNKNOWN";
    assert.equal(listed, true, row.row + " unlisted verdict");
    const needle = row.row + " | " + String(row.fungi) + " | " + row.verdict;
    assert.equal(evidence.includes(needle), true, "evidence missing " + needle);
    i = i + 1;
  }
});
