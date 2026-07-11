use std::time::Instant;
use std::hint::black_box;

// tri-logic — Kleene ternary logic, Int8 encoding: True=1, Unknown=0, False=-1.
// Tri.and = min(a,b), Tri.or = max(a,b), Tri.not = -a.
#[inline] fn tri_and(a: i32, b: i32) -> i32 { if a < b { a } else { b } }
#[inline] fn tri_or(a: i32, b: i32) -> i32 { if a > b { a } else { b } }
#[inline] fn tri_not(a: i32) -> i32 { -a }

// THE common bulk-N workload — mirrors benchmark.fungi main() = runBulkTri(100000)
// EXACTLY: n elements, each 3 trit-ops (and + or + not), one call = 3n trit-ops.
fn run_bulk_tri(n: i32) -> i32 {
    let mut total: i32 = 0;
    let mut i: i32 = 0;
    while i < n {
        let a = (i % 3) - 1;
        let b = ((i * 7) % 3) - 1;
        total = total + tri_and(a, b) + tri_or(a, b) + tri_not(a);
        if total > 1000000 { total -= 1000000; }
        i += 1;
    }
    total
}

fn main() {
    let elements: i32 = 100000;                          // matches benchmark.fungi main()
    let trit_ops_per_call: f64 = (elements as f64) * 3.0; // 300000 — the canonical N

    let mut calls: usize = 2000;
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--iterations" | "--operations" => calls = args[i + 1].parse().unwrap_or(calls),
            _ => {}
        }
        i += 2;
    }

    let _ = black_box(run_bulk_tri(black_box(elements)));  // warmup
    let t0 = Instant::now();
    let mut checksum: i32 = 0;
    for _ in 0..calls { checksum = black_box(run_bulk_tri(black_box(elements))); }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;

    let total_ops = (calls as f64) * trit_ops_per_call;
    let ops = total_ops / (elapsed / 1000.0);
    println!(
        "{{\"runtime\":\"rust\",\"benchmark\":\"tri-logic-v1\",\"calls\":{},\"elementsPerCall\":{},\"tritOpsPerCall\":{},\"checksum\":{},\"elapsedMs\":{:.3},\"operationsPerSecond\":{:.0},\"callsPerSecond\":{:.0},\"notes\":[\"Common bulk-N path: runBulkTri(100000)=300000 trit-ops/call, identical on every runtime\"]}}",
        calls, elements, trit_ops_per_call as i64, checksum, elapsed, ops, (calls as f64) / (elapsed / 1000.0)
    );
}
