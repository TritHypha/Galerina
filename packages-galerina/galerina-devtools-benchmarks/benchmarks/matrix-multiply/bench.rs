use std::time::Instant;
use std::env;
use std::hint::black_box;

fn mat_mul(a: &[f32], b: &[f32], c: &mut [f32], n: usize) {
    for r in 0..n {
        for col in 0..n {
            let mut s = 0f32;
            for k in 0..n { s += a[r * n + k] * b[k * n + col]; }
            c[r * n + col] = s;
        }
    }
}

fn main() {
    let mut n: usize = 64;
    let mut iterations: usize = 500;
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--size"                  => n          = args[i+1].parse().unwrap_or(n),
            "--iterations"|"--operations" => iterations = args[i+1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 2;
    }
    let a: Vec<f32> = (0..n*n).map(|i| (i % n) as f32 * 0.001 + 0.1).collect();
    let b: Vec<f32> = (0..n*n).map(|i| ((n*n - i) % n) as f32 * 0.001 + 0.1).collect();
    let mut c = vec![0f32; n*n];
    let _ = black_box({ mat_mul(&a, &b, &mut c, n); });  // warmup
    let t0 = Instant::now();
    let mut checksum = 0f64;
    for _ in 0..iterations {
        mat_mul(black_box(&a), black_box(&b), &mut c, n);
        checksum += c[0] as f64;
    }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let flops_per_iter = 2 * n * n * n;
    let gflops = flops_per_iter as f64 * iterations as f64 / (elapsed / 1000.0) / 1e9;
    let ips = iterations as f64 / (elapsed / 1000.0);
    println!(r#"{{"runtime":"rust","benchmark":"matrix-multiply-v1","matrixSize":{},"iterations":{},"checksum":{:.2},"elapsedMs":{:.3},"iterationsPerSecond":{:.2},"gflops":{:.3},"notes":["Rust serial float32 matmul — compiler may auto-vectorise"]}}"#,
        n, iterations, checksum, elapsed, ips, gflops);
}
