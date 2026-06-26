use std::time::Instant;
use std::env;
use std::hint::black_box;

// Simple SHA-256 throughput approximation using repeated XOR hashing
// (real SHA-256 would need a crate dependency; this shows the CPU overhead pattern)
fn pseudo_hash(data: &[u8]) -> [u8; 32] {
    let mut state = [0u8; 32];
    for (i, &b) in data.iter().enumerate() {
        state[i % 32] ^= b.wrapping_add(i as u8);
        state[(i + 1) % 32] = state[(i + 1) % 32].wrapping_add(state[i % 32]);
    }
    state
}

fn bench(fn_body: impl Fn() -> Vec<u8>, iterations: usize) -> (f64, f64) {
    let _ = black_box(fn_body());
    let t0 = Instant::now();
    for _ in 0..iterations { let _ = black_box(fn_body()); }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let ops_per_sec = iterations as f64 / (elapsed / 1000.0);
    (elapsed, ops_per_sec)
}

fn main() {
    let mut iterations: usize = 10000;
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--iterations" | "--operations" => iterations = args[i + 1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 2;
    }
    let data = vec![0x42u8; 1024];
    let (sha_ms, sha_ops) = bench(|| { pseudo_hash(&data).to_vec() }, iterations);
    println!(r#"{{"runtime":"rust","benchmark":"crypto-ops-v1","dataBytes":1024,"results":{{"pseudoHash":{{"name":"Pseudo-Hash (XOR chain)","iterations":{},"elapsedMs":{:.3},"operationsPerSecond":{:.0},"nsPerOp":{:.1}}}}},"notes":["Rust pseudo-hash — install sha2 crate for real SHA-256 numbers"]}}"#,
        iterations, sha_ms, sha_ops, sha_ms * 1e6 / iterations as f64);
}
