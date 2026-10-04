// audit-ledger-corrupt.test.mjs — a persistent AuditLogger ledger that contains a corrupt row is
// REFUSED by query() (ERR_AUDIT_LEDGER_CORRUPT), never silently thinned. Zero-trust default, owner
// may revisit: a dropped audit row is indistinguishable from a deleted one, so the reader fails closed
// instead of returning a shorter, clean-looking history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, appendFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLogger } from "../dist/index.js";

const LEDGER = "tower-citizen-audit.jsonl";
function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "tc-audit-"));
  const log = new AuditLogger(dir);
  return { dir, log, path: join(dir, LEDGER) };
}
const corrupt = (fn) => assert.throws(fn, (e) => e instanceof Error && e.message.startsWith("ERR_AUDIT_LEDGER_CORRUPT"));

test("anti-neutering: an intact persistent ledger still returns every row", () => {
  const { dir, log } = fresh();
  try {
    log.load("c1", "sha256:a", "galerina");
    log.exec("c1", "sha256:a", "galerina", "sha256:i");
    log.erase("c1", "sha256:a", "galerina", true, "sha256:o");
    assert.equal(log.query().length, 3);
    assert.equal(log.query({ correlationId: "c1" }).length, 3);
    assert.equal(log.getLifecycle("c1").complete, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a non-JSON row is refused, not silently dropped", () => {
  const { dir, log, path } = fresh();
  try {
    log.load("c1", "sha256:a", "galerina");
    appendFileSync(path, "{not json\n");
    log.erase("c1", "sha256:a", "galerina", true);
    corrupt(() => log.query());
    corrupt(() => log.query({ correlationId: "c1" }));
    corrupt(() => log.getLifecycle("c1"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a truncated final row (torn write) is refused", () => {
  const { dir, log, path } = fresh();
  try {
    log.load("c1", "sha256:a", "galerina");
    appendFileSync(path, '{"eventId":"EVT-1-9","timestamp":"2026-');
    corrupt(() => log.query());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("JSON rows that are not audit-event records are refused", () => {
  for (const row of ["5", "null", "[]", '"x"', "true", "{}"]) {
    const { dir, log, path } = fresh();
    try {
      log.load("c1", "sha256:a", "galerina");
      appendFileSync(path, row + "\n");
      corrupt(() => log.query());
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("a row with a forged phase, severity or governancePass type is refused", () => {
  const good = { eventId: "EVT-1-1", timestamp: "2026-10-04T00:00:00.000Z", phase: "LOAD", correlationId: "c1",
    artifactHash: "sha256:a", engineId: "galerina", severity: "INFO", category: "LIFECYCLE", details: {}, governancePass: true };
  const forged = [
    { ...good, phase: "APPROVED" },
    { ...good, severity: "TRIVIAL" },
    { ...good, category: "ANY" },
    { ...good, governancePass: "true" },
    { ...good, correlationId: 7 },
    { ...good, details: "x" },
    { ...good, logicalTick: "3" },
  ];
  for (const row of forged) {
    const { dir, path, log } = fresh();
    try {
      writeFileSync(path, JSON.stringify(good) + "\n" + JSON.stringify(row) + "\n");
      corrupt(() => log.query());
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const { dir, path, log } = fresh();
  try {
    writeFileSync(path, JSON.stringify(good) + "\r\n" + JSON.stringify({ ...good, eventId: "EVT-1-2", logicalTick: 4 }) + "\r\n");
    assert.equal(log.query().length, 2, "CRLF-terminated well-formed rows are admitted");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
