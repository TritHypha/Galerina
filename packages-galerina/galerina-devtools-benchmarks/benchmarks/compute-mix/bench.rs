// compute-mix throughput — Rust native
// Compile: rustc -O -o bench-compute-mix bench.rs
use std::time::Instant;
use std::env;

fn run_batch(mut seed: u32, mut checksum: u32, batch_size: usize) -> (u32, u32) {
    for _ in 0..batch_size {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        let mix1 = (seed ^ (seed >> 13)).wrapping_mul(2246822519u32);
        let mix2 = (mix1 ^ (mix1 >> 17)).wrapping_mul(3266489917u32);
        let fval = mix2 as f64 / 4294967296.0_f64;
        let intval = ((fval + 1.0_f64).sqrt() * 1000000.0_f64) as u32;
        checksum = match mix2 & 3 {
            0 => checksum ^ intval,
            1 => checksum.wrapping_add(mix2),
            2 => checksum ^ mix1.wrapping_shl(3),
            _ => checksum.wrapping_add(intval).wrapping_add(mix1),
        };
        seed = seed.wrapping_mul(2891336453u32).wrapping_add(1442695041u32);
        checksum ^= seed;
    }
    (seed, checksum)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    // 5s default — accurate enough for throughput measurement. Use --target-ms 30000 for publication.
    let mut target_ms = 5000u128; let mut warmup_ms = 1000u128; let mut batch_size = 50000usize;
    let seed0: u32 = 123456789;
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--target-ms"  => target_ms  = args[i+1].parse().unwrap_or(target_ms),
            "--warmup-ms"  => warmup_ms  = args[i+1].parse().unwrap_or(warmup_ms),
            "--batch-size" => batch_size = args[i+1].parse().unwrap_or(batch_size),
            _ => {}
        }
        i += 2;
    }
    let wt = Instant::now(); let (mut ws,mut wc)=(seed0,0u32);
    while wt.elapsed().as_millis()<warmup_ms { (ws,wc)=run_batch(ws,wc,batch_size); }
    let _ = (ws,wc);
    let (mut seed,mut checksum)=(seed0,0u32); let mut ops:u64=0;
    let t0 = Instant::now();
    while t0.elapsed().as_millis()<target_ms { (seed,checksum)=run_batch(seed,checksum,batch_size); ops+=batch_size as u64; }
    let elapsed = t0.elapsed().as_secs_f64()*1000.0;
    println!("{{\"runtime\":\"rust\",\"benchmark\":\"compute-mix-throughput-v2\",\"version\":2,\"algorithm\":\"lcg2x-xorshift2x-sqrt-4branch\",\"targetMs\":{},\"elapsedMs\":{:.3},\"operations\":{},\"operationsPerSecond\":{:.2},\"checksum\":{}}}",
        target_ms, elapsed, ops, ops as f64/(elapsed/1000.0), checksum);
}
