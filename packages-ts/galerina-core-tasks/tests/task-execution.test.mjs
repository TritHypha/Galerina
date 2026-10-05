import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_TASK_TIMEOUT_MS,
  MAX_TASK_TIMEOUT_MS,
  executeTaskOperations,
  parseTasksSource,
  resolveTaskTimeoutMs,
  runTask
} from "../dist/index.js";

// Run-block line numbers count from the line holding `run {`, so the first operation is line 2.
const one = (source) => parseTasksSource(source)[0];

const COPY_TASK = `task copyPublicAssets {
  effects [filesystem]
  permissions {
    read "./public"
    write "./build/public"
  }
  run {
    filesystem.mkdir("./build/public/")
    filesystem.copy("./public", "./build/public")
    filesystem.exists("./build/public/index.html")
  }
}`;

function recorder(names, behaviour = {}) {
  const calls = [];
  const handlers = {};
  for (const name of names) {
    handlers[name] = async (invocation) => {
      calls.push(invocation);
      if (behaviour[name]) await behaviour[name](invocation);
    };
  }
  return { calls, handlers };
}

const FS = ["filesystem.mkdir", "filesystem.copy", "filesystem.exists", "filesystem.remove"];

describe("run { } execution through host handlers (zero-trust defaults)", () => {
  it("without handlers nothing runs and the task is skipped", async () => {
    const result = await runTask(one(COPY_TASK));
    assert.equal(result.status, "skipped");
    assert.match(result.warnings[0], /No operation handlers/);
  });

  it("runs every operation in declared order with normalised paths, then passes", async () => {
    const { calls, handlers } = recorder(FS);
    let tick = 100;
    const result = await runTask(one(COPY_TASK), { handlers, now: () => (tick += 5) });
    assert.equal(result.status, "passed");
    assert.equal(result.operationsCompleted, 3);
    assert.equal(result.error, undefined);
    assert.equal(result.durationMs, 5);
    assert.deepEqual(calls.map((c) => [c.name, c.args, c.line]), [
      ["filesystem.mkdir", ["build/public"], 2],
      ["filesystem.copy", ["public", "build/public"], 3],
      ["filesystem.exists", ["build/public/index.html"], 4]
    ]);
    for (const call of calls) {
      assert.equal(call.task, "copyPublicAssets");
      assert.ok(Object.isFrozen(call) && Object.isFrozen(call.args));
      assert.equal(call.signal.aborted, false);
    }
  });

  it("dry-run never calls a handler", async () => {
    const { calls, handlers } = recorder(FS);
    const result = await runTask(one(COPY_TASK), { dryRun: true, handlers });
    assert.equal(result.status, "dry-run");
    assert.equal(calls.length, 0);
  });

  it("a refused task never calls a handler (permission and operation checks run first)", async () => {
    const { calls, handlers } = recorder(FS);
    const outside = one(`task escape {
  effects [filesystem]
  permissions {
    write "./build"
  }
  run {
    filesystem.remove("./src")
  }
}`);
    const result = await runTask(outside, { handlers });
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "Galerina_TASK_OPERATION_PERMISSION_DENIED");
    assert.equal(calls.length, 0);

    const shell = one(`task sh {
  effects [shell]
  run {
    filesystem.exists("./x")
  }
}`);
    const shellResult = await runTask(shell, { handlers });
    assert.equal(shellResult.error.code, "Galerina_TASK_SHELL_DENIED");
    assert.equal(calls.length, 0);
  });

  it("a missing handler refuses the whole task before any operation runs", async () => {
    const { calls, handlers } = recorder(["filesystem.mkdir", "filesystem.copy"]);
    const result = await runTask(one(COPY_TASK), { handlers });
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "Galerina_TASK_OPERATION_HANDLER_MISSING");
    assert.equal(result.error.internalDiagnostic, "run line 4: filesystem.exists");
    assert.equal(result.operationsCompleted, 0);
    assert.equal(calls.length, 0);
  });

  it("inherited or non-function handlers do not count", async () => {
    const proto = recorder(FS);
    const inherited = Object.create(proto.handlers);
    const r1 = await runTask(one(COPY_TASK), { handlers: inherited });
    assert.equal(r1.error.code, "Galerina_TASK_OPERATION_HANDLER_MISSING");
    assert.equal(proto.calls.length, 0);

    const r2 = await runTask(one(COPY_TASK), {
      handlers: { "filesystem.mkdir": "rm -rf /", "filesystem.copy": () => {}, "filesystem.exists": () => {} }
    });
    assert.equal(r2.error.code, "Galerina_TASK_OPERATION_HANDLER_MISSING");
    assert.equal(r2.error.internalDiagnostic, "run line 2: filesystem.mkdir");
  });

  it("the first failure stops the task, withholds handler text and aborts the signal", async () => {
    const seen = {};
    const { calls, handlers } = recorder(FS, {
      "filesystem.copy": (inv) => {
        seen.signal = inv.signal;
        throw new Error("EACCES build/secret/token=abc123");
      }
    });
    const result = await runTask(one(COPY_TASK), { handlers });
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "Galerina_TASK_OPERATION_FAILED");
    assert.equal(result.error.internalDiagnostic, "run line 3: filesystem.copy");
    assert.equal(result.operationsCompleted, 1);
    assert.deepEqual(calls.map((c) => c.name), ["filesystem.mkdir", "filesystem.copy"]);
    assert.equal(seen.signal.aborted, true);
    assert.doesNotMatch(JSON.stringify(result), /secret|abc123|EACCES/);
  });

  it("a synchronous throw is a failure too", async () => {
    const handlers = {
      "filesystem.mkdir": () => { throw new TypeError("boom"); },
      "filesystem.copy": () => {},
      "filesystem.exists": () => {}
    };
    const result = await runTask(one(COPY_TASK), { handlers });
    assert.equal(result.error.code, "Galerina_TASK_OPERATION_FAILED");
    assert.equal(result.operationsCompleted, 0);
  });

  it("times out at timeoutMs, aborts the signal and starts nothing further", async () => {
    const task = one(`task slow {
  effects [compiler]
  timeoutMs 20
  run {
    compiler.check()
    compiler.build()
  }
}`);
    let signal;
    let buildCalled = false;
    const result = await runTask(task, {
      handlers: {
        "compiler.check": (inv) => {
          signal = inv.signal;
          return new Promise((resolve) => setTimeout(resolve, 500));
        },
        "compiler.build": () => { buildCalled = true; }
      }
    });
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "Galerina_TASK_TIMEOUT");
    assert.equal(result.error.internalDiagnostic, "run line 2: compiler.check");
    assert.equal(result.operationsCompleted, 0);
    assert.equal(signal.aborted, true);
    assert.equal(buildCalled, false);
  });

  it("a handler that rejects because of the abort is still reported as a timeout", async () => {
    const task = one(`task slow {
  effects [compiler]
  timeoutMs 10
  run {
    compiler.check()
  }
}`);
    const result = await runTask(task, {
      handlers: {
        "compiler.check": (inv) => new Promise((_, reject) => {
          inv.signal.addEventListener("abort", () => reject(new Error("aborted")));
        })
      }
    });
    assert.equal(result.error.code, "Galerina_TASK_TIMEOUT");
  });

  it("refuses out-of-range timeouts before running anything", async () => {
    assert.equal(resolveTaskTimeoutMs({ name: "t", effects: [], permissions: [] }), DEFAULT_TASK_TIMEOUT_MS);
    for (const bad of [0, -1, 1.5, MAX_TASK_TIMEOUT_MS + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(resolveTaskTimeoutMs({ name: "t", effects: [], permissions: [], timeoutMs: bad }), undefined, String(bad));
    }
    let called = false;
    const result = await executeTaskOperations(
      { name: "t", effects: ["compiler"], permissions: [], timeoutMs: 0,
        run: { operations: [{ name: "compiler.check", args: [], line: 1 }], issues: [] } },
      { handlers: { "compiler.check": () => { called = true; } } }
    );
    assert.equal(result.error.code, "Galerina_TASK_TIMEOUT_INVALID");
    assert.equal(called, false);
  });

  it("a task with no run block is skipped even with handlers", async () => {
    const result = await runTask(one(`task plain {
  effects [compiler]
}`), { handlers: { "compiler.check": () => {} } });
    assert.equal(result.status, "skipped");
    assert.equal(result.operationsCompleted, 0);
  });
});
