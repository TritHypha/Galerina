use galerina_registry_durability_native::{
    admit_measured_linux_host, classify_linux_sysfs_observation, correlate_linux_host_observation,
    decode_linux_device_number, parse_linux_mountinfo, parse_linux_mountinfo_line,
    select_linux_mount_for_target, LinuxHostObservation, LinuxHostProbeVerdict, LinuxStorageKind,
    LinuxSysfsObservation, MeasuredLinuxHost, BTRFS_SUPER_MAGIC, EXT4_SUPER_MAGIC, XFS_SUPER_MAGIC,
};
#[cfg(not(target_os = "linux"))]
use galerina_registry_durability_native::{
    probe_linux_host, publish_linux_generation_candidate, LinuxGenerationPublicationVerdict,
};
#[cfg(not(target_os = "linux"))]
use std::path::Path;

fn direct(filesystem: &str) -> MeasuredLinuxHost {
    MeasuredLinuxHost {
        facts_complete: true,
        target_is_absolute: true,
        target_is_direct_directory: true,
        symbolic_ancestor_present: false,
        filesystem: filesystem.to_owned(),
        storage_kind: LinuxStorageKind::DirectLocalBlock,
        mount_read_write: true,
        mount_namespace_stable: true,
        filesystem_magic_matches: true,
        device_identity_stable: true,
        device_major: 8,
        device_minor: 1,
        mount_id: 42,
    }
}

fn mount(filesystem: &str) -> galerina_registry_durability_native::LinuxMountInfo {
    parse_linux_mountinfo_line(&format!(
        "42 1 8:1 / / rw,relatime - {filesystem} /dev/sda1 rw"
    ))
    .unwrap()
}

#[test]
fn exact_mount_statfs_and_sysfs_correlation_reaches_only_the_pure_candidate() {
    for (filesystem, statfs_magic) in [
        ("ext4", EXT4_SUPER_MAGIC),
        ("xfs", XFS_SUPER_MAGIC),
        ("btrfs", BTRFS_SUPER_MAGIC),
    ] {
        let mount = mount(filesystem);
        let measured = correlate_linux_host_observation(LinuxHostObservation {
            target_is_absolute: true,
            target_is_direct_directory: true,
            symbolic_ancestor_present: false,
            mount_before: mount.clone(),
            mount_after: mount,
            statfs_magic,
            stat_device_major: 8,
            stat_device_minor: 1,
            storage_kind: LinuxStorageKind::DirectLocalBlock,
            sysfs_chain_complete: true,
        });
        assert!(
            matches!(
                admit_measured_linux_host(measured),
                LinuxHostProbeVerdict::Candidate(_)
            ),
            "{filesystem}"
        );
    }
}

#[test]
fn incomplete_or_mismatched_linux_observations_refuse() {
    let mount = mount("ext4");
    let baseline = LinuxHostObservation {
        target_is_absolute: true,
        target_is_direct_directory: true,
        symbolic_ancestor_present: false,
        mount_before: mount.clone(),
        mount_after: mount,
        statfs_magic: EXT4_SUPER_MAGIC,
        stat_device_major: 8,
        stat_device_minor: 1,
        storage_kind: LinuxStorageKind::DirectLocalBlock,
        sysfs_chain_complete: true,
    };
    let mut changed_mount = baseline.mount_after.clone();
    changed_mount.mount_id = 43;
    let cases = [
        LinuxHostObservation {
            sysfs_chain_complete: false,
            ..baseline.clone()
        },
        LinuxHostObservation {
            statfs_magic: 0,
            ..baseline.clone()
        },
        LinuxHostObservation {
            stat_device_major: 9,
            ..baseline.clone()
        },
        LinuxHostObservation {
            mount_after: changed_mount,
            ..baseline.clone()
        },
        LinuxHostObservation {
            storage_kind: LinuxStorageKind::Virtual,
            ..baseline
        },
    ];
    for observation in cases {
        assert!(matches!(
            admit_measured_linux_host(correlate_linux_host_observation(observation)),
            LinuxHostProbeVerdict::Deny(_)
        ));
    }
}

#[test]
fn mountinfo_parser_is_bounded_exact_and_decodes_only_declared_escapes() {
    let parsed = parse_linux_mountinfo_line(
        "42 1 8:1 / /media/My\\040Disk rw,relatime shared:7 - ext4 /dev/sda1 rw,errors=remount-ro",
    )
    .expect("canonical mountinfo row");
    assert_eq!(parsed.mount_id, 42);
    assert_eq!(parsed.parent_id, 1);
    assert_eq!((parsed.device_major, parsed.device_minor), (8, 1));
    assert_eq!(parsed.root, "/");
    assert_eq!(parsed.mount_point, "/media/My Disk");
    assert_eq!(parsed.filesystem, "ext4");
    assert_eq!(parsed.mount_source, "/dev/sda1");
    assert!(parsed.read_write);

    for malformed in [
        "",
        "42 1 8:1 / / rw - ext4 /dev/sda1",
        "42 1 broken / / rw - ext4 /dev/sda1 rw",
        "0 1 8:1 / / rw - ext4 /dev/sda1 rw",
        "42 1 8:1 relative / rw - ext4 /dev/sda1 rw",
        "42 1 8:1 / relative rw - ext4 /dev/sda1 rw",
        "42 1 8:1 / /bad\\777 rw - ext4 /dev/sda1 rw",
        "42 1 8:1 / / rw - ext4 /dev/sda1 rw surplus",
        "42 1 8:1 / / rw - ext4 /dev/sda1 rw - xfs /dev/sdb1 rw",
    ] {
        assert!(
            parse_linux_mountinfo_line(malformed).is_err(),
            "{malformed}"
        );
    }
    assert!(parse_linux_mountinfo_line(&"x".repeat(4097)).is_err());
}

#[test]
fn mount_selection_uses_one_deepest_component_boundary() {
    let records = [
        parse_linux_mountinfo_line("1 0 8:1 / / rw - ext4 /dev/sda1 rw").unwrap(),
        parse_linux_mountinfo_line("2 1 8:2 / /var rw - xfs /dev/sda2 rw").unwrap(),
        parse_linux_mountinfo_line("3 2 8:3 / /var/lib rw - btrfs /dev/sda3 rw").unwrap(),
    ];
    assert_eq!(
        select_linux_mount_for_target(&records, "/var/lib/galerina")
            .unwrap()
            .mount_id,
        3
    );
    assert_eq!(
        select_linux_mount_for_target(&records, "/var/library")
            .unwrap()
            .mount_id,
        2
    );
    for malformed in ["", "relative", "/var/../etc", "/var//lib", "/var/./lib"] {
        assert!(select_linux_mount_for_target(&records, malformed).is_err());
    }

    let duplicate = [records[0].clone(), records[0].clone()];
    assert!(select_linux_mount_for_target(&duplicate, "/tmp").is_err());
}

#[test]
fn admits_only_the_closed_direct_local_filesystem_set() {
    for filesystem in ["ext4", "xfs", "btrfs"] {
        assert!(matches!(
            admit_measured_linux_host(direct(filesystem)),
            LinuxHostProbeVerdict::Candidate(_)
        ));
    }
    for filesystem in ["EXT4", "ext3", "zfs", "tmpfs", "overlay", "nfs", ""] {
        assert!(matches!(
            admit_measured_linux_host(direct(filesystem)),
            LinuxHostProbeVerdict::Deny(_)
        ));
    }
}

#[test]
fn every_unknown_or_hostile_fact_refuses() {
    let baseline = direct("ext4");
    let cases = [
        (
            MeasuredLinuxHost {
                facts_complete: false,
                ..baseline.clone()
            },
            "LINUX_HOST_FACTS_INCOMPLETE",
        ),
        (
            MeasuredLinuxHost {
                target_is_absolute: false,
                ..baseline.clone()
            },
            "LINUX_PATH_NOT_ABSOLUTE_DIRECT_DIRECTORY",
        ),
        (
            MeasuredLinuxHost {
                target_is_direct_directory: false,
                ..baseline.clone()
            },
            "LINUX_PATH_NOT_ABSOLUTE_DIRECT_DIRECTORY",
        ),
        (
            MeasuredLinuxHost {
                symbolic_ancestor_present: true,
                ..baseline.clone()
            },
            "LINUX_PATH_SYMBOLIC_ANCESTOR",
        ),
        (
            MeasuredLinuxHost {
                storage_kind: LinuxStorageKind::DeviceMapper,
                ..baseline.clone()
            },
            "LINUX_STORAGE_KIND_NOT_ADMITTED",
        ),
        (
            MeasuredLinuxHost {
                storage_kind: LinuxStorageKind::SoftwareRaid,
                ..baseline.clone()
            },
            "LINUX_STORAGE_KIND_NOT_ADMITTED",
        ),
        (
            MeasuredLinuxHost {
                storage_kind: LinuxStorageKind::Network,
                ..baseline.clone()
            },
            "LINUX_STORAGE_KIND_NOT_ADMITTED",
        ),
        (
            MeasuredLinuxHost {
                storage_kind: LinuxStorageKind::Overlay,
                ..baseline.clone()
            },
            "LINUX_STORAGE_KIND_NOT_ADMITTED",
        ),
        (
            MeasuredLinuxHost {
                storage_kind: LinuxStorageKind::Removable,
                ..baseline.clone()
            },
            "LINUX_STORAGE_KIND_NOT_ADMITTED",
        ),
        (
            MeasuredLinuxHost {
                storage_kind: LinuxStorageKind::Virtual,
                ..baseline.clone()
            },
            "LINUX_STORAGE_KIND_NOT_ADMITTED",
        ),
        (
            MeasuredLinuxHost {
                storage_kind: LinuxStorageKind::Unknown,
                ..baseline.clone()
            },
            "LINUX_STORAGE_KIND_NOT_ADMITTED",
        ),
        (
            MeasuredLinuxHost {
                mount_read_write: false,
                ..baseline.clone()
            },
            "LINUX_MOUNT_NOT_READ_WRITE",
        ),
        (
            MeasuredLinuxHost {
                mount_namespace_stable: false,
                ..baseline.clone()
            },
            "LINUX_MOUNT_NAMESPACE_CHANGED",
        ),
        (
            MeasuredLinuxHost {
                filesystem_magic_matches: false,
                ..baseline.clone()
            },
            "LINUX_FILESYSTEM_IDENTITY_MISMATCH",
        ),
        (
            MeasuredLinuxHost {
                device_identity_stable: false,
                ..baseline.clone()
            },
            "LINUX_DEVICE_IDENTITY_UNAVAILABLE",
        ),
        (
            MeasuredLinuxHost {
                device_major: 0,
                ..baseline.clone()
            },
            "LINUX_DEVICE_IDENTITY_UNAVAILABLE",
        ),
        (
            MeasuredLinuxHost {
                mount_id: 0,
                ..baseline
            },
            "LINUX_DEVICE_IDENTITY_UNAVAILABLE",
        ),
    ];
    for (measured, expected) in cases {
        match admit_measured_linux_host(measured) {
            LinuxHostProbeVerdict::Deny(error) => assert_eq!(error.code(), expected),
            LinuxHostProbeVerdict::Candidate(_) => panic!("hostile Linux facts were admitted"),
        }
    }
}

#[test]
fn complete_mountinfo_parser_is_bounded_and_closed() {
    let rows = parse_linux_mountinfo(
        b"1 0 8:1 / / rw - ext4 /dev/sda1 rw\n2 1 8:2 / /var rw - xfs /dev/sda2 rw\n",
    )
    .expect("bounded mountinfo document");
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[1].mount_point, "/var");

    for refused in [
        Vec::new(),
        b"1 0 8:1 / / rw - ext4 /dev/sda1 rw".to_vec(),
        b"\n".to_vec(),
        vec![b'x'; 1024 * 1024 + 1],
    ] {
        assert!(parse_linux_mountinfo(&refused).is_err());
    }
}

#[test]
fn linux_device_number_decode_matches_kernel_encoding() {
    assert_eq!(decode_linux_device_number(0x0801), Some((8, 1)));
    assert_eq!(decode_linux_device_number(0x0001_0302), Some((259, 2)));
    assert_eq!(decode_linux_device_number(0), None);
}

#[test]
fn sysfs_classification_refuses_every_unknown_topology() {
    let direct = classify_linux_sysfs_observation(LinuxSysfsObservation {
        canonical_device_path: "/sys/devices/pci0000:00/0000:00:01.0/nvme/nvme0/nvme0n1/nvme0n1p2"
            .to_owned(),
        removable: Some(false),
        has_slaves: Some(false),
    });
    assert!(direct.facts_complete);
    assert_eq!(direct.storage_kind, LinuxStorageKind::DirectLocalBlock);

    for (path, removable, has_slaves, expected) in [
        (
            "/sys/devices/virtual/block/dm-0",
            Some(false),
            Some(true),
            LinuxStorageKind::DeviceMapper,
        ),
        (
            "/sys/devices/virtual/block/md0",
            Some(false),
            Some(true),
            LinuxStorageKind::SoftwareRaid,
        ),
        (
            "/sys/devices/pci0000:00/0000:00:01.0/nvme/nvme0/nvme0n1",
            Some(true),
            Some(false),
            LinuxStorageKind::Removable,
        ),
        (
            "/sys/devices/virtual/block/loop0",
            Some(false),
            Some(false),
            LinuxStorageKind::Virtual,
        ),
    ] {
        let result = classify_linux_sysfs_observation(LinuxSysfsObservation {
            canonical_device_path: path.to_owned(),
            removable,
            has_slaves,
        });
        assert!(result.facts_complete, "{path}");
        assert_eq!(result.storage_kind, expected, "{path}");
    }

    for observation in [
        LinuxSysfsObservation {
            canonical_device_path: "/outside/sysfs/device".to_owned(),
            removable: Some(false),
            has_slaves: Some(false),
        },
        LinuxSysfsObservation {
            canonical_device_path: "/sys/devices/pci0000:00/device".to_owned(),
            removable: None,
            has_slaves: Some(false),
        },
        LinuxSysfsObservation {
            canonical_device_path: "/sys/devices/pci0000:00/device".to_owned(),
            removable: Some(false),
            has_slaves: None,
        },
        LinuxSysfsObservation {
            canonical_device_path: "/sys/devices/pci0000:00/device".to_owned(),
            removable: Some(false),
            has_slaves: Some(true),
        },
    ] {
        let result = classify_linux_sysfs_observation(observation);
        assert_eq!(result.storage_kind, LinuxStorageKind::Unknown);
        assert!(!result.facts_complete);
    }
}

#[cfg(not(target_os = "linux"))]
#[test]
fn live_linux_authority_is_explicitly_unavailable_off_linux() {
    match probe_linux_host(Path::new(".")) {
        LinuxHostProbeVerdict::Deny(error) => {
            assert_eq!(error.code(), "LINUX_PLATFORM_UNAVAILABLE")
        }
        LinuxHostProbeVerdict::Candidate(_) => panic!("non-Linux host was admitted"),
    }
    match publish_linux_generation_candidate(Path::new("."), &"a".repeat(64), b"value") {
        LinuxGenerationPublicationVerdict::Deny(error) => {
            assert_eq!(error.code(), "LINUX_PLATFORM_UNAVAILABLE")
        }
        LinuxGenerationPublicationVerdict::Candidate { .. } => {
            panic!("non-Linux publication was admitted")
        }
    }
}

#[cfg(all(feature = "fault-injection", not(target_os = "linux")))]
#[test]
fn linux_fault_surface_is_explicitly_unavailable_off_linux() {
    use galerina_registry_durability_native::publish_linux_generation_fault_candidate;

    assert!(matches!(
        publish_linux_generation_fault_candidate(
            Path::new("."),
            &"a".repeat(64),
            b"value",
            |_| {}
        ),
        LinuxGenerationPublicationVerdict::Deny(error)
            if error.code() == "LINUX_PLATFORM_UNAVAILABLE"
    ));
}
