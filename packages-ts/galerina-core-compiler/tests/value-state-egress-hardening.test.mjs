/**
 * Egress-guard hardening — regression tests for the fail-open holes found by the
 * 2026-06-16 adversarial audit of FUNGI-SECRET-006 / FUNGI-PRIVACY-004. Each was empirically
 * confirmed to leak (no diagnostic) before the fix; all must now be caught. The holes
 * affected the propagation graph (assignStmt, record-spread, string interpolation), the
 * sink set (response.body / ai.remoteInference / vector-store), the embedding recognizer
 * (instance receivers), and cross-flow propagation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes, checkValueStates } from "../dist/index.js";

const wrap = (body) => `secure flow f(req: Request) -> Int
contract { effects { ai.inference  network.outbound } secrets { credential k { provider "vault" } } }
{
${body}
  return 0
}`;
const chk = (src) => checkValueStates(parseProgram(src, "test.fungi").ast);
const has = (r, code) => r.diagnostics.some((d) => d.code === code);
const codes = (r) => r.diagnostics.map((d) => d.code).join(", ");

// FUNGI-VALUESTATE-011 — declassifier-name shadowing (CWE-501 fail-closed floor, R&D 0200).
// The privacy declassifier is matched by call-name, so a user flow named redact/seal/encrypt would be
// accepted as a valid discharge and could launder protected data past the gate (main confirmed-live,
// bridge 0197). The floor rejects the SHADOW at its DEFINITION. NON-VACUOUS: fires on each declassifier
// name + the actual laundering program; silent on a near-miss name and a clean program.
describe("declassifier-name shadowing — FUNGI-VALUESTATE-011 (CWE-501 floor)", () => {
  const shadowDecl = (name) => `pure flow ${name}(x: protected String) -> protected String\ncontract { intent { "a no-op that only shares the declassifier's name" } }\n{\n  return x\n}`;
  for (const name of ["redact", "seal", "encrypt"]) {
    it(`★ a user flow named '${name}' shadowing the declassifier → FUNGI-VALUESTATE-011`, () => {
      assert.ok(has(chk(shadowDecl(name)), "FUNGI-VALUESTATE-011"), codes(chk(shadowDecl(name))));
    });
  }
  it("★ the laundering program (no-op user redact + protected value at a sink via redact()) → VALUESTATE-011 (bypass closed)", () => {
    const src = `pure flow redact(x: protected String) -> protected String\ncontract { intent { "no-op" } }\n{\n  return x\n}\nsecure flow leak(msg: protected String) -> Int\ncontract { intent { "leak test" } effects { audit.write } }\n{\n  AuditLog.write({ addr: redact(msg) })\n  return 0\n}`;
    assert.ok(has(chk(src), "FUNGI-VALUESTATE-011"), codes(chk(src)));
  });
  it("a name that merely CONTAINS a declassifier word ('redactValue') does NOT fire — no false positive", () => {
    assert.ok(!has(chk(`pure flow redactValue(x: Int) -> Int\ncontract { intent { "ok" } }\n{\n  return x\n}`), "FUNGI-VALUESTATE-011"));
  });
  it("a clean program with no shadow does NOT fire", () => {
    assert.ok(!has(chk(`pure flow add(a: Int, b: Int) -> Int\ncontract { intent { "add" } }\n{\n  return a\n}`), "FUNGI-VALUESTATE-011"));
  });

  it("a readonly lexical redact binding is not mistaken for the compiler intrinsic", () => {
    const r = chk(wrap('  readonly redact = Fake\n  let kk = secret.get("api")\n  let copied = redact(kk)\n  let x = http.post("u", copied)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
});

describe("protected network egress requires an authenticated seal", () => {
  const protectedEgress = (wrapper) => `secure flow f() -> Int
contract { effects { network.outbound } }
{
  let msg: protected String = "synthetic"
  let response = http.post("u", ${wrapper}(msg))
  return 0
}`;

  it("generic encrypt does not discharge protected network egress", () => {
    const r = chk(protectedEgress("encrypt"));
    assert.ok(has(r, "FUNGI-VALUESTATE-009"), codes(r));
  });

  it("the authenticated seal control remains permitted", () => {
    const r = chk(protectedEgress("seal"));
    assert.ok(!has(r, "FUNGI-VALUESTATE-009"), codes(r));
  });
});

describe("secret logging checks the value crossing the sink", () => {
  const probe = (body) => `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Int {
${body}
  return 0
}`;

  it("does not reject a public match result because its arm declares a local", () => {
    const parsed = parseProgram(probe(`  print(match flag { _ => {
    let local = 0
    local
  } })`), "public-match-local-at-print.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));
  });

  it("does not reject a public match result because its arm executes a for-each", () => {
    const parsed = parseProgram(probe(`  print(match flag { _ => {
    for item in [1] {}
    0
  } })`), "public-match-loop-at-print.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));
  });

  it("rejects a direct secret accessor passed to print without an intermediate binding", () => {
    const parsed = parseProgram(probe('  print(Env.get("k"))'), "direct-secret-source-at-print.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));
  });

  it("retains secret writes through a nested match in a directly logged match result", () => {
    const source = probe(`  print(match flag { _ => {
    mut local = false
    match flag { _ => { local = key } }
    local
  } })`);
    const parsed = parseProgram(source, "nested-match-secret-write-at-print.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("local = key", "local = true"), "nested-match-public-write-at-print.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("retains secret writes through a nested match when its result is bound first", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match flag { _ => { local = key } }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "nested-match-secret-write-bound.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("local = key", "local = true"), "nested-match-public-write-bound.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("taints a later arm write after a failed secret guard, but not a public guard", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match flag { when !key => {} _ => { local = true } }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "failed-secret-guard-fallthrough.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("when !key", "when !flag"), "public-guard-fallthrough.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("preserves secret dependence when only a secret-selected match arm terminates", () => {
    const source = probe(`  print(match flag { _ => {
    mut local = false
    match flag { when !key => { return 0 } _ => {} }
    local
  } })`);
    const parsed = parseProgram(source, "secret-selected-termination.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("when !key", "when !flag"), "public-selected-termination.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("propagates assignments performed while evaluating a match guard", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match flag { when (match flag { _ => { local = key
    flag } }) => {} _ => {} }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "guard-side-effect-secret-write.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("local = key", "local = true"), "guard-side-effect-public-write.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("retains guard writes on a continuing fallback after a different guard arm returns", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match flag {
      when (match flag { _ => {
        local = key
        flag
      } }) => { return 0 }
      _ => {}
    }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "guard-write-survives-fallback.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("local = key", "local = true"), "public-guard-write-survives-fallback.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("propagates secret writes performed while evaluating a match subject", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match (match flag { _ => {
      local = key
      flag
    } }) { _ => {} }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "match-subject-side-effect-secret-write.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("local = key", "local = true"), "match-subject-side-effect-public-write.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("does not analyze a guard body after evaluating that guard terminates", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match flag {
      when flag => {}
      when (match flag { _ => { return 0 } }) => { local = key }
      _ => { local = key }
    }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "terminating-match-guard-unreachable-body.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));
  });

  it("does not treat an unused secret match subject as controlling a public guard", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match key { when flag => { local = true } _ => {} }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "public-guard-secret-subject.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));
  });

  it("preserves an outer subject write when a same-named pattern binder shadows it", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match (match flag { _ => {
      local = key
      Some(flag)
    } }) {
      Some(local) => {}
      _ => { return 0 }
    }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "match-pattern-shadow-preserves-outer-secret.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("local = key", "local = true"), "match-pattern-shadow-public-control.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("does not invent a fallthrough after every guard path terminates", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match flag {
      when (match flag { _ => { return 0 } }) => {}
      _ => {}
    }
    local = key
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "terminating-guard-has-no-fallthrough.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));
  });

  it("propagates nested match writes from declaration, assignment and condition expressions", () => {
    const expressionContexts = [
      ["declaration initializer", (write) => `let ignored = match flag { _ => { ${write}; flag } }`],
      ["assignment RHS", (write) => `mut ignored = false\n    ignored = match flag { _ => { ${write}; flag } }`],
      ["if condition", (write) => `if (match flag { _ => { ${write}; flag } }) {}`],
    ];

    for (const [context, makeExpression] of expressionContexts) {
      for (const direct of [false, true]) {
        const result = direct
          ? `print(match flag { _ => {\n    mut local = false\n    ${makeExpression("local = key")}\n    local\n  } })`
          : `let result = match flag { _ => {\n    mut local = false\n    ${makeExpression("local = key")}\n    local\n  } }\n  print(result)`;
        const publicControl = result.replace("local = key", "local = true");
        const secretSource = probe(`  ${result}`);
        const publicSource = probe(`  ${publicControl}`);
        for (const [source, shouldReject, label] of [
          [secretSource, true, "secret write"],
          [publicSource, false, "public control"],
        ]) {
          const parsed = parseProgram(source, `nested-match-${context}-${direct ? "direct" : "bound"}-${label}.fungi`);
          assert.deepEqual(parsed.diagnostics, [], `${context}, ${label}: parse`);
          assert.deepEqual(checkTypes(parsed.ast).diagnostics, [], `${context}, ${label}: type`);
          const diagnostics = checkValueStates(parsed.ast);
          assert.equal(has(diagnostics, "FUNGI-SECRET-001"), shouldReject,
            `${context}, ${direct ? "direct" : "bound"}, ${label}: ${codes(diagnostics)}`);
        }
      }
    }
  });

  it("does not retroactively mark an earlier public write as secret-controlled by a later pattern", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    match (match flag { _ => { local = true; key } }) {
      "x" => {}
      _ => {}
    }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "public-write-before-secret-pattern.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast);
    assert.ok(!has(diagnostics, "FUNGI-SECRET-001"), codes(diagnostics));
  });

  it("preserves a secret value read before a later expression overwrites its source", () => {
    const declarationSource = probe(`  let result = match flag { _ => {
    mut local = key
    let copied = [local, match flag { _ => { local = "x"; "x" } }]
    copied
  } }
  print(result)`);
    const assignmentSource = declarationSource.replace(
      'let copied = [local, match flag',
      'mut copied = [local]\n    copied = [local, match flag',
    );
    for (const [source, name] of [
      [declarationSource, "declaration"],
      [assignmentSource, "assignment"],
    ]) {
      const parsed = parseProgram(source, `match-list-${name}-read-before-overwrite.fungi`);
      assert.deepEqual(parsed.diagnostics, [], `${name}: parse`);
      assert.deepEqual(checkTypes(parsed.ast).diagnostics, [], `${name}: type`);
      assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), `${name}: ${codes(checkValueStates(parsed.ast))}`);

      const publicControl = parseProgram(source.replace("mut local = key", 'mut local = "public"'),
        `match-list-${name}-public-read-before-overwrite.fungi`);
      assert.deepEqual(publicControl.diagnostics, [], `${name} public: parse`);
      assert.deepEqual(checkTypes(publicControl.ast).diagnostics, [], `${name} public: type`);
      assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"),
        `${name} public: ${codes(checkValueStates(publicControl.ast))}`);
    }
  });

  it("captures a secret written and then read during the same match expression", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = "public"
    let copied = [match flag { _ => { local = key; "x" } }, local]
    copied
  } }
  print(result)`);
    const parsed = parseProgram(source, "match-write-before-read.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("local = key", 'local = "x"'), "match-write-before-read-public.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("transfers nested-match writes from loop conditions and discarded call arguments", () => {
    const statementForms = [
      ["loop condition", (write) => `while (match flag { _ => { ${write}; flag } }) { return 0 }`],
      ["discarded call argument", (write) => `print(match flag { _ => { ${write}; flag } })`],
    ];
    for (const [label, makeStatement] of statementForms) {
      for (const value of ["key", "true"]) {
        const source = probe(`  let result = match flag { _ => {\n    mut local = false\n    ${makeStatement(`local = ${value}`)}\n    local\n  } }\n  print(result)`);
        const parsed = parseProgram(source, `match-${label}-${value === "key" ? "secret" : "public"}.fungi`);
        assert.deepEqual(parsed.diagnostics, [], `${label}: parse`);
        assert.deepEqual(checkTypes(parsed.ast).diagnostics, [], `${label}: type`);
        const diagnostics = checkValueStates(parsed.ast);
        assert.equal(has(diagnostics, "FUNGI-SECRET-001"), value === "key",
          `${label}, ${value}: ${codes(diagnostics)}`);
      }
    }
  });

  it("uses the final loop-condition writes for normal loop exit", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = key
    while (match flag { _ => { local = "public"; flag } }) {}
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "loop-condition-overwrites-secret-before-exit.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast);
    assert.ok(!has(diagnostics, "FUNGI-SECRET-001"), codes(diagnostics));
  });

  it("retains secret-dependent continuation when only one match arm terminates", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    let ignored = match flag {
      when !key => { return 0 }
      _ => { flag }
    }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "match-initializer-secret-terminal-continuation.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("!key", "!flag"), "match-initializer-public-terminal-continuation.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("propagates secret-dependent continuation through a nested match used as a guard", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    let ignored = match flag {
      when (match flag { _ => { if !key { return 0 } else { flag } } }) => {}
      _ => {}
    }
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "nested-guard-secret-terminal.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const publicControl = parseProgram(source.replace("!key", "!flag"), "nested-guard-public-terminal.fungi");
    assert.deepEqual(publicControl.diagnostics, []);
    assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
  });

  it("keeps authorized redaction public when its argument is secret", () => {
    const source = probe(`  let result = match flag { _ => {
    let clean = redact(key)
    clean
  } }
  print(result)`);
    const parsed = parseProgram(source, "match-redact-remains-public.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));
  });

  it("joins a feasible skipped path for a nonliteral short-circuit condition", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    let ignored = flag && (match flag { _ => { local = key; flag } })
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "dynamic-short-circuit-secret-write.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    assert.ok(has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));

    const terminalSource = probe(`  let result = match flag { _ => {
    mut local = false
    let ignored = flag && (match flag { _ => { return 0 } })
    local
  } }
  print(result)`);
    const terminal = parseProgram(terminalSource, "dynamic-short-circuit-terminal-rhs.fungi");
    assert.deepEqual(terminal.diagnostics, []);
    assert.deepEqual(checkTypes(terminal.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(terminal.ast), "FUNGI-SECRET-001"), codes(checkValueStates(terminal.ast)));

    const alwaysEvaluatedSource = probe(`  let result = match flag { _ => {
    mut local = key
    let ignored = true && (match flag { _ => { local = "public"; flag } })
    local
  } }
  print(result)`);
    const alwaysEvaluated = parseProgram(alwaysEvaluatedSource, "literal-short-circuit-always-runs-rhs.fungi");
    assert.deepEqual(alwaysEvaluated.diagnostics, []);
    assert.deepEqual(checkTypes(alwaysEvaluated.ast).diagnostics, []);
    assert.ok(!has(checkValueStates(alwaysEvaluated.ast), "FUNGI-SECRET-001"),
      codes(checkValueStates(alwaysEvaluated.ast)));

    const feasibleSkipSource = probe(`  let result = match flag { _ => {
    mut local = key
    let ignored = flag && (match flag { _ => { local = "public"; flag } })
    local
  } }
  print(result)`);
    const feasibleSkip = parseProgram(feasibleSkipSource, "dynamic-short-circuit-retains-skipped-secret.fungi");
    assert.deepEqual(feasibleSkip.diagnostics, []);
    assert.deepEqual(checkTypes(feasibleSkip.ast).diagnostics, []);
    assert.ok(has(checkValueStates(feasibleSkip.ast), "FUNGI-SECRET-001"),
      codes(checkValueStates(feasibleSkip.ast)));
  });

  it("carries secrecy accumulated by a nested logical LHS into RHS write control", () => {
    for (const operator of ["&&", "||"]) {
      const sourceFor = (assigned) => probe(`  let result = match flag { _ => {
    mut local = false
    mut leaked = false
    let ignored = ((match flag { _ => { local = ${assigned}
      flag
    } }) && !local) ${operator} (match flag { _ => {
      leaked = true
      flag
    } })
    leaked
  } }
  print(result)`);
      const secret = parseProgram(sourceFor("key"), `nested-logical-lhs-secret-${operator}.fungi`);
      assert.deepEqual(secret.diagnostics, []);
      assert.deepEqual(checkTypes(secret.ast).diagnostics, []);
      assert.ok(has(checkValueStates(secret.ast), "FUNGI-SECRET-001"), codes(checkValueStates(secret.ast)));

      const publicControl = parseProgram(sourceFor("flag"), `nested-logical-lhs-public-${operator}.fungi`);
      assert.deepEqual(publicControl.diagnostics, []);
      assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
      assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
    }
  });

  it("does not retroactively taint a Boolean saved before a later RHS secret write", () => {
    for (const operator of ["&&", "||"]) {
      const sourceFor = (assigned) => probe(`  let result = match flag { _ => {
    mut local = false
    let derived = flag ${operator} (match flag { _ => {
      let saved = local
      local = ${assigned}
      saved
    } })
    derived
  } }
  print(result)`);
      const publicRead = parseProgram(sourceFor("key"), `rhs-snapshot-before-write-${operator}.fungi`);
      assert.deepEqual(publicRead.diagnostics, []);
      assert.deepEqual(checkTypes(publicRead.ast).diagnostics, []);
      assert.ok(!has(checkValueStates(publicRead.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicRead.ast)));

      const publicTwin = parseProgram(sourceFor("flag"), `rhs-public-control-${operator}.fungi`);
      assert.deepEqual(publicTwin.diagnostics, []);
      assert.deepEqual(checkTypes(publicTwin.ast).diagnostics, []);
      assert.ok(!has(checkValueStates(publicTwin.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicTwin.ast)));
    }
  });

  it("retains secret-dependent continuation when the logical RHS can return or continue", () => {
    for (const operator of ["&&", "||"]) {
      const sourceFor = (assigned) => `@version 1
secure flow probe(key: SecureString, flag: Bool, other: Bool) -> Int {
  let result = match flag { _ => {
    mut local = false
    let ignored = ((match flag { _ => {
      local = ${assigned}
      flag
    } }) && !local) ${operator} (match flag { _ => {
      if other { return 0 }
      flag
    } })
    flag
  } }
  print(result)
  return 0
}`;
      const secret = parseProgram(sourceFor("key"), `nested-logical-partial-return-secret-${operator}.fungi`);
      assert.deepEqual(secret.diagnostics, []);
      assert.deepEqual(checkTypes(secret.ast).diagnostics, []);
      assert.ok(has(checkValueStates(secret.ast), "FUNGI-SECRET-001"), codes(checkValueStates(secret.ast)));

      const publicControl = parseProgram(sourceFor("flag"), `nested-logical-partial-return-public-${operator}.fungi`);
      assert.deepEqual(publicControl.diagnostics, []);
      assert.deepEqual(checkTypes(publicControl.ast).diagnostics, []);
      assert.ok(!has(checkValueStates(publicControl.ast), "FUNGI-SECRET-001"), codes(checkValueStates(publicControl.ast)));
    }
  });

  it("does not treat statically unreachable returns as secret-controlled short-circuit exits", () => {
    const unreachableReturns = [
      "if false { return 0 }",
      "if true {} else { return 0 }",
      "while false { return 0 }",
    ];
    for (const operator of ["&&", "||"]) {
      for (const assigned of ["key", "flag"]) {
        for (const unreachable of unreachableReturns) {
          const source = `@version 1
secure flow probe(key: SecureString, flag: Bool, other: Bool) -> Int {
  let result = match flag { _ => {
    let ignored = !${assigned} ${operator} (match flag { _ => {
      ${unreachable}
      flag
    } })
    flag
  } }
  print(result)
  return 0
}`;
          const parsed = parseProgram(source, `unreachable-return-short-circuit-${operator}-${assigned}.fungi`);
          assert.deepEqual(parsed.diagnostics, []);
          assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
          assert.ok(!has(checkValueStates(parsed.ast), "FUNGI-SECRET-001"), codes(checkValueStates(parsed.ast)));
        }
      }
    }
  });

  it("does not transfer effects from a short-circuited Boolean operand", () => {
    const source = probe(`  let result = match flag { _ => {
    mut local = false
    let ignored = false && (match flag { _ => { local = key; flag } })
    local
  } }
  print(result)`);
    const parsed = parseProgram(source, "match-short-circuit-skips-effects.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast);
    assert.ok(!has(diagnostics, "FUNGI-SECRET-001"), codes(diagnostics));

    const directSink = parseProgram(probe(`  mut local = false
  print(false && (match flag { _ => { local = key; flag } }))
  print(local)`), "short-circuit-secret-rhs-direct-sink.fungi");
    assert.deepEqual(directSink.diagnostics, []);
    assert.deepEqual(checkTypes(directSink.ast).diagnostics, []);
    const directDiagnostics = checkValueStates(directSink.ast);
    assert.ok(!has(directDiagnostics, "FUNGI-SECRET-001"), codes(directDiagnostics));

    const skippedSecretEffects = parseProgram(probe(`  mut local = false
  print(false && (match flag { _ => { print(key); local = key; flag } }))
  print(local)
  print(true || (match flag { _ => { print(key); local = key; flag } }))
  print(local)`), "short-circuit-secret-rhs-skips-effects.fungi");
    assert.deepEqual(skippedSecretEffects.diagnostics, []);
    assert.deepEqual(checkTypes(skippedSecretEffects.ast).diagnostics, []);
    const skippedDiagnostics = checkValueStates(skippedSecretEffects.ast);
    assert.ok(!has(skippedDiagnostics, "FUNGI-SECRET-001"), codes(skippedDiagnostics));
  });
});

describe("egress hardening — A1 bare assignment (assignStmt) re-derives flags", () => {
  it("a secret assigned into a mut binding then egressed → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  mut s = "x"\n  let kk = secret.get("api")\n  s = kk\n  let x = http.post("u", s)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("an embedding assigned into a mut binding then egressed → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  mut s = "x"\n  let e = EmbeddingModel.run(req)\n  s = e\n  let x = http.post("u", s)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
  it("reassigning a secret binding to redact(...) clears it → clean", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  mut s = kk\n  s = redact(kk)\n  let x = http.post("u", s)'));
    assert.ok(!has(r, "FUNGI-SECRET-005"), codes(r));
  });
});

describe("egress hardening — H3 safelist inversion (unknown receiver ⇒ deny-by-default)", () => {
  it("a raw secret to an UNKNOWN egress service (in no denylist) → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = AcmeCloudThing.upload(kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("a raw secret to another unlisted service via .submit → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = WeirdSink.submit(kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("a raw secret to an ON-HOST secret-safe primitive (vault.store) is exempt → clean", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = vault.store(kk)'));
    assert.ok(!has(r, "FUNGI-SECRET-005"), codes(r));
  });
});

describe("egress hardening — A2 record spread/update keeps the flag", () => {
  it("a secret in a { ...base, tok } spread → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let base = mkRec()\n  let kk = secret.get("api")\n  let rec = { ...base, tok: kk }\n  let x = http.post("u", rec)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("an embedding in a { ...base, v } spread → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let base = mkRec()\n  let e = EmbeddingModel.run(req)\n  let rec = { ...base, v: e }\n  let x = http.post("u", rec)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — A3 string interpolation keeps the flag", () => {
  it('a secret in `"...${k}..."` → FUNGI-SECRET-005', () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let msg = "Authorization: ${kk}"\n  let x = http.post("u", msg)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it('an embedding in `"...${e}..."` → FUNGI-PRIVACY-002', () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let msg = "vec=${e}"\n  let x = http.post("u", msg)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — A5 sink coverage (response.body / remote inference / vector store)", () => {
  it("a secret to response.body → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = response.body(kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("an embedding to ai.remoteInference → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let x = ai.remoteInference(e)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
  it("an embedding to VectorDB.write → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let x = VectorDB.write(e)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — A6 instance-receiver embedding recognizer", () => {
  it("a lowercase embeddingModel.run(...) → FUNGI-PRIVACY-002 (egress arm keeps the code)", () => {
    const r = chk(wrap('  let e = embeddingModel.run(req)\n  let x = http.post("u", e)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — A4 cross-flow propagation surfaces a warning", () => {
  const SRC = (rhs) => `secure flow egress(v: String) -> Int
contract { effects { network.outbound } }
{
  let r = http.post("u", v)
  return 0
}
secure flow caller(req: Request) -> Int
contract { effects { ai.inference  network.outbound } secrets { credential k { provider "vault" } } }
{
${rhs}
  return 0
}`;
  it("a secret passed to a user flow → FUNGI-SECRET-006 (warning)", () => {
    const r = chk(SRC('  let kk = secret.get("api")\n  let z = egress(kk)'));
    const d = r.diagnostics.find((x) => x.code === "FUNGI-SECRET-006");
    assert.ok(d && d.severity === "warning", codes(r));
  });
  it("an embedding passed to a user flow → FUNGI-PRIVACY-004 (warning)", () => {
    const r = chk(SRC('  let e = EmbeddingModel.run(req)\n  let z = egress(e)'));
    const d = r.diagnostics.find((x) => x.code === "FUNGI-PRIVACY-004");
    assert.ok(d && d.severity === "warning", codes(r));
  });
});

// RD-0124 NOW-2: in PRODUCTION the cross-flow secret/embedding handoff fails CLOSED (error), not just a
// warning — an unsealed secret crossing an inter-procedurally-unverified flow boundary must not ship.
describe("egress hardening — A4 cross-flow FAILS CLOSED in production (RD-0124 NOW-2)", () => {
  const SRC = (rhs) => `secure flow egress(v: String) -> Int
contract { effects { network.outbound } }
{
  let r = http.post("u", v)
  return 0
}
secure flow caller(req: Request) -> Int
contract { effects { ai.inference  network.outbound } secrets { credential k { provider "vault" } } }
{
${rhs}
  return 0
}`;
  const chkProd = (src) => checkValueStates(parseProgram(src, "test.fungi").ast, "production");
  it("a secret crossing a flow boundary → FUNGI-SECRET-006 ERROR in production", () => {
    const r = chkProd(SRC('  let kk = secret.get("api")\n  let z = egress(kk)'));
    const d = r.diagnostics.find((x) => x.code === "FUNGI-SECRET-006");
    assert.ok(d && d.severity === "error", codes(r));
  });
  it("an embedding crossing a flow boundary → FUNGI-PRIVACY-004 ERROR in production", () => {
    const r = chkProd(SRC('  let e = EmbeddingModel.run(req)\n  let z = egress(e)'));
    const d = r.diagnostics.find((x) => x.code === "FUNGI-PRIVACY-004");
    assert.ok(d && d.severity === "error", codes(r));
  });
});

// ── Container read-back: store in a record/array, read an element back, then egress ──
// The adversarial review flagged this as a possible gap; the propagation (container binding is
// tagged; member/index access carries the flag to the new binding) actually closes it. Locked in.
describe("egress hardening — container read-back is tracked", () => {
  it("secret stored in a record then read back via field → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let rec = { tok: kk }\n  let x = rec.tok\n  let y = http.post("u", x)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("secret stored in an array then read back via index → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let arr = [kk]\n  let x = arr[0]\n  let y = http.post("u", x)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("embedding stored in an array then read back via index → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let arr = [e]\n  let x = arr[0]\n  let y = http.post("u", x)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — no false positives", () => {
  it("seal()-ed embedding stays clean", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let s = seal(e)\n  let x = http.post("u", s)'));
    assert.ok(!has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
  it("an unrelated receiver's seal method does not discharge a protected network value", () => {
    const src = `secure flow leak(msg: protected String) -> Int\ncontract { effects { network.outbound } }\n{\n  let x = http.post("u", Fake.seal(msg))\n  return 0\n}`;
    assert.ok(has(chk(src), "FUNGI-VALUESTATE-009"), codes(chk(src)));
  });
  it("a local seal binding does not discharge a protected network value", () => {
    const src = `secure flow leak(msg: protected String) -> Int\ncontract { effects { network.outbound } }\n{\n  let seal = msg\n  let x = http.post("u", seal(msg))\n  return 0\n}`;
    assert.ok(has(chk(src), "FUNGI-VALUESTATE-009"), codes(chk(src)));
  });
  it("a derived non-secret value stays clean", () => {
    const r = chk(wrap('  let a = build(1)\n  let b = a.slice(0,2)\n  let x = http.post("u", b)'));
    assert.ok(!has(r, "FUNGI-SECRET-005"), codes(r));
  });
});

describe("egress hardening — VSC-003 memberExpr receivers don't bypass the recognizers", () => {
  it("secret to a memberExpr network sink (client.http.post) → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = client.http.post("u", kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("secret via a memberExpr source (ctx.secrets.get) then egressed → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = ctx.secrets.get("api")\n  let x = http.post("u", kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("embedding to a memberExpr sink (client.http.post) → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let x = client.http.post("u", e)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});
