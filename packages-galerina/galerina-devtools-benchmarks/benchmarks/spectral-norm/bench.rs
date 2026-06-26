use std::env;
use std::hint::black_box;
use std::time::Instant;

// spectral-norm — scaled-integer power iteration (Computer Language Benchmarks Game family).
//
// Mirrors node.mjs / python.py exactly. All values stay NON-NEGATIVE, so Rust `/`
// matches Node `Math.trunc(a/b)` and Python `a // b`; the `checksum` is byte-identical
// across the three runtimes. i64 throughout — the largest intermediate matvec sum is
// ~4.9e11 and vBv*SCALE is ~3.1e12, both far inside i64 (≈9.2e18).
//
// Build (in this directory): rustc -O -o bench-native-rust.exe bench.rs
// operationsPerSecond is A-evals/sec on ITERS*2*n^2 = 200000 evals per run.

const SCALE: i64 = 4096;
const N: usize = 100;
const ITERS: usize = 10;
const A_EVALS: i64 = ITERS as i64 * 2 * N as i64 * N as i64; // 200000

#[inline]
fn eval_a(i: i64, j: i64) -> i64 {
    let denom = (i + j) * (i + j + 1) / 2 + i + 1; // positive integer
    SCALE / denom
}

// dst[i] = ( sum_j A[i][j] * src[j] ) / SCALE   (transpose uses A[j][i])
fn matvec(transpose: bool, src: &[i64], dst: &mut [i64]) {
    for i in 0..N {
        let mut s: i64 = 0;
        for j in 0..N {
            let a = if transpose {
                eval_a(j as i64, i as i64)
            } else {
                eval_a(i as i64, j as i64)
            };
            s += a * src[j];
        }
        dst[i] = s / SCALE;
    }
}

fn spectral_norm() -> i64 {
    let mut u = vec![SCALE; N];
    let mut v = vec![0i64; N];
    let mut tmp = vec![0i64; N];
    for _ in 0..ITERS {
        matvec(false, &u, &mut tmp); // v = A^T A u
        matvec(true, &tmp, &mut v);
        matvec(false, &v, &mut tmp); // u = A^T A v
        matvec(true, &tmp, &mut u);
    }
    let mut v_bv: i64 = 0;
    let mut vv: i64 = 0;
    for i in 0..N {
        let ui = u[i] / SCALE;
        let vi = v[i] / SCALE;
        v_bv += ui * vi;
        vv += vi * vi;
    }
    if vv == 0 {
        0
    } else {
        v_bv * SCALE / vv
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let iterations: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(50);

    let mut checksum = spectral_norm(); // warmup / correctness capture
    let t0 = Instant::now();
    for _ in 0..iterations {
        checksum = black_box(spectral_norm());
    }
    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let ops = (iterations as f64 * A_EVALS as f64 / (elapsed_ms / 1000.0)).round() as i64;

    println!(
        r#"{{"runtime":"rust","benchmark":"spectral-norm-v1","iterations":{},"aEvals":{},"checksum":{},"elapsedMs":{:.3},"operationsPerSecond":{},"notes":["Scaled-int power iteration (n=100, 10 iters); checksum is byte-identical to Node and Python"]}}"#,
        iterations, A_EVALS, checksum, elapsed_ms, ops
    );
}
