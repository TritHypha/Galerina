/// gpu-compute benchmark — Rust CPU baseline (serial map-reduce).
///
/// NOTE: This is the CPU serial baseline. A real GPU variant would use the
/// `wgpu` crate (Vulkan/D3D12 compute shader). That is gated behind toolchain
/// availability — see the harness GPU detection. This file is the honest
/// CPU number that always runs.
use std::time::Instant;
use std::env;
use std::hint::black_box;

fn kernel(i: i64) -> i64 { i * 2 + 1 }

fn map_reduce(n: i64) -> i64 {
    let mut acc: i64 = 0;
    for i in 0..n {
        acc += kernel(i);
        if acc > 1_000_000_000 { acc -= 1_000_000_000; }
    }
    acc
}

fn main() {
    let mut elements: i64 = 100000;
    let mut iterations: usize = 50000;
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--elements"                  => elements   = args[i+1].parse().unwrap_or(elements),
            "--operations"|"--iterations" => iterations = args[i+1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 2;
    }
    let _ = black_box(map_reduce(black_box(elements)));  // warmup
    let t0 = Instant::now();
    let mut result = 0i64;
    for _ in 0..iterations { result = black_box(map_reduce(black_box(elements))); }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let total_elements = iterations as i64 * elements;
    let ips = if elapsed < 0.001 { 0.0 } else { iterations as f64 / (elapsed / 1000.0) };
    let ops = if elapsed < 0.001 { 0.0 } else { total_elements as f64 / (elapsed / 1000.0) };
    println!(r#"{{"runtime":"rust","benchmark":"gpu-compute-v1","device":"cpu (serial)","elements":{},"iterations":{},"result":{},"elapsedMs":{:.3},"iterationsPerSecond":{:.2},"operationsPerSecond":{:.0},"notes":["Rust CPU serial baseline. GPU variant requires wgpu (toolchain-gated)."]}}"#,
        elements, iterations, result, elapsed, ips, ops);
}
