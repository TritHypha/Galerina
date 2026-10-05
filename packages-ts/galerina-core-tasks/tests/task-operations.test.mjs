import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkTaskOperations,
  createDryRunPlan,
  parseTaskRunBlock,
  parseTasksSource,
  runTask,
  MAX_TASK_OPERATIONS,
  TASK_OPERATION_NAMES
} from "../dist/index.js";

const one = (source) => parseTasksSource(source)[0];

describe("run { } operations: parse and permission-check (no execution)", () => {
  it("parses README built-ins into typed operations with lines", () => {
    const task = one(`task copyPublicAssets {
  effects [filesystem]
  permissions {
    read "./public"
    write "./build/public"
  }
  run {
    // copy the static assets
    filesystem.copy("./public", "./build/public")
    filesystem.exists("./public/index.html")
  }
}`);
    assert.deepEqual(task.run.issues, []);
    assert.deepEqual(task.run.operations.map((op) => [op.name, op.args]), [
      ["filesystem.copy", ["./public", "./build/public"]],
      ["filesystem.exists", ["./public/index.html"]]
    ]);
    assert.ok(Object.isFrozen(task.run) && Object.isFrozen(task.run.operations[0]));
    assert.equal(checkTaskOperations(task), undefined);
  });

  it("keeps tasks without a run block unchanged", () => {
    const task = one(`task plain {
  effects [compiler]
}`);
    assert.equal("run" in task, false);
    assert.equal(checkTaskOperations(task), undefined);
  });

  it("admits compiler and reports built-ins when the effect is declared", () => {
    const task = one(`task buildApi {
  effects [filesystem, compiler, reports]
  permissions {
    read "./src"
    write "./build"
  }
  run {
    compiler.check()
    compiler.build()
    reports.generate()
  }
}`);
    assert.equal(checkTaskOperations(task), undefined);
  });

  it("refuses unknown operations, including raw shell", () => {
    for (const line of ['shell.exec("./deploy.sh")', "reports.generateSecurity()", "process.spawn()", "constructor.prototype()"]) {
      const task = one(`task t {
  effects [shell, reports]
  permissions {
    shell "./deploy.sh"
  }
  run {
    ${line}
  }
}`);
      const error = checkTaskOperations(task);
      assert.equal(error?.code, "Galerina_TASK_OPERATION_UNKNOWN", line);
      assert.match(error.suggestedFix, /Raw shell stays denied/);
    }
  });

  it("refuses non-call statements and malformed arguments", () => {
    for (const line of [
      "return Ok(TaskOk)",
      "compiler.build();",
      'filesystem.copy("./a" "./b")',
      'filesystem.copy("./a",)',
      "filesystem.remove(./build)",
      'filesystem.remove("a\\"b")',
      "if true {",
      'compiler.check(); shell.exec("rm")',
      "filesystem.remove('./build')"
    ]) {
      const run = parseTaskRunBlock(`\n  ${line}\n`);
      assert.equal(run.operations.length, 0, line);
      assert.equal(run.issues[0]?.code, "Galerina_TASK_OPERATION_SYNTAX_INVALID", line);
    }
  });

  it("never keeps raw line text in issues", () => {
    const run = parseTaskRunBlock('\n  echo "secret-token-123" > /etc/passwd\n  evil.op("secret-arg")\n');
    const text = JSON.stringify(run);
    assert.ok(!text.includes("secret-token-123") && !text.includes("secret-arg"));
    assert.deepEqual(run.issues.map((i) => [i.line, i.code, i.operation]), [
      [2, "Galerina_TASK_OPERATION_SYNTAX_INVALID", undefined],
      [3, "Galerina_TASK_OPERATION_UNKNOWN", "evil.op"]
    ]);
  });

  it("refuses duplicate run blocks and oversize run blocks", () => {
    const dup = one(`task t {
  effects [compiler]
  run {
    compiler.check()
  }
  run {
    compiler.build()
  }
}`);
    assert.equal(checkTaskOperations(dup)?.code, "Galerina_TASK_RUN_BLOCK_DUPLICATE");
    const many = parseTaskRunBlock(Array.from({ length: MAX_TASK_OPERATIONS + 1 }, () => "compiler.check()").join("\n"));
    assert.equal(many.operations.length, MAX_TASK_OPERATIONS);
    assert.equal(many.issues[0]?.code, "Galerina_TASK_OPERATION_LIMIT_EXCEEDED");
    const long = parseTaskRunBlock(`filesystem.remove("${"a".repeat(2000)}")`);
    assert.equal(long.issues[0]?.code, "Galerina_TASK_OPERATION_LIMIT_EXCEEDED");
  });

  it("requires the operation's effect to be declared", () => {
    const task = one(`task t {
  effects [reports]
  run {
    compiler.build()
  }
}`);
    const error = checkTaskOperations(task);
    assert.equal(error?.code, "Galerina_TASK_OPERATION_EFFECT_UNDECLARED");
    assert.equal(error.effect, "compiler");
  });

  it("refuses built-ins whose effect mapping is still undecided", () => {
    for (const name of ["schemas.generateJson", "openapi.generate", "tests.run"]) {
      assert.ok(TASK_OPERATION_NAMES.includes(name));
      const task = one(`task t {
  effects [filesystem, compiler, reports]
  run {
    ${name}()
  }
}`);
      assert.equal(checkTaskOperations(task)?.code, "Galerina_TASK_OPERATION_EFFECT_UNDECIDED", name);
    }
  });

  it("checks arity", () => {
    const task = one(`task t {
  effects [filesystem, compiler]
  permissions {
    write "./build"
  }
  run {
    compiler.check("--fast")
  }
}`);
    assert.equal(checkTaskOperations(task)?.code, "Galerina_TASK_OPERATION_ARGS_INVALID");
  });

  it("confines filesystem paths to declared read/write permissions", () => {
    const base = (runLine, perms = 'read "./public"\n    write "./build"') => one(`task t {
  effects [filesystem]
  permissions {
    ${perms}
  }
  run {
    ${runLine}
  }
}`);
    const cases = [
      ['filesystem.remove("./build/cache")', undefined],
      ['filesystem.remove("build")', undefined],
      ['filesystem.mkdir("./build/")', undefined],
      ['filesystem.remove("./buildx")', "Galerina_TASK_OPERATION_PERMISSION_DENIED"],
      ['filesystem.remove("./public")', "Galerina_TASK_OPERATION_PERMISSION_DENIED"],
      ['filesystem.copy("./build", "./public")', "Galerina_TASK_OPERATION_PERMISSION_DENIED"],
      ['filesystem.exists("./src")', "Galerina_TASK_OPERATION_PERMISSION_DENIED"],
      ['filesystem.exists("./build/out.txt")', undefined],
      ['filesystem.remove("./build/../src")', "Galerina_TASK_OPERATION_PATH_INVALID"],
      ['filesystem.remove("/etc")', "Galerina_TASK_OPERATION_PATH_INVALID"],
      ['filesystem.remove("C:/Windows")', "Galerina_TASK_OPERATION_PATH_INVALID"],
      ['filesystem.remove("./")', "Galerina_TASK_OPERATION_PATH_INVALID"],
      ['filesystem.remove("")', "Galerina_TASK_OPERATION_PATH_INVALID"],
      ['filesystem.remove("./build/./x")', "Galerina_TASK_OPERATION_PATH_INVALID"],
      ['filesystem.remove("build//x")', "Galerina_TASK_OPERATION_PATH_INVALID"]
    ];
    for (const [line, code] of cases) {
      assert.equal(checkTaskOperations(base(line))?.code, code, line);
    }
    const traversingScope = base('filesystem.remove("./x")', 'write "./build/../x"');
    assert.equal(checkTaskOperations(traversingScope)?.code, "Galerina_TASK_OPERATION_PERMISSION_DENIED");
  });

  it("runTask refuses a bad run block in dry-run and real mode, and never executes", async () => {
    const bad = one(`task t {
  effects [filesystem]
  permissions {
    write "./build"
  }
  run {
    filesystem.remove("./src")
  }
}`);
    for (const dryRun of [true, false]) {
      const result = await runTask(bad, { dryRun });
      assert.equal(result.status, "failed");
      assert.equal(result.error?.code, "Galerina_TASK_OPERATION_PERMISSION_DENIED");
      assert.equal(result.error?.internalDiagnostic, "run line 2: filesystem.remove argument 1");
    }
    const good = one(`task t {
  effects [filesystem]
  permissions {
    write "./build"
  }
  run {
    filesystem.remove("./build")
  }
}`);
    assert.equal((await runTask(good, { dryRun: true })).status, "dry-run");
    const real = await runTask(good);
    assert.equal(real.status, "skipped");
    assert.deepEqual(real.warnings, ["No operation handlers were supplied; nothing was executed."]);
    assert.deepEqual(createDryRunPlan(good).operations.map((op) => op.name), ["filesystem.remove"]);
  });

  it("permission checks still run first (shell denial wins)", async () => {
    const task = one(`task t {
  effects [shell]
  run {
    shell.exec("./x.sh")
  }
}`);
    assert.equal((await runTask(task, { dryRun: true })).error?.code, "Galerina_TASK_SHELL_DENIED");
  });
});
