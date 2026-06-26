// arithmetic-threshold — Rust native
// Compile: rustc -O -o bench-arithmetic bench.rs
use std::time::Instant;
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut threshold: i64 = 200_000_000_000_000i64;
    let mut i = 1;
    while i+1<args.len() {
        if args[i]=="--threshold" { threshold=args[i+1].parse().unwrap_or(threshold); }
        i+=2;
    }
    let t0=Instant::now();
    let mut total:i64=0; let mut idx:i64=0; let mut additions:i64=0; let mut checksum:u32=0u32;
    while total<=threshold {
        total+=idx; idx+=1; additions+=1;
        total+=idx; idx+=1; additions+=1;
        let ui=idx as u32;
        checksum=(checksum^ui).wrapping_mul(2654435761u32).wrapping_add(ui);
    }
    let elapsed=t0.elapsed().as_secs_f64()*1000.0;
    println!("{{\"runtime\":\"rust\",\"benchmark\":\"arithmetic-threshold-v2\",\"threshold\":{},\"additions\":{},\"checksum\":{},\"elapsedMs\":{:.3},\"additionsPerSecond\":{:.2}}}",
        threshold,additions,checksum,elapsed,additions as f64/(elapsed/1000.0));
}
