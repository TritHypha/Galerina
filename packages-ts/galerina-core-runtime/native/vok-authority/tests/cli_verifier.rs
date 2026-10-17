//! CLI failure-id tests for vok-artifact-verifier (N4 duplicate flags, N5 caller digest).
//! These tests assert the typed id on stderr, empty stdout, and rc=1. They must go RED
//! when the matching refuse is deleted.

#![forbid(unsafe_code)]

use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

fn verifier_exe() -> PathBuf {
    match std::env::var("CARGO_BIN_EXE_vok_artifact_verifier") {
        Ok(path) if !path.is_empty() => return PathBuf::from(path),
        Ok(_) | Err(_) => {}
    }
    match std::env::var("CARGO_BIN_EXE_vok-artifact-verifier") {
        Ok(path) if !path.is_empty() => return PathBuf::from(path),
        Ok(_) | Err(_) => {}
    }
    let mut dir = match std::env::var_os("CARGO_TARGET_DIR") {
        Some(value) => PathBuf::from(value),
        None => PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target"),
    };
    match std::env::var("CARGO_BUILD_TARGET") {
        Ok(triple) if !triple.is_empty() => dir.push(triple),
        Ok(_) | Err(_) => {}
    }
    dir.push("debug");
    dir.push("vok-artifact-verifier");
    dir
}

fn bin() -> Command {
    let exe = verifier_exe();
    assert!(
        exe.is_file(),
        "VOK_VERIFIER_MISSING {}",
        exe.display()
    );
    let mut cmd = Command::new(exe);
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd
}

fn run(args: &[&str]) -> Output {
    bin()
        .args(args)
        .output()
        .expect("vok-artifact-verifier must be spawnable")
}

fn assert_refused(output: &Output, id: &str) {
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(
        output.status.code(),
        Some(1),
        "rc must be 1 for {id}; stderr={stderr}"
    );
    assert!(
        output.stdout.is_empty(),
        "stdout must be empty for {id}; got {} bytes",
        output.stdout.len()
    );
    assert!(
        stderr.contains(id),
        "stderr must contain {id}; got {stderr:?}"
    );
}

#[test]
fn duplicate_stdin_flag_is_usage() {
    assert_refused(&run(&["--stdin", "--stdin"]), "VOK_VERIFIER_USAGE");
}

#[test]
fn duplicate_build_point_flag_is_usage() {
    assert_refused(
        &run(&[
            "--artifact",
            "x.wasm",
            "--envelope-out",
            "e.json",
            "--seal-out",
            "s.json",
            "--build-point",
            "git:ad0ed3acc298f4ffe76d01f7c7286b2ea5c964f9",
            "--build-point",
            "git:ad0ed3acc298f4ffe76d01f7c7286b2ea5c964f9",
        ]),
        "VOK_VERIFIER_USAGE",
    );
}

#[test]
fn duplicate_artifact_flag_is_usage() {
    assert_refused(
        &run(&[
            "--artifact",
            "a.wasm",
            "--artifact",
            "b.wasm",
            "--envelope-out",
            "e.json",
            "--seal-out",
            "s.json",
        ]),
        "VOK_VERIFIER_USAGE",
    );
}

#[test]
fn duplicate_envelope_out_flag_is_usage() {
    assert_refused(
        &run(&[
            "--artifact",
            "a.wasm",
            "--envelope-out",
            "e1.json",
            "--envelope-out",
            "e2.json",
            "--seal-out",
            "s.json",
        ]),
        "VOK_VERIFIER_USAGE",
    );
}

#[test]
fn duplicate_seal_out_flag_is_usage() {
    assert_refused(
        &run(&[
            "--artifact",
            "a.wasm",
            "--envelope-out",
            "e.json",
            "--seal-out",
            "s1.json",
            "--seal-out",
            "s2.json",
        ]),
        "VOK_VERIFIER_USAGE",
    );
}

#[test]
fn digest_equals_form_is_caller_digest_refused() {
    assert_refused(&run(&["--digest=x"]), "VOK_CALLER_DIGEST_REFUSED");
}

#[test]
fn digest_space_form_is_caller_digest_refused() {
    assert_refused(&run(&["--digest", "x"]), "VOK_CALLER_DIGEST_REFUSED");
}

#[test]
fn expected_digest_equals_form_is_caller_digest_refused() {
    assert_refused(&run(&["--expected-digest=x"]), "VOK_CALLER_DIGEST_REFUSED");
}

#[test]
fn expected_digest_space_form_is_caller_digest_refused() {
    assert_refused(
        &run(&["--expected-digest", "x"]),
        "VOK_CALLER_DIGEST_REFUSED",
    );
}

#[test]
fn stdin_with_artifact_is_usage() {
    assert_refused(
        &run(&["--stdin", "--artifact", "x"]),
        "VOK_VERIFIER_USAGE",
    );
}
