// gen-gir.mjs — generate REAL GIR artifacts (fungi.gir.v1) from the `.fungi` example
// sources, using the shipped @galerina/core-compiler. No hand-authored placeholders:
// the artifact is exactly what the compiler's parse -> checkEffects -> emitGIR pipeline
// produces, so it can never drift from the compiler. Deterministic (no timestamp).
//
// Usage (run from anywhere inside the repo):
//   node docs/examples/gir/gen-gir.mjs               self-test on one example (prints)
//   node docs/examples/gir/gen-gir.mjs --emit <dir>  emit <name>.gir.json for the curated set
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// locate the repo root by walking up until the built compiler is found
function findRepo(start) {
  let d = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(d, 'packages-galerina/galerina-core-compiler/dist/index.js'))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('repo root (packages-galerina/galerina-core-compiler/dist) not found above ' + start);
}
const REPO = findRepo(dirname(fileURLToPath(import.meta.url)));
const COMPILER = join(REPO, 'packages-galerina/galerina-core-compiler/dist/index.js');
const { parseProgram, checkEffects, emitGIR } = await import(pathToFileURL(COMPILER).href);

// curated set: name -> source .fungi directory (relative to docs/examples)
const CURATED = [
  ['001-pure-flow', 'Level-1-Basics/001-pure-flow'],
  ['104-multiple-effects', 'Level-3-Effects/104-multiple-effects'],
  ['173-validation-chain', 'Level-4-Security/173-validation-chain'],
  ['224-contract-best-practices', 'Level-5-Governance/224-contract-best-practices'],
  ['208-audit-proof-required', 'Level-5-Governance/208-audit-proof-required'],
  ['365-ai-summary-flow', 'Level-7-AI/365-ai-summary-flow'],
  ['453-financial-payment-charge', 'Level-9-Enterprise/453-financial-payment-charge'],
  ['465-enterprise-summary', 'Level-9-Enterprise/465-enterprise-summary'],
];

export function genGir(fungiPath, relSource) {
  const source = readFileSync(fungiPath, 'utf8');
  const sourceHash = 'sha256:' + createHash('sha256').update(source).digest('hex');
  const parseResult = parseProgram(source, fungiPath);
  const errs = (parseResult.diagnostics ?? []).filter((d) => d.severity === 'error');
  if (errs.length) return { ok: false, errors: errs.map((e) => `${e.code ?? ''} ${e.message}`.trim()) };
  const effectResults = checkEffects(parseResult.flows, parseResult.ast);
  const { gir } = emitGIR(parseResult.ast, parseResult.flows, effectResults, { sourceHash });
  // deterministic artifact: drop the timestamp; put provenance first; keep the real GIR body.
  const { schemaVersion, generatedAt, ...rest } = gir;
  return { ok: true, artifact: { schemaVersion, sourceFile: relSource, sourceHash, ...rest } };
}

const argv = process.argv.slice(2);
if (argv[0] === '--emit') {
  const outDir = argv[1] || join(REPO, 'docs/examples/gir');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  let ok = 0, fail = 0;
  for (const [name, rel] of CURATED) {
    const src = join(REPO, 'docs/examples', rel, 'example.fungi');
    if (!existsSync(src)) { console.log(`  MISSING  ${name}  (${rel}/example.fungi)`); fail++; continue; }
    const r = genGir(src, `docs/examples/${rel}/example.fungi`);
    if (!r.ok) { console.log(`  FAIL     ${name}: ${r.errors.join('; ')}`); fail++; continue; }
    writeFileSync(join(outDir, `${name}.gir.json`), JSON.stringify(r.artifact, null, 2) + '\n', 'utf8');
    const f = r.artifact.flows?.[0];
    console.log(`  OK       ${name}.gir.json  (flow=${f?.name}, effects=${f?.effects?.declared?.length ?? 0}, proofs=${f?.proofs?.length ?? 0})`);
    ok++;
  }
  console.log(`\n${ok}/${ok + fail} emitted to ${outDir}`);
  process.exit(fail ? 1 : 0);
}

// default: self-test on one example
const testPath = join(REPO, 'docs/examples/Level-1-Basics/001-pure-flow/example.fungi');
const r = genGir(testPath, 'docs/examples/Level-1-Basics/001-pure-flow/example.fungi');
console.log(r.ok ? `OK — ${JSON.stringify(r.artifact).length} chars` : `FAIL: ${r.errors}`);
