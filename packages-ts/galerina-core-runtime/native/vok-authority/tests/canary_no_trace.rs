//! MEM-R15 (gap map 1.3): failure paths of the VOK CLIs and the secret-arena
//! custodian process leave no trace of a synthetic canary. No stdout or stderr
//! byte run may contain any 4-byte-or-longer window of the canary. All inputs
//! are synthetic; the canary is test data, never a real secret.
//!
//! Scope note: vok-lmb-check echoes the input of a well-formed, admitted row
//! by design (rows are public test vectors, not secrets), so only its refusal
//! paths are covered here.

#![forbid(unsafe_code)]

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

const CANARY: &str = "SYNTH-CANARY-7f3a";
const WINDOW: usize = 4;
const A: &str = "00000000000000a1";
const H: &str = "5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a";

fn exe(names: &[&str]) -> PathBuf {
    for key in names {
        if let Ok(path) = std::env::var(key) {
            if !path.is_empty() {
                return PathBuf::from(path);
            }
        }
    }
    panic!("binary path missing for {names:?}");
}

fn lease_audit() -> PathBuf {
    if let Some(path) = option_env!("CARGO_BIN_EXE_vok-lease-audit") {
        return PathBuf::from(path);
    }
    exe(&["CARGO_BIN_EXE_vok_lease_audit", "CARGO_BIN_EXE_vok-lease-audit"])
}

fn lmb_check() -> PathBuf {
    if let Some(path) = option_env!("CARGO_BIN_EXE_vok-lmb-check") {
        return PathBuf::from(path);
    }
    exe(&["CARGO_BIN_EXE_vok_lmb_check", "CARGO_BIN_EXE_vok-lmb-check"])
}

fn custodian() -> PathBuf {
    if let Some(path) = option_env!("CARGO_BIN_EXE_galerina-secret-arena-custodian") {
        return PathBuf::from(path);
    }
    exe(&[
        "CARGO_BIN_EXE_galerina_secret_arena_custodian",
        "CARGO_BIN_EXE_galerina-secret-arena-custodian",
    ])
}

fn run(path: PathBuf, args: &[&str], stdin: &[u8]) -> Output {
    assert!(path.is_file(), "VOK_BIN_MISSING {}", path.display());
    let mut child = Command::new(&path)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("binary must be spawnable");
    {
        let mut pipe = child.stdin.take().expect("stdin pipe");
        // EPIPE is fine: a refusing process may exit before reading it all.
        let _ = pipe.write_all(stdin);
    }
    child.wait_with_output().expect("binary must finish")
}

fn has_trace(hay: &[u8]) -> bool {
    let canary = CANARY.as_bytes();
    canary
        .windows(WINDOW)
        .any(|needle| hay.windows(WINDOW).any(|w| w == needle))
}

fn assert_no_trace(label: &str, out: &Output) {
    assert!(!has_trace(&out.stdout), "{label}: canary window on stdout: {:?}", String::from_utf8_lossy(&out.stdout));
    assert!(!has_trace(&out.stderr), "{label}: canary window on stderr: {:?}", String::from_utf8_lossy(&out.stderr));
}

/// A refusal: rc 1, one typed id line on stderr, nothing on stdout, no trace.
fn assert_quiet_refusal(label: &str, out: &Output, id_prefix: &str) {
    assert_no_trace(label, out);
    assert_eq!(out.status.code(), Some(1), "{label}: rc, stderr {:?}", String::from_utf8_lossy(&out.stderr));
    assert!(out.stdout.is_empty(), "{label}: refusal printed on stdout");
    let err = String::from_utf8(out.stderr.clone()).expect("stderr ascii");
    let line = err.trim_end();
    assert!(!line.contains('\n'), "{label}: one stderr line, got {err:?}");
    assert!(line.starts_with(id_prefix), "{label}: stderr {line:?} is not a typed {id_prefix} id");
}

#[test]
fn trace_detector_sees_every_window() {
    let canary = CANARY.as_bytes();
    for start in 0..=canary.len() - WINDOW {
        let mut hay = b"xx ".to_vec();
        hay.extend_from_slice(&canary[start..start + WINDOW]);
        assert!(has_trace(&hay), "window {start}");
    }
    assert!(!has_trace(b"VOK_LA_LINE_MALFORMED\n"));
    assert!(!has_trace(b"VOK_LMB_LINE_MALFORMED row=1\n"));
}

#[test]
fn lease_audit_refusals_never_echo_the_canary() {
    let cases: Vec<(&str, String)> = vec![
        ("canary verb", format!("{CANARY} {A} 7\n")),
        ("canary lease id", format!("open {CANARY} 7\n")),
        ("canary epoch", format!("open {A} {CANARY}\n")),
        ("canary receipt label", format!("open {A} 7\nuse {A} 7\nreceipt {A} 7 {CANARY} {H}\n")),
        ("canary receipt hash", format!("open {A} 7\nuse {A} 7\nreceipt {A} 7 ALLOW {CANARY}\n")),
        ("canary refusal reason", format!("open {A} 7\nuse {A} 7\nrefused {A} 7 {CANARY} 0\n")),
        ("canary trailing field", format!("open {A} 7 {CANARY}\n")),
        ("canary after CR", format!("open {A} 7\r\n{CANARY}\n")),
        ("canary with non-ascii", format!("open {A} 7\n{CANARY}\u{e9}\n")),
        ("canary comment", format!("# {CANARY}\nopen {A} 7\n")),
        ("canary long line", format!("{}\n", CANARY.repeat(64))),
    ];
    for (label, log) in &cases {
        for args in [&["--stdin"][..], &["--stdin", "--gate"][..]] {
            let out = run(lease_audit(), args, log.as_bytes());
            assert_quiet_refusal(label, &out, "VOK_LA_");
        }
    }
}

#[test]
fn lease_audit_usage_refusals_never_echo_canary_arguments() {
    let flag = format!("--{CANARY}");
    let digest = format!("--digest={CANARY}");
    for args in [&[CANARY][..], &["--stdin", flag.as_str()][..], &[digest.as_str()][..]] {
        let out = run(lease_audit(), args, b"");
        assert_quiet_refusal("lease usage", &out, "VOK_LA_");
    }
}

#[test]
fn lmb_check_stdin_refusals_never_echo_the_canary() {
    let cases: Vec<(&str, String)> = vec![
        ("pipe in row", format!("{CANARY} | IN_BOUNDS\n")),
        ("comment row", format!("# {CANARY}\n")),
        ("double space", format!("{CANARY}  1\n")),
        ("leading space", format!(" {CANARY}\n")),
        ("trailing space", format!("{CANARY} \n")),
        ("empty line after canary", format!("{CANARY}\n\n")),
        ("CR", format!("{CANARY}\r\n")),
        ("non-ascii", format!("{CANARY}\u{e9}\n")),
        ("long line", format!("{}\n", CANARY.repeat(4096))),
    ];
    for (label, text) in &cases {
        for args in [&["--stdin"][..], &["--stdin", "--gate"][..]] {
            let out = run(lmb_check(), args, text.as_bytes());
            assert_quiet_refusal(label, &out, "VOK_LMB_");
        }
    }
}

#[test]
fn lmb_check_rows_refusals_never_echo_the_canary() {
    let dir = std::env::temp_dir().join(format!("vok-mem-r15-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let schema = "galerina.vok.linear-memory-trap-vectors.v1";
    let cases: Vec<(&str, String)> = vec![
        ("canary header", format!("# {CANARY} rows=1\n{CANARY} | X\n")),
        ("canary row count", format!("# {schema} rows={CANARY}\n")),
        ("canary expected mismatch", format!("# {schema} rows=1\n{CANARY} | {CANARY}\n")),
        ("canary missing tail", format!("# {schema} rows=1\n{CANARY}\n")),
        ("canary empty tail", format!("# {schema} rows=1\n{CANARY} | \n")),
        ("canary count mismatch", format!("# {schema} rows=2\n{CANARY} | X\n")),
        ("canary CR", format!("# {schema} rows=1\r\n{CANARY} | X\r\n")),
    ];
    for (index, (label, text)) in cases.iter().enumerate() {
        let path = dir.join(format!("case-{index}.rows.txt"));
        std::fs::write(&path, text).expect("write rows");
        let path_text = path.to_str().expect("utf8 temp path").to_string();
        let out = run(lmb_check(), &["--rows", &path_text], b"");
        assert_quiet_refusal(label, &out, "VOK_LMB_");
    }
    let missing = dir.join(format!("{CANARY}.missing"));
    let out = run(lmb_check(), &["--rows", missing.to_str().expect("utf8")], b"");
    assert_quiet_refusal("missing rows file named with the canary", &out, "VOK_LMB_");
    let _ = std::fs::remove_dir_all(&dir);
}

fn frame(payload: &[u8]) -> Vec<u8> {
    let mut out = (payload.len() as u32).to_be_bytes().to_vec();
    out.extend_from_slice(payload);
    out
}

fn named(opcode: u8, name: &[u8], value: &[u8]) -> Vec<u8> {
    let mut payload = vec![opcode];
    payload.extend_from_slice(&(name.len() as u16).to_be_bytes());
    payload.extend_from_slice(name);
    payload.extend_from_slice(value);
    frame(&payload)
}

fn parse_replies(out: &[u8]) -> Vec<(u8, Vec<u8>)> {
    let mut rest = out;
    let mut parsed = Vec::new();
    while !rest.is_empty() {
        assert!(rest.len() >= 4, "short reply header {out:?}");
        let len = u32::from_be_bytes([rest[0], rest[1], rest[2], rest[3]]) as usize;
        assert!(len >= 1 && rest.len() >= 4 + len, "bad reply frame {out:?}");
        parsed.push((rest[4], rest[5..4 + len].to_vec()));
        rest = &rest[4 + len..];
    }
    parsed
}

/// Feed canary-bearing failure frames to a live custodian process. If the
/// host has no secretmem the custodian must refuse at open with exactly one
/// UNSUPPORTED reply and rc 2; otherwise every reply is a bare refusal.
#[test]
fn custodian_process_failure_replies_never_echo_the_canary() {
    let canary = CANARY.as_bytes();
    let mut spaced = canary.to_vec();
    spaced[5] = b' ';
    let mut non_utf8 = canary.to_vec();
    non_utf8[0] = 0xFF;
    let mut unknown = vec![0x80_u8];
    unknown.extend_from_slice(canary);
    let mut truncated = vec![3_u8, 0xFF, 0xFF];
    truncated.extend_from_slice(canary);

    let mut input = Vec::new();
    input.extend(named(1, &spaced, canary)); // PUT bad name  -> INVALID
    input.extend(named(1, &non_utf8, canary)); // PUT non-utf8 -> INVALID
    input.extend(named(1, canary, b"")); // PUT empty value -> INVALID
    input.extend(frame(&unknown)); // unknown opcode -> INVALID
    input.extend(frame(&truncated)); // GET short name -> INVALID
    input.extend(named(3, canary, b"")); // GET missing -> NOT_FOUND
    input.extend(named(2, canary, b"")); // HAS missing -> OK [0]
    let expected: Vec<(u8, Vec<u8>)> = vec![
        (3, vec![]),
        (3, vec![]),
        (3, vec![]),
        (3, vec![]),
        (3, vec![]),
        (1, vec![]),
        (0, vec![0]),
    ];

    let out = run(custodian(), &[], &input);
    assert_no_trace("custodian", &out);
    assert!(out.stderr.is_empty(), "custodian writes nothing to stderr");
    match out.status.code() {
        Some(2) => {
            assert_eq!(out.stdout, vec![0, 0, 0, 1, 5], "open refusal is one bare UNSUPPORTED");
        }
        Some(0) => {
            assert_eq!(parse_replies(&out.stdout), expected);
        }
        other => panic!("custodian rc {other:?}"),
    }

    // A fatal oversize header after one good request: rc 1, no trace.
    let mut fatal = named(3, canary, b"");
    fatal.extend_from_slice(&u32::MAX.to_be_bytes());
    fatal.extend_from_slice(canary);
    let out = run(custodian(), &[], &fatal);
    assert_no_trace("custodian oversize", &out);
    assert!(out.stderr.is_empty());
    match out.status.code() {
        Some(2) => assert_eq!(out.stdout, vec![0, 0, 0, 1, 5]),
        Some(1) => assert_eq!(parse_replies(&out.stdout), vec![(1, vec![])]),
        other => panic!("custodian oversize rc {other:?}"),
    }
}
