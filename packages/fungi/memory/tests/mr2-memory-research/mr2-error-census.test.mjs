// MEM-R2 gaps H4 (generic errors) and 1.4 (record schema) on the provider
// side. Drives every MEM-R1 and MEM-R2 fault mode through a fixed operation
// script and checks every error and every status record: messages come from a
// closed set, carry no secret name or value, and records hold only a state.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_MESSAGES,
  CANARY,
  NAME,
  bytes,
  capture,
  linuxOnly,
  loadProvider,
  open,
  openR1,
  windows,
} from "./mr2-harness.mjs";
import { escapeRefusalIsGeneric } from "./mr2-scenarios.mjs";

const R1_MODES = ["ok", "trunc-get", "zero-get", "huge-get", "kill-get", "quar-get", "odd-status-get", "epoch-down", "epoch-short"];
const R2_MODES = [
  "has-empty", "has-two", "has-long", "has-unlisted",
  "status-empty", "status-long", "status-two", "status-unlisted",
  "put-extra", "put-unlisted", "put-echo",
  "epoch-long", "epoch-empty", "epoch-huge", "epoch-unlisted", "epoch-quar",
  "get-unlisted-echo",
];
const ERROR_NAMES = new Set(["SecretArenaUnavailable", "SecretArenaQuarantined"]);

function script(p) {
  const errors = [];
  const records = [];
  const step = (fn) => {
    const r = capture(fn);
    if (r.thrown) errors.push(r.error);
  };
  step(() => p.put(NAME, bytes(CANARY)));
  step(() => p.has(NAME));
  step(() => p.use(NAME, () => {}));
  step(() => p.revocationEpoch());
  step(() => p.revocationEpoch());
  step(() => records.push(p.status()));
  step(() => p.use(NAME, () => {}));
  step(() => records.push(p.status()));
  p.dispose();
  step(() => p.use(NAME, () => {}));
  step(() => records.push(p.status()));
  return { errors, records };
}

async function census() {
  const mod = await loadProvider();
  const out = [];
  for (const mode of R1_MODES) out.push({ mode, ...script(openR1(mod, mode)) });
  for (const mode of R2_MODES) out.push({ mode, ...script(open(mod, mode)) });
  return { mod, out };
}

function leaks(text, secret) {
  return windows(secret).find((w) => String(text).includes(w));
}

test("MR2 H4: every fault-path error is a known class with a message from the closed set", async (t) => {
  if (!linuxOnly(t)) return;
  const { mod, out } = await census();
  let total = 0;
  for (const { mode, errors } of out) {
    for (const e of errors) {
      total += 1;
      assert.equal(ERROR_NAMES.has(e.name), true, `${mode}: unexpected error class ${e.name}`);
      assert.equal(ALLOWED_MESSAGES.has(e.message), true, `${mode}: unexpected message ${JSON.stringify(e.message)}`);
      const expected = e.name === "SecretArenaQuarantined" ? mod.ERR_SECRET_ARENA_QUARANTINED : mod.ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM;
      assert.equal(e.code, expected, `${mode}: code`);
    }
  }
  assert.equal(total > out.length, true, "census must actually exercise fault paths");
});

test("MR2 H4: no error message, stack or own property carries the secret name or value", async (t) => {
  if (!linuxOnly(t)) return;
  const { out } = await census();
  for (const { mode, errors } of out) {
    for (const e of errors) {
      const text = [e.message, e.stack ?? "", JSON.stringify(Object.assign({}, e))].join("\n");
      assert.equal(leaks(text, NAME), undefined, `${mode}: error leaks secret name`);
      assert.equal(leaks(text, CANARY), undefined, `${mode}: error leaks canary`);
      assert.deepEqual(Object.keys(e).sort(), ["code", "name"], `${mode}: error own keys`);
    }
  }
});

test("MR2 1.4: status records hold exactly one state field from the closed set", async (t) => {
  if (!linuxOnly(t)) return;
  const { out } = await census();
  for (const { mode, records } of out) {
    assert.equal(records.length > 0, true, mode);
    for (const rec of records) {
      assert.deepEqual(Object.keys(rec), ["state"], `${mode}: record keys`);
      assert.equal(["active", "quarantined"].includes(rec.state), true, `${mode}: state ${rec.state}`);
      assert.equal(leaks(JSON.stringify(rec), CANARY), undefined, mode);
    }
    assert.equal(records.at(-1).state, "quarantined", `${mode}: disposed provider reports quarantined`);
  }
});

test("MR2 H4: escape-channel refusal is generic", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(escapeRefusalIsGeneric(await loadProvider()), true);
});
