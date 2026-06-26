use std::time::Instant;
use std::env;
use std::hint::black_box;

#[derive(Clone, Copy, PartialEq)]
enum Tri { True = 1, Unknown = 0, False = -1 }

fn tri_and(a: Tri, b: Tri) -> Tri {
    match (a, b) {
        (Tri::False, _) | (_, Tri::False) => Tri::False,
        (Tri::Unknown, _) | (_, Tri::Unknown) => Tri::Unknown,
        _ => Tri::True,
    }
}
fn tri_or(a: Tri, b: Tri) -> Tri {
    match (a, b) {
        (Tri::True, _) | (_, Tri::True) => Tri::True,
        (Tri::Unknown, _) | (_, Tri::Unknown) => Tri::Unknown,
        _ => Tri::False,
    }
}
fn tri_not(a: Tri) -> Tri { match a { Tri::True => Tri::False, Tri::False => Tri::True, Tri::Unknown => Tri::Unknown } }

fn bench<F: Fn() -> i32>(f: F, iterations: usize) -> (f64, f64) {
    let _ = black_box(f());
    let t0 = Instant::now();
    for _ in 0..iterations { let _ = black_box(f()); }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    (elapsed, iterations as f64 / (elapsed / 1000.0))
}

fn main() {
    let vals = [Tri::True, Tri::Unknown, Tri::False];
    let mut iterations: usize = 5000000;
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--iterations"|"--operations" => iterations = args[i+1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 2;
    }
    let (and_ms, and_ops) = bench(|| { let mut s=0i32; for &a in &vals { for &b in &vals { s += tri_and(a,b) as i32; } } s }, iterations);
    let (or_ms, or_ops)   = bench(|| { let mut s=0i32; for &a in &vals { for &b in &vals { s += tri_or(a,b)  as i32; } } s }, iterations);
    let (not_ms, not_ops) = bench(|| { let mut s=0i32; for &a in &vals { s += tri_not(a) as i32; } s }, iterations);
    println!(r#"{{"runtime":"rust","benchmark":"tri-logic-v1","results":{{"triAnd":{{"name":"Tri.and","iterations":{},"elapsedMs":{:.3},"operationsPerSecond":{:.0}}},"triOr":{{"name":"Tri.or","iterations":{},"elapsedMs":{:.3},"operationsPerSecond":{:.0}}},"triNot":{{"name":"Tri.not","iterations":{},"elapsedMs":{:.3},"operationsPerSecond":{:.0}}}}},"notes":["Rust enum-based match dispatch"]}}"#,
        iterations, and_ms, and_ops, iterations, or_ms, or_ops, iterations, not_ms, not_ops);
}
