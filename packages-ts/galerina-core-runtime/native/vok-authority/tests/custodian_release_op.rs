//! MEM-R25 process tests for the custodian's handle ops (gap 2.5 / H8 on
//! the wire): OP_PUT_HANDLE=8, OP_GET_HANDLE=9, OP_RELEASE=10. They drive the
//! real binary over stdin/stdout with synthetic data only. A fresh custodian
//! issues generations 1, 2, 3, ... from one counter, so each session below is
//! written ahead of time and its replies are pinned exactly:
//! - a handle round-trips, RELEASE ends it, and a stale or double release is
//!   NOT_FOUND without touching the live entry;
//! - generation 0 and any operand that isn't exactly 8 bytes are INVALID and
//!   the session carries on;
//! - opcode 6 stays unassigned; no canary window reaches stdout or stderr.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Output, Stdio};

const CANARY: &[u8] = b"SYNTH-CANARY-7f3a";
const WINDOW: usize = 4;
const ST_OK: u8 = 0;
const ST_NOT_FOUND: u8 = 1;
const ST_INVALID: u8 = 3;
const ST_UNSUPPORTED: u8 = 5;
const OP_PUT: u8 = 1;
const OP_HAS: u8 = 2;
const OP_GET: u8 = 3;
const OP_CLEANUP: u8 = 4;
const OP_STATUS: u8 = 5;
const OP_PUT_HANDLE: u8 = 8;
const OP_GET_HANDLE: u8 = 9;
const OP_RELEASE: u8 = 10;

fn custodian() -> PathBuf {
    if let Some(path) = option_env!("CARGO_BIN_EXE_galerina-secret-arena-custodian") {
        return PathBuf::from(path);
    }
    for key in [
        "CARGO_BIN_EXE_galerina_secret_arena_custodian",
        "CARGO_BIN_EXE_galerina-secret-arena-custodian",
    ] {
        if let Ok(path) = std::env::var(key) {
            if !path.is_empty() {
                return PathBuf::from(path);
            }
        }
    }
    panic!("custodian binary path missing");
}

fn spawn() -> Child {
    let path = custodian();
    assert!(path.is_file(), "VOK_BIN_MISSING {}", path.display());
    Command::new(&path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("custodian must be spawnable")
}

fn run(stdin: &[u8]) -> Output {
    let mut child = spawn();
    {
        let mut pipe = child.stdin.take().expect("stdin pipe");
        let _ = pipe.write_all(stdin);
    }
    child.wait_with_output().expect("custodian must finish")
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

fn replies(out: &[u8]) -> Vec<(u8, Vec<u8>)> {
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

fn has_trace(hay: &[u8]) -> bool {
    CANARY
        .windows(WINDOW)
        .any(|needle| hay.windows(WINDOW).any(|w| w == needle))
}

fn assert_quiet(label: &str, out: &Output) {
    assert!(!has_trace(&out.stdout), "{label}: canary on stdout");
    assert!(!has_trace(&out.stderr), "{label}: canary on stderr");
    assert!(out.stderr.is_empty(), "{label}: custodian writes nothing to stderr");
}

/// With VOK_EXPECT_ARENA=1 (set on hosts known to support memfd_secret,
/// such as the WSL2 runner) an open refusal is a failure, not a skip, so a
/// broken hardening step that fails closed can't hide as "unsupported".
fn expect_arena() -> bool {
    std::env::var("VOK_EXPECT_ARENA").as_deref() == Ok("1")
}

/// The hello every session starts with; the open refusal (no secretmem
/// support at all) is the only accepted alternative and ends the test early.
fn opened(out: &Output) -> bool {
    if out.status.code() == Some(2) {
        assert_eq!(out.stdout, vec![0, 0, 0, 1, ST_UNSUPPORTED], "open refusal is bare");
        assert!(!expect_arena(), "custodian refused to open but VOK_EXPECT_ARENA=1");
        return false;
    }
    true
}

fn with_gen(opcode: u8, name: &[u8], generation: u64) -> Vec<u8> {
    named(opcode, name, &generation.to_be_bytes())
}

fn gen_reply(generation: u64) -> (u8, Vec<u8>) {
    (ST_OK, generation.to_be_bytes().to_vec())
}

fn none() -> (u8, Vec<u8>) {
    (ST_NOT_FOUND, Vec::new())
}

fn session(frames: &[Vec<u8>]) -> Option<(Output, Vec<(u8, Vec<u8>)>)> {
    let out = run(&frames.concat());
    assert_quiet("handle session", &out);
    if !opened(&out) {
        return None;
    }
    assert_eq!(out.status.code(), Some(0), "clean exit");
    let parsed = replies(&out.stdout);
    assert_eq!(parsed.len(), frames.len(), "one reply per request");
    Some((out, parsed))
}

#[test]
fn a_handle_round_trips_and_release_ends_it() {
    let Some((_, r)) = session(&[
        named(OP_PUT_HANDLE, b"k", b"value-synthetic"),
        with_gen(OP_GET_HANDLE, b"k", 1),
        named(OP_HAS, b"k", b""),
        with_gen(OP_RELEASE, b"k", 1),
        named(OP_HAS, b"k", b""),
        with_gen(OP_GET_HANDLE, b"k", 1),
        named(OP_GET, b"k", b""),
        with_gen(OP_RELEASE, b"k", 1),
        frame(&[OP_STATUS]),
    ]) else {
        return;
    };
    assert_eq!(
        r,
        vec![
            gen_reply(1),
            (ST_OK, b"value-synthetic".to_vec()),
            (ST_OK, vec![1]),
            (ST_OK, Vec::new()),
            (ST_OK, vec![0]),
            none(),
            none(),
            none(),
            (ST_OK, vec![0]),
        ]
    );
}

#[test]
fn a_stale_handle_cannot_reach_or_release_the_replacement() {
    let Some((_, r)) = session(&[
        named(OP_PUT_HANDLE, b"k", b"first-synthetic"),
        named(OP_PUT_HANDLE, b"k", b"second-synthetic"),
        with_gen(OP_GET_HANDLE, b"k", 1),
        with_gen(OP_RELEASE, b"k", 1),
        with_gen(OP_GET_HANDLE, b"k", 3),
        with_gen(OP_GET_HANDLE, b"k", 2),
        with_gen(OP_RELEASE, b"k", 2),
        frame(&[OP_STATUS]),
    ]) else {
        return;
    };
    assert_eq!(
        r,
        vec![
            gen_reply(1),
            gen_reply(2),
            none(),
            none(),
            none(),
            (ST_OK, b"second-synthetic".to_vec()),
            (ST_OK, Vec::new()),
            (ST_OK, vec![0]),
        ]
    );
}

#[test]
fn malformed_handles_are_invalid_and_the_session_continues() {
    let mut frames = vec![named(OP_PUT_HANDLE, b"k", b"keep-synthetic")];
    for opcode in [OP_GET_HANDLE, OP_RELEASE] {
        frames.push(with_gen(opcode, b"k", 0));
        for len in [0usize, 7, 9] {
            frames.push(named(opcode, b"k", &vec![1; len]));
        }
    }
    frames.push(with_gen(6, b"k", 1));
    frames.push(with_gen(OP_GET_HANDLE, b"k", 1));
    let expected_invalid = frames.len() - 2;
    let Some((_, r)) = session(&frames) else {
        return;
    };
    assert_eq!(r[0], gen_reply(1));
    for (i, reply) in r[1..expected_invalid + 1].iter().enumerate() {
        assert_eq!(reply, &(ST_INVALID, Vec::new()), "request {}", i + 1);
    }
    assert_eq!(r[r.len() - 1], (ST_OK, b"keep-synthetic".to_vec()), "entry untouched");
}

#[test]
fn name_and_handle_ops_share_one_generation_counter() {
    let Some((_, r)) = session(&[
        named(OP_PUT, b"a", b"alpha-synthetic"),
        named(OP_PUT_HANDLE, b"b", b"beta-synthetic"),
        with_gen(OP_GET_HANDLE, b"a", 2),
        with_gen(OP_GET_HANDLE, b"b", 1),
        with_gen(OP_GET_HANDLE, b"b", 2),
        frame(&[OP_CLEANUP]),
        with_gen(OP_GET_HANDLE, b"b", 2),
    ]) else {
        return;
    };
    assert_eq!(
        r,
        vec![
            (ST_OK, Vec::new()),
            gen_reply(2),
            none(),
            none(),
            (ST_OK, b"beta-synthetic".to_vec()),
            (ST_OK, Vec::new()),
            none(),
        ]
    );
}

#[test]
fn canary_names_and_values_never_echo_through_handle_ops() {
    let Some((out, r)) = session(&[
        named(OP_PUT_HANDLE, CANARY, CANARY),
        with_gen(OP_GET_HANDLE, CANARY, 2),
        with_gen(OP_RELEASE, CANARY, 2),
        with_gen(OP_RELEASE, CANARY, 1),
        with_gen(OP_GET_HANDLE, CANARY, 1),
        named(OP_HAS, CANARY, b""),
    ]) else {
        return;
    };
    assert_eq!(
        r,
        vec![gen_reply(1), none(), none(), (ST_OK, Vec::new()), none(), (ST_OK, vec![0])]
    );
    assert!(!has_trace(&out.stdout));
}

#[test]
fn a_forged_handle_on_a_fresh_custodian_is_not_found() {
    let Some((_, r)) = session(&[
        with_gen(OP_GET_HANDLE, b"k", 1),
        with_gen(OP_RELEASE, b"k", 1),
        with_gen(OP_GET_HANDLE, b"k", u64::MAX),
        with_gen(OP_RELEASE, b"k", 0x8000_0000_0000_0000),
        frame(&[OP_STATUS]),
    ]) else {
        return;
    };
    assert_eq!(r, vec![none(), none(), none(), none(), (ST_OK, vec![0])]);
}
