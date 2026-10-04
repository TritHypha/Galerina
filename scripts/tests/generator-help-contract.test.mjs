// generator-help-contract.test.mjs — every registered generator owner (governance/tooling-policy.json)
// answers `--help` / `-h` with usage on stdout and exit 0, BEFORE any read, generation or write.
// Zero-trust default, owner may revisit (docs/TODO.md "Dev-tool ergonomics: give registered owners a
// consistent non-mutating `--help` contract"). code-index, dev-tool-index and ts-retirement-graph are
// covered by their own PRs; generate-sbom already honoured --help.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OWNERS = ["audit-coverage", "component-health", "flat-package-root-lock", "fungi-golden-probe", "gen-assurance-semantic-graph", "gen-code-registry", "gen-contract-registry", "gen-roadmap", "gen-status-blocks", "gen-unit-registry", "generate-rd0858-scalar-audit-map", "kb-graph-generator", "kb-index", "package-graph-generator", "project-graph-generator", "verify-slide-reference-evidence"];
const ROOT = resolve(".");
const status = () => execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });

for (const name of OWNERS) {
  for (const flag of ["--help", "-h"]) {
    test(`${name} ${flag} prints usage, exits 0 and changes nothing`, () => {
      const before = status();
      const r = spawnSync(process.execPath, [join(ROOT, "scripts", `${name}.mjs`), flag], {
        cwd: ROOT, encoding: "utf8", timeout: 120_000,
      });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.ok(r.stdout.startsWith(`usage: node scripts/${name}.mjs`), r.stdout.slice(0, 200));
      assert.equal(status(), before, "help must not touch the working tree");
    });
  }
}

for (const name of ["gen-code-registry", "audit-coverage"]) {
  test(`${name} refuses an unknown argument before reading or writing`, () => {
    const cwd = mkdtempSync(join(tmpdir(), `${name}-arg-`));
    try {
      const r = spawnSync(process.execPath, [join(ROOT, "scripts", `${name}.mjs`), "--bogus"], { cwd, encoding: "utf8" });
      assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr, /REFUSED/);
      assert.deepEqual(readdirSync(cwd), []);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
}

test("exitOnHelp is inert when its module is not the entrypoint", () => {
  const helper = pathToFileURL(join(ROOT, "scripts", "lib", "cli-help.mjs")).href;
  const code = `import { exitOnHelp } from ${JSON.stringify(helper)};
exitOnHelp(${JSON.stringify(pathToFileURL(join(ROOT, "scripts", "gen-roadmap.mjs")).href)}, "usage: x");
console.log("inert");`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code, "--", "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "inert");
});
