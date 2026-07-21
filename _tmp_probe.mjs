import { join } from 'path';
import { readFileSync } from 'fs';
const ROOT = 'C:/Users/phill/Documents/GitHub/Galerina';
const DIST = 'file:///' + join(ROOT, 'packages-galerina/galerina-core-compiler/dist/index.js').replace(/\\/g, '/');
const L = await import(DIST);
const SH = join(ROOT, 'packages-galerina/galerina-core-compiler/src/self-hosted');
const strip = f => { let s = readFileSync(join(SH, f), 'utf8'); if (s.charCodeAt(0)===0xFEFF) s=s.slice(1); return s.replace(/^@version 1\s*/m,''); };

for (const [label, extra] of [
  ['parser', ''],
  ['gir-emitter', '\n' + strip('gir-emitter.fungi')],
]) {
  const body = label === 'parser'
    ? 'let p = parseFlows(toks) return p.flows.count()'
    : 'let p = parseFlows(toks) let g = emitGIRModule(p.flows) return g.pureCount';
  const driver = `pure flow r2probe(src: String) -> Int\ncontract { intent { "R2" } }\n{ let res = tokenize(src)\nmatch res { Ok(toks) => { ${body} } _ => { return -1 } } }`;
  const src = '@version 1\n' + strip('lexer.fungi') + '\n' + strip('parser.fungi') + extra + '\n' + driver;
  const prog = L.parseProgram(src, 'r2-' + label);
  const errs = (prog.diagnostics ?? []).filter(d => d.severity==='error');
  if (errs.length) { console.log(label, 'parse error:', errs[0].code + ':' + errs[0].message.slice(0,60)); continue; }
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, 'r2', prog.ast, true));
  const asm = await L.assembleWAT(wat);
  console.log(label, '-> valid:', asm.valid, asm.diagnostics.length > 0 ? 'diag: ' + asm.diagnostics[0]?.message?.slice(0,250) : '');
}
