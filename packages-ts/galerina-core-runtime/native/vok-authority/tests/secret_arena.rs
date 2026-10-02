use galerina_vok_authority::{SecretArena, SecretArenaError};

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
#[test]
#[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
fn linux_secret_arena_tracks_reserved_allocated_and_cleaned_states() {
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
