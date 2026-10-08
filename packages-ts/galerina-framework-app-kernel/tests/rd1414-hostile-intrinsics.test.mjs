import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function runIsolated(source) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    encoding: "utf8",
    timeout: 2_000,
  });
}

test("an inherited thenable getter cannot expose and weaken private route policy", () => {
  const child = runIsolated(`
    import { createAppKernel } from "./dist/index.js";
    const request = (path, id) => ({ method: "GET", path, headers: {}, body: new Uint8Array(0), query: {}, requestId: id, receivedAt: 0, channelVerdict: 1, principalId: "p", principalScopes: [] });
    let weakened = false;
    const kernel = createAppKernel({
      routes: [
        { method: "GET", path: "/public", handler: "public", auth: { mode: "public" } },
        { method: "GET", path: "/protected", handler: "protected", auth: { mode: "required", scopes: ["private:read"] } },
      ],
      dispatch: {
        public: () => {
          Object.defineProperty(Object.prototype, "then", { configurable: true, get() {
            if (this && Object.prototype.hasOwnProperty.call(this, "response") && Object.prototype.hasOwnProperty.call(this, "policy") && this.policy?.auth?.scopes?.length) {
              this.policy.auth.scopes.length = 0;
              weakened = true;
            }
            return undefined;
          } });
          return { body: { ok: true } };
        },
        protected: () => ({ body: { admitted: true } }),
      },
    });
    await kernel.handle(request("/public", "public"));
    const first = await kernel.handle(request("/protected", "denied-before"));
    const second = await kernel.handle(request("/protected", "after-poison"));
    delete Object.prototype.then;
    process.stdout.write(JSON.stringify({ first: first.status, second: second.status, weakened }));
  `);
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, `isolated thenable probe must exit normally: ${child.stderr}`);
  assert.deepEqual(JSON.parse(child.stdout), { first: 403, second: 403, weakened: false });
});

test("a handler cannot suppress mandatory audit retention by replacing Array.prototype.push", () => {
  const child = runIsolated(`
    import { createAppKernel, InMemoryAuditSink } from "./dist/index.js";
    const nativePush = Array.prototype.push;
    const sink = new InMemoryAuditSink();
    const kernel = createAppKernel({
      routes: [{ method: "GET", path: "/audit", handler: "poison", auth: { mode: "public" }, audit: { runtimeReport: true } }],
      dispatch: { poison: () => {
        Array.prototype.push = function (...items) {
          if (items.length === 1 && items[0]?.requestId === "audit-poison") return this.length;
          return Reflect.apply(nativePush, this, items);
        };
        return { body: { ok: true } };
      } },
      auditSink: sink,
    });
    const response = await kernel.handle({ method: "GET", path: "/audit", headers: {}, body: new Uint8Array(0), query: {}, requestId: "audit-poison", receivedAt: 0 });
    Array.prototype.push = nativePush;
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.stdout.write(JSON.stringify({ status: response.status, events: sink.drained().map((event) => event.requestId) }));
  `);
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, `isolated audit poison probe must exit normally: ${child.stderr}`);
  assert.deepEqual(JSON.parse(child.stdout), { status: 200, events: ["audit-poison"] });
});

test("a handler cannot replace Promise.race and strand deadline settlement", () => {
  const child = runIsolated(`
    import { createAppKernel } from "./dist/index.js";
    const nativeRace = Promise.race.bind(Promise);
    const nativeSetTimeout = setTimeout;
    const kernel = createAppKernel({
      routes: [{ method: "GET", path: "/race", handler: "poison", auth: { mode: "public" }, limits: { timeoutMs: 5 } }],
      dispatch: { poison: () => {
        Promise.race = () => new Promise(() => undefined);
        return new Promise(() => undefined);
      } },
    });
    const response = await nativeRace([
      kernel.handle({ method: "GET", path: "/race", headers: {}, body: new Uint8Array(0), query: {}, requestId: "race-poison", receivedAt: 0 }),
      new Promise((resolve) => nativeSetTimeout(() => resolve(undefined), 100)),
    ]);
    Promise.race = nativeRace;
    process.stdout.write(JSON.stringify(response === undefined ? null : { status: response.status, error: JSON.parse(new TextDecoder().decode(response.body)).error }));
  `);
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, `isolated race poison probe must exit normally: ${child.stderr}`);
  assert.deepEqual(JSON.parse(child.stdout), { status: 504, error: "deadline_exceeded" });
});
