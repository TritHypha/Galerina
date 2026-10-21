// S2 (X-H1, X-N1, X-DUP): unique build names per suite, mandatory runner arity guard,
// import-composed run equals the flattened run, duplicate flow names never resolve silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { MEM, SRC, red, flatten, withUnit, invoke } from "./harness.mjs";

function testFiles() {
  const out = [];
  const root = join(MEM, "tests");
  for (const d of readdirSync(root)) {
    const p = join(root, d);
    if (statSync(p).isDirectory() === false || d.startsWith("48-")) continue;
    for (const f of readdirSync(p)) {
      if (f.endsWith(".mjs")) out.push(join(p, f));
    }
  }
  return out;
}

test("S2 H1: no suite builds a fixed shared file name (flat.fungi) that collides on rerun in the same checkout", red("S2", "X-H1 unique build names per suite"), () => {
  const hits = [];
  for (const f of testFiles()) {
    if (/["']flat\.fungi["']/.test(readFileSync(f, "utf8"))) hits.push(basename(join(f, "..")) + "/" + basename(f));
  }
  assert.deepEqual(hits, [], "fixed build names: " + hits.join(" "));
});

test("S2 N1: run --invoke with too few arguments refuses (no value from defaulted args)", red("S2", "X-N1 mandatory runner arity guard"), () => {
  withUnit(flatten(["c-boundary"]), (f) => {
    const none = invoke(f, "readForeignBool", []);
    assert.notEqual(none.status, 0, "0-arg call must refuse, got value " + none.value);
    const short = invoke(f, "readForeignSafeInteger", [0]);
    assert.notEqual(short.status, 0, "1-of-2-arg call must refuse, got value " + short.value);
  });
});

test("S2 N1: run --invoke with too many arguments refuses", red("S2", "X-N1 mandatory runner arity guard"), () => {
  withUnit(flatten(["c-boundary"]), (f) => {
    const extra = invoke(f, "readForeignBool", [1, 2, 3]);
    assert.notEqual(extra.status, 0, "3-arg call to a 1-arg flow must refuse, got value " + extra.value);
  });
});

test("S2 X-DUP: import-composed run of a flow that calls an imported helper equals the flattened run", red("S2", "X-DUP import-composed equals flattened"), () => {
  const args = [0, 100, 1, 0, 0, 0];
  const flat = withUnit(flatten(["c-boundary", "monotonic-time"]), (f) => invoke(f, "mintFromClock", args));
  assert.equal(flat.status, 0, "flattened run must succeed");
  assert.equal(flat.value, 0, "flattened control value");
  const composed = invoke(join(SRC, "monotonic-time.fungi"), "mintFromClock", args, MEM);
  assert.equal(composed.status, 0, "import-composed run must succeed: " + composed.text.slice(-300));
  assert.equal(composed.value, flat.value, "composed value must equal flattened value");
});

test("S2 X-DUP: two imported units defining the same flow name refuse with a named diagnostic", red("S2", "X-DUP duplicate flow names in the import-composed program"), () => {
  const unit = (v) => "@version 1\npure flow dupName(x: Int) -> Int\ncontract {\n  intent { \"dup " + v + "\" }\n}\n{\n  return " + v + "\n}\n";
  withUnit(unit(1), (fa, dir) => {
    writeFileSync(join(dir, "dupb.fungi"), unit(2));
    const main = join(dir, "dupmain.fungi");
    writeFileSync(main, "@version 1\nimport \"./" + basename(fa) + "\"\nimport \"./dupb.fungi\"\npure flow pick(x: Int) -> Int\ncontract {\n  intent { \"pick\" }\n}\n{\n  return dupName(x)\n}\n");
    const r = invoke(main, "pick", [0]);
    const refused = r.status !== 0 && /FUNGI-[A-Z]+-\d{3}/.test(r.text) && /dup|duplicate|ambiguous/i.test(r.text);
    assert.equal(refused, true, "duplicate flow name must refuse; got status " + r.status + " value " + r.value);
  });
});