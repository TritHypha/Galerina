import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wasmCrossCheck } from "../verify-artifacts.mjs";

const REPO = join(fileURLToPath(new URL("../..", import.meta.url)));

test("verify-artifacts.mjs is valid JavaScript", () => {
  const r = spawnSync(process.execPath, ["--check", join(REPO, "scripts", "verify-artifacts.mjs")], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
});

test("hostile wasm path with .. is refused and does not skip sibling subjects", () => {
  const dir = mkdtempSync(join(tmpdir(), "verify-art-"));
  try {
    const manifest = join(dir, "pkg.lmanifest.json");
    writeFileSync(manifest, JSON.stringify({
      wasm: "../secret.wasm",
      sha256: "a".repeat(64),
      nested: { wasm: "ok.wasm", sha256: "b".repeat(64) },
    }));
    writeFileSync(join(dir, "ok.wasm"), "ok");
    const findings = wasmCrossCheck(manifest);
    assert.ok(findings.some((f) => f.status === "WASM-PATH-REFUSED" && String(f.wasm).includes("..")));
    assert.equal(findings.filter((f) => f.status === "WASM-PATH-REFUSED").length >= 1, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
