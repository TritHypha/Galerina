//! DSS.wasm sidecar F4 (memory half) — pooled linear memory is ZEROED on reuse across tasks.
//!
//! DRCM F4: the pooling instance allocator reuses linear memory between tasks, so the sidecar must
//! guarantee zero-on-reset — task N+1 must NEVER observe task N's residue. This is a containment
//! property to PROVE, not assume ("don't assume it"). We force the strongest case: a pool with a
//! SINGLE memory slot, so a second instance is guaranteed to reuse the first's backing memory. If the
//! second instance reads zero where the first wrote a sentinel, zero-on-reset holds under the real
//! embedder configuration.
//!
//! (V_DPM re-init per task — the OTHER half of F4 — is a #102 task-lifecycle obligation, design-stage;
//! this proves the memory-containment half concretely, in wasmtime, today.)
use wasmtime::{Config, Engine, Instance, InstanceAllocationStrategy, Module, PoolingAllocationConfig, Store};

const MEM_WAT: &str = r#"(module (memory (export "mem") 1))"#; // one 64 KiB page, exported

#[test]
fn pooled_linear_memory_is_zeroed_across_tasks() -> anyhow::Result<()> {
    // A pool sized to exactly ONE core instance / ONE memory slot: a second instantiation cannot get
    // a fresh slot, it MUST reuse the first's backing memory — which makes the zero check meaningful.
    let mut pool = PoolingAllocationConfig::default();
    pool.total_core_instances(1);
    pool.total_memories(1);
    pool.total_tables(1);
    pool.max_memory_size(1 << 16); // 64 KiB = 1 page

    let mut config = Config::new();
    config.allocation_strategy(InstanceAllocationStrategy::Pooling(pool));
    let engine = Engine::new(&config)?;
    let module = Module::new(&engine, MEM_WAT)?;

    const OFF: usize = 7;
    const SENTINEL: u8 = 0xAB;

    // ── non-vacuity: prove the pool has exactly ONE slot, so a later instance MUST reuse it. ──
    // Hold task A alive, write a sentinel, and attempt a CONCURRENT second instance — it must FAIL
    // (pool exhausted). Without this the zero check below could pass trivially on a fresh, never-
    // reused allocation, proving nothing.
    {
        let mut store_a = Store::new(&engine, ());
        let inst_a = Instance::new(&mut store_a, &module, &[])?;
        let mem_a = inst_a.get_memory(&mut store_a, "mem").expect("mem export");
        mem_a.data_mut(&mut store_a)[OFF] = SENTINEL;
        assert_eq!(mem_a.data(&store_a)[OFF], SENTINEL, "sentinel write must land");

        let mut store_b = Store::new(&engine, ());
        let concurrent = Instance::new(&mut store_b, &module, &[]);
        assert!(
            concurrent.is_err(),
            "single-slot pool must reject a 2nd concurrent instance — else the reuse below is not forced"
        );
        // end of scope drops store_a -> the one slot returns to the pool
    }

    // ── zero-on-reset: a fresh task reuses that slot and MUST see zero, not task A's sentinel. ──
    {
        let mut store = Store::new(&engine, ());
        let inst = Instance::new(&mut store, &module, &[])?;
        let mem = inst.get_memory(&mut store, "mem").expect("mem export");
        assert_eq!(
            mem.data(&store)[OFF],
            0,
            "pooled memory leaked task A's residue (0x{SENTINEL:02X}) — zero-on-reset FAILED (F4)"
        );
    }

    println!("F4: pooled linear memory zeroed on reuse across tasks (single-slot pool forces reuse) OK");
    Ok(())
}
