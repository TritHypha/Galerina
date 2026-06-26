// tmf-container — Rust reference implementation of the .tmf v0 trust-container.
// Self-contained SHAKE256 (FIPS-202 Keccak-f[1600]) — no external crates, so it
// builds with the suite's plain `rustc -O` harness. Byte-identical to the Galerina
// @galerina/ext-tmf engine: it asserts the SAME published golden root before timing,
// so a wrong implementation is rejected (never reported as a benchmark result).
use std::time::Instant;

const RC: [u64; 24] = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000,
    0x000000000000808b, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
    0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
];
const ROTC: [u32; 24] = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];
const PILN: [usize; 24] = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];

fn keccakf(st: &mut [u64; 25]) {
    for round in 0..24 {
        let mut bc = [0u64; 5];
        for i in 0..5 { bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20]; }
        for i in 0..5 {
            let t = bc[(i + 4) % 5] ^ bc[(i + 1) % 5].rotate_left(1);
            let mut j = 0;
            while j < 25 { st[j + i] ^= t; j += 5; }
        }
        let mut t = st[1];
        for i in 0..24 {
            let j = PILN[i];
            let tmp = st[j];
            st[j] = t.rotate_left(ROTC[i]);
            t = tmp;
        }
        for jb in (0..25).step_by(5) {
            let mut tmp = [0u64; 5];
            for i in 0..5 { tmp[i] = st[jb + i]; }
            for i in 0..5 { st[jb + i] ^= (!tmp[(i + 1) % 5]) & tmp[(i + 2) % 5]; }
        }
        st[0] ^= RC[round];
    }
}

fn shake256(input: &[u8], out_len: usize) -> Vec<u8> {
    const RATE: usize = 136; // 1088-bit rate for SHAKE256
    let mut st = [0u64; 25];
    let xor_byte = |st: &mut [u64; 25], pos: usize, b: u8| {
        st[pos / 8] ^= (b as u64) << ((pos % 8) * 8);
    };
    let mut p = 0usize;
    for &b in input {
        xor_byte(&mut st, p, b);
        p += 1;
        if p == RATE { keccakf(&mut st); p = 0; }
    }
    xor_byte(&mut st, p, 0x1f);          // SHAKE domain separation
    xor_byte(&mut st, RATE - 1, 0x80);   // pad10*1
    keccakf(&mut st);
    let mut out = Vec::with_capacity(out_len);
    let mut pos = 0usize;
    while out.len() < out_len {
        if pos == RATE { keccakf(&mut st); pos = 0; }
        out.push((st[pos / 8] >> ((pos % 8) * 8)) as u8);
        pos += 1;
    }
    out
}

fn lp(b: &[u8]) -> Vec<u8> {
    let mut v = (b.len() as u32).to_le_bytes().to_vec();
    v.extend_from_slice(b);
    v
}
fn cat(parts: &[&[u8]]) -> Vec<u8> {
    let mut v = Vec::new();
    for p in parts { v.extend_from_slice(p); }
    v
}

struct Section { kind: u16, modality: u16, coord: Vec<u8>, payload: Vec<u8> }

fn leaf_hash(s: &Section) -> Vec<u8> {
    let msg = cat(&[&lp(b"TMX-LEAF-v0"), &s.kind.to_le_bytes(), &s.modality.to_le_bytes(), &lp(&s.coord), &lp(&s.payload)]);
    shake256(&msg, 32)
}
fn node_hash(c0: &[u8], c1: &[u8], c2: &[u8]) -> Vec<u8> {
    shake256(&cat(&[&lp(b"TMX-NODE-v0"), c0, c1, c2]), 32)
}
fn top_node(leaves: &[Vec<u8>], absent: &[u8]) -> Vec<u8> {
    let mut level: Vec<Vec<u8>> = leaves.to_vec();
    loop {
        let mut next: Vec<Vec<u8>> = Vec::new();
        let mut i = 0;
        while i < level.len() {
            let c0 = &level[i];
            let c1 = if i + 1 < level.len() { &level[i + 1] } else { absent };
            let c2 = if i + 2 < level.len() { &level[i + 2] } else { absent };
            next.push(node_hash(c0, c1, c2));
            i += 3;
        }
        level = next;
        if level.len() <= 1 { return level.into_iter().next().unwrap(); }
    }
}
fn header_core(profile: u16, flags: u16, count: u64) -> Vec<u8> {
    cat(&[&[0x89, 0x54, 0x4d, 0x46, 0x0d, 0x0a, 0x1a, 0x0a],
        &0u16.to_le_bytes(), &0u16.to_le_bytes(), &profile.to_le_bytes(), &flags.to_le_bytes(), &count.to_le_bytes()])
}
fn write_tmf(sections: &[Section], absent: &[u8]) -> Vec<u8> {
    let mut leaves: Vec<Vec<u8>> = Vec::new();
    let mut entries: Vec<u8> = Vec::new();
    let mut region: Vec<u8> = Vec::new();
    let mut blob_off: u64 = 0;
    for s in sections {
        let leaf = leaf_hash(s);
        let blob_len = (s.coord.len() + s.payload.len()) as u64;
        entries.extend_from_slice(&s.kind.to_le_bytes());
        entries.extend_from_slice(&s.modality.to_le_bytes());
        entries.extend_from_slice(&(s.coord.len() as u32).to_le_bytes());
        entries.extend_from_slice(&blob_off.to_le_bytes());
        entries.extend_from_slice(&blob_len.to_le_bytes());
        entries.extend_from_slice(&leaf);
        region.extend_from_slice(&s.coord);
        region.extend_from_slice(&s.payload);
        blob_off += blob_len;
        leaves.push(leaf);
    }
    let hc = header_core(0, 0, sections.len() as u64);
    let root = shake256(&cat(&[&lp(b"TMX-ROOT-v0"), &lp(&hc), &top_node(&leaves, absent)]), 32);
    cat(&[&hc, &root, &entries, &region])
}

fn to_hex(b: &[u8]) -> String {
    let mut s = String::with_capacity(b.len() * 2);
    for &x in b { s.push_str(&format!("{:02x}", x)); }
    s
}
fn i32le3(a: i32, b: i32, c: i32) -> Vec<u8> {
    let mut v = a.to_le_bytes().to_vec();
    v.extend_from_slice(&b.to_le_bytes());
    v.extend_from_slice(&c.to_le_bytes());
    v
}

fn main() {
    const GOLDEN_ROOT: &str = "43386e644c7b53aa0900cda21c15acd15f30b3fdf997950e39e7dd3dbc685212";
    let absent = shake256(&lp(b"TMX-ABSENT-v0"), 32);
    let sections = vec![
        Section { kind: 1, modality: 0, coord: i32le3(3, 5, 7), payload: b"hello".to_vec() },
        Section { kind: 1, modality: 2, coord: i32le3(3, 5, 8), payload: b"world!".to_vec() },
    ];

    let sample = write_tmf(&sections, &absent);
    let root = to_hex(&sample[24..56]);
    if sample.len() != 203 || root != GOLDEN_ROOT {
        eprintln!("tmf-container correctness check failed: len={} root={}", sample.len(), root);
        std::process::exit(1);
    }

    let iterations: u64 = std::env::args().nth(1).and_then(|a| a.parse().ok()).unwrap_or(300_000);
    for _ in 0..1000 { let _ = write_tmf(&sections, &absent); }

    let t0 = Instant::now();
    let mut acc: u64 = 0;
    for _ in 0..iterations { acc += write_tmf(&sections, &absent).len() as u64; }
    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let ops = (iterations as f64) / (elapsed_ms / 1000.0);

    println!("{{\"runtime\":\"rust\",\"benchmark\":\"tmf-container-v1\",\"iterations\":{},\"containerBytes\":{},\"integrityRoot\":\"{}\",\"checksum\":{},\"elapsedMs\":{:.3},\"operationsPerSecond\":{:.0}}}",
        iterations, sample.len(), root, acc, elapsed_ms, ops);
}
