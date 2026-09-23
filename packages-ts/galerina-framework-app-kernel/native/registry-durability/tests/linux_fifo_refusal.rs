#![cfg(target_os = "linux")]

use std::fs::{self, OpenOptions};
use std::os::unix::fs::{FileTypeExt, OpenOptionsExt};
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

use galerina_registry_durability_native::{
    publish_linux_generation_candidate, LinuxGenerationPublicationVerdict,
    LINUX_PUBLICATION_O_NONBLOCK,
};

fn tmp_root() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "galerina-linux-fifo-{}-{}",
        std::process::id(),
        Instant::now().elapsed().as_nanos()
    ));
    fs::create_dir_all(&root).expect("temp publication root");
    root
}

#[test]
fn nonblocking_fifo_open_returns_immediately_and_is_fifo() {
    let root = tmp_root();
    let fifo = root.join("hostile.fifo");
    let status = Command::new("mkfifo").arg(&fifo).status().expect("mkfifo");
    assert!(status.success());
    let started = Instant::now();
    let opened = OpenOptions::new()
        .read(true)
        .custom_flags(LINUX_PUBLICATION_O_NONBLOCK)
        .open(&fifo);
    let elapsed = started.elapsed();
    let file = opened.expect("O_NONBLOCK read-open of a FIFO must return");
    assert!(file.metadata().unwrap().file_type().is_fifo());
    fs::remove_dir_all(&root).ok();
    assert!(
        elapsed < Duration::from_millis(500),
        "nonblocking FIFO open blocked for {elapsed:?}"
    );
}

#[test]
fn publication_of_preexisting_fifo_refuses_or_does_not_block() {
    let root = tmp_root();
    let generation_id = "c".repeat(64);
    let fifo = root.join(format!("registry-generation-{generation_id}.json"));
    let status = Command::new("mkfifo").arg(&fifo).status().expect("mkfifo");
    assert!(status.success());
    let started = Instant::now();
    let verdict = publish_linux_generation_candidate(
        &root,
        &generation_id,
        br#"{"schema":"galerina.registry.generation.v1"}"#,
    );
    let elapsed = started.elapsed();
    fs::remove_dir_all(&root).ok();
    assert!(
        elapsed < Duration::from_millis(1500),
        "publication against a FIFO blocked for {elapsed:?}"
    );
    match verdict {
        LinuxGenerationPublicationVerdict::Deny(error)
            if error.code() == "LINUX_FIFO_REFUSED"
                || error.code() == "LINUX_PUBLICATION_HOST_NOT_CANDIDATE" => {}
        other => panic!("expected FIFO or host-not-candidate deny, got {other:?}"),
    }
}
