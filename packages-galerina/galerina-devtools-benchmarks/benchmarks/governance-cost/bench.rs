use std::time::Instant;
use std::env;
use std::hint::black_box;

fn triangle_number(n: i64) -> i64 {
    (1..=n).sum()
}

fn main() {
    let mut n: i64 = 1000;
    let mut iterations: usize = 10_000_000;
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--n" => n = args[i+1].parse().unwrap_or(n),
            "--operations" | "--iterations" => iterations = args[i+1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 2;
    }
    // Warmup
    let _ = black_box(triangle_number(black_box(n)));
    let t0 = Instant::now();
    let mut result: i64 = 0;
    for _ in 0..iterations {
        result = black_box(triangle_number(black_box(n)));
    }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let rate = if elapsed < 0.001 { 0.0 } else { iterations as f64 / (elapsed / 1000.0) };
    println!(r#"{{"runtime":"rust","benchmark":"governance-cost-v1","n":{},"result":{},"iterations":{},"elapsedMs":{:.3},"iterationsPerSecond":{:.2}}}"#,
        n, result, iterations, elapsed, rate);
}
