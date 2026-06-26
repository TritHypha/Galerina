use std::time::Instant;
use std::env;
use std::hint::black_box;

fn html_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 10);
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

fn bench<F: Fn() -> String>(f: F, iterations: usize) -> (f64, f64) {
    let _ = black_box(f());
    let t0 = Instant::now();
    for _ in 0..iterations { let _ = black_box(f()); }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    (elapsed, iterations as f64 / (elapsed / 1000.0))
}

fn main() {
    let mut iterations: usize = 50000;
    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--iterations"|"--operations" => iterations = args[i+1].parse().unwrap_or(iterations),
            _ => {}
        }
        i += 2;
    }
    let html = "<div class=\"container\"><p>Hello, <b>World</b>!</p><script>alert('test')</script></div>";
    let words = "The quick brown fox jumps over the lazy dog and then ran away very fast indeed";
    let (he_ms, he_ops) = bench(|| html_escape(black_box(html)), iterations);
    let (sp_ms, sp_ops) = bench(|| black_box(words).split(' ').collect::<Vec<_>>().join("-"), iterations);
    println!(r#"{{"runtime":"rust","benchmark":"text-html-v1","results":{{"htmlEscape":{{"name":"HTML escape","iterations":{},"elapsedMs":{:.3},"operationsPerSecond":{:.0},"nsPerOp":{:.1}}},"stringSplit":{{"name":"split+join","iterations":{},"elapsedMs":{:.3},"operationsPerSecond":{:.0},"nsPerOp":{:.1}}}}},"notes":["Rust char-by-char HTML escape + split/join"]}}"#,
        iterations, he_ms, he_ops, he_ms*1e6/iterations as f64,
        iterations, sp_ms, sp_ops, sp_ms*1e6/iterations as f64);
}
