use std::time::Instant;
use std::env;
use std::hint::black_box;

fn fib(n: u64) -> u64 {
    if n <= 1 { return n; }
    fib(n - 1) + fib(n - 2)
}

fn main() {
    let mut n: u64 = 30;
    let mut iterations: usize = 200;  // fib(30) in Rust ~0.5ms/call; 200 iters ≈ 100ms
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--n"          => n          = args[i+1].parse().unwrap_or(n),
            "--operations" | "--iterations" => iterations = args[i+1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 2;
    }
    // Warmup (with black_box to prevent constant folding)
    let _ = black_box(fib(black_box(n)));
    let t0 = Instant::now();
    let mut result: u64 = 0;
    for _ in 0..iterations {
        result = black_box(fib(black_box(n)));
    }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let rate = if elapsed < 0.001 { 0.0 } else { iterations as f64 / (elapsed / 1000.0) };
    println!(r#"{{"runtime":"rust","benchmark":"fibonacci-recursive-v1","n":{},"result":{},"iterations":{},"elapsedMs":{:.3},"iterationsPerSecond":{:.2}}}"#,
        n, result, iterations, elapsed, rate);
}
