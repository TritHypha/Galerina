// S7 (1414-MLK, LEASE, ARENA, KG-02 design rule): product custody on Linux.
// MLK (Q6): touch page, mlock2 or memfd_secret, rc 0, then /proc/<pid>/smaps Locked >= 4 kB for the VMA.
//   "never swapped" stays a typed UNKNOWN for S9.
// LEASE (Q7): Austral-style linear Lease, consumed exactly once on every path; close without the
//   sealed capability is refused.
// Q8: secret bytes are kept out of guest linear memory (the port hands a handle, never bytes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MEM, red, have, flatten, withUnit, galerina } from "./harness.mjs";

function lockedKbForAddr(pid, addr) {
  const lines = readFileSync("/proc/" + pid + "/smaps", "utf8").split("\n");
  let inVma = false;
  let kb = -1;
  for (const l of lines) {
    const m = l.match(/^([0-9a-f]+)-([0-9a-f]+)\s/);
    if (m) {
      inVma = BigInt("0x" + m[1]) <= addr && addr < BigInt("0x" + m[2]);
      continue;
    }
    const k = l.match(/^Locked\x3a\s+(\d+) kB/);
    if (inVma && k) kb = Number(k[1]);
  }
  return kb;
}

const CONTROL = [
  "import ctypes, mmap, sys",
  "libc = ctypes.CDLL(None, use_errno=True)",
  "m = mmap.mmap(-1, 4096)",
  "m[0:32] = bytes(range(32))",
  "a = ctypes.addressof(ctypes.c_char.from_buffer(m))",
  "rc = libc.mlock(ctypes.c_void_p(a), ctypes.c_size_t(4096))",
  "print('READY %x %d' % (a, rc), flush=True)",
  "sys.stdin.read()",
  "m[0:32] = bytes(32)",
  "print('WIPED', flush=True)",
].join("\n");

function probeLocked(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => {
      out += d;
      const m = out.match(/READY ([0-9a-f]+)/);
      if (m && !p.done) {
        p.done = true;
        const kb = lockedKbForAddr(p.pid, BigInt("0x" + m[1]));
        p.stdin.end();
        p.on("close", (code) => resolve({ kb, out, code }));
      }
    });
    p.on("error", () => resolve({ kb: -1, out: "spawn error", code: -1 }));
  });
}

test("S7 MLK control (green): the smaps Locked method observes a 4 kB mlock on this host", { skip: process.platform !== "linux" || !have("python3") }, async () => {
  const r = await probeLocked("python3", ["-c", CONTROL]);
  assert.match(r.out, /READY [0-9a-f]+ 0/, "control mlock rc 0");
  assert.ok(r.kb >= 4, "control Locked kB " + r.kb);
});

const ARENA_PROBE = join(MEM, "native", "linux-arena", "arena-lock-probe");

test("S7 MLK: the wired Linux arena shows smaps Locked >= 4 kB for its secret VMA after lock, then wipes", red("S7", "MLK smaps Locked >= 4 kB after lock"), async () => {
  assert.equal(existsSync(ARENA_PROBE), true, "Linux arena lock probe not wired: native/linux-arena/arena-lock-probe");
  const r = await probeLocked(ARENA_PROBE, ["--bytes", "4096"]);
  assert.ok(r.kb >= 4, "arena Locked kB " + r.kb);
  assert.match(r.out, /WIPED/, "arena wipes on close");
  assert.equal(r.code, 0);
});

const LEASE_OK = "@version 1\nlinear type Lease\npure flow useLease(lease: Lease, cap: CloseCap, fail: Int) -> Int\ncontract {\n  intent { \"close exactly once on every path\" }\n}\n{\n  if fail == 1 {\n    close(lease, cap)\n    return 1\n  }\n  close(lease, cap)\n  return 0\n}\n";
const LEASE_MISSING = LEASE_OK.replace("    close(lease, cap)\n    return 1", "    return 1");
const LEASE_TWICE = LEASE_OK.replace("  close(lease, cap)\n  return 0", "  close(lease, cap)\n  close(lease, cap)\n  return 0");
const LEASE_NOCAP = LEASE_OK.replace(/close\(lease, cap\)/g, "close(lease)");
const LEASE_LOOP = "@version 1\nlinear type Lease\npure flow loopLease(lease: Lease, cap: CloseCap, n: Int) -> Int\ncontract {\n  intent { \"no consuming an outer lease inside a loop\" }\n}\n{\n  let i: Int = 0\n  while i < n {\n    close(lease, cap)\n    i = i + 1\n  }\n  return 0\n}\n";

function checkProbe(text) {
  return withUnit(text, (f, dir) => galerina(["check", f, "--strict-types", "--strict-governance"], dir));
}

test("S7 LEASE: a lease closed exactly once on every path checks clean", red("S7", "LEASE compiler-recognised must-close"), () => {
  const r = checkProbe(LEASE_OK);
  assert.equal(r.status, 0, r.text.slice(-400));
});

for (const [name, text] of [["missing close on the early-return path", LEASE_MISSING], ["double close", LEASE_TWICE], ["close inside a loop", LEASE_LOOP]]) {
  test("S7 LEASE: " + name + " is refused with a linear-lease diagnostic", red("S7", "LEASE closed exactly once on every path"), () => {
    const r = checkProbe(text);
    assert.notEqual(r.status, 0);
    assert.match(r.text, /FUNGI-(LINEAR|LEASE)-\d{3}/, "named linear-lease diagnostic");
  });
}

test("S7 LEASE: close without the sealed capability is refused", red("S7", "LEASE close without the capability is refused"), () => {
  const r = checkProbe(LEASE_NOCAP);
  assert.notEqual(r.status, 0);
  assert.match(r.text, /FUNGI-(LINEAR|LEASE|AFFINE)-\d{3}/, "named capability diagnostic");
});

test("S7 Q8: no secret bytes in guest linear memory (the secrets port hands a handle, never bytes)", red("S7", "no secret bytes in guest linear memory"), () => {
  const SECRET = Uint8Array.from({ length: 32 }, (_, i) => (0xa5 ^ (i * 7)) & 0xff);
  withUnit(flatten(["c-boundary", "release-commit-point", "secret-gate"]), (f, dir) => {
    assert.equal(galerina(["build", f], dir).status, 0, "build");
    const wasm = readdirSync(join(dir, "build")).find((n) => n.endsWith(".wasm"));
    const mod = new WebAssembly.Module(readFileSync(join(dir, "build", wasm)));
    const imps = WebAssembly.Module.imports(mod);
    assert.ok(imps.some((i) => /secret/i.test(i.module + i.name)), "no secrets port import to exercise");
    let mem = null;
    const env = {};
    for (const i of imps) {
      env[i.module] = env[i.module] || {};
      if (i.kind !== "function") continue;
      env[i.module][i.name] = (...a) => {
        if (/secret/i.test(i.module + i.name) && a.length >= 2 && mem) {
          new Uint8Array(mem.buffer).set(SECRET, a[0] >>> 0); // a byte-copying port would land here
        }
        return 0;
      };
    }
    const inst = new WebAssembly.Instance(mod, env);
    mem = Object.values(inst.exports).find((e) => e instanceof WebAssembly.Memory) || null;
    for (const [n, e] of Object.entries(inst.exports)) {
      if (typeof e === "function" && /deliver/i.test(n)) {
        try { e(...new Array(e.length).fill(0)); } catch { /* traps are fine; residue is what we measure */ }
      }
    }
    if (mem) {
      const buf = Buffer.from(mem.buffer);
      let hits = 0;
      for (let w = 0; w + 8 <= 32; w += 8) if (buf.indexOf(Buffer.from(SECRET.subarray(w, w + 8))) >= 0) hits++;
      assert.equal(hits, 0, "synthetic secret windows found in linear memory: " + hits);
    }
  });
});

test("S7 ARENA: independent arena review verdict recorded as PASS", red("S7", "independent arena review PASS"), () => {
  const p = join(MEM, "evidence", "closure", "S7-arena-review.md");
  assert.equal(existsSync(p), true, "evidence/closure/S7-arena-review.md missing");
  assert.match(readFileSync(p, "utf8"), /^Verdict: PASS\b/m);
});