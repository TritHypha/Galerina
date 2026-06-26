# LSS Native Seam

This TypeScript package implements the **atomic-rename + HMAC-SHA256 core** of the
Sentinel State engine: a crash-safe, integrity-gated snapshot of governed state.

What lives **below** this package — the host/native seam — is intentionally *not*
implemented here:

- **NVMe / flash double-buffer partition.** `AtomicWriter` relies on filesystem
  rename atomicity (`writeFileSync(.tmp)` → `renameSync(.snap)`). On real
  aerospace/embedded hardware the two buffers should map to a dedicated
  double-buffered flash partition so a power loss mid-program leaves the prior
  good buffer intact at the block-device level, not just the FS level.
- **Encryption-at-rest.** The snapshot payload is HMAC-authenticated but stored
  in plaintext JSON. The host is responsible for transparent encryption-at-rest
  (e.g. self-encrypting drive, or an envelope-encrypted partition) under a key
  distinct from the GovernanceKey used for the HMAC.

This package provides the portable, deterministic core; the host provides the
durable, confidential medium.
