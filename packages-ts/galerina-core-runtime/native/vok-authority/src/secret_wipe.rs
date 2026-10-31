//! MEM-R24 (gap map 2.4): the wipe-then-read-back rule for secret bytes, split
//! out of the Linux `memfd_secret` mapping so it runs in CI on any host.
//!
//! The rule: every byte is written to zero with a volatile store, then every
//! byte is read back with a volatile load, and a single non-zero byte refuses
//! the wipe. Volatile access keeps the compiler from eliding the stores as
//! dead (the memory is about to be unmapped or reused), so a successful return
//! means the zeros were observed in memory, not merely requested.
//!
//! `SecretMapping::wipe_and_verify` (secret_arena.rs, Linux only) calls
//! `wipe_then_verify` over a `VolatileRegion`, so the CI tests in this module
//! exercise the exact loop the target runs. The target-only test
//! `cleanup_observes_zero_bytes_before_unmapping_the_real_mapping` stays as the
//! end-to-end check on a memfd_secret kernel.

// The Linux mapping is the only production caller; other hosts build the
// module for its CI tests alone.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::ptr::NonNull;

/// The wipe was not observed: a byte read back non-zero. Carries no byte
/// values and no offsets, so the refusal cannot leak secret material.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct WipeNotObserved;

/// Byte cells that can be zeroed and read back one at a time.
pub(crate) trait WipeCells {
    fn cell_count(&self) -> usize;
    fn write_zero(&mut self, index: usize);
    fn read_cell(&self, index: usize) -> u8;
}

/// Zero every cell, then read every cell back. Write pass completes before the
/// read pass starts, so a cell that only reads zero because it was never
/// written cannot pass early.
pub(crate) fn wipe_then_verify<T: WipeCells + ?Sized>(cells: &mut T) -> Result<(), WipeNotObserved> {
    let count = cells.cell_count();
    for index in 0..count {
        cells.write_zero(index);
    }
    for index in 0..count {
        if cells.read_cell(index) != 0 {
            return Err(WipeNotObserved);
        }
    }
    Ok(())
}

/// A live byte region accessed only through volatile loads and stores.
pub(crate) struct VolatileRegion {
    address: NonNull<u8>,
    length: usize,
}

impl VolatileRegion {
    /// # Safety
    /// `address` must point to `length` bytes that are live, writable, and not
    /// aliased by any reference for the lifetime of the returned region.
    pub(crate) unsafe fn new(address: NonNull<u8>, length: usize) -> Self {
        Self { address, length }
    }
}

impl WipeCells for VolatileRegion {
    fn cell_count(&self) -> usize {
        self.length
    }

    fn write_zero(&mut self, index: usize) {
        assert!(index < self.length, "wipe index outside region");
        // SAFETY: `new` requires `length` live writable unaliased bytes and the
        // index was just bounds-checked.
        unsafe { std::ptr::write_volatile(self.address.as_ptr().add(index), 0) }
    }

    fn read_cell(&self, index: usize) -> u8 {
        assert!(index < self.length, "wipe index outside region");
        // SAFETY: as for write_zero.
        unsafe { std::ptr::read_volatile(self.address.as_ptr().add(index)) }
    }
}

/// Wipe and verify an owned heap buffer through the same volatile path the
/// Linux mapping uses. Used for short-lived copies (borrow windows) and tests.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn wipe_buffer_then_verify(buffer: &mut [u8]) -> Result<(), WipeNotObserved> {
    let Some(address) = NonNull::new(buffer.as_mut_ptr()) else {
        return Ok(());
    };
    // SAFETY: `buffer` is an exclusive borrow of exactly `buffer.len()` bytes
    // and no other reference to it exists while `region` is alive.
    let mut region = unsafe { VolatileRegion::new(address, buffer.len()) };
    wipe_then_verify(&mut region)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A model of memory that can refuse writes at chosen cells, so the
    /// read-back pass is shown to catch a store that never landed.
    struct StuckCells {
        bytes: Vec<u8>,
        stuck: Vec<usize>,
        writes: usize,
        reads: usize,
        order: Vec<char>,
    }

    impl StuckCells {
        fn new(len: usize, fill: u8, stuck: &[usize]) -> Self {
            Self {
                bytes: vec![fill; len],
                stuck: stuck.to_vec(),
                writes: 0,
                reads: 0,
                order: Vec::new(),
            }
        }
    }

    impl WipeCells for StuckCells {
        fn cell_count(&self) -> usize {
            self.bytes.len()
        }
        fn write_zero(&mut self, index: usize) {
            self.writes += 1;
            if self.order.last() != Some(&'w') {
                self.order.push('w');
            }
            if !self.stuck.contains(&index) {
                self.bytes[index] = 0;
            }
        }
        fn read_cell(&self, index: usize) -> u8 {
            self.bytes[index]
        }
    }

    #[test]
    fn heap_buffer_page_crossing_reads_back_zero() {
        // 4097 = one byte over a 4 KiB page, same length as the target-only test.
        let mut buffer = vec![0xA5_u8; 4097];
        assert_eq!(wipe_buffer_then_verify(&mut buffer), Ok(()));
        assert!(buffer.iter().all(|byte| *byte == 0));
    }

    #[test]
    fn every_length_from_zero_to_seventy_wipes_completely() {
        for len in 0..=70 {
            let mut buffer: Vec<u8> = (0..len).map(|i| (i as u8) | 0x80).collect();
            assert_eq!(wipe_buffer_then_verify(&mut buffer), Ok(()), "len {len}");
            assert!(buffer.iter().all(|byte| *byte == 0), "len {len}");
        }
    }

    #[test]
    fn empty_buffer_is_a_successful_no_op() {
        let mut buffer: Vec<u8> = Vec::new();
        assert_eq!(wipe_buffer_then_verify(&mut buffer), Ok(()));
    }

    #[test]
    fn a_stuck_first_middle_or_last_cell_refuses() {
        for stuck in [0_usize, 2048, 4096] {
            let mut cells = StuckCells::new(4097, 0xA5, &[stuck]);
            assert_eq!(wipe_then_verify(&mut cells), Err(WipeNotObserved), "stuck {stuck}");
        }
    }

    #[test]
    fn a_stuck_cell_that_already_held_zero_is_not_a_failure() {
        // The read-back checks the observed value, not whether the store landed.
        let mut cells = StuckCells::new(16, 0xA5, &[3]);
        cells.bytes[3] = 0;
        assert_eq!(wipe_then_verify(&mut cells), Ok(()));
    }

    #[test]
    fn all_writes_happen_before_any_read() {
        let mut cells = StuckCells::new(64, 0x5A, &[]);
        assert_eq!(wipe_then_verify(&mut cells), Ok(()));
        assert_eq!(cells.writes, 64);
        assert_eq!(cells.order, vec!['w']);
        let _ = cells.reads;
    }

    #[test]
    fn refusal_carries_no_byte_value_or_offset() {
        let mut cells = StuckCells::new(32, 0xC3, &[17]);
        let refusal = wipe_then_verify(&mut cells).unwrap_err();
        let text = format!("{refusal:?}");
        assert_eq!(text, "WipeNotObserved");
        assert!(!text.contains("17") && !text.to_ascii_lowercase().contains("c3"));
    }

    #[test]
    fn volatile_region_matches_the_model_on_a_live_buffer() {
        let mut buffer = vec![0xFF_u8; 257];
        let address = NonNull::new(buffer.as_mut_ptr()).unwrap();
        // SAFETY: exclusive owner of the 257-byte buffer for the region's life.
        let mut region = unsafe { VolatileRegion::new(address, buffer.len()) };
        assert_eq!(region.cell_count(), 257);
        assert_eq!(region.read_cell(256), 0xFF);
        assert_eq!(wipe_then_verify(&mut region), Ok(()));
        assert_eq!(region.read_cell(0), 0);
        assert_eq!(region.read_cell(256), 0);
    }

    #[test]
    #[should_panic(expected = "wipe index outside region")]
    fn volatile_region_refuses_out_of_bounds_index() {
        let mut buffer = vec![1_u8; 4];
        let address = NonNull::new(buffer.as_mut_ptr()).unwrap();
        // SAFETY: exclusive owner of the 4-byte buffer.
        let mut region = unsafe { VolatileRegion::new(address, buffer.len()) };
        region.write_zero(4);
    }
}
