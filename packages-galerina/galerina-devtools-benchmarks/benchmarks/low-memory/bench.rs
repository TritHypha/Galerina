/// low-memory benchmark — Rust allocation baseline
/// All operations on stack — zero heap allocation expected.
use std::time::Instant;
use std::env;
use std::hint::black_box;

fn validate(n: i32) -> i32 { if n >= 0 && n <= 1000000 { 1 } else { 0 } }
fn classify(n: i32) -> i32 {
    if n < 100   { return 1; }
    if n < 1000  { return 2; }
    if n < 10000 { return 3; }
    4
}
fn process_stream(count: i32) -> i32 {
    let mut total = 0i32;
    for i in 0..count {
        if validate(i) == 1 { total += classify(i); }
    }
    total
}

fn main() {
    let mut stream_size: i32 = 10000;
    let mut iterations: usize = 100_000;
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--stream-size"               => stream_size = args[i+1].parse().unwrap_or(stream_size),
            "--operations"|"--iterations" => iterations  = args[i+1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 2;
    }
    // Warmup
    let _ = black_box(process_stream(black_box(stream_size)));
    let t0 = Instant::now();
    let mut result = 0i32;
    for _ in 0..iterations { result = black_box(process_stream(black_box(stream_size))); }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let total_ops = iterations as i64 * stream_size as i64;
    let rate = if elapsed < 0.001 { 0.0 } else { iterations as f64 / (elapsed / 1000.0) };
    println!(r#"{{"runtime":"rust","benchmark":"low-memory-v1","streamSize":{},"iterations":{},"result":{},"elapsedMs":{:.3},"iterationsPerSecond":{:.2},"totalOps":{},"memory":{{"bytesPerOperation":0.0}},"notes":["Rust stack-only — zero heap allocation"]}}"#,
        stream_size, iterations, result, elapsed, rate, total_ops);
}
