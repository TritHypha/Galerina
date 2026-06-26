// binary-trees — THE allocation/GC benchmark (Computer Language Benchmarks Game).
// minDepth=4, maxDepth=10. Builds full binary trees of Box-allocated nodes, walks them
// to count nodes, and accumulates a deterministic integer checksum. One full run
// ALLOCATES EXACTLY 135854 nodes. The checksum (135854) is identical across Rust,
// Node, Python and the Galerina path. Build: rustc -O -o bench-native-rust.exe bench.rs
use std::time::Instant;
use std::env;

enum Tree {
    Leaf,
    Node(Box<Tree>, Box<Tree>),
}

fn bottom_up_tree(depth: i64) -> Tree {
    if depth <= 0 {
        Tree::Leaf
    } else {
        Tree::Node(
            Box::new(bottom_up_tree(depth - 1)),
            Box::new(bottom_up_tree(depth - 1)),
        )
    }
}

fn item_check(node: &Tree) -> i64 {
    match node {
        Tree::Leaf => 1,
        Tree::Node(l, r) => 1 + item_check(l) + item_check(r),
    }
}

fn checksum() -> i64 {
    const MIN_DEPTH: i64 = 4;
    const MAX_DEPTH: i64 = 10;
    let mut check: i64 = 0;

    let stretch_depth = MAX_DEPTH + 1;
    check += item_check(&bottom_up_tree(stretch_depth));

    let long_lived_tree = bottom_up_tree(MAX_DEPTH);

    let mut depth = MIN_DEPTH;
    while depth <= MAX_DEPTH {
        let iterations = 1i64 << (MAX_DEPTH - depth + MIN_DEPTH); // 2^(max-depth+min)
        let mut sum: i64 = 0;
        for _ in 0..iterations {
            sum += item_check(&bottom_up_tree(depth));
        }
        check += sum;
        depth += 2;
    }

    check += item_check(&long_lived_tree);
    check
}

fn main() {
    const NODES_PER_RUN: i64 = 135854;
    let mut iterations: i64 = 1;
    let args: Vec<String> = env::args().collect();
    if args.len() > 1 {
        iterations = args[1].parse().unwrap_or(1);
    }
    let mut i = 1;
    while i + 1 < args.len() {
        if args[i] == "--iterations" || args[i] == "--operations" {
            iterations = args[i + 1].parse().unwrap_or(iterations);
        }
        i += 1;
    }

    // Correctness gate.
    let sample = checksum();
    if sample != NODES_PER_RUN {
        eprintln!("binary-trees checksum failed: got {}, expected {}", sample, NODES_PER_RUN);
        std::process::exit(1);
    }

    let t0 = Instant::now();
    let mut check: i64 = 0;
    for _ in 0..iterations {
        check = checksum();
    }
    let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
    let total_nodes = NODES_PER_RUN * iterations;
    let rate = if elapsed < 0.001 { 0.0 } else { total_nodes as f64 / (elapsed / 1000.0) };
    println!(
        r#"{{"runtime":"rust","benchmark":"binary-trees-v1","iterations":{},"nodesAllocated":{},"checksum":{},"elapsedMs":{:.3},"operationsPerSecond":{:.0}}}"#,
        iterations, NODES_PER_RUN, check, elapsed, rate
    );
}
