// Mandelbrot escape-time (Computer Language Benchmarks Game) — Rust native, scaled-integer.
// Mirrors benchmark.spore, node.mjs and python.py EXACTLY. The only negative division
// numerator (2*zr*zi) is split into sign+magnitude so every numerator is non-negative,
// making Rust `/` (trunc toward zero) agree with Python //, JS Math.trunc and Galerina /.
// All intermediates stay < 2^31; we use i64 for headroom. Checksum is byte-identical.
// Compile: rustc -O -o bench-native-rust.exe bench.rs
use std::time::Instant;
use std::env;
use std::hint::black_box;

const W: i64 = 128;
const H: i64 = 128;
const MAXITER: i64 = 100;
const SCALE: i64 = 8192;
const MINR: i64 = -20480;   // real axis: -2.5 .. +1.0 (×SCALE)
const SPANR: i64 = 28672;
const MINI: i64 = -16384;   // imag axis: -2.0 .. +2.0 (×SCALE)
const SPANI: i64 = 32768;

fn mandel() -> i64 {
    let mut checksum: i64 = 0;
    let mut py: i64 = 0;
    while py < H {
        let ci = MINI + (py * SPANI) / H;
        let mut px: i64 = 0;
        while px < W {
            let cr = MINR + (px * SPANR) / W;
            let mut zr: i64 = 0;
            let mut zi: i64 = 0;
            let mut it: i64 = 0;
            while it < MAXITER {
                let zr2 = (zr * zr) / SCALE;
                let zi2 = (zi * zi) / SCALE;
                if zr2 + zi2 > 32768 {           // escape: |z|^2 > 4 (= 4*SCALE)
                    break;
                }
                let cross = zr * zi;             // may be negative
                let sgn = if cross < 0 { -1 } else { 1 };
                let mag = if cross < 0 { -cross } else { cross };
                let nzi = sgn * ((2 * mag) / SCALE) + ci;
                let nzr = zr2 - zi2 + cr;
                zr = nzr;
                zi = nzi;
                it = it + 1;
            }
            checksum = checksum + it;
            px += 1;
        }
        py += 1;
    }
    checksum
}

fn main() {
    let mut iterations: usize = 200;
    let args: Vec<String> = env::args().collect();
    if args.len() > 1 {
        iterations = args[1].parse().unwrap_or(iterations);
    }
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--operations" | "--iterations" => iterations = args[i + 1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 1;
    }

    // Warmup
    let _ = black_box(mandel());

    let t0 = Instant::now();
    let mut checksum: i64 = 0;
    for _ in 0..iterations {
        checksum = black_box(mandel());
    }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let pixels: i64 = W * H; // 16384 pixels per run
    let rate = if elapsed < 0.001 { 0.0 } else { (iterations as f64 * pixels as f64) / (elapsed / 1000.0) };
    println!(r#"{{"runtime":"rust","benchmark":"mandelbrot-v1","iterations":{},"pixels":{},"checksum":{},"elapsedMs":{:.3},"operationsPerSecond":{:.0}}}"#,
        iterations, pixels, checksum, elapsed, rate);
}
