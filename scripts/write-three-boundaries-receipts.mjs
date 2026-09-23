#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/reports/receipts");
mkdirSync(OUT, { recursive: true });

const jobs = [
  {
    id: "audit-selftest",
    argv: ["scripts/audit-three-security-boundaries.mjs", "--self-test"],
    timeout: 15000,
    file: "three-boundaries-audit-selftest.txt",
  },
  {
    id: "q1",
    argv: ["--test", "--test-timeout=120000", "packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs"],
    timeout: 180000,
    file: "three-boundaries-q1.txt",
  },
  {
    id: "q2",
    argv: ["--test", "--test-timeout=60000", "packages-ts/galerina-framework-api-server/tests/q2-durable-replay-admission.test.mjs"],
    timeout: 90000,
    file: "three-boundaries-q2.txt",
  },
  {
    id: "q3",
    argv: ["--test", "--test-timeout=60000", "packages-ts/galerina-core-sentinel-state/tests/q3-fifo-toctou.test.mjs"],
    timeout: 90000,
    file: "three-boundaries-q3.txt",
  },
  {
    id: "corpus",
    argv: [
      "scripts/audit-three-security-boundaries.mjs",
      "--json",
      "--corpus-manifest",
      "docs/reports/security-three-boundaries-corpus-2026-09-22.json",
    ],
    timeout: 20000,
    file: "three-boundaries-corpus.json",
  },
];

const index = [];
for (const job of jobs) {
  const r = spawnSync(process.execPath, job.argv, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: job.timeout,
    killSignal: "SIGKILL",
    maxBuffer: 2 * 1024 * 1024,
  });
  const body = [
    `id=${job.id}`,
    `argv=${JSON.stringify(job.argv)}`,
    `status=${r.status}`,
    `signal=${r.signal}`,
    `error=${r.error ? r.error.message : ""}`,
    "----- stdout -----",
    r.stdout ?? "",
    "----- stderr -----",
    r.stderr ?? "",
  ].join("\n");
  const dest = join(OUT, job.file);
  writeFileSync(dest, body);
  const digest = createHash("sha256").update(body).digest("hex");
  index.push({ id: job.id, file: job.file, sha256: digest, status: r.status, signal: r.signal });
  console.log(`${job.id} status=${r.status} signal=${r.signal} sha256=${digest}`);
}
writeFileSync(join(OUT, "three-boundaries-index.json"), JSON.stringify(index, null, 2) + "\n");
