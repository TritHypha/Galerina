use std::time::Instant;
use std::env;

fn pipeline(size: usize) -> i64 {
    (0..size)
        .filter(|x| x % 2 == 0)
        .map(|x| (x * 2) as i64)
        .sum()
}

fn main() {
    let mut size: usize = 10_000;
    let mut iterations: usize = 100_000;
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--size"       => size       = args[i+1].parse().unwrap_or(size),
            "--operations" | "--iterations" => iterations = args[i+1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 2;
    }
    // Warmup
    let _ = pipeline(size);
    let t0 = Instant::now();
    let mut result: i64 = 0;
    for _ in 0..iterations {
        result = pipeline(size);
    }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    println!(r#"{{"runtime":"rust","benchmark":"collection-pipeline-v1","size":{},"iterations":{},"result":{},"elapsedMs":{:.3},"iterationsPerSecond":{:.2}}}"#,
        size, iterations, result, elapsed, iterations as f64 / (elapsed / 1000.0));
}
