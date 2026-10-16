#![forbid(unsafe_code)]

use std::env;
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use galerina_vok_authority::{
    verify_wasm_file, verify_wasm_stdin, write_verdict_stdout, DEFAULT_BUILD_POINT,
};

fn refuse(id: &str) -> ExitCode {
    let mut stderr = io::stderr().lock();
    let _ = writeln!(stderr, "{id}");
    ExitCode::from(1)
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    for arg in &args[1..] {
        if arg == "--digest"
            || arg.starts_with("--digest=")
            || arg == "--expected-digest"
            || arg.starts_with("--expected-digest=")
            || arg == "--expected"
            || arg.starts_with("--expected=")
        {
            return refuse("VOK_CALLER_DIGEST_REFUSED");
        }
    }

    let mut artifact = None;
    let mut envelope_out = None;
    let mut seal_out = None;
    let mut stdin_mode = false;
    let mut build_point = DEFAULT_BUILD_POINT.to_string();
    let mut index = 1_usize;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin" => {
                stdin_mode = true;
            }
            "--artifact" => {
                index += 1;
                if index >= args.len() {
                    return refuse("VOK_VERIFIER_USAGE");
                }
                artifact = Some(PathBuf::from(&args[index]));
            }
            "--envelope-out" => {
                index += 1;
                if index >= args.len() {
                    return refuse("VOK_VERIFIER_USAGE");
                }
                envelope_out = Some(PathBuf::from(&args[index]));
            }
            "--seal-out" => {
                index += 1;
                if index >= args.len() {
                    return refuse("VOK_VERIFIER_USAGE");
                }
                seal_out = Some(PathBuf::from(&args[index]));
            }
            "--build-point" => {
                index += 1;
                if index >= args.len() {
                    return refuse("VOK_VERIFIER_USAGE");
                }
                build_point = args[index].clone();
            }
            _ => return refuse("VOK_VERIFIER_USAGE"),
        }
        index += 1;
    }

    if stdin_mode {
        if artifact.is_some() || envelope_out.is_some() || seal_out.is_some() {
            return refuse("VOK_VERIFIER_USAGE");
        }
        match verify_wasm_stdin(&build_point) {
            Ok((envelope, seal)) => match write_verdict_stdout(&envelope, &seal) {
                Ok(()) => ExitCode::SUCCESS,
                Err(error) => refuse(error.failure_id()),
            },
            Err(error) => refuse(error.failure_id()),
        }
    } else {
        let Some(artifact) = artifact else {
            return refuse("VOK_VERIFIER_USAGE");
        };
        let Some(envelope_out) = envelope_out else {
            return refuse("VOK_VERIFIER_USAGE");
        };
        let Some(seal_out) = seal_out else {
            return refuse("VOK_VERIFIER_USAGE");
        };
        match verify_wasm_file(&artifact, &envelope_out, &seal_out, &build_point) {
            Ok(()) => {
                let mut stderr = io::stderr().lock();
                let _ = writeln!(stderr, "PASS: envelope and wax-seal written");
                ExitCode::SUCCESS
            }
            Err(error) => refuse(error.failure_id()),
        }
    }
}
