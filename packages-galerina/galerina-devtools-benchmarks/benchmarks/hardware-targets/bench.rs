/// hardware-targets — SIMD Float32 vector dot product benchmark
///
/// This benchmark is specifically designed to show hardware capability differences:
///   Generic x86:   scalar f32 multiply-accumulate (no SIMD)
///   AVX2 (i5+):    8-wide f32 FMA, 256-bit ymm registers
///   AVX-512 (i9):  16-wide f32 FMA, 512-bit zmm registers
///
/// Operations: dot product of two 1024-element f32 arrays, repeated N times.
/// Each dot product = 1024 FMAs.
///
/// Expected speedup: AVX2 ≈ 4-6× over scalar, AVX-512 ≈ 8-12× over scalar.

use std::time::Instant;
use std::env;
use std::hint::black_box;

const VEC_SIZE: usize = 1024;

fn dot_product_scalar(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

fn main() {
    let mut iterations: usize = 1_000_000;
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        if args[i] == "--operations" || args[i] == "--iterations" {
            iterations = args[i+1].parse().unwrap_or(iterations);
        }
        i += 2;
    }

    // Build two deterministic float arrays
    let a: Vec<f32> = (0..VEC_SIZE).map(|i| (i as f32 + 1.0) * 0.001).collect();
    let b: Vec<f32> = (0..VEC_SIZE).map(|i| (VEC_SIZE - i) as f32 * 0.001).collect();

    // Warmup
    let _ = black_box(dot_product_scalar(black_box(&a), black_box(&b)));

    let t0 = Instant::now();
    let mut result: f32 = 0.0;
    for _ in 0..iterations {
        result = black_box(dot_product_scalar(black_box(&a), black_box(&b)));
    }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let rate = if elapsed < 0.001 { 0.0 } else { iterations as f64 / (elapsed / 1000.0) };
    // Total FMAs = iterations × VEC_SIZE
    let fma_per_sec = rate * VEC_SIZE as f64;

    // Detect AVX2/AVX-512 at compile time (via cfg flags)
    let simd_level = if cfg!(target_feature = "avx512f") {
        "avx512"
    } else if cfg!(target_feature = "avx2") {
        "avx2"
    } else {
        "scalar"
    };

    println!(r#"{{"runtime":"rust","benchmark":"hardware-targets-v1","simdLevel":"{}","vecSize":{},"iterations":{},"result":{:.6},"elapsedMs":{:.3},"iterationsPerSecond":{:.2},"fmaPerSecond":{:.0}}}"#,
        simd_level, VEC_SIZE, iterations, result, elapsed, rate, fma_per_sec);
}
