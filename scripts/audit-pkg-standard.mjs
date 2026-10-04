#!/usr/bin/env node
// audit-pkg-standard.mjs: the `pkg-standard-audit` conformance gate (Package Standard v1
// section 9; handover R3). It extends the KB pkg-census idea into an enforcing gate over
// the three section 4 documents of every workspace package.
//
// FAIL-CLOSED: exit 1 on any FUNGI-PKGSTD-* diagnostic, exit 2 on any refusal (unbuilt core,
// malformed package.json or lockfile, unreadable index, empty package set). A missing
// document is RED, never "not applicable".
//
// Profiles:
//   --profile development (default)  structural section 4 conformance, source-hash freshness,
//                                     pinning, and the licence allow-list
//   --profile production              additionally requires a signature and a WASM artifact
//                                     (FUNGI-PKGSTD-011/012); honestly RED until R1/R2 and
//                                     section 5b signing land
// Options: --root <dir>, --json, --self-test.
//
// The decision core is packages-ts/galerina-devtools-package-graph/src/package-standard.ts
// (built to dist/). Observed source hashes come from the git index via the generator's
// reader, so the gate and the generator cannot disagree on what "the sources" are.

import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RefusedError,
  STANDARD_FILES,
  fixtureFiles,
  generateAll,
  licensePolicy,
  loadCore,
  makeFixtureRepo,
} from "./gen-package-standard-manifests.mjs";

export async function auditRoot(root, profile) {
  if (profile !== "development" && profile !== "production") throw new RefusedError(`unknown profile ${profile}`);
  const core = await loadCore();
  const policy = await licensePolicy(root);
  const result = generateAll(root);
  const diagnostics = [...core.auditPackageSet(result.dirs, result.indexDirs)];
  for (const p of result.packages) {
    const read = (file) => {
      const path = join(root, "packages-ts", p.dir, file);
      return existsSync(path) ? { present: true, text: readFileSync(path, "utf8") } : { present: false };
    };
    diagnostics.push(...core.auditPackage({
      packageDir: p.dir,
      packageName: p.name,
      packageVersion: p.version,
      manifest: read("galerina-package.json"),
      buildManifest: read("build-manifest.json"),
      sbom: read("sbom.json"),
      observedSources: p.observedSources,
      observedAggregateSha256: p.observedAggregateSha256,
      profile,
      ...policy,
    }));
  }
  const sorted = core.sortDiagnostics(diagnostics);
  const byCode = {};
  for (const d of sorted) byCode[d.code] = (byCode[d.code] ?? 0) + 1;
  return { packages: result.packages.length, profile, diagnostics: sorted, byCode };
}

async function selfTest() {
  const root = makeFixtureRepo(fixtureFiles());
  try {
    const missing = await auditRoot(root, "development");
    const fired = new Set(missing.diagnostics.map((d) => d.code));
    for (const code of ["FUNGI-PKGSTD-001", "FUNGI-PKGSTD-004", "FUNGI-PKGSTD-007"]) {
      if (!fired.has(code)) throw new RefusedError(`self-test: ${code} did not fire on a package with no documents`);
    }
    const result = generateAll(root);
    for (const p of result.packages) for (const file of STANDARD_FILES) writeFileSync(join(root, "packages-ts", p.dir, file), p.docs[file]);
    const clean = await auditRoot(root, "development");
    if (clean.diagnostics.length !== 0) throw new RefusedError(`self-test: generated fixture is not clean: ${clean.diagnostics.map((d) => d.code).join(",")}`);
    const prod = await auditRoot(root, "production");
    const prodCodes = new Set(prod.diagnostics.map((d) => d.code));
    if (!prodCodes.has("FUNGI-PKGSTD-011") || !prodCodes.has("FUNGI-PKGSTD-012")) throw new RefusedError("self-test: production profile did not reject an unsigned, WASM-less package");
    const manifestPath = join(root, "packages-ts", "galerina-alpha", "galerina-package.json");
    writeFileSync(manifestPath, readFileSync(manifestPath, "utf8").replace('"boundaries": []', '"boundaries": null'));
    const hostile = await auditRoot(root, "development");
    if (!hostile.diagnostics.some((d) => d.code === "FUNGI-PKGSTD-002")) throw new RefusedError("self-test: a null value was accepted");
    return "self-test PASS: missing documents RED, generated documents green, production RED, null RED";
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export async function main(argv) {
  let root = process.cwd();
  let profile = "development";
  let asJson = false;
  let self = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root" && argv[i + 1] !== undefined) root = resolve(argv[(i += 1)]);
    else if (a === "--profile" && argv[i + 1] !== undefined) profile = argv[(i += 1)];
    else if (a === "--json") asJson = true;
    else if (a === "--self-test") self = true;
    else throw new RefusedError(`unknown argument ${a}`);
  }
  if (self) return { code: 0, text: await selfTest() };
  const report = await auditRoot(root, profile);
  const code = report.diagnostics.length > 0 ? 1 : 0;
  if (asJson) return { code, text: JSON.stringify({ tool: "pkg-standard-audit", ...report }, null, 2) };
  const lines = [
    `# pkg-standard-audit (Package Standard v1 section 4) | profile ${report.profile} | ${report.packages} packages`,
    ...Object.entries(report.byCode).map(([c, n]) => `  ${c}: ${n}`),
    ...report.diagnostics.slice(0, 40).map((d) => `${d.code} ${d.name} ${d.packageDir}/${d.file}: ${d.detail}`),
    ...(report.diagnostics.length > 40 ? [`... ${report.diagnostics.length - 40} more (use --json)`] : []),
    `VIOLATIONS: ${report.diagnostics.length}`,
  ];
  return { code, text: lines.join("\n") };
}

function isMain() {
  try {
    return process.argv[1] !== undefined && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMain()) {
  main(process.argv.slice(2)).then(({ code, text }) => {
    process.stdout.write(`${text}\n`);
    process.exitCode = code;
  }, (error) => {
    process.stderr.write(`REFUSED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
