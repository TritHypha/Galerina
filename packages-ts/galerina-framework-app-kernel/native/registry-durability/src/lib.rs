#![deny(unsafe_op_in_unsafe_fn)]

#[cfg(all(feature = "fault-injection", not(debug_assertions)))]
compile_error!("fault-injection is test-only and must not be compiled into an optimized build");

use std::path::Path;

pub const DRIVE_FIXED: u32 = 3;
pub const DRIVE_REMOTE: u32 = 4;
pub const FILE_SUPPORTS_REMOTE_STORAGE: u32 = 0x0000_0100;
pub const PUBLICATION_BOUNDARY_IDS: [&str; 7] = [
    "stage-opened",
    "bytes-written",
    "file-flushed",
    "stage-closed",
    "published",
    "reopened-verified",
    "directory-flushed",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WindowsRelease {
    Windows10,
    Windows11,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WindowsArchitecture {
    X86_64,
    Arm64,
    Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MeasuredWindowsHost {
    pub drive_type: u32,
    pub filesystem: String,
    pub filesystem_flags: u32,
    pub volume_serial: u32,
    pub release: WindowsRelease,
    pub os_major: u32,
    pub os_build: u32,
    pub architecture: WindowsArchitecture,
    pub native_process: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedWindowsHost {
    pub drive_type: u32,
    pub filesystem: String,
    pub filesystem_flags: u32,
    pub volume_serial: u32,
    pub release: WindowsRelease,
    pub os_major: u32,
    pub os_build: u32,
    pub architecture: WindowsArchitecture,
    pub native_process: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WindowsHostProbeError {
    code: &'static str,
    os_code: Option<u32>,
}

impl WindowsHostProbeError {
    pub fn code(&self) -> &'static str {
        self.code
    }

    pub fn os_code(&self) -> Option<u32> {
        self.os_code
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WindowsHostProbeVerdict {
    Candidate(AdmittedWindowsHost),
    Deny(WindowsHostProbeError),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WindowsDirectoryFlushVerdict {
    Candidate,
    Deny(WindowsHostProbeError),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WindowsGenerationPublicationVerdict {
    Candidate { byte_length: usize },
    Deny(WindowsHostProbeError),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MacosStorageKind {
    DirectInternal,
    Network,
    DiskImage,
    Removable,
    Virtual,
    Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MeasuredMacosHost {
    pub facts_complete: bool,
    pub operating_system: String,
    pub architecture: String,
    pub target_is_absolute: bool,
    pub target_is_direct_directory: bool,
    pub symbolic_ancestor_present: bool,
    pub filesystem: String,
    pub storage_kind: MacosStorageKind,
    pub mount_is_local: bool,
    pub mount_is_read_write: bool,
    pub identity_stable: bool,
    pub link_count: u64,
    pub full_flush_available: bool,
    pub device_id: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedMacosHost {
    pub operating_system: String,
    pub architecture: String,
    pub filesystem: String,
    pub storage_kind: MacosStorageKind,
    pub link_count: u64,
    pub device_id: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MacosHostProbeError {
    code: &'static str,
    os_code: Option<i32>,
}

impl MacosHostProbeError {
    pub fn code(&self) -> &'static str {
        self.code
    }

    pub fn os_code(&self) -> Option<i32> {
        self.os_code
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MacosHostProbeVerdict {
    Candidate(AdmittedMacosHost),
    Deny(MacosHostProbeError),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MacosGenerationPublicationVerdict {
    Candidate { byte_length: usize },
    Deny(MacosHostProbeError),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[doc(hidden)]
pub enum MacosPublicationFault {
    None,
    ShortWrite,
    ZeroProgress,
    DiskFull,
    FullFlush,
    Publish,
    Reopen,
    DirectoryBarrier,
    NamespaceChanged,
    ReadbackChanged,
}

#[cfg(feature = "fault-injection")]
#[doc(hidden)]
pub const fn macos_publication_fault_code(fault: MacosPublicationFault) -> Option<&'static str> {
    match fault {
        MacosPublicationFault::None => None,
        MacosPublicationFault::ShortWrite => Some("MACOS_WRITE_SHORT_REFUSED"),
        MacosPublicationFault::ZeroProgress => Some("MACOS_WRITE_ZERO_PROGRESS_REFUSED"),
        MacosPublicationFault::DiskFull => Some("MACOS_DISK_FULL_REFUSED"),
        MacosPublicationFault::FullFlush => Some("MACOS_FULL_FLUSH_REFUSED"),
        MacosPublicationFault::Publish => Some("MACOS_PUBLICATION_REFUSED"),
        MacosPublicationFault::Reopen => Some("MACOS_REOPEN_REFUSED"),
        MacosPublicationFault::DirectoryBarrier => Some("MACOS_DIRECTORY_BARRIER_REFUSED"),
        MacosPublicationFault::NamespaceChanged => Some("MACOS_NAMESPACE_CHANGED_REFUSED"),
        MacosPublicationFault::ReadbackChanged => Some("MACOS_READBACK_MISMATCH_REFUSED"),
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LinuxStorageKind {
    DirectLocalBlock,
    DeviceMapper,
    SoftwareRaid,
    Network,
    Overlay,
    Removable,
    Virtual,
    Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MeasuredLinuxHost {
    pub facts_complete: bool,
    pub target_is_absolute: bool,
    pub target_is_direct_directory: bool,
    pub symbolic_ancestor_present: bool,
    pub filesystem: String,
    pub storage_kind: LinuxStorageKind,
    pub mount_read_write: bool,
    pub mount_namespace_stable: bool,
    pub filesystem_magic_matches: bool,
    pub device_identity_stable: bool,
    pub device_major: u32,
    pub device_minor: u32,
    pub mount_id: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedLinuxHost {
    pub filesystem: String,
    pub device_major: u32,
    pub device_minor: u32,
    pub mount_id: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LinuxHostProbeError {
    code: &'static str,
}

impl LinuxHostProbeError {
    pub fn code(&self) -> &'static str {
        self.code
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LinuxHostProbeVerdict {
    Candidate(AdmittedLinuxHost),
    Deny(LinuxHostProbeError),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LinuxGenerationPublicationVerdict {
    Candidate { byte_length: usize },
    Deny(LinuxHostProbeError),
}

#[cfg(feature = "fault-injection")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[doc(hidden)]
pub enum LinuxPublicationFault {
    None,
    ShortWrite,
    ZeroProgress,
    DiskFull,
    FileBarrier,
    Publish,
    Reopen,
    DirectoryBarrier,
    NamespaceChanged,
    ReadbackChanged,
}

#[cfg(feature = "fault-injection")]
#[doc(hidden)]
pub const fn linux_publication_fault_code(fault: LinuxPublicationFault) -> Option<&'static str> {
    match fault {
        LinuxPublicationFault::None => None,
        LinuxPublicationFault::ShortWrite => Some("LINUX_WRITE_SHORT_REFUSED"),
        LinuxPublicationFault::ZeroProgress => Some("LINUX_WRITE_ZERO_PROGRESS_REFUSED"),
        LinuxPublicationFault::DiskFull => Some("LINUX_DISK_FULL_REFUSED"),
        LinuxPublicationFault::FileBarrier => Some("LINUX_FILE_BARRIER_REFUSED"),
        LinuxPublicationFault::Publish => Some("LINUX_PUBLICATION_REFUSED"),
        LinuxPublicationFault::Reopen => Some("LINUX_REOPEN_REFUSED"),
        LinuxPublicationFault::DirectoryBarrier => Some("LINUX_DIRECTORY_BARRIER_REFUSED"),
        LinuxPublicationFault::NamespaceChanged => Some("LINUX_NAMESPACE_CHANGED_REFUSED"),
        LinuxPublicationFault::ReadbackChanged => Some("LINUX_READBACK_MISMATCH_REFUSED"),
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LinuxMountInfo {
    pub mount_id: u64,
    pub parent_id: u64,
    pub device_major: u32,
    pub device_minor: u32,
    pub root: String,
    pub mount_point: String,
    pub filesystem: String,
    pub mount_source: String,
    pub read_write: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LinuxMountInfoError {
    code: &'static str,
}

pub const EXT4_SUPER_MAGIC: u64 = 0x0000_EF53;
pub const XFS_SUPER_MAGIC: u64 = 0x5846_5342;
pub const BTRFS_SUPER_MAGIC: u64 = 0x9123_683E;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LinuxHostObservation {
    pub target_is_absolute: bool,
    pub target_is_direct_directory: bool,
    pub symbolic_ancestor_present: bool,
    pub mount_before: LinuxMountInfo,
    pub mount_after: LinuxMountInfo,
    pub statfs_magic: u64,
    pub stat_device_major: u32,
    pub stat_device_minor: u32,
    pub storage_kind: LinuxStorageKind,
    pub sysfs_chain_complete: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LinuxSysfsObservation {
    pub canonical_device_path: String,
    pub removable: Option<bool>,
    pub has_slaves: Option<bool>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LinuxSysfsClassification {
    pub storage_kind: LinuxStorageKind,
    pub facts_complete: bool,
}

pub fn classify_linux_sysfs_observation(
    observation: LinuxSysfsObservation,
) -> LinuxSysfsClassification {
    let path = observation.canonical_device_path.as_str();
    let complete = observation.removable.is_some()
        && observation.has_slaves.is_some()
        && path.starts_with("/sys/devices/");
    if !complete {
        return LinuxSysfsClassification {
            storage_kind: LinuxStorageKind::Unknown,
            facts_complete: false,
        };
    }
    if path.contains("/virtual/block/dm-") {
        return LinuxSysfsClassification {
            storage_kind: LinuxStorageKind::DeviceMapper,
            facts_complete: true,
        };
    }
    if path.contains("/virtual/block/md") {
        return LinuxSysfsClassification {
            storage_kind: LinuxStorageKind::SoftwareRaid,
            facts_complete: true,
        };
    }
    if path.contains("/virtual/") {
        return LinuxSysfsClassification {
            storage_kind: LinuxStorageKind::Virtual,
            facts_complete: true,
        };
    }
    if observation.removable == Some(true) {
        return LinuxSysfsClassification {
            storage_kind: LinuxStorageKind::Removable,
            facts_complete: true,
        };
    }
    if observation.has_slaves != Some(false) {
        return LinuxSysfsClassification {
            storage_kind: LinuxStorageKind::Unknown,
            facts_complete: false,
        };
    }
    LinuxSysfsClassification {
        storage_kind: LinuxStorageKind::DirectLocalBlock,
        facts_complete: true,
    }
}

pub fn decode_linux_device_number(device: u64) -> Option<(u32, u32)> {
    if device == 0 {
        return None;
    }
    let major = ((device >> 8) & 0x0000_0fff) | ((device >> 32) & 0xffff_f000);
    let minor = (device & 0x0000_00ff) | ((device >> 12) & 0xffff_ff00);
    Some((u32::try_from(major).ok()?, u32::try_from(minor).ok()?))
}

pub fn correlate_linux_host_observation(observation: LinuxHostObservation) -> MeasuredLinuxHost {
    let expected_magic = match observation.mount_before.filesystem.as_str() {
        "ext4" => Some(EXT4_SUPER_MAGIC),
        "xfs" => Some(XFS_SUPER_MAGIC),
        "btrfs" => Some(BTRFS_SUPER_MAGIC),
        _ => None,
    };
    let mount_namespace_stable = observation.mount_before == observation.mount_after;
    let device_identity_stable = observation.mount_before.device_major
        == observation.stat_device_major
        && observation.mount_before.device_minor == observation.stat_device_minor
        && observation.mount_after.device_major == observation.stat_device_major
        && observation.mount_after.device_minor == observation.stat_device_minor
        && observation.mount_before.mount_id == observation.mount_after.mount_id;
    MeasuredLinuxHost {
        facts_complete: observation.sysfs_chain_complete,
        target_is_absolute: observation.target_is_absolute,
        target_is_direct_directory: observation.target_is_direct_directory,
        symbolic_ancestor_present: observation.symbolic_ancestor_present,
        filesystem: observation.mount_before.filesystem,
        storage_kind: observation.storage_kind,
        mount_read_write: observation.mount_before.read_write && observation.mount_after.read_write,
        mount_namespace_stable,
        filesystem_magic_matches: expected_magic == Some(observation.statfs_magic),
        device_identity_stable,
        device_major: observation.stat_device_major,
        device_minor: observation.stat_device_minor,
        mount_id: observation.mount_after.mount_id,
    }
}

impl LinuxMountInfoError {
    pub fn code(&self) -> &'static str {
        self.code
    }
}

fn mountinfo_error(code: &'static str) -> LinuxMountInfoError {
    LinuxMountInfoError { code }
}

fn decode_mountinfo_field(field: &str) -> Result<String, LinuxMountInfoError> {
    if field.is_empty() || field.len() > 2048 {
        return Err(mountinfo_error("LINUX_MOUNTINFO_FIELD_BOUNDS"));
    }
    let bytes = field.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'\\' {
            decoded.push(bytes[index]);
            index += 1;
            continue;
        }
        if index + 3 >= bytes.len() {
            return Err(mountinfo_error("LINUX_MOUNTINFO_ESCAPE_MALFORMED"));
        }
        let escape = &bytes[index + 1..index + 4];
        let value = match escape {
            b"040" => b' ',
            b"011" => b'\t',
            b"012" => b'\n',
            b"134" => b'\\',
            _ => return Err(mountinfo_error("LINUX_MOUNTINFO_ESCAPE_UNKNOWN")),
        };
        if value.is_ascii_control() {
            return Err(mountinfo_error("LINUX_MOUNTINFO_CONTROL_PATH"));
        }
        decoded.push(value);
        index += 4;
    }
    String::from_utf8(decoded).map_err(|_| mountinfo_error("LINUX_MOUNTINFO_NOT_UTF8"))
}

fn is_canonical_absolute_linux_path(path: &str) -> bool {
    if !path.starts_with('/') || path.contains('\0') || path.chars().any(char::is_control) {
        return false;
    }
    if path == "/" {
        return true;
    }
    if path.ends_with('/') {
        return false;
    }
    path[1..]
        .split('/')
        .all(|component| !component.is_empty() && component != "." && component != "..")
}

pub fn parse_linux_mountinfo_line(line: &str) -> Result<LinuxMountInfo, LinuxMountInfoError> {
    if line.is_empty() || line.len() > 4096 || line.contains(['\r', '\n', '\0']) || !line.is_ascii()
    {
        return Err(mountinfo_error("LINUX_MOUNTINFO_LINE_BOUNDS"));
    }
    let fields: Vec<&str> = line.split_ascii_whitespace().collect();
    if fields.len() < 10 || fields.len() > 64 {
        return Err(mountinfo_error("LINUX_MOUNTINFO_FIELD_COUNT"));
    }
    let separators: Vec<usize> = fields
        .iter()
        .enumerate()
        .filter_map(|(index, field)| (*field == "-").then_some(index))
        .collect();
    if separators.len() != 1 {
        return Err(mountinfo_error("LINUX_MOUNTINFO_SEPARATOR_COUNT"));
    }
    let separator = separators[0];
    if separator < 6 || fields.len() != separator + 4 {
        return Err(mountinfo_error("LINUX_MOUNTINFO_SHAPE"));
    }
    let mount_id = fields[0]
        .parse::<u64>()
        .map_err(|_| mountinfo_error("LINUX_MOUNTINFO_MOUNT_ID"))?;
    let parent_id = fields[1]
        .parse::<u64>()
        .map_err(|_| mountinfo_error("LINUX_MOUNTINFO_PARENT_ID"))?;
    if mount_id == 0 {
        return Err(mountinfo_error("LINUX_MOUNTINFO_MOUNT_ID"));
    }
    let (major, minor) = fields[2]
        .split_once(':')
        .ok_or_else(|| mountinfo_error("LINUX_MOUNTINFO_DEVICE_ID"))?;
    let device_major = major
        .parse::<u32>()
        .map_err(|_| mountinfo_error("LINUX_MOUNTINFO_DEVICE_ID"))?;
    let device_minor = minor
        .parse::<u32>()
        .map_err(|_| mountinfo_error("LINUX_MOUNTINFO_DEVICE_ID"))?;
    let root = decode_mountinfo_field(fields[3])?;
    let mount_point = decode_mountinfo_field(fields[4])?;
    if !is_canonical_absolute_linux_path(&root) || !is_canonical_absolute_linux_path(&mount_point) {
        return Err(mountinfo_error("LINUX_MOUNTINFO_PATH_NOT_CANONICAL"));
    }
    let options: Vec<&str> = fields[5].split(',').collect();
    if options.is_empty() || options.iter().any(|option| option.is_empty()) {
        return Err(mountinfo_error("LINUX_MOUNTINFO_OPTIONS_MALFORMED"));
    }
    let has_read_write = options.contains(&"rw");
    let has_read_only = options.contains(&"ro");
    if has_read_write == has_read_only {
        return Err(mountinfo_error("LINUX_MOUNTINFO_ACCESS_AMBIGUOUS"));
    }
    let filesystem = fields[separator + 1];
    if filesystem.is_empty()
        || filesystem.len() > 32
        || !filesystem
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(mountinfo_error("LINUX_MOUNTINFO_FILESYSTEM_MALFORMED"));
    }
    let mount_source = decode_mountinfo_field(fields[separator + 2])?;
    if fields[separator + 3].is_empty() {
        return Err(mountinfo_error("LINUX_MOUNTINFO_SUPER_OPTIONS_MALFORMED"));
    }
    Ok(LinuxMountInfo {
        mount_id,
        parent_id,
        device_major,
        device_minor,
        root,
        mount_point,
        filesystem: filesystem.to_owned(),
        mount_source,
        read_write: has_read_write,
    })
}

pub fn parse_linux_mountinfo(input: &[u8]) -> Result<Vec<LinuxMountInfo>, LinuxMountInfoError> {
    const MAX_MOUNTINFO_BYTES: usize = 1024 * 1024;
    const MAX_MOUNTINFO_ROWS: usize = 4096;
    if input.is_empty()
        || input.len() > MAX_MOUNTINFO_BYTES
        || input.last() != Some(&b'\n')
        || !input.is_ascii()
    {
        return Err(mountinfo_error("LINUX_MOUNTINFO_DOCUMENT_BOUNDS"));
    }
    let document = std::str::from_utf8(input)
        .map_err(|_| mountinfo_error("LINUX_MOUNTINFO_DOCUMENT_NOT_UTF8"))?;
    let mut records = Vec::new();
    for line in document.lines() {
        if line.is_empty() || records.len() >= MAX_MOUNTINFO_ROWS {
            return Err(mountinfo_error("LINUX_MOUNTINFO_DOCUMENT_SHAPE"));
        }
        records.push(parse_linux_mountinfo_line(line)?);
    }
    if records.is_empty() {
        return Err(mountinfo_error("LINUX_MOUNTINFO_DOCUMENT_SHAPE"));
    }
    Ok(records)
}

pub fn select_linux_mount_for_target<'a>(
    records: &'a [LinuxMountInfo],
    target: &str,
) -> Result<&'a LinuxMountInfo, LinuxMountInfoError> {
    if !is_canonical_absolute_linux_path(target) {
        return Err(mountinfo_error("LINUX_TARGET_PATH_NOT_CANONICAL"));
    }
    let mut selected: Option<&LinuxMountInfo> = None;
    for record in records {
        let matches = record.mount_point == "/"
            || target == record.mount_point
            || target
                .strip_prefix(&record.mount_point)
                .is_some_and(|suffix| suffix.starts_with('/'));
        if !matches {
            continue;
        }
        match selected {
            Some(current) if current.mount_point.len() == record.mount_point.len() => {
                return Err(mountinfo_error("LINUX_MOUNTINFO_TARGET_AMBIGUOUS"));
            }
            Some(current) if current.mount_point.len() > record.mount_point.len() => {}
            _ => selected = Some(record),
        }
    }
    selected.ok_or_else(|| mountinfo_error("LINUX_MOUNTINFO_TARGET_UNMAPPED"))
}

fn linux_deny(code: &'static str) -> LinuxHostProbeVerdict {
    LinuxHostProbeVerdict::Deny(LinuxHostProbeError { code })
}

pub fn admit_measured_linux_host(measured: MeasuredLinuxHost) -> LinuxHostProbeVerdict {
    if !measured.facts_complete {
        return linux_deny("LINUX_HOST_FACTS_INCOMPLETE");
    }
    if !measured.target_is_absolute || !measured.target_is_direct_directory {
        return linux_deny("LINUX_PATH_NOT_ABSOLUTE_DIRECT_DIRECTORY");
    }
    if measured.symbolic_ancestor_present {
        return linux_deny("LINUX_PATH_SYMBOLIC_ANCESTOR");
    }
    if measured.storage_kind != LinuxStorageKind::DirectLocalBlock {
        return linux_deny("LINUX_STORAGE_KIND_NOT_ADMITTED");
    }
    if !measured.mount_read_write {
        return linux_deny("LINUX_MOUNT_NOT_READ_WRITE");
    }
    if !measured.mount_namespace_stable {
        return linux_deny("LINUX_MOUNT_NAMESPACE_CHANGED");
    }
    if !measured.filesystem_magic_matches {
        return linux_deny("LINUX_FILESYSTEM_IDENTITY_MISMATCH");
    }
    if !measured.device_identity_stable || measured.device_major == 0 || measured.mount_id == 0 {
        return linux_deny("LINUX_DEVICE_IDENTITY_UNAVAILABLE");
    }
    if !matches!(measured.filesystem.as_str(), "ext4" | "xfs" | "btrfs") {
        return linux_deny("LINUX_FILESYSTEM_NOT_ADMITTED");
    }
    LinuxHostProbeVerdict::Candidate(AdmittedLinuxHost {
        filesystem: measured.filesystem,
        device_major: measured.device_major,
        device_minor: measured.device_minor,
        mount_id: measured.mount_id,
    })
}

pub const STATIC_LINK_PROFILE_SCHEMA: &str = "galerina-registry-durability-static-link-profile/v1";
pub const STATIC_LINK_PROFILE_ABI: &str = "galerina.registry.durability.abi.v1";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StaticLinkProfileClaim {
    pub schema: &'static str,
    pub abi: &'static str,
    pub adapter_source_sha256: String,
    pub fungi_contract_sha256: String,
    pub build_profile: &'static str,
    pub adapter_is_statically_linked: bool,
    pub external_adapter_loader_present: bool,
    pub fault_injection_present: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StaticLinkProfileEvidence {
    pub schema: &'static str,
    pub abi: &'static str,
    pub adapter_source_sha256: String,
    pub fungi_contract_sha256: String,
    pub build_profile: &'static str,
    pub adapter_is_statically_linked: bool,
    pub external_adapter_loader_present: bool,
    pub fault_injection_present: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StaticLinkProfileVerdict {
    Candidate(StaticLinkProfileEvidence),
    Deny(&'static str),
}

const ADAPTER_SOURCE_BYTES: &[u8] = include_bytes!("lib.rs");
const FUNGI_CONTRACT_BYTES: &[u8] =
    include_bytes!("../../../src/self-hosted/registry-durability-admission.fungi");

/// Dependency-free SHA-256 for binding the compile-time embedded source and
/// contract. It is intentionally public so an independent harness can compare
/// it with a second implementation and published test vectors.
pub fn sha256(input: &[u8]) -> String {
    const INITIAL: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    const ROUND: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];

    let bit_length = (input.len() as u64).wrapping_mul(8);
    let mut padded = Vec::with_capacity(input.len().saturating_add(72));
    padded.extend_from_slice(input);
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_length.to_be_bytes());

    let mut state = INITIAL;
    for block in padded.as_chunks::<64>().0 {
        let mut words = [0_u32; 64];
        for (index, bytes) in block.as_chunks::<4>().0.iter().enumerate() {
            words[index] = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        }
        for index in 16..64 {
            let s0 = words[index - 15].rotate_right(7)
                ^ words[index - 15].rotate_right(18)
                ^ (words[index - 15] >> 3);
            let s1 = words[index - 2].rotate_right(17)
                ^ words[index - 2].rotate_right(19)
                ^ (words[index - 2] >> 10);
            words[index] = words[index - 16]
                .wrapping_add(s0)
                .wrapping_add(words[index - 7])
                .wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = state;
        for index in 0..64 {
            let upper = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let choose = (e & f) ^ ((!e) & g);
            let first = h
                .wrapping_add(upper)
                .wrapping_add(choose)
                .wrapping_add(ROUND[index])
                .wrapping_add(words[index]);
            let lower = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let majority = (a & b) ^ (a & c) ^ (b & c);
            let second = lower.wrapping_add(majority);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(first);
            d = c;
            c = b;
            b = a;
            a = first.wrapping_add(second);
        }
        state[0] = state[0].wrapping_add(a);
        state[1] = state[1].wrapping_add(b);
        state[2] = state[2].wrapping_add(c);
        state[3] = state[3].wrapping_add(d);
        state[4] = state[4].wrapping_add(e);
        state[5] = state[5].wrapping_add(f);
        state[6] = state[6].wrapping_add(g);
        state[7] = state[7].wrapping_add(h);
    }

    state.iter().map(|word| format!("{word:08x}")).collect()
}

pub const MAX_PRODUCTION_GENERATION_BYTES: usize = 16 * 1_048_576;
const PRODUCTION_GENERATION_ID_CONTEXT: &[u8] = b"galerina.registry.generation.v1\0";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidatedProductionHostRequest {
    pub directory: String,
    pub generation_id: String,
    pub byte_length: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProductionHostRequestVerdict {
    Candidate(ValidatedProductionHostRequest),
    Deny(&'static str),
}

impl ProductionHostRequestVerdict {
    pub const fn denial_code(&self) -> Option<&'static str> {
        match self {
            Self::Candidate(_) => None,
            Self::Deny(code) => Some(code),
        }
    }
}

pub fn production_host_generation_id(bytes: &[u8]) -> String {
    let mut preimage = Vec::with_capacity(
        PRODUCTION_GENERATION_ID_CONTEXT
            .len()
            .saturating_add(bytes.len()),
    );
    preimage.extend_from_slice(PRODUCTION_GENERATION_ID_CONTEXT);
    preimage.extend_from_slice(bytes);
    sha256(&preimage)
}

pub fn assess_production_host_request(
    directory: &str,
    generation_id: &str,
    bytes: &[u8],
) -> ProductionHostRequestVerdict {
    if directory.contains('\0') {
        return ProductionHostRequestVerdict::Deny("PRODUCTION_HOST_DIRECTORY_NUL");
    }
    if !Path::new(directory).is_absolute() {
        return ProductionHostRequestVerdict::Deny("PRODUCTION_HOST_DIRECTORY_NOT_ABSOLUTE");
    }
    if generation_id.len() != 64
        || !generation_id
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return ProductionHostRequestVerdict::Deny("PRODUCTION_HOST_GENERATION_ID_MALFORMED");
    }
    if bytes.is_empty() {
        return ProductionHostRequestVerdict::Deny("PRODUCTION_HOST_GENERATION_EMPTY");
    }
    if bytes.len() > MAX_PRODUCTION_GENERATION_BYTES {
        return ProductionHostRequestVerdict::Deny("PRODUCTION_HOST_GENERATION_TOO_LARGE");
    }
    if production_host_generation_id(bytes) != generation_id {
        return ProductionHostRequestVerdict::Deny("PRODUCTION_HOST_GENERATION_ID_MISMATCH");
    }
    ProductionHostRequestVerdict::Candidate(ValidatedProductionHostRequest {
        directory: directory.to_owned(),
        generation_id: generation_id.to_owned(),
        byte_length: bytes.len(),
    })
}

pub const PRODUCTION_HOST_ABI_VERSION: u32 = 1;
const MAX_PRODUCTION_DIRECTORY_BYTES: usize = 32_768;

#[repr(C)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GalerinaProductionHostResultV1 {
    pub abi_version: u32,
    pub verdict: i32,
    pub os_code: i64,
    pub byte_length: u64,
    pub production_authorizing: u8,
    pub reserved: [u8; 7],
    pub reason: [u8; 96],
    pub platform: [u8; 16],
    pub generation_id: [u8; 64],
    pub adapter_source_sha256: [u8; 64],
}

impl Default for GalerinaProductionHostResultV1 {
    fn default() -> Self {
        Self {
            abi_version: PRODUCTION_HOST_ABI_VERSION,
            verdict: -1,
            os_code: 0,
            byte_length: 0,
            production_authorizing: 0,
            reserved: [0; 7],
            reason: [0; 96],
            platform: [0; 16],
            generation_id: [0; 64],
            adapter_source_sha256: [0; 64],
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProductionHostPublicationEvidence {
    pub platform: &'static str,
    pub generation_id: String,
    pub byte_length: usize,
    pub adapter_source_sha256: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProductionHostPublicationVerdict {
    Candidate(ProductionHostPublicationEvidence),
    Deny {
        code: &'static str,
        os_code: Option<i64>,
    },
}

fn production_host_deny(
    code: &'static str,
    os_code: Option<i64>,
) -> ProductionHostPublicationVerdict {
    ProductionHostPublicationVerdict::Deny { code, os_code }
}

pub fn publish_production_host_generation(
    directory: &str,
    generation_id: &str,
    bytes: &[u8],
) -> ProductionHostPublicationVerdict {
    let validated = match assess_production_host_request(directory, generation_id, bytes) {
        ProductionHostRequestVerdict::Candidate(value) => value,
        ProductionHostRequestVerdict::Deny(code) => return production_host_deny(code, None),
    };

    #[cfg(windows)]
    let platform_result = match publish_windows_generation_candidate(
        Path::new(&validated.directory),
        &validated.generation_id,
        bytes,
    ) {
        WindowsGenerationPublicationVerdict::Candidate { byte_length } => {
            Ok(("windows", byte_length))
        }
        WindowsGenerationPublicationVerdict::Deny(error) => {
            Err((error.code(), error.os_code().map(i64::from)))
        }
    };

    #[cfg(all(
        target_os = "linux",
        target_env = "gnu",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    let platform_result = match publish_linux_generation_candidate(
        Path::new(&validated.directory),
        &validated.generation_id,
        bytes,
    ) {
        LinuxGenerationPublicationVerdict::Candidate { byte_length } => Ok(("linux", byte_length)),
        LinuxGenerationPublicationVerdict::Deny(error) => Err((error.code(), None)),
    };

    #[cfg(target_os = "macos")]
    let platform_result = match publish_macos_generation_candidate(
        Path::new(&validated.directory),
        &validated.generation_id,
        bytes,
    ) {
        MacosGenerationPublicationVerdict::Candidate { byte_length } => Ok(("macos", byte_length)),
        MacosGenerationPublicationVerdict::Deny(error) => {
            Err((error.code(), error.os_code().map(i64::from)))
        }
    };

    #[cfg(not(any(
        windows,
        target_os = "macos",
        all(
            target_os = "linux",
            target_env = "gnu",
            target_pointer_width = "64",
            any(target_arch = "x86_64", target_arch = "aarch64")
        )
    )))]
    let platform_result: Result<(&'static str, usize), (&'static str, Option<i64>)> =
        Err(("PRODUCTION_HOST_PLATFORM_UNAVAILABLE", None));

    match platform_result {
        Ok((platform, byte_length)) if byte_length == validated.byte_length => {
            ProductionHostPublicationVerdict::Candidate(ProductionHostPublicationEvidence {
                platform,
                generation_id: validated.generation_id,
                byte_length,
                adapter_source_sha256: sha256(ADAPTER_SOURCE_BYTES),
            })
        }
        Ok(_) => production_host_deny("PRODUCTION_HOST_BYTE_LENGTH_MISMATCH", None),
        Err((code, os_code)) => production_host_deny(code, os_code),
    }
}

fn copy_result_field<const N: usize>(target: &mut [u8; N], value: &str) {
    let count = target.len().min(value.len());
    target[..count].copy_from_slice(&value.as_bytes()[..count]);
}

fn production_host_ffi_inner(
    directory: &[u8],
    generation_id: &[u8],
    bytes: &[u8],
) -> GalerinaProductionHostResultV1 {
    let mut result = GalerinaProductionHostResultV1::default();
    let directory = match std::str::from_utf8(directory) {
        Ok(value) => value,
        Err(_) => {
            copy_result_field(&mut result.reason, "PRODUCTION_HOST_DIRECTORY_NOT_UTF8");
            return result;
        }
    };
    let generation_id = match std::str::from_utf8(generation_id) {
        Ok(value) => value,
        Err(_) => {
            copy_result_field(
                &mut result.reason,
                "PRODUCTION_HOST_GENERATION_ID_MALFORMED",
            );
            return result;
        }
    };
    match publish_production_host_generation(directory, generation_id, bytes) {
        ProductionHostPublicationVerdict::Candidate(evidence) => {
            result.verdict = 1;
            result.byte_length = evidence.byte_length as u64;
            copy_result_field(&mut result.platform, evidence.platform);
            copy_result_field(&mut result.generation_id, &evidence.generation_id);
            copy_result_field(
                &mut result.adapter_source_sha256,
                &evidence.adapter_source_sha256,
            );
        }
        ProductionHostPublicationVerdict::Deny { code, os_code } => {
            result.os_code = os_code.unwrap_or(0);
            copy_result_field(&mut result.reason, code);
        }
    }
    result
}

/// Publishes one exact registry generation through the platform adapter linked
/// into this image.
///
/// # Safety
///
/// Each non-null input pointer must remain valid for its declared byte length
/// for the duration of the call. `out_result` must point to writable storage
/// for one `GalerinaProductionHostResultV1`.
#[no_mangle]
pub unsafe extern "C" fn galerina_registry_publish_generation_v1(
    directory_ptr: *const u8,
    directory_len: usize,
    generation_id_ptr: *const u8,
    generation_id_len: usize,
    generation_bytes_ptr: *const u8,
    generation_bytes_len: usize,
    out_result: *mut GalerinaProductionHostResultV1,
) -> i32 {
    if out_result.is_null() {
        return -2;
    }
    let mut early = GalerinaProductionHostResultV1::default();
    if directory_ptr.is_null()
        || generation_id_ptr.is_null()
        || generation_bytes_ptr.is_null()
        || directory_len == 0
        || directory_len > MAX_PRODUCTION_DIRECTORY_BYTES
        || generation_id_len != 64
        || generation_bytes_len == 0
        || generation_bytes_len > MAX_PRODUCTION_GENERATION_BYTES
    {
        copy_result_field(&mut early.reason, "PRODUCTION_HOST_ABI_INPUT_REFUSED");
        unsafe { std::ptr::write(out_result, early) };
        return -1;
    }

    let directory = unsafe { std::slice::from_raw_parts(directory_ptr, directory_len) };
    let generation_id = unsafe { std::slice::from_raw_parts(generation_id_ptr, generation_id_len) };
    let generation_bytes =
        unsafe { std::slice::from_raw_parts(generation_bytes_ptr, generation_bytes_len) };
    let outcome = std::panic::catch_unwind(|| {
        production_host_ffi_inner(directory, generation_id, generation_bytes)
    });
    let result = match outcome {
        Ok(value) => value,
        Err(_) => {
            let mut denied = GalerinaProductionHostResultV1::default();
            copy_result_field(&mut denied.reason, "PRODUCTION_HOST_INTERNAL_REFUSAL");
            denied
        }
    };
    let status = result.verdict;
    unsafe { std::ptr::write(out_result, result) };
    status
}

pub fn embedded_static_link_profile() -> StaticLinkProfileEvidence {
    StaticLinkProfileEvidence {
        schema: STATIC_LINK_PROFILE_SCHEMA,
        abi: STATIC_LINK_PROFILE_ABI,
        adapter_source_sha256: sha256(ADAPTER_SOURCE_BYTES),
        fungi_contract_sha256: sha256(FUNGI_CONTRACT_BYTES),
        build_profile: if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
        adapter_is_statically_linked: true,
        external_adapter_loader_present: false,
        fault_injection_present: cfg!(feature = "fault-injection"),
    }
}

pub fn assess_static_link_profile(claim: &StaticLinkProfileClaim) -> StaticLinkProfileVerdict {
    let embedded = embedded_static_link_profile();
    if embedded.fault_injection_present || claim.fault_injection_present {
        return StaticLinkProfileVerdict::Deny("STATIC_PROFILE_FAULT_INJECTION_PRESENT");
    }
    if claim.schema != embedded.schema {
        return StaticLinkProfileVerdict::Deny("STATIC_PROFILE_SCHEMA_MISMATCH");
    }
    if claim.abi != embedded.abi {
        return StaticLinkProfileVerdict::Deny("STATIC_PROFILE_ABI_MISMATCH");
    }
    if claim.adapter_source_sha256 != embedded.adapter_source_sha256 {
        return StaticLinkProfileVerdict::Deny("STATIC_PROFILE_SOURCE_MISMATCH");
    }
    if claim.fungi_contract_sha256 != embedded.fungi_contract_sha256 {
        return StaticLinkProfileVerdict::Deny("STATIC_PROFILE_CONTRACT_MISMATCH");
    }
    if claim.build_profile != embedded.build_profile || embedded.build_profile != "release" {
        return StaticLinkProfileVerdict::Deny("STATIC_PROFILE_NOT_RELEASE");
    }
    if !claim.adapter_is_statically_linked || !embedded.adapter_is_statically_linked {
        return StaticLinkProfileVerdict::Deny("STATIC_PROFILE_NOT_STATIC");
    }
    if claim.external_adapter_loader_present || embedded.external_adapter_loader_present {
        return StaticLinkProfileVerdict::Deny("STATIC_PROFILE_EXTERNAL_LOADER_PRESENT");
    }
    StaticLinkProfileVerdict::Candidate(embedded)
}

fn deny(code: &'static str, os_code: Option<u32>) -> WindowsHostProbeVerdict {
    WindowsHostProbeVerdict::Deny(WindowsHostProbeError { code, os_code })
}

pub fn admit_measured_windows_host(measured: MeasuredWindowsHost) -> WindowsHostProbeVerdict {
    if !measured.native_process {
        return deny("WINDOWS_PROCESS_ARCHITECTURE_TRANSLATED", None);
    }
    if measured.architecture != WindowsArchitecture::X86_64 {
        return deny("WINDOWS_ARCHITECTURE_NOT_ADMITTED", None);
    }
    if measured.os_major != 10 {
        return deny("WINDOWS_OS_MAJOR_NOT_ADMITTED", None);
    }
    let release_matches_build = match measured.release {
        WindowsRelease::Windows10 => (10_240..22_000).contains(&measured.os_build),
        WindowsRelease::Windows11 => measured.os_build >= 22_000,
        WindowsRelease::Unknown => false,
    };
    if !release_matches_build {
        return deny("WINDOWS_RELEASE_IDENTITY_MISMATCH", None);
    }
    if measured.drive_type != DRIVE_FIXED {
        return deny("WINDOWS_VOLUME_NOT_FIXED_LOCAL", None);
    }
    if measured.filesystem_flags & FILE_SUPPORTS_REMOTE_STORAGE != 0 {
        return deny("WINDOWS_VOLUME_SUPPORTS_REMOTE_STORAGE", None);
    }
    let filesystem = if measured.filesystem.eq_ignore_ascii_case("NTFS") {
        "ntfs"
    } else {
        return deny("WINDOWS_FILESYSTEM_NOT_ADMITTED", None);
    };
    WindowsHostProbeVerdict::Candidate(AdmittedWindowsHost {
        drive_type: measured.drive_type,
        filesystem: filesystem.to_owned(),
        filesystem_flags: measured.filesystem_flags,
        volume_serial: measured.volume_serial,
        release: measured.release,
        os_major: measured.os_major,
        os_build: measured.os_build,
        architecture: measured.architecture,
        native_process: measured.native_process,
    })
}

fn macos_deny(code: &'static str, os_code: Option<i32>) -> MacosHostProbeVerdict {
    MacosHostProbeVerdict::Deny(MacosHostProbeError { code, os_code })
}

pub fn admit_measured_macos_host(measured: MeasuredMacosHost) -> MacosHostProbeVerdict {
    if !measured.facts_complete {
        return macos_deny("MACOS_HOST_FACTS_INCOMPLETE", None);
    }
    if measured.operating_system != "macos" {
        return macos_deny("MACOS_PLATFORM_NOT_ADMITTED", None);
    }
    if measured.architecture != "arm64" {
        return macos_deny("MACOS_ARCHITECTURE_NOT_ADMITTED", None);
    }
    if !measured.target_is_absolute || !measured.target_is_direct_directory {
        return macos_deny("MACOS_PATH_NOT_ABSOLUTE_DIRECT_DIRECTORY", None);
    }
    if measured.symbolic_ancestor_present {
        return macos_deny("MACOS_PATH_SYMBOLIC_ANCESTOR", None);
    }
    if measured.filesystem != "apfs" {
        return macos_deny("MACOS_FILESYSTEM_NOT_ADMITTED", None);
    }
    if measured.storage_kind != MacosStorageKind::DirectInternal {
        return macos_deny("MACOS_STORAGE_KIND_NOT_ADMITTED", None);
    }
    if !measured.mount_is_local {
        return macos_deny("MACOS_MOUNT_NOT_LOCAL", None);
    }
    if !measured.mount_is_read_write {
        return macos_deny("MACOS_MOUNT_NOT_READ_WRITE", None);
    }
    if !measured.identity_stable {
        return macos_deny("MACOS_IDENTITY_UNSTABLE", None);
    }
    // This is the retained directory identity, not the generation file.
    // APFS directory link counts are not a single-link invariant. Generation
    // staging and reopen enforce exactly one link inside publication.
    if measured.link_count == 0 {
        return macos_deny("MACOS_LINK_COUNT_UNAVAILABLE", None);
    }
    if !measured.full_flush_available {
        return macos_deny("MACOS_FULL_FLUSH_UNAVAILABLE", None);
    }
    if measured.device_id == 0 {
        return macos_deny("MACOS_DEVICE_ID_UNAVAILABLE", None);
    }
    MacosHostProbeVerdict::Candidate(AdmittedMacosHost {
        operating_system: measured.operating_system,
        architecture: measured.architecture,
        filesystem: measured.filesystem,
        storage_kind: measured.storage_kind,
        link_count: measured.link_count,
        device_id: measured.device_id,
    })
}

#[cfg(all(
    target_os = "linux",
    target_env = "gnu",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
mod linux {
    #[cfg(feature = "fault-injection")]
    use super::LinuxPublicationFault;
    use super::{
        admit_measured_linux_host, classify_linux_sysfs_observation,
        correlate_linux_host_observation, decode_linux_device_number, linux_deny,
        parse_linux_mountinfo, select_linux_mount_for_target, AdmittedLinuxHost,
        LinuxGenerationPublicationVerdict, LinuxHostObservation, LinuxHostProbeError,
        LinuxHostProbeVerdict, LinuxMountInfo, LinuxStorageKind, LinuxSysfsObservation,
    };
    use std::ffi::{c_char, c_int, c_long, c_void, CString};
    use std::fs::{self, File, Metadata, OpenOptions};
    use std::io::{self, Read, Write};
    use std::os::fd::{AsRawFd, FromRawFd, RawFd};
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
    use std::path::{Component, Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    const MAX_GENERATION_BYTES: usize = 16 * 1024 * 1024;
    const O_WRONLY: c_int = 1;
    const O_CREAT: c_int = 0o100;
    const O_EXCL: c_int = 0o200;
    const O_DIRECTORY: c_int = 0o200000;
    const O_NOFOLLOW: c_int = 0o400000;
    const O_CLOEXEC: c_int = 0o2000000;
    const ENOENT: i32 = 2;
    const EEXIST: i32 = 17;
    const RENAME_NOREPLACE: u32 = 1;
    const STATFS_OUTPUT_BYTES: usize = 256;

    #[repr(C, align(16))]
    struct LinuxStatFsBuffer {
        bytes: [u8; STATFS_OUTPUT_BYTES],
    }

    unsafe extern "C" {
        fn fstatfs(file_descriptor: c_int, output: *mut c_void) -> c_int;
        fn openat(
            directory_descriptor: c_int,
            path: *const c_char,
            flags: c_int,
            mode: u32,
        ) -> c_int;
        fn unlinkat(directory_descriptor: c_int, path: *const c_char, flags: c_int) -> c_int;
        fn renameat2(
            old_directory_descriptor: c_int,
            old_path: *const c_char,
            new_directory_descriptor: c_int,
            new_path: *const c_char,
            flags: u32,
        ) -> c_int;
    }

    struct AnchoredLinuxDirectory {
        directory: File,
        path: PathBuf,
        device: u64,
        inode: u64,
        mount: LinuxMountInfo,
        admitted: AdmittedLinuxHost,
    }

    fn publication_deny(code: &'static str) -> LinuxGenerationPublicationVerdict {
        LinuxGenerationPublicationVerdict::Deny(LinuxHostProbeError { code })
    }

    fn generation_id_valid(generation_id: &str) -> bool {
        generation_id.len() == 64
            && generation_id
                .bytes()
                .all(|value| value.is_ascii_digit() || (b'a'..=b'f').contains(&value))
    }

    fn direct_directory_metadata(path: &Path) -> Result<Metadata, ()> {
        let text = path.to_str().ok_or(())?;
        if !super::is_canonical_absolute_linux_path(text) {
            return Err(());
        }
        let mut current = PathBuf::from("/");
        for component in path.components() {
            match component {
                Component::RootDir => continue,
                Component::Normal(value) => current.push(value),
                _ => return Err(()),
            }
            let metadata = fs::symlink_metadata(&current).map_err(|_| ())?;
            if metadata.file_type().is_symlink() {
                return Err(());
            }
        }
        let metadata = fs::symlink_metadata(path).map_err(|_| ())?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(());
        }
        Ok(metadata)
    }

    fn read_mountinfo() -> Result<Vec<LinuxMountInfo>, ()> {
        let input = fs::read("/proc/self/mountinfo").map_err(|_| ())?;
        parse_linux_mountinfo(&input).map_err(|_| ())
    }

    fn statfs_magic(directory: &File) -> Result<u64, ()> {
        let mut output = LinuxStatFsBuffer {
            bytes: [0; STATFS_OUTPUT_BYTES],
        };
        // SAFETY: the supported GNU Linux ABIs place f_type in the first
        // c_long. The aligned buffer is deliberately larger than statfs on
        // the admitted x86-64 and AArch64 ABIs, and directory owns a live
        // descriptor. No assumed Rust representation of the remaining C
        // structure crosses this boundary.
        if unsafe {
            fstatfs(
                directory.as_raw_fd(),
                output.bytes.as_mut_ptr().cast::<c_void>(),
            )
        } != 0
        {
            return Err(());
        }
        // SAFETY: the buffer is aligned for c_long and successful fstatfs
        // initialized at least its first field.
        let filesystem_type = unsafe { output.bytes.as_ptr().cast::<c_long>().read() };
        u64::try_from(filesystem_type).map_err(|_| ())
    }

    fn read_exact_flag(path: &Path) -> Option<bool> {
        let metadata = fs::symlink_metadata(path).ok()?;
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 4 {
            return None;
        }
        match fs::read(path).ok()?.as_slice() {
            b"0\n" | b"0" => Some(false),
            b"1\n" | b"1" => Some(true),
            _ => None,
        }
    }

    fn removable_flag(device_path: &Path) -> Option<bool> {
        let mut current = Some(device_path);
        for _ in 0..32 {
            let directory = current?;
            let flag = directory.join("removable");
            match fs::symlink_metadata(&flag) {
                Ok(_) => return read_exact_flag(&flag),
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(_) => return None,
            }
            if directory == Path::new("/sys/devices") {
                return None;
            }
            current = directory.parent();
        }
        None
    }

    fn slaves_flag(device_path: &Path) -> Option<bool> {
        let slaves = device_path.join("slaves");
        let metadata = fs::symlink_metadata(&slaves).ok()?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return None;
        }
        let mut entries = fs::read_dir(slaves).ok()?;
        match entries.next() {
            None => Some(false),
            Some(Ok(_)) => Some(true),
            Some(Err(_)) => None,
        }
    }

    fn classify_sysfs(major: u32, minor: u32) -> (LinuxStorageKind, bool) {
        let link = PathBuf::from(format!("/sys/dev/block/{major}:{minor}"));
        let link_metadata = match fs::symlink_metadata(&link) {
            Ok(value) if value.file_type().is_symlink() => value,
            _ => return (LinuxStorageKind::Unknown, false),
        };
        let _ = link_metadata;
        let canonical = match fs::canonicalize(link) {
            Ok(value) => value,
            Err(_) => return (LinuxStorageKind::Unknown, false),
        };
        let canonical_text = match canonical.to_str() {
            Some(value) => value.to_owned(),
            None => return (LinuxStorageKind::Unknown, false),
        };
        let classification = classify_linux_sysfs_observation(LinuxSysfsObservation {
            canonical_device_path: canonical_text,
            removable: removable_flag(&canonical),
            has_slaves: slaves_flag(&canonical),
        });
        (classification.storage_kind, classification.facts_complete)
    }

    fn open_directory(path: &Path) -> Result<File, ()> {
        OpenOptions::new()
            .read(true)
            .custom_flags(O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            .open(path)
            .map_err(|_| ())
    }

    fn anchor_directory(path: &Path) -> Result<AnchoredLinuxDirectory, LinuxHostProbeVerdict> {
        let before_metadata = direct_directory_metadata(path)
            .map_err(|_| linux_deny("LINUX_PATH_INSPECTION_REFUSED"))?;
        let target = path
            .to_str()
            .ok_or_else(|| linux_deny("LINUX_PATH_NOT_UTF8"))?;
        let mountinfo_before =
            read_mountinfo().map_err(|_| linux_deny("LINUX_MOUNTINFO_READ_REFUSED"))?;
        let mount_before = select_linux_mount_for_target(&mountinfo_before, target)
            .map_err(|_| linux_deny("LINUX_MOUNTINFO_TARGET_REFUSED"))?
            .clone();
        let directory =
            open_directory(path).map_err(|_| linux_deny("LINUX_DIRECTORY_OPEN_REFUSED"))?;
        let handle_metadata = directory
            .metadata()
            .map_err(|_| linux_deny("LINUX_DIRECTORY_STAT_REFUSED"))?;
        if before_metadata.dev() != handle_metadata.dev()
            || before_metadata.ino() != handle_metadata.ino()
        {
            return Err(linux_deny("LINUX_DIRECTORY_IDENTITY_CHANGED"));
        }
        let (major, minor) = decode_linux_device_number(handle_metadata.dev())
            .ok_or_else(|| linux_deny("LINUX_DEVICE_IDENTITY_UNAVAILABLE"))?;
        let magic = statfs_magic(&directory).map_err(|_| linux_deny("LINUX_STATFS_REFUSED"))?;
        let (storage_kind, sysfs_chain_complete) = classify_sysfs(major, minor);
        let mountinfo_after =
            read_mountinfo().map_err(|_| linux_deny("LINUX_MOUNTINFO_READ_REFUSED"))?;
        let mount_after = select_linux_mount_for_target(&mountinfo_after, target)
            .map_err(|_| linux_deny("LINUX_MOUNTINFO_TARGET_REFUSED"))?
            .clone();
        let after_metadata = direct_directory_metadata(path)
            .map_err(|_| linux_deny("LINUX_PATH_RECHECK_REFUSED"))?;
        if after_metadata.dev() != handle_metadata.dev()
            || after_metadata.ino() != handle_metadata.ino()
        {
            return Err(linux_deny("LINUX_DIRECTORY_IDENTITY_CHANGED"));
        }
        let measured = correlate_linux_host_observation(LinuxHostObservation {
            target_is_absolute: true,
            target_is_direct_directory: true,
            symbolic_ancestor_present: false,
            mount_before: mount_before.clone(),
            mount_after,
            statfs_magic: magic,
            stat_device_major: major,
            stat_device_minor: minor,
            storage_kind,
            sysfs_chain_complete,
        });
        match admit_measured_linux_host(measured) {
            LinuxHostProbeVerdict::Candidate(admitted) => Ok(AnchoredLinuxDirectory {
                directory,
                path: path.to_path_buf(),
                device: handle_metadata.dev(),
                inode: handle_metadata.ino(),
                mount: mount_before,
                admitted,
            }),
            denied @ LinuxHostProbeVerdict::Deny(_) => Err(denied),
        }
    }

    fn c_name(value: &str) -> Result<CString, ()> {
        if value.is_empty() || value.len() > 255 || value.contains('/') {
            return Err(());
        }
        CString::new(value).map_err(|_| ())
    }

    fn openat_file(directory: RawFd, name: &CString, flags: c_int, mode: u32) -> io::Result<File> {
        // SAFETY: name is NUL-terminated, directory is a live retained
        // descriptor, and ownership of a successful descriptor moves to File.
        let descriptor = unsafe { openat(directory, name.as_ptr(), flags, mode) };
        if descriptor < 0 {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: descriptor is newly returned and uniquely owned here.
        Ok(unsafe { File::from_raw_fd(descriptor) })
    }

    fn unlink_name(directory: RawFd, name: &CString) -> bool {
        // SAFETY: name and directory descriptor remain valid for the call.
        (unsafe { unlinkat(directory, name.as_ptr(), 0) }) == 0
    }

    fn read_exact_at(directory: RawFd, name: &CString, expected: &[u8]) -> Result<bool, ()> {
        let mut file = openat_file(directory, name, O_NOFOLLOW | O_CLOEXEC, 0).map_err(|_| ())?;
        let before = file.metadata().map_err(|_| ())?;
        if !before.is_file() || before.nlink() != 1 || before.len() != expected.len() as u64 {
            return Ok(false);
        }
        let mut observed = Vec::with_capacity(expected.len());
        file.read_to_end(&mut observed).map_err(|_| ())?;
        let after = file.metadata().map_err(|_| ())?;
        Ok(before.dev() == after.dev()
            && before.ino() == after.ino()
            && before.len() == after.len()
            && before.nlink() == after.nlink()
            && observed == expected)
    }

    fn anchor_unchanged(anchor: &AnchoredLinuxDirectory) -> bool {
        let metadata = match direct_directory_metadata(&anchor.path) {
            Ok(value) => value,
            Err(()) => return false,
        };
        if metadata.dev() != anchor.device || metadata.ino() != anchor.inode {
            return false;
        }
        let target = match anchor.path.to_str() {
            Some(value) => value,
            None => return false,
        };
        let records = match read_mountinfo() {
            Ok(value) => value,
            Err(()) => return false,
        };
        matches!(
            select_linux_mount_for_target(&records, target),
            Ok(observed) if observed == &anchor.mount
        ) && anchor.admitted.device_major == anchor.mount.device_major
            && anchor.admitted.device_minor == anchor.mount.device_minor
            && anchor.admitted.mount_id == anchor.mount.mount_id
    }

    pub fn probe(path: &Path) -> LinuxHostProbeVerdict {
        match anchor_directory(path) {
            Ok(anchor) if anchor_unchanged(&anchor) => {
                LinuxHostProbeVerdict::Candidate(anchor.admitted)
            }
            Ok(_) => linux_deny("LINUX_HOST_RECHECK_REFUSED"),
            Err(verdict) => verdict,
        }
    }

    #[cfg(not(feature = "fault-injection"))]
    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    enum LinuxPublicationFault {
        None,
        ShortWrite,
        ZeroProgress,
        DiskFull,
        FileBarrier,
        Publish,
        Reopen,
        DirectoryBarrier,
        NamespaceChanged,
        ReadbackChanged,
    }

    fn publish_generation_observed<F>(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
        fault: LinuxPublicationFault,
        mut observe: F,
    ) -> LinuxGenerationPublicationVerdict
    where
        F: FnMut(&'static str),
    {
        if !generation_id_valid(generation_id)
            || bytes.is_empty()
            || bytes.len() > MAX_GENERATION_BYTES
        {
            return publication_deny("LINUX_PUBLICATION_INPUT_REFUSED");
        }
        let anchor = match anchor_directory(directory) {
            Ok(value) => value,
            Err(_) => return publication_deny("LINUX_PUBLICATION_HOST_NOT_CANDIDATE"),
        };
        let descriptor = anchor.directory.as_raw_fd();
        let final_name = match c_name(&format!("registry-generation-{generation_id}.json")) {
            Ok(value) => value,
            Err(()) => return publication_deny("LINUX_PUBLICATION_FINAL_NAME_REFUSED"),
        };
        match openat_file(descriptor, &final_name, O_NOFOLLOW | O_CLOEXEC, 0) {
            Ok(_) => {
                return match read_exact_at(descriptor, &final_name, bytes) {
                    Ok(true)
                        if anchor.directory.sync_all().is_ok() && anchor_unchanged(&anchor) =>
                    {
                        LinuxGenerationPublicationVerdict::Candidate {
                            byte_length: bytes.len(),
                        }
                    }
                    _ => publication_deny("LINUX_PUBLICATION_COLLISION"),
                };
            }
            Err(error) if error.raw_os_error() == Some(ENOENT) => {}
            Err(_) => return publication_deny("LINUX_PUBLICATION_EXISTING_OPEN_REFUSED"),
        }
        let nonce = match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(value) => value.as_nanos(),
            Err(_) => return publication_deny("LINUX_PUBLICATION_NONCE_UNAVAILABLE"),
        };
        let stage_name = match c_name(&format!(
            ".registry-generation-{generation_id}.{}-{nonce}.tmp",
            std::process::id()
        )) {
            Ok(value) => value,
            Err(()) => return publication_deny("LINUX_PUBLICATION_STAGE_NAME_REFUSED"),
        };
        let mut stage = match openat_file(
            descriptor,
            &stage_name,
            O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
            0o600,
        ) {
            Ok(value) => value,
            Err(_) => return publication_deny("LINUX_PUBLICATION_STAGE_OPEN_REFUSED"),
        };
        observe("stage-opened");
        if matches!(fault, LinuxPublicationFault::ZeroProgress) {
            drop(stage);
            let _ = unlink_name(descriptor, &stage_name);
            return publication_deny("LINUX_WRITE_ZERO_PROGRESS_REFUSED");
        }
        if matches!(fault, LinuxPublicationFault::DiskFull) {
            drop(stage);
            let _ = unlink_name(descriptor, &stage_name);
            return publication_deny("LINUX_DISK_FULL_REFUSED");
        }
        let write_limit = if matches!(fault, LinuxPublicationFault::ShortWrite) {
            bytes.len().saturating_sub(1)
        } else {
            bytes.len()
        };
        let mut written = 0usize;
        while written < write_limit {
            let progress = match stage.write(&bytes[written..write_limit]) {
                Ok(0) => {
                    drop(stage);
                    let _ = unlink_name(descriptor, &stage_name);
                    return publication_deny("LINUX_WRITE_ZERO_PROGRESS_REFUSED");
                }
                Ok(value) => value,
                Err(error) if error.raw_os_error() == Some(28) => {
                    drop(stage);
                    let _ = unlink_name(descriptor, &stage_name);
                    return publication_deny("LINUX_DISK_FULL_REFUSED");
                }
                Err(_) => {
                    drop(stage);
                    let _ = unlink_name(descriptor, &stage_name);
                    return publication_deny("LINUX_PUBLICATION_STAGE_WRITE_REFUSED");
                }
            };
            let next = match written.checked_add(progress) {
                Some(value) if value > written && value <= write_limit => value,
                _ => {
                    drop(stage);
                    let _ = unlink_name(descriptor, &stage_name);
                    return publication_deny("LINUX_WRITE_PROGRESS_INVALID_REFUSED");
                }
            };
            written = next;
        }
        if written != bytes.len() {
            drop(stage);
            let _ = unlink_name(descriptor, &stage_name);
            return publication_deny("LINUX_WRITE_SHORT_REFUSED");
        }
        observe("bytes-written");
        if matches!(fault, LinuxPublicationFault::FileBarrier) {
            drop(stage);
            let _ = unlink_name(descriptor, &stage_name);
            return publication_deny("LINUX_FILE_BARRIER_REFUSED");
        }
        if stage.flush().is_err() || stage.sync_all().is_err() {
            drop(stage);
            let _ = unlink_name(descriptor, &stage_name);
            return publication_deny("LINUX_PUBLICATION_FILE_BARRIER_REFUSED");
        }
        let stage_metadata = match stage.metadata() {
            Ok(value) => value,
            Err(_) => {
                drop(stage);
                let _ = unlink_name(descriptor, &stage_name);
                return publication_deny("LINUX_PUBLICATION_STAGE_STAT_REFUSED");
            }
        };
        if !stage_metadata.is_file()
            || stage_metadata.dev() != anchor.device
            || stage_metadata.nlink() != 1
            || stage_metadata.len() != bytes.len() as u64
        {
            drop(stage);
            let _ = unlink_name(descriptor, &stage_name);
            return publication_deny("LINUX_PUBLICATION_STAGE_IDENTITY_REFUSED");
        }
        observe("file-flushed");
        drop(stage);
        observe("stage-closed");
        if matches!(fault, LinuxPublicationFault::Publish) {
            let _ = unlink_name(descriptor, &stage_name);
            return publication_deny("LINUX_PUBLICATION_REFUSED");
        }
        // SAFETY: both names are NUL-terminated and the atomic rename remains
        // relative to the same retained directory descriptor. RENAME_NOREPLACE
        // refuses rather than replacing an existing destination.
        let renamed = unsafe {
            renameat2(
                descriptor,
                stage_name.as_ptr(),
                descriptor,
                final_name.as_ptr(),
                RENAME_NOREPLACE,
            )
        };
        if renamed != 0 {
            let code = io::Error::last_os_error().raw_os_error();
            let _ = unlink_name(descriptor, &stage_name);
            return match code {
                Some(EEXIST)
                    if matches!(read_exact_at(descriptor, &final_name, bytes), Ok(true)) =>
                {
                    publication_deny("LINUX_PUBLICATION_RACE_COLLISION")
                }
                _ => publication_deny("LINUX_PUBLICATION_RENAME_REFUSED"),
            };
        }
        observe("published");
        if matches!(fault, LinuxPublicationFault::Reopen) {
            return publication_deny("LINUX_REOPEN_REFUSED");
        }
        if matches!(fault, LinuxPublicationFault::ReadbackChanged) {
            return publication_deny("LINUX_READBACK_MISMATCH_REFUSED");
        }
        if !matches!(read_exact_at(descriptor, &final_name, bytes), Ok(true)) {
            return publication_deny("LINUX_PUBLICATION_REOPEN_REFUSED");
        }
        observe("reopened-verified");
        if matches!(fault, LinuxPublicationFault::DirectoryBarrier) {
            return publication_deny("LINUX_DIRECTORY_BARRIER_REFUSED");
        }
        if anchor.directory.sync_all().is_err() {
            return publication_deny("LINUX_PUBLICATION_DIRECTORY_BARRIER_REFUSED");
        }
        observe("directory-flushed");
        if matches!(fault, LinuxPublicationFault::NamespaceChanged) {
            return publication_deny("LINUX_NAMESPACE_CHANGED_REFUSED");
        }
        if !anchor_unchanged(&anchor) {
            return publication_deny("LINUX_PUBLICATION_HOST_RECHECK_REFUSED");
        }
        LinuxGenerationPublicationVerdict::Candidate {
            byte_length: bytes.len(),
        }
    }

    pub fn publish_generation(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
    ) -> LinuxGenerationPublicationVerdict {
        publish_generation_observed(
            directory,
            generation_id,
            bytes,
            LinuxPublicationFault::None,
            |_| {},
        )
    }

    #[cfg(feature = "fault-injection")]
    pub fn publish_generation_fault_candidate<F>(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
        observe: F,
    ) -> LinuxGenerationPublicationVerdict
    where
        F: FnMut(&'static str),
    {
        publish_generation_observed(
            directory,
            generation_id,
            bytes,
            LinuxPublicationFault::None,
            observe,
        )
    }

    #[cfg(feature = "fault-injection")]
    pub fn publish_generation_injected_candidate(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
        fault: LinuxPublicationFault,
    ) -> LinuxGenerationPublicationVerdict {
        publish_generation_observed(directory, generation_id, bytes, fault, |_| {})
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{
        admit_measured_macos_host, MacosGenerationPublicationVerdict, MacosHostProbeError,
        MacosHostProbeVerdict, MacosPublicationFault, MacosStorageKind, MeasuredMacosHost,
    };
    use std::ffi::{c_char, c_int, c_void, CStr, CString};
    use std::fs::{self, File, Metadata};
    use std::io::{self, Read, Write};
    use std::os::fd::{AsRawFd, FromRawFd, RawFd};
    use std::os::unix::fs::MetadataExt;
    use std::path::{Component, Path};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    const MAX_GENERATION_BYTES: usize = 16 * 1024 * 1024;
    const MAX_PATH_BYTES: usize = 1024;
    const O_WRONLY: c_int = 1;
    const O_RDWR: c_int = 2;
    const O_NOFOLLOW: c_int = 0x0000_0100;
    const O_CREAT: c_int = 0x0000_0200;
    const O_EXCL: c_int = 0x0000_0800;
    const O_CLOEXEC: c_int = 0x0100_0000;
    const RENAME_EXCL: u32 = 0x0000_0004;
    const F_FULLFSYNC: c_int = 51;
    const MNT_RDONLY: u32 = 0x0000_0001;
    const MNT_REMOVABLE: u32 = 0x0000_0200;
    const MNT_LOCAL: u32 = 0x0000_1000;
    const MNT_SNAPSHOT: u32 = 0x4000_0000;
    const EEXIST: i32 = 17;
    const ENOSPC: i32 = 28;
    const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

    static NONCE: AtomicU64 = AtomicU64::new(1);

    #[repr(C)]
    struct StatFs {
        block_size: u32,
        io_size: i32,
        blocks: u64,
        blocks_free: u64,
        blocks_available: u64,
        files: u64,
        files_free: u64,
        filesystem_id: [i32; 2],
        owner: u32,
        filesystem_type: u32,
        flags: u32,
        filesystem_subtype: u32,
        filesystem_name: [c_char; 16],
        mounted_on: [c_char; MAX_PATH_BYTES],
        mounted_from: [c_char; MAX_PATH_BYTES],
        flags_extended: u32,
        reserved: [u32; 7],
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct FileIdentity {
        device: u64,
        inode: u64,
        links: u64,
        byte_length: u64,
    }

    struct DirectoryAnchor {
        directory: File,
        path_metadata: Metadata,
    }

    #[link(name = "System")]
    extern "C" {
        fn fcntl(file_descriptor: c_int, command: c_int, ...) -> c_int;
        fn fsync(file_descriptor: c_int) -> c_int;
        fn openat(
            directory_descriptor: c_int,
            path: *const c_char,
            flags: c_int,
            mode: u32,
        ) -> c_int;
        fn renameatx_np(
            from_directory: c_int,
            from: *const c_char,
            to_directory: c_int,
            to: *const c_char,
            flags: u32,
        ) -> c_int;
        fn statfs(path: *const c_char, buffer: *mut StatFs) -> c_int;
    }

    #[link(name = "DiskArbitration", kind = "framework")]
    extern "C" {
        fn DASessionCreate(allocator: *const c_void) -> *mut c_void;
        fn DADiskCreateFromBSDName(
            allocator: *const c_void,
            session: *mut c_void,
            name: *const c_char,
        ) -> *mut c_void;
        fn DADiskCopyDescription(disk: *mut c_void) -> *mut c_void;

        static kDADiskDescriptionDeviceInternalKey: *const c_void;
        static kDADiskDescriptionDeviceProtocolKey: *const c_void;
        static kDADiskDescriptionMediaEjectableKey: *const c_void;
        static kDADiskDescriptionMediaRemovableKey: *const c_void;
        static kDADiskDescriptionVolumeNetworkKey: *const c_void;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFBooleanGetTypeID() -> usize;
        fn CFBooleanGetValue(boolean: *const c_void) -> u8;
        fn CFDictionaryGetValue(dictionary: *const c_void, key: *const c_void) -> *const c_void;
        fn CFGetTypeID(value: *const c_void) -> usize;
        fn CFRelease(value: *const c_void);
        fn CFStringGetCString(
            string: *const c_void,
            buffer: *mut c_char,
            buffer_size: isize,
            encoding: u32,
        ) -> u8;
        fn CFStringGetTypeID() -> usize;
    }

    fn publication_deny(
        code: &'static str,
        os_code: Option<i32>,
    ) -> MacosGenerationPublicationVerdict {
        MacosGenerationPublicationVerdict::Deny(MacosHostProbeError { code, os_code })
    }

    fn io_code(error: &io::Error) -> Option<i32> {
        error.raw_os_error()
    }

    fn generation_id_valid(generation_id: &str) -> bool {
        generation_id.len() == 64
            && generation_id
                .bytes()
                .all(|value| value.is_ascii_digit() || (b'a'..=b'f').contains(&value))
    }

    fn c_name(value: &str) -> Option<CString> {
        if value.is_empty() || value.contains('/') || value.len() > 255 {
            return None;
        }
        CString::new(value).ok()
    }

    fn absolute_c_path(path: &Path) -> Option<CString> {
        use std::os::unix::ffi::OsStrExt;

        if !path.is_absolute()
            || path
                .components()
                .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
        {
            return None;
        }
        CString::new(path.as_os_str().as_bytes()).ok()
    }

    fn file_identity(metadata: &Metadata) -> FileIdentity {
        FileIdentity {
            device: metadata.dev(),
            inode: metadata.ino(),
            links: metadata.nlink(),
            byte_length: metadata.len(),
        }
    }

    fn anchor_directory(path: &Path) -> Result<DirectoryAnchor, &'static str> {
        let metadata = fs::symlink_metadata(path).map_err(|_| "MACOS_PATH_UNAVAILABLE")?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("MACOS_PATH_NOT_DIRECT_DIRECTORY");
        }
        let directory = File::open(path).map_err(|_| "MACOS_DIRECTORY_OPEN_REFUSED")?;
        let descriptor_metadata = directory
            .metadata()
            .map_err(|_| "MACOS_DIRECTORY_STAT_REFUSED")?;
        if file_identity(&metadata) != file_identity(&descriptor_metadata) {
            return Err("MACOS_DIRECTORY_IDENTITY_MISMATCH");
        }
        Ok(DirectoryAnchor {
            directory,
            path_metadata: metadata,
        })
    }

    fn anchor_unchanged(path: &Path, anchor: &DirectoryAnchor) -> bool {
        let Ok(path_metadata) = fs::symlink_metadata(path) else {
            return false;
        };
        let Ok(descriptor_metadata) = anchor.directory.metadata() else {
            return false;
        };
        file_identity(&path_metadata) == file_identity(&anchor.path_metadata)
            && file_identity(&descriptor_metadata) == file_identity(&anchor.path_metadata)
            && !path_metadata.file_type().is_symlink()
    }

    fn has_symbolic_ancestor(path: &Path) -> Result<bool, ()> {
        let mut ancestors = path
            .ancestors()
            .filter(|ancestor| !ancestor.as_os_str().is_empty())
            .collect::<Vec<_>>();
        ancestors.reverse();
        for ancestor in ancestors {
            let metadata = fs::symlink_metadata(ancestor).map_err(|_| ())?;
            if metadata.file_type().is_symlink() {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn full_flush(file: &File) -> Result<(), i32> {
        // SAFETY: file owns a live descriptor; F_FULLFSYNC takes no additional
        // variadic argument and returns synchronously.
        if unsafe { fcntl(file.as_raw_fd(), F_FULLFSYNC) } == 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error().raw_os_error().unwrap_or(1))
        }
    }

    fn directory_barrier(directory: &File) -> Result<(), i32> {
        // SAFETY: directory owns a live retained descriptor. This is the
        // namespace-metadata barrier; file data still requires F_FULLFSYNC.
        if unsafe { fsync(directory.as_raw_fd()) } == 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error().raw_os_error().unwrap_or(1))
        }
    }

    fn openat_file(descriptor: RawFd, name: &CStr, flags: c_int, mode: u32) -> io::Result<File> {
        // SAFETY: name is NUL-terminated and descriptor remains live. On
        // success ownership of the returned descriptor moves into File.
        let opened = unsafe { openat(descriptor, name.as_ptr(), flags, mode) };
        if opened < 0 {
            Err(io::Error::last_os_error())
        } else {
            // SAFETY: opened is a new owned descriptor returned by openat.
            Ok(unsafe { File::from_raw_fd(opened) })
        }
    }

    fn read_exact_at(
        descriptor: RawFd,
        name: &CStr,
        expected: &[u8],
    ) -> Result<Option<FileIdentity>, i32> {
        let mut file = openat_file(descriptor, name, O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0)
            .map_err(|error| error.raw_os_error().unwrap_or(1))?;
        let before = file
            .metadata()
            .map(|value| file_identity(&value))
            .map_err(|error| error.raw_os_error().unwrap_or(1))?;
        if before.links != 1 || before.byte_length != expected.len() as u64 {
            return Ok(None);
        }
        let mut observed = Vec::with_capacity(expected.len());
        file.read_to_end(&mut observed)
            .map_err(|error| error.raw_os_error().unwrap_or(1))?;
        full_flush(&file)?;
        let after = file
            .metadata()
            .map(|value| file_identity(&value))
            .map_err(|error| error.raw_os_error().unwrap_or(1))?;
        if observed == expected && after == before {
            Ok(Some(before))
        } else {
            Ok(None)
        }
    }

    unsafe fn dictionary_boolean(dictionary: *const c_void, key: *const c_void) -> Option<bool> {
        // SAFETY: caller supplies a live CFDictionary and a framework-owned key.
        let value = unsafe { CFDictionaryGetValue(dictionary, key) };
        if value.is_null() || unsafe { CFGetTypeID(value) } != unsafe { CFBooleanGetTypeID() } {
            return None;
        }
        Some(unsafe { CFBooleanGetValue(value) } != 0)
    }

    unsafe fn dictionary_string(dictionary: *const c_void, key: *const c_void) -> Option<String> {
        // SAFETY: caller supplies a live CFDictionary and a framework-owned key.
        let value = unsafe { CFDictionaryGetValue(dictionary, key) };
        if value.is_null() || unsafe { CFGetTypeID(value) } != unsafe { CFStringGetTypeID() } {
            return None;
        }
        let mut buffer = [0_i8; 128];
        if unsafe {
            CFStringGetCString(
                value,
                buffer.as_mut_ptr(),
                buffer.len() as isize,
                K_CF_STRING_ENCODING_UTF8,
            )
        } == 0
        {
            return None;
        }
        // SAFETY: CFStringGetCString succeeded and guarantees NUL termination.
        unsafe { CStr::from_ptr(buffer.as_ptr()) }
            .to_str()
            .ok()
            .map(str::to_owned)
    }

    fn classify_storage(device: &CStr) -> (MacosStorageKind, bool) {
        // SAFETY: framework constructors accept a null default allocator and a
        // valid NUL-terminated BSD device name.
        let session = unsafe { DASessionCreate(std::ptr::null()) };
        if session.is_null() {
            return (MacosStorageKind::Unknown, false);
        }
        let disk = unsafe { DADiskCreateFromBSDName(std::ptr::null(), session, device.as_ptr()) };
        if disk.is_null() {
            // SAFETY: session is a live CoreFoundation object owned here.
            unsafe { CFRelease(session) };
            return (MacosStorageKind::Unknown, false);
        }
        let description = unsafe { DADiskCopyDescription(disk) };
        if description.is_null() {
            // SAFETY: disk and session are live objects owned here.
            unsafe {
                CFRelease(disk);
                CFRelease(session);
            }
            return (MacosStorageKind::Unknown, false);
        }
        // SAFETY: description is a live CFDictionary and all keys are
        // framework-owned constants for the duration of these calls.
        let facts = unsafe {
            (
                dictionary_boolean(description, kDADiskDescriptionVolumeNetworkKey),
                dictionary_boolean(description, kDADiskDescriptionMediaRemovableKey),
                dictionary_boolean(description, kDADiskDescriptionMediaEjectableKey),
                dictionary_boolean(description, kDADiskDescriptionDeviceInternalKey),
                dictionary_string(description, kDADiskDescriptionDeviceProtocolKey),
            )
        };
        // SAFETY: all three objects are live and owned by this function.
        unsafe {
            CFRelease(description);
            CFRelease(disk);
            CFRelease(session);
        }
        let (Some(network), Some(removable), Some(ejectable), Some(internal), Some(protocol)) =
            facts
        else {
            return (MacosStorageKind::Unknown, false);
        };
        let normalized = protocol.to_ascii_lowercase();
        if network {
            return (MacosStorageKind::Network, true);
        }
        if removable || ejectable {
            return (MacosStorageKind::Removable, true);
        }
        if normalized.contains("disk image") {
            return (MacosStorageKind::DiskImage, true);
        }
        if normalized.contains("virtual") || normalized.contains("virtio") {
            return (MacosStorageKind::Virtual, true);
        }
        let admitted_protocol = ["nvme", "pci", "sata", "apple fabric"]
            .iter()
            .any(|candidate| normalized == *candidate);
        if internal && admitted_protocol {
            (MacosStorageKind::DirectInternal, true)
        } else {
            (MacosStorageKind::Unknown, true)
        }
    }

    fn bounded_statfs(path: &Path) -> Result<(String, String, u32), ()> {
        let path = absolute_c_path(path).ok_or(())?;
        let mut buffer = std::mem::MaybeUninit::<StatFs>::zeroed();
        // SAFETY: path is NUL-terminated and buffer points to writable memory.
        if unsafe { statfs(path.as_ptr(), buffer.as_mut_ptr()) } != 0 {
            return Err(());
        }
        // SAFETY: statfs returned success and initialized the complete value.
        let buffer = unsafe { buffer.assume_init() };
        // SAFETY: successful statfs produces NUL-terminated fixed buffers.
        let filesystem = unsafe { CStr::from_ptr(buffer.filesystem_name.as_ptr()) }
            .to_str()
            .map_err(|_| ())?
            .to_owned();
        let device = unsafe { CStr::from_ptr(buffer.mounted_from.as_ptr()) }
            .to_str()
            .map_err(|_| ())?
            .to_owned();
        Ok((filesystem, device, buffer.flags))
    }

    pub fn probe(path: &Path) -> MacosHostProbeVerdict {
        if absolute_c_path(path).is_none() {
            return super::macos_deny("MACOS_PATH_NOT_ABSOLUTE_CANONICAL_INPUT", None);
        }
        let symbolic_ancestor_present = match has_symbolic_ancestor(path) {
            Ok(value) => value,
            Err(()) => return super::macos_deny("MACOS_PATH_ANCESTRY_UNAVAILABLE", None),
        };
        let before = match fs::symlink_metadata(path) {
            Ok(value) if value.is_dir() && !value.file_type().is_symlink() => value,
            _ => return super::macos_deny("MACOS_PATH_NOT_DIRECT_DIRECTORY", None),
        };
        let canonical = match fs::canonicalize(path) {
            Ok(value) if value == path => value,
            _ => return super::macos_deny("MACOS_PATH_CANONICALIZATION_REFUSED", None),
        };
        let (filesystem, device_name, mount_flags) = match bounded_statfs(&canonical) {
            Ok(value) => value,
            Err(()) => return super::macos_deny("MACOS_FILESYSTEM_FACTS_UNAVAILABLE", None),
        };
        let device_name = match CString::new(device_name) {
            Ok(value) => value,
            Err(_) => return super::macos_deny("MACOS_DEVICE_NAME_MALFORMED", None),
        };
        let (storage_kind, storage_facts_complete) = classify_storage(&device_name);
        let architecture = if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            "unsupported"
        };
        let device_id = before.dev();
        let after = match fs::symlink_metadata(&canonical) {
            Ok(value) => value,
            Err(_) => return super::macos_deny("MACOS_IDENTITY_RECHECK_UNAVAILABLE", None),
        };
        let storage_kind = if mount_flags & MNT_REMOVABLE != 0 {
            MacosStorageKind::Removable
        } else if mount_flags & MNT_SNAPSHOT != 0 {
            MacosStorageKind::Virtual
        } else {
            storage_kind
        };
        admit_measured_macos_host(MeasuredMacosHost {
            facts_complete: storage_facts_complete,
            operating_system: "macos".to_owned(),
            architecture: architecture.to_owned(),
            target_is_absolute: true,
            target_is_direct_directory: true,
            symbolic_ancestor_present,
            filesystem: filesystem.to_ascii_lowercase(),
            storage_kind,
            mount_is_local: mount_flags & MNT_LOCAL != 0,
            mount_is_read_write: mount_flags & MNT_RDONLY == 0,
            identity_stable: file_identity(&before) == file_identity(&after),
            link_count: before.nlink(),
            // The statically linked F_FULLFSYNC ABI is available in this
            // module. A successful file-level call is still mandatory inside
            // publication; unsupported filesystems fail there without fsync
            // fallback.
            full_flush_available: true,
            device_id,
        })
    }

    fn stage_name(generation_id: &str) -> Option<CString> {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_nanos();
        let sequence = NONCE.fetch_add(1, Ordering::Relaxed);
        c_name(&format!(
            ".registry-generation-{generation_id}.{}-{nonce}-{sequence}.tmp",
            std::process::id()
        ))
    }

    fn publish_generation_observed<F>(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
        fault: MacosPublicationFault,
        mut observe: F,
    ) -> MacosGenerationPublicationVerdict
    where
        F: FnMut(&'static str),
    {
        if !generation_id_valid(generation_id)
            || bytes.is_empty()
            || bytes.len() > MAX_GENERATION_BYTES
        {
            return publication_deny("MACOS_PUBLICATION_INPUT_REFUSED", None);
        }
        let admitted_host = match probe(directory) {
            MacosHostProbeVerdict::Candidate(value) => value,
            MacosHostProbeVerdict::Deny(_) => {
                return publication_deny("MACOS_PUBLICATION_HOST_NOT_CANDIDATE", None);
            }
        };
        let anchor = match anchor_directory(directory) {
            Ok(value) => value,
            Err(code) => return publication_deny(code, None),
        };
        if anchor.path_metadata.dev() != admitted_host.device_id {
            return publication_deny("MACOS_PUBLICATION_DEVICE_IDENTITY_CHANGED", None);
        }
        let descriptor = anchor.directory.as_raw_fd();
        let final_name = match c_name(&format!("registry-generation-{generation_id}.json")) {
            Some(value) => value,
            None => return publication_deny("MACOS_FINAL_NAME_REFUSED", None),
        };
        match read_exact_at(descriptor, &final_name, bytes) {
            Ok(Some(identity)) if identity.device == anchor.path_metadata.dev() => {
                if directory_barrier(&anchor.directory).is_err()
                    || !anchor_unchanged(directory, &anchor)
                {
                    return publication_deny("MACOS_DIRECTORY_BARRIER_REFUSED", None);
                }
                return MacosGenerationPublicationVerdict::Candidate {
                    byte_length: bytes.len(),
                };
            }
            Ok(Some(_)) | Ok(None) => {
                return publication_deny("MACOS_PUBLICATION_COLLISION", None);
            }
            Err(EEXIST) => return publication_deny("MACOS_PUBLICATION_COLLISION", None),
            Err(_) => {}
        }

        let stage_name = match stage_name(generation_id) {
            Some(value) => value,
            None => return publication_deny("MACOS_PUBLICATION_NONCE_UNAVAILABLE", None),
        };
        let mut stage = match openat_file(
            descriptor,
            &stage_name,
            O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW,
            0o600,
        ) {
            Ok(value) => value,
            Err(error) => {
                return publication_deny("MACOS_STAGE_OPEN_REFUSED", io_code(&error));
            }
        };
        observe("stage-opened");

        if matches!(fault, MacosPublicationFault::ZeroProgress) {
            drop(stage);
            return publication_deny("MACOS_WRITE_ZERO_PROGRESS_REFUSED", None);
        }
        if matches!(fault, MacosPublicationFault::DiskFull) {
            drop(stage);
            return publication_deny("MACOS_DISK_FULL_REFUSED", None);
        }
        let write_bytes = if matches!(fault, MacosPublicationFault::ShortWrite) {
            &bytes[..bytes.len().saturating_sub(1)]
        } else {
            bytes
        };
        if let Err(error) = stage.write_all(write_bytes) {
            drop(stage);
            return if error.raw_os_error() == Some(ENOSPC) {
                publication_deny("MACOS_DISK_FULL_REFUSED", Some(ENOSPC))
            } else {
                publication_deny("MACOS_WRITE_REFUSED", io_code(&error))
            };
        }
        observe("bytes-written");
        if stage.flush().is_err() {
            drop(stage);
            return publication_deny("MACOS_USER_FLUSH_REFUSED", None);
        }
        if matches!(fault, MacosPublicationFault::FullFlush) || full_flush(&stage).is_err() {
            drop(stage);
            return publication_deny("MACOS_FULL_FLUSH_REFUSED", None);
        }
        let stage_identity = match stage.metadata() {
            Ok(value) => file_identity(&value),
            Err(error) => {
                drop(stage);
                return publication_deny("MACOS_STAGE_STAT_REFUSED", io_code(&error));
            }
        };
        if stage_identity.device != anchor.path_metadata.dev()
            || stage_identity.links != 1
            || stage_identity.byte_length != bytes.len() as u64
        {
            drop(stage);
            let code = if matches!(fault, MacosPublicationFault::ShortWrite) {
                "MACOS_WRITE_SHORT_REFUSED"
            } else {
                "MACOS_STAGE_IDENTITY_REFUSED"
            };
            return publication_deny(code, None);
        }
        observe("file-flushed");
        drop(stage);
        observe("stage-closed");

        if matches!(fault, MacosPublicationFault::Publish) {
            return publication_deny("MACOS_PUBLICATION_REFUSED", None);
        }
        // SAFETY: both names are NUL-terminated and the no-replace rename is
        // scoped to the same retained directory descriptor.
        if unsafe {
            renameatx_np(
                descriptor,
                stage_name.as_ptr(),
                descriptor,
                final_name.as_ptr(),
                RENAME_EXCL,
            )
        } != 0
        {
            let error = io::Error::last_os_error();
            return publication_deny("MACOS_PUBLICATION_RENAME_REFUSED", io_code(&error));
        }
        observe("published");
        if matches!(fault, MacosPublicationFault::Reopen) {
            return publication_deny("MACOS_REOPEN_REFUSED", None);
        }
        if matches!(fault, MacosPublicationFault::ReadbackChanged) {
            return publication_deny("MACOS_READBACK_MISMATCH_REFUSED", None);
        }
        let reopened_identity = match read_exact_at(descriptor, &final_name, bytes) {
            Ok(Some(value)) => value,
            _ => return publication_deny("MACOS_REOPEN_REFUSED", None),
        };
        if reopened_identity != stage_identity {
            return publication_deny("MACOS_READBACK_IDENTITY_MISMATCH_REFUSED", None);
        }
        observe("reopened-verified");
        if matches!(fault, MacosPublicationFault::DirectoryBarrier) {
            return publication_deny("MACOS_DIRECTORY_BARRIER_REFUSED", None);
        }
        if directory_barrier(&anchor.directory).is_err() {
            return publication_deny("MACOS_DIRECTORY_BARRIER_REFUSED", None);
        }
        observe("directory-flushed");
        if matches!(fault, MacosPublicationFault::NamespaceChanged) {
            return publication_deny("MACOS_NAMESPACE_CHANGED_REFUSED", None);
        }
        if !anchor_unchanged(directory, &anchor) {
            return publication_deny("MACOS_NAMESPACE_CHANGED_REFUSED", None);
        }
        MacosGenerationPublicationVerdict::Candidate {
            byte_length: bytes.len(),
        }
    }

    pub fn publish_generation(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
    ) -> MacosGenerationPublicationVerdict {
        publish_generation_observed(
            directory,
            generation_id,
            bytes,
            MacosPublicationFault::None,
            |_| {},
        )
    }

    #[cfg(feature = "fault-injection")]
    pub fn publish_generation_fault_candidate<F>(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
        observe: F,
    ) -> MacosGenerationPublicationVerdict
    where
        F: FnMut(&'static str),
    {
        publish_generation_observed(
            directory,
            generation_id,
            bytes,
            MacosPublicationFault::None,
            observe,
        )
    }

    #[cfg(feature = "fault-injection")]
    pub fn publish_generation_injected_candidate(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
        fault: MacosPublicationFault,
    ) -> MacosGenerationPublicationVerdict {
        publish_generation_observed(directory, generation_id, bytes, fault, |_| {})
    }
}

#[cfg(windows)]
mod windows {
    use super::{
        admit_measured_windows_host, deny, MeasuredWindowsHost, WindowsArchitecture,
        WindowsDirectoryFlushVerdict, WindowsGenerationPublicationVerdict, WindowsHostProbeError,
        WindowsHostProbeVerdict, WindowsRelease,
    };
    use std::ffi::c_void;
    use std::ffi::OsStr;
    use std::fs::{self, File, OpenOptions};
    use std::io::{Read, Write};
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::{AsRawHandle, IntoRawHandle};
    use std::path::{Component, Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    const INVALID_FILE_ATTRIBUTES: u32 = u32::MAX;
    const INVALID_HANDLE_VALUE: *mut c_void = -1_isize as *mut c_void;
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x0000_0010;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    const FILE_FLAG_WRITE_THROUGH: u32 = 0x8000_0000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const FILE_SHARE_READ: u32 = 0x0000_0001;
    const FILE_SHARE_WRITE: u32 = 0x0000_0002;
    const FILE_SHARE_DELETE: u32 = 0x0000_0004;
    const GENERIC_WRITE: u32 = 0x4000_0000;
    const OPEN_EXISTING: u32 = 3;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x0000_0008;
    const MAX_GENERATION_BYTES: usize = 16 * 1024 * 1024;
    const MAX_PATH_CHARS: usize = 32_768;
    const FILESYSTEM_NAME_CHARS: usize = 64;
    const IMAGE_FILE_MACHINE_UNKNOWN: u16 = 0;
    const IMAGE_FILE_MACHINE_AMD64: u16 = 0x8664;
    const IMAGE_FILE_MACHINE_ARM64: u16 = 0xaa64;

    #[repr(C)]
    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct FileTime {
        low: u32,
        high: u32,
    }

    #[repr(C)]
    struct OsVersionInfoW {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform_id: u32,
        service_pack: [u16; 128],
    }

    #[repr(C)]
    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct ByHandleFileInformation {
        attributes: u32,
        creation_time: FileTime,
        last_access_time: FileTime,
        last_write_time: FileTime,
        volume_serial_number: u32,
        file_size_high: u32,
        file_size_low: u32,
        number_of_links: u32,
        file_index_high: u32,
        file_index_low: u32,
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct OpenFileIdentity {
        attributes: u32,
        volume_serial_number: u32,
        byte_length: u64,
        number_of_links: u32,
        file_index: u64,
        last_write_time: FileTime,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CloseHandle(object: *mut c_void) -> i32;
        fn CreateFileW(
            file_name: *const u16,
            desired_access: u32,
            share_mode: u32,
            security_attributes: *mut c_void,
            creation_disposition: u32,
            flags_and_attributes: u32,
            template_file: *mut c_void,
        ) -> *mut c_void;
        fn FlushFileBuffers(file: *mut c_void) -> i32;
        fn GetDriveTypeW(root_path_name: *const u16) -> u32;
        fn GetCurrentProcess() -> *mut c_void;
        fn GetFileAttributesW(file_name: *const u16) -> u32;
        fn GetLastError() -> u32;
        fn GetVolumeInformationW(
            root_path_name: *const u16,
            volume_name_buffer: *mut u16,
            volume_name_size: u32,
            volume_serial_number: *mut u32,
            maximum_component_length: *mut u32,
            filesystem_flags: *mut u32,
            filesystem_name_buffer: *mut u16,
            filesystem_name_size: u32,
        ) -> i32;
        fn GetVolumePathNameW(
            file_name: *const u16,
            volume_path_name: *mut u16,
            buffer_length: u32,
        ) -> i32;
        fn GetFileInformationByHandle(
            file: *mut c_void,
            information: *mut ByHandleFileInformation,
        ) -> i32;
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
        fn IsWow64Process2(
            process: *mut c_void,
            process_machine: *mut u16,
            native_machine: *mut u16,
        ) -> i32;
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(version: *mut OsVersionInfoW) -> i32;
    }

    fn last_error() -> u32 {
        // SAFETY: GetLastError takes no pointers and has no preconditions.
        unsafe { GetLastError() }
    }

    fn wide_nul(value: &OsStr) -> Option<Vec<u16>> {
        let units: Vec<u16> = value.encode_wide().collect();
        if units.is_empty() || units.contains(&0) {
            return None;
        }
        let mut terminated = units;
        terminated.push(0);
        Some(terminated)
    }

    fn terminated_length(buffer: &[u16]) -> Option<usize> {
        buffer.iter().position(|unit| *unit == 0)
    }

    fn measured_os_identity(
    ) -> Result<(WindowsRelease, u32, u32, WindowsArchitecture, bool), WindowsHostProbeError> {
        let mut version = OsVersionInfoW {
            size: std::mem::size_of::<OsVersionInfoW>() as u32,
            major: 0,
            minor: 0,
            build: 0,
            platform_id: 0,
            service_pack: [0; 128],
        };
        // SAFETY: version is a writable OSVERSIONINFOW-compatible value whose
        // size field is initialized for the duration of the call.
        let status = unsafe { RtlGetVersion(&mut version) };
        if status != 0 {
            return Err(WindowsHostProbeError {
                code: "WINDOWS_OS_IDENTITY_UNAVAILABLE",
                os_code: Some(status as u32),
            });
        }
        let release = if version.major == 10 && (10_240..22_000).contains(&version.build) {
            WindowsRelease::Windows10
        } else if version.major == 10 && version.build >= 22_000 {
            WindowsRelease::Windows11
        } else {
            WindowsRelease::Unknown
        };

        let mut process_machine = IMAGE_FILE_MACHINE_UNKNOWN;
        let mut native_machine = IMAGE_FILE_MACHINE_UNKNOWN;
        // SAFETY: GetCurrentProcess returns the current process pseudo-handle;
        // both machine pointers are writable for the duration of the call.
        if unsafe {
            IsWow64Process2(
                GetCurrentProcess(),
                &mut process_machine,
                &mut native_machine,
            )
        } == 0
        {
            return Err(WindowsHostProbeError {
                code: "WINDOWS_ARCHITECTURE_IDENTITY_UNAVAILABLE",
                os_code: Some(last_error()),
            });
        }
        let architecture = match native_machine {
            IMAGE_FILE_MACHINE_AMD64 => WindowsArchitecture::X86_64,
            IMAGE_FILE_MACHINE_ARM64 => WindowsArchitecture::Arm64,
            _ => WindowsArchitecture::Unknown,
        };
        Ok((
            release,
            version.major,
            version.build,
            architecture,
            process_machine == IMAGE_FILE_MACHINE_UNKNOWN,
        ))
    }

    fn reparse_component(path: &Path) -> Result<bool, u32> {
        let mut ancestors: Vec<&Path> = path
            .ancestors()
            .filter(|ancestor| !ancestor.as_os_str().is_empty())
            .collect();
        ancestors.reverse();
        for ancestor in ancestors {
            let wide = wide_nul(ancestor.as_os_str()).ok_or(87_u32)?;
            // SAFETY: wide is NUL-terminated and remains alive for the call.
            let attributes = unsafe { GetFileAttributesW(wide.as_ptr()) };
            if attributes == INVALID_FILE_ATTRIBUTES {
                return Err(last_error());
            }
            if attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub fn probe(path: &Path) -> WindowsHostProbeVerdict {
        if !path.is_absolute()
            || path
                .components()
                .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
        {
            return deny("WINDOWS_PATH_NOT_ABSOLUTE_CANONICAL_INPUT", None);
        }
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(_) => return deny("WINDOWS_PATH_UNAVAILABLE", None),
        };
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return deny("WINDOWS_PATH_NOT_DIRECT_DIRECTORY", None);
        }
        let input_wide = match wide_nul(path.as_os_str()) {
            Some(value) => value,
            None => return deny("WINDOWS_PATH_ENCODING_REFUSED", None),
        };
        // SAFETY: input_wide is NUL-terminated and lives for the call.
        let attributes = unsafe { GetFileAttributesW(input_wide.as_ptr()) };
        if attributes == INVALID_FILE_ATTRIBUTES {
            return deny("WINDOWS_PATH_ATTRIBUTES_UNAVAILABLE", Some(last_error()));
        }
        if attributes & FILE_ATTRIBUTE_DIRECTORY == 0
            || attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        {
            return deny("WINDOWS_PATH_REPARSE_OR_NON_DIRECTORY", None);
        }
        match reparse_component(path) {
            Ok(false) => {}
            Ok(true) => return deny("WINDOWS_PATH_REPARSE_ANCESTOR", None),
            Err(code) => {
                return deny("WINDOWS_PATH_ANCESTRY_UNAVAILABLE", Some(code));
            }
        }
        if fs::canonicalize(path).is_err() {
            return deny("WINDOWS_PATH_CANONICALIZATION_FAILED", None);
        }

        let mut volume_path = vec![0_u16; MAX_PATH_CHARS];
        // SAFETY: buffers are valid for their declared lengths and input_wide
        // is NUL-terminated.
        let volume_ok = unsafe {
            GetVolumePathNameW(
                input_wide.as_ptr(),
                volume_path.as_mut_ptr(),
                volume_path.len() as u32,
            )
        };
        if volume_ok == 0 {
            return deny("WINDOWS_VOLUME_PATH_UNAVAILABLE", Some(last_error()));
        }
        let volume_length = match terminated_length(&volume_path) {
            Some(length) if length > 0 => length,
            _ => return deny("WINDOWS_VOLUME_PATH_MALFORMED", None),
        };
        volume_path.truncate(volume_length + 1);

        // SAFETY: volume_path is NUL-terminated.
        let drive_type = unsafe { GetDriveTypeW(volume_path.as_ptr()) };
        let mut volume_serial = 0_u32;
        let mut maximum_component_length = 0_u32;
        let mut filesystem_flags = 0_u32;
        let mut filesystem_name = vec![0_u16; FILESYSTEM_NAME_CHARS];
        // SAFETY: all output pointers reference writable values or buffers of
        // the declared sizes; volume_path remains NUL-terminated.
        let information_ok = unsafe {
            GetVolumeInformationW(
                volume_path.as_ptr(),
                std::ptr::null_mut(),
                0,
                &mut volume_serial,
                &mut maximum_component_length,
                &mut filesystem_flags,
                filesystem_name.as_mut_ptr(),
                filesystem_name.len() as u32,
            )
        };
        if information_ok == 0 {
            return deny("WINDOWS_VOLUME_INFORMATION_UNAVAILABLE", Some(last_error()));
        }
        let filesystem_length = match terminated_length(&filesystem_name) {
            Some(length) if length > 0 => length,
            _ => return deny("WINDOWS_FILESYSTEM_NAME_MALFORMED", None),
        };
        let filesystem = match String::from_utf16(&filesystem_name[..filesystem_length]) {
            Ok(value) => value,
            Err(_) => return deny("WINDOWS_FILESYSTEM_NAME_NOT_UTF16", None),
        };
        let (release, os_major, os_build, architecture, native_process) =
            match measured_os_identity() {
                Ok(value) => value,
                Err(error) => return WindowsHostProbeVerdict::Deny(error),
            };
        admit_measured_windows_host(MeasuredWindowsHost {
            drive_type,
            filesystem,
            filesystem_flags,
            volume_serial,
            release,
            os_major,
            os_build,
            architecture,
            native_process,
        })
    }

    fn flush_deny(code: &'static str, os_code: Option<u32>) -> WindowsDirectoryFlushVerdict {
        WindowsDirectoryFlushVerdict::Deny(WindowsHostProbeError { code, os_code })
    }

    pub fn flush_directory(path: &Path) -> WindowsDirectoryFlushVerdict {
        if !matches!(probe(path), WindowsHostProbeVerdict::Candidate(_)) {
            return flush_deny("WINDOWS_DIRECTORY_HOST_NOT_CANDIDATE", None);
        }
        let wide = match wide_nul(path.as_os_str()) {
            Some(value) => value,
            None => return flush_deny("WINDOWS_DIRECTORY_PATH_ENCODING_REFUSED", None),
        };
        // SAFETY: wide is NUL-terminated. Null security/template pointers are
        // permitted, and the handle is checked before use.
        let handle = unsafe {
            CreateFileW(
                wide.as_ptr(),
                GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                std::ptr::null_mut(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                std::ptr::null_mut(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            return flush_deny("WINDOWS_DIRECTORY_OPEN_REFUSED", Some(last_error()));
        }
        // SAFETY: handle was returned successfully by CreateFileW and remains
        // open for this call.
        let flush_ok = unsafe { FlushFileBuffers(handle) };
        let flush_error = if flush_ok == 0 {
            Some(last_error())
        } else {
            None
        };
        // SAFETY: handle is a live kernel handle owned by this function.
        let close_ok = unsafe { CloseHandle(handle) };
        if flush_error.is_some() {
            return flush_deny("WINDOWS_DIRECTORY_FLUSH_REFUSED", flush_error);
        }
        if close_ok == 0 {
            return flush_deny("WINDOWS_DIRECTORY_CLOSE_REFUSED", Some(last_error()));
        }
        WindowsDirectoryFlushVerdict::Candidate
    }

    fn publication_deny(
        code: &'static str,
        os_code: Option<u32>,
    ) -> WindowsGenerationPublicationVerdict {
        WindowsGenerationPublicationVerdict::Deny(WindowsHostProbeError { code, os_code })
    }

    fn io_code(error: &std::io::Error) -> Option<u32> {
        error
            .raw_os_error()
            .and_then(|code| u32::try_from(code).ok())
    }

    fn generation_id_valid(generation_id: &str) -> bool {
        generation_id.len() == 64
            && generation_id
                .bytes()
                .all(|value| value.is_ascii_digit() || (b'a'..=b'f').contains(&value))
    }

    fn close_file(file: File) -> Result<(), u32> {
        let handle = file.into_raw_handle().cast::<c_void>();
        // SAFETY: ownership of the live handle moved out of File and into this
        // function, so exactly one CloseHandle call is required.
        if unsafe { CloseHandle(handle) } == 0 {
            Err(last_error())
        } else {
            Ok(())
        }
    }

    fn open_file_identity(file: &File) -> Result<Option<OpenFileIdentity>, u32> {
        let mut information = ByHandleFileInformation {
            attributes: 0,
            creation_time: FileTime { low: 0, high: 0 },
            last_access_time: FileTime { low: 0, high: 0 },
            last_write_time: FileTime { low: 0, high: 0 },
            volume_serial_number: 0,
            file_size_high: 0,
            file_size_low: 0,
            number_of_links: 0,
            file_index_high: 0,
            file_index_low: 0,
        };
        // SAFETY: file owns a live handle and information is a writable
        // BY_HANDLE_FILE_INFORMATION-compatible value for the call.
        if unsafe {
            GetFileInformationByHandle(file.as_raw_handle().cast::<c_void>(), &mut information)
        } == 0
        {
            return Err(last_error());
        }
        if information.attributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT) != 0
            || information.number_of_links != 1
        {
            return Ok(None);
        }
        Ok(Some(OpenFileIdentity {
            attributes: information.attributes,
            volume_serial_number: information.volume_serial_number,
            byte_length: u64::from(information.file_size_high) << 32
                | u64::from(information.file_size_low),
            number_of_links: information.number_of_links,
            file_index: u64::from(information.file_index_high) << 32
                | u64::from(information.file_index_low),
            last_write_time: information.last_write_time,
        }))
    }

    fn read_exact_candidate(path: &Path, expected: &[u8]) -> Result<bool, u32> {
        let mut file = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
            .map_err(|error| io_code(&error).unwrap_or(1))?;
        let before = match open_file_identity(&file)? {
            Some(identity) => identity,
            None => {
                close_file(file)?;
                return Ok(false);
            }
        };
        if usize::try_from(before.byte_length).ok() != Some(expected.len()) {
            close_file(file)?;
            return Ok(false);
        }
        let mut observed = Vec::with_capacity(expected.len());
        file.read_to_end(&mut observed)
            .map_err(|error| io_code(&error).unwrap_or(1))?;
        let after = open_file_identity(&file)?;
        close_file(file)?;
        Ok(after == Some(before) && observed == expected)
    }

    fn stage_path(directory: &Path, generation_id: &str) -> Result<PathBuf, ()> {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ())?
            .as_nanos();
        Ok(directory.join(format!(
            ".registry-generation-{generation_id}.{}-{nonce}.tmp",
            std::process::id(),
        )))
    }

    fn publish_generation_observed<F>(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
        mut observe: F,
    ) -> WindowsGenerationPublicationVerdict
    where
        F: FnMut(&'static str),
    {
        if !generation_id_valid(generation_id)
            || bytes.is_empty()
            || bytes.len() > MAX_GENERATION_BYTES
        {
            return publication_deny("WINDOWS_PUBLICATION_INPUT_REFUSED", None);
        }
        if !matches!(probe(directory), WindowsHostProbeVerdict::Candidate(_)) {
            return publication_deny("WINDOWS_PUBLICATION_HOST_NOT_CANDIDATE", None);
        }
        let final_path = directory.join(format!("registry-generation-{generation_id}.json"));
        if final_path.exists() {
            return match read_exact_candidate(&final_path, bytes) {
                Ok(true)
                    if matches!(
                        flush_directory(directory),
                        WindowsDirectoryFlushVerdict::Candidate
                    ) =>
                {
                    WindowsGenerationPublicationVerdict::Candidate {
                        byte_length: bytes.len(),
                    }
                }
                Ok(_) => publication_deny("WINDOWS_PUBLICATION_COLLISION", None),
                Err(code) => {
                    publication_deny("WINDOWS_PUBLICATION_EXISTING_READ_REFUSED", Some(code))
                }
            };
        }
        let staging_path = match stage_path(directory, generation_id) {
            Ok(path) => path,
            Err(()) => return publication_deny("WINDOWS_PUBLICATION_NONCE_UNAVAILABLE", None),
        };
        let mut staging = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .share_mode(0)
            .custom_flags(FILE_FLAG_WRITE_THROUGH)
            .open(&staging_path)
        {
            Ok(file) => file,
            Err(error) => {
                return publication_deny("WINDOWS_PUBLICATION_STAGE_OPEN_REFUSED", io_code(&error));
            }
        };
        observe("stage-opened");
        let staged = (|| -> Result<(), (&'static str, Option<u32>)> {
            staging
                .write_all(bytes)
                .map_err(|error| ("WINDOWS_PUBLICATION_WRITE_REFUSED", io_code(&error)))?;
            observe("bytes-written");
            staging
                .flush()
                .map_err(|error| ("WINDOWS_PUBLICATION_USER_FLUSH_REFUSED", io_code(&error)))?;
            // SAFETY: staging owns a live file handle for the duration of the
            // call. FlushFileBuffers is the required file-data barrier.
            if unsafe { FlushFileBuffers(staging.as_raw_handle().cast::<c_void>()) } == 0 {
                return Err(("WINDOWS_PUBLICATION_FILE_FLUSH_REFUSED", Some(last_error())));
            }
            observe("file-flushed");
            let identity = open_file_identity(&staging)
                .map_err(|code| ("WINDOWS_PUBLICATION_STAGE_STAT_REFUSED", Some(code)))?;
            if identity.and_then(|value| usize::try_from(value.byte_length).ok())
                != Some(bytes.len())
            {
                return Err(("WINDOWS_PUBLICATION_SHORT_WRITE", None));
            }
            Ok(())
        })();
        if let Err((code, os_code)) = staged {
            drop(staging);
            return publication_deny(code, os_code);
        }
        if let Err(code) = close_file(staging) {
            return publication_deny("WINDOWS_PUBLICATION_STAGE_CLOSE_REFUSED", Some(code));
        }
        observe("stage-closed");

        let staging_wide = match wide_nul(staging_path.as_os_str()) {
            Some(value) => value,
            None => return publication_deny("WINDOWS_PUBLICATION_STAGE_PATH_REFUSED", None),
        };
        let final_wide = match wide_nul(final_path.as_os_str()) {
            Some(value) => value,
            None => return publication_deny("WINDOWS_PUBLICATION_FINAL_PATH_REFUSED", None),
        };
        // SAFETY: both paths are NUL-terminated and remain alive. No replace
        // flag is supplied, so an existing destination cannot be overwritten.
        let moved = unsafe {
            MoveFileExW(
                staging_wide.as_ptr(),
                final_wide.as_ptr(),
                MOVEFILE_WRITE_THROUGH,
            )
        };
        if moved == 0 {
            let move_error = last_error();
            return match read_exact_candidate(&final_path, bytes) {
                Ok(true)
                    if matches!(
                        flush_directory(directory),
                        WindowsDirectoryFlushVerdict::Candidate
                    ) =>
                {
                    WindowsGenerationPublicationVerdict::Candidate {
                        byte_length: bytes.len(),
                    }
                }
                _ => publication_deny("WINDOWS_PUBLICATION_MOVE_REFUSED", Some(move_error)),
            };
        }
        observe("published");

        let reopened = read_exact_candidate(&final_path, bytes);
        if !matches!(reopened, Ok(true)) {
            return publication_deny("WINDOWS_PUBLICATION_REOPEN_REFUSED", None);
        }
        observe("reopened-verified");
        let directory_flushed = matches!(
            flush_directory(directory),
            WindowsDirectoryFlushVerdict::Candidate
        );
        if !directory_flushed {
            return publication_deny("WINDOWS_PUBLICATION_BARRIER_REFUSED", None);
        }
        observe("directory-flushed");
        WindowsGenerationPublicationVerdict::Candidate {
            byte_length: bytes.len(),
        }
    }

    pub fn publish_generation(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
    ) -> WindowsGenerationPublicationVerdict {
        publish_generation_observed(directory, generation_id, bytes, |_| {})
    }

    #[cfg(feature = "fault-injection")]
    pub fn publish_generation_fault_candidate<F>(
        directory: &Path,
        generation_id: &str,
        bytes: &[u8],
        observe: F,
    ) -> WindowsGenerationPublicationVerdict
    where
        F: FnMut(&'static str),
    {
        publish_generation_observed(directory, generation_id, bytes, observe)
    }
}

pub fn probe_linux_host(path: &Path) -> LinuxHostProbeVerdict {
    #[cfg(all(
        target_os = "linux",
        target_env = "gnu",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    {
        linux::probe(path)
    }
    #[cfg(not(all(
        target_os = "linux",
        target_env = "gnu",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    )))]
    {
        let _ = path;
        #[cfg(target_os = "linux")]
        {
            linux_deny("LINUX_ABI_UNSUPPORTED")
        }
        #[cfg(not(target_os = "linux"))]
        {
            linux_deny("LINUX_PLATFORM_UNAVAILABLE")
        }
    }
}

pub fn publish_linux_generation_candidate(
    directory: &Path,
    generation_id: &str,
    bytes: &[u8],
) -> LinuxGenerationPublicationVerdict {
    #[cfg(all(
        target_os = "linux",
        target_env = "gnu",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    {
        linux::publish_generation(directory, generation_id, bytes)
    }
    #[cfg(not(all(
        target_os = "linux",
        target_env = "gnu",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    )))]
    {
        let _ = (directory, generation_id, bytes);
        #[cfg(target_os = "linux")]
        {
            LinuxGenerationPublicationVerdict::Deny(LinuxHostProbeError {
                code: "LINUX_ABI_UNSUPPORTED",
            })
        }
        #[cfg(not(target_os = "linux"))]
        {
            LinuxGenerationPublicationVerdict::Deny(LinuxHostProbeError {
                code: "LINUX_PLATFORM_UNAVAILABLE",
            })
        }
    }
}

#[cfg(feature = "fault-injection")]
#[doc(hidden)]
pub fn publish_linux_generation_fault_candidate<F>(
    directory: &Path,
    generation_id: &str,
    bytes: &[u8],
    observe: F,
) -> LinuxGenerationPublicationVerdict
where
    F: FnMut(&'static str),
{
    #[cfg(all(
        target_os = "linux",
        target_env = "gnu",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    {
        linux::publish_generation_fault_candidate(directory, generation_id, bytes, observe)
    }
    #[cfg(not(all(
        target_os = "linux",
        target_env = "gnu",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    )))]
    {
        let _ = (directory, generation_id, bytes, observe);
        #[cfg(target_os = "linux")]
        {
            LinuxGenerationPublicationVerdict::Deny(LinuxHostProbeError {
                code: "LINUX_ABI_UNSUPPORTED",
            })
        }
        #[cfg(not(target_os = "linux"))]
        {
            LinuxGenerationPublicationVerdict::Deny(LinuxHostProbeError {
                code: "LINUX_PLATFORM_UNAVAILABLE",
            })
        }
    }
}

#[cfg(feature = "fault-injection")]
#[doc(hidden)]
pub fn publish_linux_generation_injected_candidate(
    directory: &Path,
    generation_id: &str,
    bytes: &[u8],
    fault: LinuxPublicationFault,
) -> LinuxGenerationPublicationVerdict {
    #[cfg(all(
        target_os = "linux",
        target_env = "gnu",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    {
        linux::publish_generation_injected_candidate(directory, generation_id, bytes, fault)
    }
    #[cfg(not(all(
        target_os = "linux",
        target_env = "gnu",
        target_pointer_width = "64",
        any(target_arch = "x86_64", target_arch = "aarch64")
    )))]
    {
        let _ = (directory, generation_id, bytes, fault);
        #[cfg(target_os = "linux")]
        {
            LinuxGenerationPublicationVerdict::Deny(LinuxHostProbeError {
                code: "LINUX_ABI_UNSUPPORTED",
            })
        }
        #[cfg(not(target_os = "linux"))]
        {
            LinuxGenerationPublicationVerdict::Deny(LinuxHostProbeError {
                code: "LINUX_PLATFORM_UNAVAILABLE",
            })
        }
    }
}

pub fn probe_windows_host(path: &Path) -> WindowsHostProbeVerdict {
    #[cfg(windows)]
    {
        windows::probe(path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        deny("WINDOWS_PLATFORM_UNAVAILABLE", None)
    }
}

pub fn probe_macos_host(path: &Path) -> MacosHostProbeVerdict {
    #[cfg(target_os = "macos")]
    {
        macos::probe(path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        macos_deny("MACOS_PLATFORM_UNAVAILABLE", None)
    }
}

pub fn publish_macos_generation_candidate(
    directory: &Path,
    generation_id: &str,
    bytes: &[u8],
) -> MacosGenerationPublicationVerdict {
    #[cfg(target_os = "macos")]
    {
        macos::publish_generation(directory, generation_id, bytes)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (directory, generation_id, bytes);
        MacosGenerationPublicationVerdict::Deny(MacosHostProbeError {
            code: "MACOS_PLATFORM_UNAVAILABLE",
            os_code: None,
        })
    }
}

#[cfg(feature = "fault-injection")]
#[doc(hidden)]
pub fn publish_macos_generation_fault_candidate<F>(
    directory: &Path,
    generation_id: &str,
    bytes: &[u8],
    observe: F,
) -> MacosGenerationPublicationVerdict
where
    F: FnMut(&'static str),
{
    #[cfg(target_os = "macos")]
    {
        macos::publish_generation_fault_candidate(directory, generation_id, bytes, observe)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (directory, generation_id, bytes, observe);
        MacosGenerationPublicationVerdict::Deny(MacosHostProbeError {
            code: "MACOS_PLATFORM_UNAVAILABLE",
            os_code: None,
        })
    }
}

#[cfg(feature = "fault-injection")]
#[doc(hidden)]
pub fn publish_macos_generation_injected_candidate(
    directory: &Path,
    generation_id: &str,
    bytes: &[u8],
    fault: MacosPublicationFault,
) -> MacosGenerationPublicationVerdict {
    #[cfg(target_os = "macos")]
    {
        macos::publish_generation_injected_candidate(directory, generation_id, bytes, fault)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (directory, generation_id, bytes, fault);
        MacosGenerationPublicationVerdict::Deny(MacosHostProbeError {
            code: "MACOS_PLATFORM_UNAVAILABLE",
            os_code: None,
        })
    }
}

pub fn flush_windows_directory_candidate(path: &Path) -> WindowsDirectoryFlushVerdict {
    #[cfg(windows)]
    {
        windows::flush_directory(path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        WindowsDirectoryFlushVerdict::Deny(WindowsHostProbeError {
            code: "WINDOWS_PLATFORM_UNAVAILABLE",
            os_code: None,
        })
    }
}

pub fn publish_windows_generation_candidate(
    directory: &Path,
    generation_id: &str,
    bytes: &[u8],
) -> WindowsGenerationPublicationVerdict {
    #[cfg(windows)]
    {
        windows::publish_generation(directory, generation_id, bytes)
    }
    #[cfg(not(windows))]
    {
        let _ = (directory, generation_id, bytes);
        WindowsGenerationPublicationVerdict::Deny(WindowsHostProbeError {
            code: "WINDOWS_PLATFORM_UNAVAILABLE",
            os_code: None,
        })
    }
}

#[cfg(feature = "fault-injection")]
#[doc(hidden)]
pub fn publish_windows_generation_fault_candidate<F>(
    directory: &Path,
    generation_id: &str,
    bytes: &[u8],
    observe: F,
) -> WindowsGenerationPublicationVerdict
where
    F: FnMut(&'static str),
{
    #[cfg(windows)]
    {
        windows::publish_generation_fault_candidate(directory, generation_id, bytes, observe)
    }
    #[cfg(not(windows))]
    {
        let _ = (directory, generation_id, bytes, observe);
        WindowsGenerationPublicationVerdict::Deny(WindowsHostProbeError {
            code: "WINDOWS_PLATFORM_UNAVAILABLE",
            os_code: None,
        })
    }
}
