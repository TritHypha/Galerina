import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Rebuild ALL native benchmark binaries from source so the comparison never
// trusts a stale, checked-in .exe that may have been built on a different CPU.
//
// For every benchmarks/<dir> that ships a bench.rs we build two Rust binaries:
//   bench-native-rust   — generic -O baseline (the portable native ceiling;
//                          this is the name runner.mjs looks up first)
//   bench-native-avx2   — -O + AVX2/FMA tuned (fills the "Rust AVX2" column)
// For the three dirs whose C++ output names runner.mjs recognises we also try
// g++/clang++/cl (skips gracefully when no C++ toolchain is installed).
//
// AVX-512 is intentionally NOT auto-built: emitting +avx512 code on a CPU that
// lacks it produces a binary that dies with an illegal instruction. The
// runner.mjs avx512 column stays opt-in (drop a bench-native-avx512 in by hand
// on an AVX-512 host).

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const benchDir  = join(__dirname, "..", "benchmarks");

// C++ output names runner.mjs knows how to find (legacy lookup table).
const CPP_OUT = {
  "compute-mix":          "bench-compute-mix",
  "arithmetic-threshold": "bench-arithmetic",
  "six-digit-guess":      "bench-guess",
};

function tryCmd(label, cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "pipe", ...opts });
    console.log(`  [ok]   ${label}`);
    return true;
  } catch (e) {
    const msg = String(e.stderr || e.message || e).split("\n")[0].slice(0, 90);
    console.log(`  [skip] ${label} — ${msg}`);
    return false;
  }
}

const dirs = readdirSync(benchDir).filter((d) => {
  try { return statSync(join(benchDir, d)).isDirectory(); } catch { return false; }
}).sort();

let rustGen = 0, rustAvx2 = 0, cppN = 0, rsDirs = 0;

for (const d of dirs) {
  const dir = join(benchDir, d);
  const rs  = join(dir, "bench.rs");
  const cpp = join(dir, "bench.cpp");
  if (!existsSync(rs) && !existsSync(cpp)) continue;
  console.log(`\n=== ${d} ===`);

  // ── Rust: generic (portable) + AVX2-tuned ───────────────────────────────
  if (existsSync(rs)) {
    rsDirs++;
    if (tryCmd(`Rust generic (${d})`,
        `rustc -O -o "${join(dir, "bench-native-rust.exe")}" "${rs}"`)) rustGen++;
    if (tryCmd(`Rust AVX2 (${d})`,
        `rustc -O -C target-feature=+avx2,+fma -o "${join(dir, "bench-native-avx2.exe")}" "${rs}"`)) rustAvx2++;
  }

  // ── C++: only the dirs whose output names runner.mjs recognises ──────────
  if (existsSync(cpp) && CPP_OUT[d]) {
    const out = join(dir, CPP_OUT[d]);
    const ok =
      tryCmd(`C++ g++ (${d})`,     `g++ -O2 -march=native -o "${out}" "${cpp}" -lm`) ||
      tryCmd(`C++ clang++ (${d})`, `clang++ -O2 -march=native -o "${out}" "${cpp}" -lm`) ||
      tryCmd(`C++ MSVC cl (${d})`, `cl /O2 /EHsc "${cpp}" /Fe:"${out}.exe"`, { cwd: dir });
    if (ok) cppN++;
  } else if (existsSync(cpp)) {
    console.log(`  [note] C++ source present but runner.mjs has no lookup name for "${d}" — skipping (Rust covers the native column).`);
  }
}

console.log(`\nDone. Rust dirs: ${rsDirs} | generic built: ${rustGen} | AVX2 built: ${rustAvx2} | C++ built: ${cppN}.`);
if (cppN === 0) console.log("No C++ toolchain found (g++/clang++/cl) — C++ column will be N/A; the Rust column is the native CPU ceiling.");
