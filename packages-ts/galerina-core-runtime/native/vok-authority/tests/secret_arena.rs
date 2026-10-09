use galerina_vok_authority::{SecretArena, SecretArenaError, ERR_SECRET_ARENA_CLEANUP_FAILED};

#[test]
fn secret_arena_display_preserves_existing_consumer_identifiers() {
    let cases = [
        (SecretArenaError::InvalidLength, "SECRET_ARENA_INVALID_LENGTH"),
        (SecretArenaError::UnsupportedPlatform, "SECRET_ARENA_UNSUPPORTED_PLATFORM"),
        (SecretArenaError::CreateRefused { os_errno: 13 }, "SECRET_ARENA_CREATE_REFUSED:13"),
        (SecretArenaError::ResizeRefused, "SECRET_ARENA_RESIZE_REFUSED"),
        (SecretArenaError::MapRefused, "SECRET_ARENA_MAP_REFUSED"),
        (SecretArenaError::PageSizeRefused, "SECRET_ARENA_PAGE_SIZE_REFUSED"),
        (SecretArenaError::NotAllocated, "SECRET_ARENA_NOT_ALLOCATED"),
        (SecretArenaError::NotActive, "SECRET_ARENA_NOT_ACTIVE"),
        (SecretArenaError::CleanupFailed, "SECRET_ARENA_CLEANUP_FAILED"),
    ];
    for (error, expected) in cases {
        assert_eq!(error.to_string(), expected);
        assert!(error.runtime_code().code.starts_with("ERR_SECRET_ARENA_"));
    }
}

#[test]
fn secret_arena_runtime_error_codes_are_public_and_attached_to_errors() {
    let error = SecretArenaError::CleanupFailed;
    assert_eq!(
        ERR_SECRET_ARENA_CLEANUP_FAILED.code,
        "ERR_SECRET_ARENA_CLEANUP_FAILED"
    );
    assert_eq!(error.runtime_code(), &ERR_SECRET_ARENA_CLEANUP_FAILED);
}

#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
use galerina_vok_authority::MemoryStatus;

#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
static LINUX_SECRET_ARENA_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
fn assert_memlock_test_preconditions(expected_limit_bytes: usize) {
    let limits = std::fs::read_to_string("/proc/self/limits")
        .expect("Linux process limits must be observable");
    let memlock = limits
        .lines()
        .find(|line| line.starts_with("Max locked memory"))
        .expect("Max locked memory limit must be present");
    let fields: Vec<_> = memlock.split_whitespace().collect();
    assert_eq!(&fields[..3], &["Max", "locked", "memory"]);
    assert_eq!(
        fields.get(3).and_then(|value| value.parse::<usize>().ok()),
        Some(expected_limit_bytes)
    );
    assert_eq!(
        fields.get(4).and_then(|value| value.parse::<usize>().ok()),
        Some(expected_limit_bytes)
    );
    assert_eq!(fields.get(5).copied(), Some("bytes"));

    let status = std::fs::read_to_string("/proc/self/status")
        .expect("Linux process capabilities must be observable");
    let effective_caps = status
        .lines()
        .find(|line| line.starts_with("CapEff:"))
        .and_then(|line| line.split_whitespace().nth(1))
        .expect("effective capability mask must be present");
    let effective_caps = u64::from_str_radix(effective_caps, 16)
        .expect("effective capability mask must be hexadecimal");
    const CAP_IPC_LOCK: u64 = 1 << 14;
    assert_eq!(
        effective_caps & CAP_IPC_LOCK,
        0,
        "CAP_IPC_LOCK bypasses RLIMIT_MEMLOCK"
    );
}

#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
#[test]
#[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
fn linux_secret_arena_tracks_reserved_allocated_and_cleaned_states() {
    let _guard = LINUX_SECRET_ARENA_TEST_LOCK
        .lock()
        .expect("serialize Linux secretmem arena tests");
    const RESERVED: usize = 4097;
    let mut arena = SecretArena::reserve(RESERVED).expect("Linux secretmem must be available");
    assert_eq!(arena.status(), MemoryStatus::Reserved);
    assert_eq!(arena.reserved_bytes(), RESERVED);
    assert_eq!(arena.unresolved_bytes(), RESERVED);
    assert_eq!(arena.allocated_bytes(), 0);
    assert_eq!(arena.retained_bytes(), 0);

    arena
        .allocate_pages()
        .expect("secret pages must be faulted in");
    assert_eq!(arena.status(), MemoryStatus::Allocated);
    assert!(arena.allocated_bytes() > RESERVED);

    // External callers can observe accounting, but cannot access plaintext.
    assert_eq!(arena.retained_bytes(), 0);

    arena
        .cleanup()
        .expect("explicit wipe and unmap must succeed");
    assert_eq!(arena.status(), MemoryStatus::Cleaned);
    assert_eq!(arena.unresolved_bytes(), 0);
    assert_eq!(arena.allocate_pages(), Err(SecretArenaError::NotActive));
}

#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
#[test]
#[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel, an exact 64 MiB RLIMIT_MEMLOCK, and no effective CAP_IPC_LOCK; run explicitly on the target"]
fn linux_secret_arena_restores_full_mapping_allowance_after_cleanup() {
    use galerina_vok_authority::MemoryStatus;

    let _guard = LINUX_SECRET_ARENA_TEST_LOCK
        .lock()
        .expect("serialize Linux secretmem arena tests");
    // The equal-sized second mapping must fail while the first occupies the
    // entire verified process memlock limit, then succeed after full cleanup.
    const RESERVED: usize = 64 * 1024 * 1024;
    assert_memlock_test_preconditions(RESERVED);
    let mut first = SecretArena::reserve(RESERVED).expect("reserve first secret arena");
    first.allocate_pages().expect("allocate first secret arena");
    assert_eq!(first.allocated_bytes(), RESERVED);
    assert!(
        matches!(
            SecretArena::reserve(RESERVED),
            Err(SecretArenaError::MapRefused)
        ),
        "a same-sized reservation must not fit while the first arena is live"
    );

    first
        .cleanup()
        .expect("wipe, verify, unmap, and close first secret arena");
    assert_eq!(first.status(), MemoryStatus::Cleaned);
    assert_eq!(first.allocated_bytes(), 0);
    assert_eq!(first.retained_bytes(), 0);
    assert_eq!(first.unresolved_bytes(), 0);
    drop(first);

    // This same-sized real Linux secretmem allocation checks that cleanup
    // returns the full bounded memlock allowance for later use. It does not
    // assert reuse of the same physical pages or prove whole-process copies
    // were removed.
    let mut next = SecretArena::reserve(RESERVED).expect("reserve next secret arena");
    next.allocate_pages().expect("allocate next secret arena");
    assert_eq!(next.allocated_bytes(), RESERVED);
    next.cleanup()
        .expect("wipe, verify, unmap, and close next secret arena");
    assert_eq!(next.status(), MemoryStatus::Cleaned);
    assert_eq!(next.unresolved_bytes(), 0);
}

#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
#[test]
fn zero_length_secret_arena_is_refused_before_platform_access() {
    assert!(matches!(
        SecretArena::reserve(0),
        Err(SecretArenaError::InvalidLength)
    ));
}

#[cfg(not(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
)))]
#[test]
fn valid_length_secret_arena_refuses_unsupported_platform() {
    assert!(matches!(
        SecretArena::reserve(1),
        Err(SecretArenaError::UnsupportedPlatform)
    ));
}
