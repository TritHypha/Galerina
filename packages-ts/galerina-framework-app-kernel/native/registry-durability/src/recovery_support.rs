#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use galerina_registry_durability_native::sha256;

pub const CANDIDATE_BYTES: &[u8] =
    br#"{"schema":"galerina.registry.generation.v1","candidate":true}"#;
pub const MAX_GENERATION_BYTES: u64 = 16 * 1024 * 1024;
pub const PUBLICATION_BOUNDARIES: [&str; 7] = [
    "stage-opened",
    "bytes-written",
    "file-flushed",
    "stage-closed",
    "published",
    "reopened-verified",
    "directory-flushed",
];

#[derive(Clone)]
pub struct RecoveryArguments {
    pub execution: String,
    pub mode: String,
    pub target: PathBuf,
    pub experiment_id: String,
    pub boundary: String,
    pub prior_id: String,
    pub candidate_id: String,
    pub prior_digest: String,
    pub candidate_digest: String,
    pub target_device_digest: String,
    pub repository_root: PathBuf,
    pub home_root: PathBuf,
    pub system_root: PathBuf,
    pub repository_device_digest: String,
    pub home_device_digest: String,
    pub system_device_digest: String,
}

fn lower_hex_64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn direct_absolute_path(value: &str) -> Result<PathBuf, &'static str> {
    let path = PathBuf::from(value);
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err("RECOVERY_PATH_REFUSED");
    }
    let metadata = fs::symlink_metadata(&path).map_err(|_| "RECOVERY_PATH_UNAVAILABLE")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("RECOVERY_PATH_IDENTITY_REFUSED");
    }
    fs::canonicalize(path).map_err(|_| "RECOVERY_PATH_UNAVAILABLE")
}

pub fn parse_arguments() -> Result<RecoveryArguments, &'static str> {
    let raw = std::env::args().skip(1).collect::<Vec<_>>();
    if raw.len() != 32 {
        return Err("RECOVERY_ARGUMENTS_REFUSED");
    }
    let mut values = BTreeMap::new();
    for pair in raw.as_chunks::<2>().0 {
        if !pair[0].starts_with("--") || values.insert(pair[0].clone(), pair[1].clone()).is_some() {
            return Err("RECOVERY_ARGUMENTS_REFUSED");
        }
    }
    let expected = [
        "--boundary",
        "--candidate-digest",
        "--candidate-id",
        "--execution",
        "--experiment-id",
        "--home-device-digest",
        "--home-root",
        "--mode",
        "--prior-digest",
        "--prior-id",
        "--repository-device-digest",
        "--repository-root",
        "--system-device-digest",
        "--system-root",
        "--target",
        "--target-device-digest",
    ];
    if values.keys().map(String::as_str).ne(expected) {
        return Err("RECOVERY_ARGUMENTS_REFUSED");
    }
    let value = |key: &str| values.get(key).cloned().ok_or("RECOVERY_ARGUMENTS_REFUSED");
    let arguments = RecoveryArguments {
        execution: value("--execution")?,
        mode: value("--mode")?,
        target: direct_absolute_path(&value("--target")?)?,
        experiment_id: value("--experiment-id")?,
        boundary: value("--boundary")?,
        prior_id: value("--prior-id")?,
        candidate_id: value("--candidate-id")?,
        prior_digest: value("--prior-digest")?,
        candidate_digest: value("--candidate-digest")?,
        target_device_digest: value("--target-device-digest")?,
        repository_root: direct_absolute_path(&value("--repository-root")?)?,
        home_root: direct_absolute_path(&value("--home-root")?)?,
        system_root: direct_absolute_path(&value("--system-root")?)?,
        repository_device_digest: value("--repository-device-digest")?,
        home_device_digest: value("--home-device-digest")?,
        system_device_digest: value("--system-device-digest")?,
    };
    arguments.validate()?;
    Ok(arguments)
}

impl RecoveryArguments {
    fn validate(&self) -> Result<(), &'static str> {
        if !matches!(self.execution.as_str(), "live" | "test-only")
            || !matches!(
                self.mode.as_str(),
                "controlled-reboot" | "controlled-power-loss"
            )
            || !PUBLICATION_BOUNDARIES.contains(&self.boundary.as_str())
            || !lower_hex_64(&self.experiment_id)
            || !lower_hex_64(&self.prior_id)
            || !lower_hex_64(&self.candidate_id)
            || self.prior_id == self.candidate_id
            || !lower_hex_64(&self.prior_digest)
            || !lower_hex_64(&self.candidate_digest)
            || !lower_hex_64(&self.target_device_digest)
            || !lower_hex_64(&self.repository_device_digest)
            || !lower_hex_64(&self.home_device_digest)
            || !lower_hex_64(&self.system_device_digest)
            || self.candidate_digest != sha256(CANDIDATE_BYTES)
        {
            return Err("RECOVERY_ARGUMENTS_REFUSED");
        }
        for prohibited in [&self.repository_root, &self.home_root, &self.system_root] {
            if self.target.starts_with(prohibited) || prohibited.starts_with(&self.target) {
                return Err("RECOVERY_PROHIBITED_PATH_REFUSED");
            }
        }
        if [
            &self.repository_device_digest,
            &self.home_device_digest,
            &self.system_device_digest,
        ]
        .contains(&&self.target_device_digest)
        {
            return Err("RECOVERY_PROHIBITED_DEVICE_REFUSED");
        }
        if self.execution == "live"
            && [&self.repository_root, &self.home_root, &self.system_root]
                .iter()
                .any(|prohibited| same_native_device(&self.target, prohibited).unwrap_or(true))
        {
            return Err("RECOVERY_PROHIBITED_NATIVE_DEVICE_REFUSED");
        }
        Ok(())
    }

    pub fn prior_path(&self) -> PathBuf {
        self.target
            .join(format!("registry-generation-{}.json", self.prior_id))
    }

    pub fn candidate_path(&self) -> PathBuf {
        self.target
            .join(format!("registry-generation-{}.json", self.candidate_id))
    }

    pub fn marker_path(&self) -> PathBuf {
        self.target.join(".galerina-durability-sacrificial-v1")
    }

    pub fn checkpoint_path(&self) -> PathBuf {
        self.target.join("registry-durability-checkpoint-v1")
    }

    pub fn arm_path(&self) -> PathBuf {
        self.target.join(format!(
            "registry-durability-arm-{}.json",
            self.experiment_id
        ))
    }

    pub fn result_path(&self) -> PathBuf {
        self.target.join(format!(
            "registry-durability-result-{}.json",
            self.experiment_id
        ))
    }

    pub fn marker_bytes(&self) -> Vec<u8> {
        format!(
            "GALERINA_DURABILITY_SACRIFICIAL_V1\nexperiment={}\ndevice={}\n",
            self.experiment_id, self.target_device_digest
        )
        .into_bytes()
    }

    pub fn arm_bytes(&self) -> Vec<u8> {
        format!(
            concat!(
                "{{\n",
                "  \"authenticated\": false,\n",
                "  \"boundaryId\": \"{}\",\n",
                "  \"candidateDigest\": \"sha256:{}\",\n",
                "  \"candidateGenerationId\": \"{}\",\n",
                "  \"deviceDigest\": \"sha256:{}\",\n",
                "  \"evidenceMode\": \"{}\",\n",
                "  \"execution\": \"{}\",\n",
                "  \"experimentId\": \"{}\",\n",
                "  \"priorDigest\": \"sha256:{}\",\n",
                "  \"priorGenerationId\": \"{}\",\n",
                "  \"productionAuthorizing\": false,\n",
                "  \"schema\": \"galerina.registry.durability.recovery-arm.v1\"\n",
                "}}\n"
            ),
            self.boundary,
            self.candidate_digest,
            self.candidate_id,
            self.target_device_digest,
            self.mode,
            self.execution,
            self.experiment_id,
            self.prior_digest,
            self.prior_id,
        )
        .into_bytes()
    }

    pub fn result_bytes(&self, arm_digest: &str, outcome: &str) -> Vec<u8> {
        format!(
            concat!(
                "{{\n",
                "  \"armDigest\": \"sha256:{}\",\n",
                "  \"authenticated\": false,\n",
                "  \"boundaryId\": \"{}\",\n",
                "  \"deviceDigest\": \"sha256:{}\",\n",
                "  \"evidenceMode\": \"{}\",\n",
                "  \"execution\": \"{}\",\n",
                "  \"experimentId\": \"{}\",\n",
                "  \"outcome\": \"{}\",\n",
                "  \"productionAuthorizing\": false,\n",
                "  \"schema\": \"galerina.registry.durability.recovery-result.v1\"\n",
                "}}\n"
            ),
            arm_digest,
            self.boundary,
            self.target_device_digest,
            self.mode,
            self.execution,
            self.experiment_id,
            outcome,
        )
        .into_bytes()
    }
}

#[cfg(unix)]
fn same_native_device(left: &Path, right: &Path) -> Result<bool, &'static str> {
    use std::os::unix::fs::MetadataExt;
    let left = fs::symlink_metadata(left).map_err(|_| "RECOVERY_DEVICE_IDENTITY_REFUSED")?;
    let right = fs::symlink_metadata(right).map_err(|_| "RECOVERY_DEVICE_IDENTITY_REFUSED")?;
    Ok(left.dev() == right.dev())
}

#[cfg(windows)]
fn same_native_device(left: &Path, right: &Path) -> Result<bool, &'static str> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetVolumePathNameW(file_name: *const u16, volume_path: *mut u16, length: u32) -> i32;
    }

    fn volume_root(path: &Path) -> Result<Vec<u16>, &'static str> {
        let mut input = path.as_os_str().encode_wide().collect::<Vec<_>>();
        if input.contains(&0) {
            return Err("RECOVERY_DEVICE_IDENTITY_REFUSED");
        }
        input.push(0);
        let mut output = vec![0_u16; 32_768];
        // SAFETY: both pointers reference initialized, bounded UTF-16 buffers;
        // the output length is exactly the allocated capacity.
        let status =
            unsafe { GetVolumePathNameW(input.as_ptr(), output.as_mut_ptr(), output.len() as u32) };
        if status == 0 {
            return Err("RECOVERY_DEVICE_IDENTITY_REFUSED");
        }
        let length = output
            .iter()
            .position(|unit| *unit == 0)
            .ok_or("RECOVERY_DEVICE_IDENTITY_REFUSED")?;
        output.truncate(length);
        if output.is_empty() || output.iter().any(|unit| *unit > 0x7f) {
            return Err("RECOVERY_DEVICE_IDENTITY_REFUSED");
        }
        for unit in &mut output {
            if (*unit >= u16::from(b'a')) && (*unit <= u16::from(b'z')) {
                *unit -= u16::from(b'a' - b'A');
            }
        }
        Ok(output)
    }

    Ok(volume_root(left)? == volume_root(right)?)
}

#[cfg(not(any(unix, windows)))]
fn same_native_device(_left: &Path, _right: &Path) -> Result<bool, &'static str> {
    Err("RECOVERY_DEVICE_IDENTITY_REFUSED")
}

#[cfg(unix)]
fn single_link_metadata(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    metadata.nlink() == 1
}

#[cfg(windows)]
fn single_link_metadata(_metadata: &fs::Metadata) -> bool {
    true
}

#[cfg(not(any(unix, windows)))]
fn single_link_metadata(_metadata: &fs::Metadata) -> bool {
    false
}

#[cfg(windows)]
fn single_link_file(file: &File, _metadata: &fs::Metadata) -> bool {
    use std::ffi::c_void;
    use std::mem::MaybeUninit;
    use std::os::windows::io::AsRawHandle;

    #[repr(C)]
    struct FileTime {
        low: u32,
        high: u32,
    }

    #[repr(C)]
    struct ByHandleFileInformation {
        file_attributes: u32,
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

    #[link(name = "kernel32")]
    extern "system" {
        fn GetFileInformationByHandle(
            file: *mut c_void,
            information: *mut ByHandleFileInformation,
        ) -> i32;
    }

    let mut information = MaybeUninit::<ByHandleFileInformation>::zeroed();
    // SAFETY: the handle is owned by `file`; the output points to an exact
    // Windows ABI structure and is read only after a non-zero return.
    let result = unsafe {
        GetFileInformationByHandle(file.as_raw_handle().cast(), information.as_mut_ptr())
    };
    result != 0 && unsafe { information.assume_init() }.number_of_links == 1
}

#[cfg(unix)]
fn single_link_file(_file: &File, metadata: &fs::Metadata) -> bool {
    single_link_metadata(metadata)
}

#[cfg(not(any(unix, windows)))]
fn single_link_file(_file: &File, _metadata: &fs::Metadata) -> bool {
    false
}

pub fn read_stable_direct(path: &Path, limit: u64) -> Result<Vec<u8>, &'static str> {
    let before = fs::symlink_metadata(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "RECOVERY_FILE_UNAVAILABLE"
        } else {
            "RECOVERY_FILE_REFUSED"
        }
    })?;
    if !before.is_file()
        || before.file_type().is_symlink()
        || !single_link_metadata(&before)
        || before.len() == 0
        || before.len() > limit
    {
        return Err("RECOVERY_FILE_IDENTITY_REFUSED");
    }
    let mut file = File::open(path).map_err(|_| "RECOVERY_FILE_REFUSED")?;
    let opened = file.metadata().map_err(|_| "RECOVERY_FILE_REFUSED")?;
    if opened.len() != before.len() || !single_link_file(&file, &opened) {
        return Err("RECOVERY_FILE_CHANGED_REFUSED");
    }
    let mut bytes = Vec::with_capacity(opened.len() as usize);
    file.read_to_end(&mut bytes)
        .map_err(|_| "RECOVERY_FILE_REFUSED")?;
    let after = file.metadata().map_err(|_| "RECOVERY_FILE_REFUSED")?;
    if bytes.len() as u64 != opened.len()
        || after.len() != opened.len()
        || after.modified().ok() != opened.modified().ok()
        || !single_link_file(&file, &after)
    {
        return Err("RECOVERY_FILE_CHANGED_REFUSED");
    }
    Ok(bytes)
}

pub fn write_exclusive_synced(path: &Path, bytes: &[u8]) -> Result<(), &'static str> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "RECOVERY_RESULT_EXISTS"
            } else {
                "RECOVERY_OUTPUT_REFUSED"
            }
        })?;
    file.write_all(bytes)
        .and_then(|()| file.flush())
        .and_then(|()| file.sync_all())
        .map_err(|_| "RECOVERY_OUTPUT_REFUSED")?;
    sync_parent(path.parent().ok_or("RECOVERY_OUTPUT_REFUSED")?)?;
    Ok(())
}

#[cfg(windows)]
fn sync_parent(path: &Path) -> Result<(), &'static str> {
    use galerina_registry_durability_native::{
        flush_windows_directory_candidate, WindowsDirectoryFlushVerdict,
    };
    match flush_windows_directory_candidate(path) {
        WindowsDirectoryFlushVerdict::Candidate => Ok(()),
        WindowsDirectoryFlushVerdict::Deny(_) => Err("RECOVERY_OUTPUT_REFUSED"),
    }
}

#[cfg(not(windows))]
fn sync_parent(path: &Path) -> Result<(), &'static str> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "RECOVERY_OUTPUT_REFUSED")
}

pub fn verify_common_inputs(arguments: &RecoveryArguments) -> Result<(), &'static str> {
    if read_stable_direct(&arguments.marker_path(), 512)? != arguments.marker_bytes() {
        return Err("RECOVERY_MARKER_REFUSED");
    }
    let prior = read_stable_direct(&arguments.prior_path(), MAX_GENERATION_BYTES)?;
    if sha256(&prior) != arguments.prior_digest {
        return Err("RECOVERY_PRIOR_REFUSED");
    }
    Ok(())
}

pub fn selected_checkpoint(arguments: &RecoveryArguments) -> Result<String, &'static str> {
    let bytes = read_stable_direct(&arguments.checkpoint_path(), 512)?;
    let prior = format!(
        "GALERINA_DURABILITY_CHECKPOINT_V1\nexperiment={}\nselected={}\n",
        arguments.experiment_id, arguments.prior_id
    );
    let candidate = format!(
        "GALERINA_DURABILITY_CHECKPOINT_V1\nexperiment={}\nselected={}\n",
        arguments.experiment_id, arguments.candidate_id
    );
    if bytes == prior.as_bytes() {
        Ok("PRIOR".to_owned())
    } else if bytes == candidate.as_bytes() {
        Ok("CANDIDATE".to_owned())
    } else {
        Err("RECOVERY_CHECKPOINT_REFUSED")
    }
}
