// R3 `pkg-standard-audit` gate, end to end over fixture repositories.
// Requires the audit core build: (cd packages-ts/galerina-devtools-package-graph && npm run build)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditRoot, main } from "../audit-pkg-standard.mjs";
import { fixtureFiles, main as generate, makeFixtureRepo } from "../gen-package-standard-manifests.mjs";

const withGenerated = async (fn, mutate = () => {}) => {
  const files = fixtureFiles();
  mutate(files);
  const root = makeFixtureRepo(files);
  try {
    await generate(["--root", root, "--write", "--accept-lock-drift"]);
    execFileSync("git", ["-C", root, "add", "-A"]);
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};
const codesOf = (r) => new Set(r.diagnostics.map((d) => d.code));

test("fail-closed: a package without documents is RED (001/004/007), exit 1", async () => {
  const root = makeFixtureRepo(fixtureFiles());
  try {
    const r = await main(["--root", root, "--json"]);
    assert.equal(r.code, 1);
    const codes = new Set(JSON.parse(r.text).diagnostics.map((d) => d.code));
    for (const c of ["FUNGI-PKGSTD-001", "FUNGI-PKGSTD-004", "FUNGI-PKGSTD-007"]) assert.ok(codes.has(c), c);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generated documents pass the development profile, exit 0", async () => {
  await withGenerated(async (root) => {
    const r = await main(["--root", root]);
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /VIOLATIONS: 0/);
  });
});

test("production profile is honestly RED for unsigned, WASM-less packages (011/012)", async () => {
  await withGenerated(async (root) => {
    const codes = codesOf(await auditRoot(root, "production"));
    assert.ok(codes.has("FUNGI-PKGSTD-011") && codes.has("FUNGI-PKGSTD-012"));
  });
});

test("a committed source change after generation is caught (006)", async () => {
  await withGenerated(async (root) => {
    writeFileSync(join(root, "packages-ts/galerina-alpha/src/index.ts"), "export const alpha = 3;\n");
    execFileSync("git", ["-C", root, "add", "-A"]);
    assert.ok(codesOf(await auditRoot(root, "development")).has("FUNGI-PKGSTD-006"));
  });
});

test("an unpinned dependency (009) and a GPL dependency (010) are reported, not hidden", async () => {
  await withGenerated(async (root) => {
    const codes = codesOf(await auditRoot(root, "development"));
    assert.ok(codes.has("FUNGI-PKGSTD-009"));
    assert.ok(codes.has("FUNGI-PKGSTD-010"));
  }, (files) => {
    files["packages-ts/galerina-alpha/package-lock.json"] = `${JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/leftpad": { version: "1.0.2", integrity: `sha512-${Buffer.alloc(64, 7).toString("base64")}`, license: "GPL-3.0" } } })}\n`;
    const pj = JSON.parse(files["packages-ts/galerina-alpha/package.json"]);
    pj.dependencies.unlocked = "^2.0.0";
    files["packages-ts/galerina-alpha/package.json"] = `${JSON.stringify(pj)}\n`;
  });
});

test("a package on disk but not in the workspace list is caught (013)", async () => {
  await withGenerated(async (root) => {
    writeFileSync(join(root, "galerina.workspace.json"), `${JSON.stringify({ packages: ["packages-ts/galerina-core-compiler"] })}\n`);
    assert.ok(codesOf(await auditRoot(root, "development")).has("FUNGI-PKGSTD-013"));
  });
});

test("unknown profile and unknown arguments are refused", async () => {
  await assert.rejects(main(["--profile", "staging"]), /unknown profile/);
  await assert.rejects(main(["--bogus"]), /unknown argument/);
});

test("self-test passes", async () => {
  const r = await main(["--self-test"]);
  assert.equal(r.code, 0);
});
