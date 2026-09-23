// Q3 hostile TOCTOU: lstat-then-open on the real AtomicWriter and registry loader.
// Substitution is a deterministic --require hook (unlink + mkfifo after lstat
// returns regular-file stats). Each potentially blocking child has a finite
// kill deadline. Sleep is not the race mechanism.
//
// Live FIFO open is established on Linux or via WSL using a Linux tmpdir
// (DrvFs /mnt/c cannot host FIFOs). Windows without WSL is NOT VERIFIABLE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, symlinkSync, constants as fsConstants } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { AtomicWriter, StateSerializer, SecurityTrap } from "../dist/index.js";
import { tmpDir } from "./_tmp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRELOAD = join(HERE, "q3-fifo-toctou-preload.cjs");
const CHILD = join(HERE, "q3-fifo-toctou-child.mjs");
const REG_CHILD = join(HERE, "q3-fifo-toctou-registry-child.mjs");
const KILL_DEADLINE_MS = 8000;
const TEST_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

function toWsl(p) {
  const abs = p.replaceAll("/", "\\");
  if (!/^[A-Za-z]:\\/.test(abs)) return abs.replaceAll("\\", "/");
  return "/mnt/" + abs[0].toLowerCase() + abs.slice(2).replaceAll("\\", "/");
}

function requireLinuxOrWsl(t) {
  if (process.platform === "linux") return true;
  const probe = spawnSync("wsl.exe", ["-e", "bash", "-lc", "command -v node && command -v mkfifo"], {
    encoding: "utf8",
    timeout: 15000,
  });
  if ((probe.error && probe.error.code === "ENOENT") || probe.status !== 0) {
    console.log("Q3_PLATFORM=NOT_VERIFIABLE windows-without-wsl-node-mkfifo");
    t.skip("live FIFO open is NOT VERIFIABLE on this Windows host without WSL node/mkfifo");
    return false;
  }
  return true;
}

function spawnSupervisedLinux(kind) {
  const preload = process.platform === "linux" ? PRELOAD : toWsl(PRELOAD);
  const child = process.platform === "linux"
    ? (kind === "registry" ? REG_CHILD : CHILD)
    : toWsl(kind === "registry" ? REG_CHILD : CHILD);
  const generationId = "a".repeat(64);
  const parent = kind === "parent";
  const bash = [
    "set -e",
    "DIR=$(mktemp -d /tmp/q3-toctou-XXXXXX)",
    "echo secret-sibling > \"$DIR/sibling.txt\"",
    "echo Q3_DIR_OUT=$DIR",
    "export Q3_DIR=\"$DIR\"",
    "export Q3_NAME=ckpt",
    "export Q3_PLANT=1",
    "export Q3_OP=" + (kind === "scrub" ? "scrub" : "read"),
    "export Q3_GENERATION_ID=" + generationId,
    parent ? "export Q3_PARENT=1" : "true",
    kind === "registry"
      ? "export Q3_TOCTOU_PATH=\"$DIR/registry-generation-" + generationId + ".json\""
      : "export Q3_TOCTOU_PATH=\"$DIR/ckpt.snap\"",
    "node --require " + JSON.stringify(preload) + " " + JSON.stringify(child),
  ].join("; ");

  if (process.platform === "linux") {
    return spawnSync("bash", ["-lc", bash], {
      encoding: "utf8",
      timeout: KILL_DEADLINE_MS,
      killSignal: "SIGKILL",
      cwd: HERE,
    });
  }
  return spawnSync("wsl.exe", ["-e", "bash", "-lc", bash], {
    encoding: "utf8",
    timeout: KILL_DEADLINE_MS,
    killSignal: "SIGKILL",
  });
}

function spawnSiblingCheck(stdout) {
  const match = /Q3_DIR_OUT=(\S+)/.exec(stdout ?? "");
  if (!match) return null;
  const dir = match[1];
  const read = (p) => {
    if (process.platform === "linux") {
      try {
        return spawnSync("cat", [p], { encoding: "utf8", timeout: 5000 }).stdout;
      } catch {
        return null;
      }
    }
    const r = spawnSync("wsl.exe", ["-e", "bash", "-lc", `cat ${JSON.stringify(p)} 2>/dev/null || cat ${JSON.stringify(p + ".moved/sibling.txt")} 2>/dev/null || true`], {
      encoding: "utf8",
      timeout: 15000,
    });
    return r.stdout ?? "";
  };
  const direct = read(`${dir}/sibling.txt`);
  if (direct && direct.includes("secret-sibling")) return direct.endsWith("\n") ? direct : `${direct}\n`;
  const moved = read(`${dir}.moved/sibling.txt`);
  if (moved && moved.includes("secret-sibling")) return moved.endsWith("\n") ? moved : `${moved}\n`;
  return direct || moved || null;
}

function spawnDirectFifo() {
  const child = process.platform === "linux" ? CHILD : toWsl(CHILD);
  const bash = [
    "set -e",
    "DIR=$(mktemp -d /tmp/q3-direct-XXXXXX)",
    "mkfifo \"$DIR/ckpt.snap\"",
    "export Q3_DIR=\"$DIR\"",
    "export Q3_NAME=ckpt",
    "export Q3_OP=read",
    "node " + JSON.stringify(child),
  ].join("; ");
  if (process.platform === "linux") {
    return spawnSync("bash", ["-lc", bash], {
      encoding: "utf8",
      timeout: KILL_DEADLINE_MS,
      killSignal: "SIGKILL",
      cwd: HERE,
    });
  }
  return spawnSync("wsl.exe", ["-e", "bash", "-lc", bash], {
    encoding: "utf8",
    timeout: KILL_DEADLINE_MS,
    killSignal: "SIGKILL",
  });
}

test("Q3 native Windows Node has no O_NONBLOCK — live FIFO open is NOT VERIFIABLE here", () => {
  if (process.platform === "win32") {
    assert.equal(Object.hasOwn(fsConstants, "O_NONBLOCK"), false,
      "Windows Node constants omit O_NONBLOCK; a POSIX nonblock open cannot be established natively");
    return;
  }
  assert.equal(typeof fsConstants.O_NONBLOCK, "number");
});

test("Q3 valid-file control: AtomicWriter.read of a regular snapshot returns the snapshot", () => {
  const dir = tmpDir();
  const w = new AtomicWriter(dir);
  const s = new StateSerializer({ hmacKey: TEST_KEY });
  const snap = s.serialize({ a: 7 }, 1);
  w.write("ckpt", snap);
  assert.deepEqual(w.read("ckpt"), snap);
});

test("Q3 symlink control: planted snapshot symlink is refused before open", () => {
  const dir = tmpDir();
  const w = new AtomicWriter(dir);
  const outside = join(dir, "..", `q3-outside-${process.pid}.txt`);
  writeFileSync(outside, "secret-outside");
  const live = join(dir, "ckpt.snap");
  try {
    symlinkSync(outside, live);
  } catch {
    return;
  }
  assert.throws(() => w.read("ckpt"), (err) => err instanceof SecurityTrap && err.code === "LSS-LINK-001");
});

test("Q3 FIFO substituted after lstat must refuse read without blocking open", (t) => {
  if (!requireLinuxOrWsl(t)) return;
  const r = spawnSupervisedLinux("read");
  assert.equal(r.signal, null, `child must finish before the kill deadline; signal=${r.signal} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.equal(r.status, 0, `expected LSS-FIFO-001; status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.match(`${r.stdout}`, /LSS-FIFO-001/);
});

test("Q3 FIFO substituted after lstat must refuse scrub without blocking open", (t) => {
  if (!requireLinuxOrWsl(t)) return;
  const r = spawnSupervisedLinux("scrub");
  assert.equal(r.signal, null, `child must finish before the kill deadline; signal=${r.signal} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.equal(r.status, 0, `expected LSS-FIFO-001; status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.match(`${r.stdout}`, /LSS-FIFO-001/);
});

test("Q3 registry loader FIFO substituted after lstat must refuse without blocking open", (t) => {
  if (!requireLinuxOrWsl(t)) return;
  const r = spawnSupervisedLinux("registry");
  assert.equal(r.signal, null, `child must finish before the kill deadline; signal=${r.signal} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.equal(r.status, 0, `expected FIFO refuse; status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
});

test("Q3 parent directory substituted after lstat must refuse without blocking open", (t) => {
  if (!requireLinuxOrWsl(t)) return;
  const r = spawnSupervisedLinux("parent");
  const sibling = spawnSiblingCheck(r.stdout);
  assert.notEqual(sibling, null, "Q3_DIR_OUT must be recoverable so the sibling control is mandatory");
  assert.match(String(sibling), /secret-sibling/);
  assert.equal(r.signal, null, `child must finish before the kill deadline; signal=${r.signal} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.equal(r.status, 0, `expected LSS-FIFO-001; status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.match(`${r.stdout}`, /LSS-FIFO-001/);
});

test("Q3 TOCTOU kill leaves the unrelated sibling file unchanged", (t) => {
  if (!requireLinuxOrWsl(t)) return;
  const r = spawnSupervisedLinux("read");
  const sibling = spawnSiblingCheck(r.stdout);
  assert.notEqual(sibling, null, "Q3_DIR_OUT must be recoverable so the sibling control is mandatory");
  assert.equal(String(sibling).replace(/\r\n/g, "\n"), "secret-sibling\n");
  assert.match(`${r.stderr}`, /Q3_SWAPPED/);
});

test("Q3 direct FIFO (present at lstat) refuses without the interposition hook", (t) => {
  if (!requireLinuxOrWsl(t)) return;
  const r = spawnDirectFifo();
  assert.equal(r.signal, null, `direct FIFO must not block; signal=${r.signal} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.equal(r.status, 0, `expected LSS-FIFO-001; status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.match(`${r.stdout}`, /LSS-FIFO-001/);
});
