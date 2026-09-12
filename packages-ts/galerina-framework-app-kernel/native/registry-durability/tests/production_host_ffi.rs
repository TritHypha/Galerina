#[cfg(windows)]
use galerina_registry_durability_native::production_host_generation_id;
use galerina_registry_durability_native::{
    galerina_registry_publish_generation_v1, GalerinaProductionHostResultV1,
    PRODUCTION_HOST_ABI_VERSION,
};
#[cfg(windows)]
use std::fs::{create_dir, read, remove_dir_all};
#[cfg(windows)]
use std::path::PathBuf;
#[cfg(windows)]
use std::time::{SystemTime, UNIX_EPOCH};

fn text(field: &[u8]) -> &str {
    let end = field
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(field.len());
    std::str::from_utf8(&field[..end]).expect("result field is UTF-8")
}

#[cfg(windows)]
fn fixture_directory() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "galerina-production-host-{}-{nonce}",
        std::process::id(),
    ))
}

#[test]
fn null_output_is_a_terminal_abi_refusal() {
    let status = unsafe {
        galerina_registry_publish_generation_v1(
            std::ptr::null(),
            0,
            std::ptr::null(),
            0,
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
        )
    };
    assert_eq!(status, -2);
}

#[test]
fn malformed_request_writes_one_closed_denial() {
    let directory = b"relative";
    let generation_id = [b'0'; 64];
    let bytes = b"{}";
    let mut result = GalerinaProductionHostResultV1::default();
    let status = unsafe {
        galerina_registry_publish_generation_v1(
            directory.as_ptr(),
            directory.len(),
            generation_id.as_ptr(),
            generation_id.len(),
            bytes.as_ptr(),
            bytes.len(),
            &mut result,
        )
    };

    assert_eq!(status, -1);
    assert_eq!(result.abi_version, PRODUCTION_HOST_ABI_VERSION);
    assert_eq!(result.verdict, -1);
    assert_eq!(
        text(&result.reason),
        "PRODUCTION_HOST_DIRECTORY_NOT_ABSOLUTE",
    );
    assert_eq!(result.production_authorizing, 0);
}

#[cfg(windows)]
#[test]
fn current_windows_host_publishes_only_exact_identity() {
    let directory = fixture_directory();
    create_dir(&directory).expect("create exact fixture directory");
    let bytes = br#"{"schema":"galerina-registry-generation/v1"}"#;
    let generation_id = production_host_generation_id(bytes);
    let directory_text = directory.to_str().expect("fixture path is UTF-8");
    let mut result = GalerinaProductionHostResultV1::default();

    let status = unsafe {
        galerina_registry_publish_generation_v1(
            directory_text.as_ptr(),
            directory_text.len(),
            generation_id.as_ptr(),
            generation_id.len(),
            bytes.as_ptr(),
            bytes.len(),
            &mut result,
        )
    };

    assert_eq!(status, 1, "native denial: {}", text(&result.reason));
    assert_eq!(result.verdict, 1);
    assert_eq!(result.byte_length, bytes.len() as u64);
    assert_eq!(text(&result.generation_id), generation_id);
    assert_eq!(result.production_authorizing, 0);
    assert_eq!(
        read(directory.join(format!("registry-generation-{generation_id}.json")))
            .expect("published generation"),
        bytes,
    );

    remove_dir_all(&directory).expect("remove isolated fixture directory");
}
