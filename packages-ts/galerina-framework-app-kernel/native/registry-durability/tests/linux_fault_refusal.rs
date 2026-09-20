#![cfg(feature = "fault-injection")]

#[cfg(not(target_os = "linux"))]
use std::path::Path;

use galerina_registry_durability_native::{
    linux_publication_fault_code, publish_linux_generation_injected_candidate,
    LinuxGenerationPublicationVerdict, LinuxPublicationFault,
};

#[cfg(target_os = "linux")]
use std::{fs, path::PathBuf};

#[test]
fn every_linux_publication_fault_has_one_stable_closed_denial_code() {
    let cases = [
        (
            LinuxPublicationFault::ShortWrite,
            "LINUX_WRITE_SHORT_REFUSED",
        ),
        (
            LinuxPublicationFault::ZeroProgress,
            "LINUX_WRITE_ZERO_PROGRESS_REFUSED",
        ),
        (LinuxPublicationFault::DiskFull, "LINUX_DISK_FULL_REFUSED"),
        (
            LinuxPublicationFault::FileBarrier,
            "LINUX_FILE_BARRIER_REFUSED",
        ),
        (LinuxPublicationFault::Publish, "LINUX_PUBLICATION_REFUSED"),
        (LinuxPublicationFault::Reopen, "LINUX_REOPEN_REFUSED"),
        (
            LinuxPublicationFault::DirectoryBarrier,
            "LINUX_DIRECTORY_BARRIER_REFUSED",
        ),
        (
            LinuxPublicationFault::NamespaceChanged,
            "LINUX_NAMESPACE_CHANGED_REFUSED",
        ),
        (
            LinuxPublicationFault::ReadbackChanged,
            "LINUX_READBACK_MISMATCH_REFUSED",
        ),
    ];

    for (fault, expected) in cases {
        assert_eq!(linux_publication_fault_code(fault), Some(expected));
    }
    assert_eq!(
        linux_publication_fault_code(LinuxPublicationFault::None),
        None
    );
    assert_ne!(
        linux_publication_fault_code(LinuxPublicationFault::ShortWrite),
        linux_publication_fault_code(LinuxPublicationFault::ZeroProgress)
    );
}

#[cfg(not(target_os = "linux"))]
#[test]
fn injected_linux_publication_never_claims_live_evidence_off_linux() {
    for fault in [
        LinuxPublicationFault::None,
        LinuxPublicationFault::ShortWrite,
        LinuxPublicationFault::ZeroProgress,
        LinuxPublicationFault::DiskFull,
        LinuxPublicationFault::FileBarrier,
        LinuxPublicationFault::Publish,
        LinuxPublicationFault::Reopen,
        LinuxPublicationFault::DirectoryBarrier,
        LinuxPublicationFault::NamespaceChanged,
        LinuxPublicationFault::ReadbackChanged,
    ] {
        assert!(matches!(
            publish_linux_generation_injected_candidate(
                Path::new("."),
                &"a".repeat(64),
                b"value",
                fault,
            ),
            LinuxGenerationPublicationVerdict::Deny(error)
                if error.code() == "LINUX_PLATFORM_UNAVAILABLE"
        ));
    }
}

#[cfg(target_os = "linux")]
fn evidence_root() -> PathBuf {
    PathBuf::from(
        std::env::var_os("GALERINA_LINUX_EVIDENCE_DIRECTORY")
            .expect("named bare-host evidence directory is required"),
    )
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "requires the named Linux bare-host evidence directory"]
fn every_injected_fault_denies_without_exposing_partial_generation() {
    let expected = br#"{"schema":"galerina.registry.generation.v1","fault":true}"#;
    let cases = [
        (LinuxPublicationFault::ShortWrite, false),
        (LinuxPublicationFault::ZeroProgress, false),
        (LinuxPublicationFault::DiskFull, false),
        (LinuxPublicationFault::FileBarrier, false),
        (LinuxPublicationFault::Publish, false),
        (LinuxPublicationFault::Reopen, true),
        (LinuxPublicationFault::ReadbackChanged, true),
        (LinuxPublicationFault::DirectoryBarrier, true),
        (LinuxPublicationFault::NamespaceChanged, true),
    ];

    for (index, (fault, final_expected)) in cases.into_iter().enumerate() {
        let root = evidence_root().join(format!(
            ".galerina-linux-fault-{}-{index}",
            std::process::id()
        ));
        fs::create_dir(&root).expect("disposable fault directory");
        let generation_id = format!("{index:x}").repeat(64);
        let final_path = root.join(format!("registry-generation-{generation_id}.json"));

        assert!(matches!(
            publish_linux_generation_injected_candidate(
                &root,
                &generation_id,
                expected,
                fault,
            ),
            LinuxGenerationPublicationVerdict::Deny(error)
                if error.code() == linux_publication_fault_code(fault).expect("fault code")
        ));
        match final_expected {
            true => assert_eq!(fs::read(&final_path).expect("complete final"), expected),
            false => assert!(!final_path.exists(), "partial final exposed for {fault:?}"),
        }
        fs::remove_dir_all(root).expect("disposable fault cleanup");
    }
}
