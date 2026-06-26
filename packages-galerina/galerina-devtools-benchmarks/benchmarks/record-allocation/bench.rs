use std::time::Instant;
use std::env;
use std::hint::black_box;

fn main() {
    let mut iterations = 10_000_000usize;  // more iterations for measurable timing
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i+1 < args.len() {
        if args[i]=="--operations"||args[i]=="--iterations" { iterations=args[i+1].parse().unwrap_or(iterations); }
        i+=2;
    }
    let t0 = Instant::now();
    let mut sum: i64 = 0;
    for j in 0..iterations {
        let x = j as i64;
        let y = j as i64 * 2;
        let z = j as i64 + 1;
        // black_box prevents optimizer from eliminating unused fields
        let _ = black_box(y);
        sum += black_box(x) + black_box(z);
    }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let rate = if elapsed < 0.001 { 0.0 } else { iterations as f64 / (elapsed / 1000.0) };
    println!(r#"{{"runtime":"rust","benchmark":"record-allocation-v1","iterations":{},"sum":{},"elapsedMs":{:.3},"iterationsPerSecond":{:.2}}}"#,
        iterations, sum, elapsed, rate);
}
