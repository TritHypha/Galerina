//! RD-0529 A1 (part 2 of 2) — the general-corpus differential re-run through REAL wasmtime.
//!
//! `tools/export-corpus-differential.mjs` compiles a seed of pure Galerina flows, runs each under the
//! Stage-A INTERPRETER and under V8, asserts interp ≡ V8 (values AND fail-closed traps), and emits a
//! fixture: per program the `.wasm` bytes + each call's args + the agreed expected {value | trap}. This
//! harness re-runs every call through Wasmtime — the production embedder — and asserts wasmtime matches
//! the fixture. A pass is the THREE-way agreement the DSS supervisor's M1 harness proved for ONE module,
//! now over a general corpus with arbitrary signatures:
//!     interpreter  ===  V8  ===  wasmtime          (result bit-equal, and fail-closed traps identical)
//!
//! It generalises M1 past its 6 fixed DSS exports + 2 hand-written signatures: the callee's type is read
//! from the module itself (`Func::ty` → params/results) and the call is DYNAMIC (`Func::call` over `Val`s),
//! so any (i32/f64 today; i64/f32 as the seed grows) pure flow runs without a bespoke typed shim. Traps
//! are caught (a `call` that returns `Err` is the module failing closed) and asserted against the fixture.
//! Fuel metering is ON (Milestone-0 discipline) so every call runs under an explicit budget, never ambient.
//!
//! Fixture (generated; gitignored):  run  node tools/export-corpus-differential.mjs  first.

use std::path::PathBuf;
use wasmtime::{Config, Engine, Instance, Module, Store, Val, ValType};

fn fixture(name: &str) -> PathBuf {
    [env!("CARGO_MANIFEST_DIR"), "fixtures", "corpus", name].iter().collect()
}

fn read_json(name: &str) -> anyhow::Result<serde_json::Value> {
    let bytes = std::fs::read(fixture(name))
        .map_err(|e| anyhow::anyhow!("missing corpus fixture {name}: {e} — run: node tools/export-corpus-differential.mjs"))?;
    Ok(serde_json::from_slice(&bytes)?)
}

// An i64 arg arrives as a JSON number (i32/small cases) or a STRING (i64/u64 values past JSON's safe-integer
// range). For a u64 value > i64::MAX (e.g. 2^64-1) parse as u64 then reinterpret the bits as i64 — the wasmtime
// i64 param carries the bit pattern, which the module's unsigned ops (i64.div_u/rem_u/gt_u) read correctly.
fn arg_i64(a: &serde_json::Value) -> i64 {
    if let Some(n) = a.as_i64() {
        return n;
    }
    let s = a.as_str().expect("i64 arg is a JSON number or string");
    s.parse::<i64>().unwrap_or_else(|_| s.parse::<u64>().expect("i64/u64 arg") as i64)
}

#[test]
fn corpus_equals_interp_and_v8_through_wasmtime() -> anyhow::Result<()> {
    let manifest = read_json("corpus-differential.json")?;
    let programs = manifest["programs"].as_array().expect("programs is an array");

    // fuel ON (Milestone-0 discipline): no ambient execution.
    let mut config = Config::new();
    config.consume_fuel(true);
    let engine = Engine::new(&config)?;

    let mut checked = 0usize;
    let mut traps_checked = 0usize;
    let mut mismatches: Vec<String> = Vec::new();

    for prog in programs {
        let id = prog["id"].as_str().expect("program id");
        let wasm_file = prog["wasm_file"].as_str().expect("wasm_file");
        let flow = prog["flow"].as_str().unwrap_or("f");
        let wasm = std::fs::read(fixture(wasm_file))
            .map_err(|e| anyhow::anyhow!("missing {wasm_file}: {e} — run the exporter"))?;
        let module = Module::new(&engine, &wasm)?;

        for call in prog["calls"].as_array().expect("calls is an array") {
            checked += 1;
            let args_json = call["args"].as_array().expect("args is an array");
            let want_trap = call["expect"]["trap"].as_bool().unwrap_or(false);

            // fresh store + explicit fuel per call — never ambient (pure flows import nothing → no linker).
            let mut store = Store::new(&engine, ());
            store.set_fuel(100_000_000)?;
            let instance = Instance::new(&mut store, &module, &[])?;
            let func = match instance.get_func(&mut store, flow) {
                Some(f) => f,
                None => { mismatches.push(format!("{id}: no exported function `{flow}`")); continue; }
            };

            // signature straight from the module — generalises M1's two hand-written shapes.
            let ty = func.ty(&store);
            let params: Vec<ValType> = ty.params().collect();
            let results: Vec<ValType> = ty.results().collect();

            let mut vals: Vec<Val> = Vec::with_capacity(params.len());
            let mut unsupported = false;
            for (i, pt) in params.iter().enumerate() {
                let a = &args_json[i];
                let v = match pt {
                    ValType::I32 => Val::I32(a.as_i64().expect("i32 arg") as i32),
                    ValType::I64 => Val::I64(arg_i64(a)),
                    ValType::F64 => Val::F64(a.as_f64().expect("f64 arg").to_bits()),
                    ValType::F32 => Val::F32((a.as_f64().expect("f32 arg") as f32).to_bits()),
                    other => { mismatches.push(format!("{id}: unsupported param type {other:?}")); unsupported = true; break; }
                };
                vals.push(v);
            }
            if unsupported { continue; }

            let mut out = vec![Val::I32(0); results.len()];
            let call_res = func.call(&mut store, &vals, &mut out);

            match (call_res, want_trap) {
                // a `call` that Errs is the module failing closed (trap / fuel) — the fail-closed contract.
                (Err(_), true) => { traps_checked += 1; }
                (Err(e), false) => mismatches.push(format!("{id}({args_json:?}): wasmtime TRAPPED ({e}) but fixture expects a value")),
                (Ok(()), true) => mismatches.push(format!("{id}({args_json:?}): wasmtime returned a value but fixture expects a fail-closed TRAP")),
                (Ok(()), false) => {
                    let want = call["expect"]["value"].as_str().unwrap_or("");
                    let ok = match results.first() {
                        // f64: BIT-exact (RD-0529 A2) — compare the raw bit pattern to the fixture's f64bits key.
                        // A string or `==` compare would hide a -0.0 / flush-to-zero / subnormal divergence; bits can't.
                        Some(ValType::F64) => {
                            let want_bits = call["expect"]["f64bits"].as_str()
                                .and_then(|s| u64::from_str_radix(s.trim_start_matches("0x"), 16).ok());
                            matches!((out[0].f64(), want_bits), (Some(g), Some(wb)) if g.to_bits() == wb)
                        }
                        // i32 (incl. Bool, lowered to 0/1) and i64: exact integer string match.
                        Some(ValType::I32) => out[0].i32().map(|g| (g as i64).to_string() == want).unwrap_or(false),
                        Some(ValType::I64) => out[0].i64().map(|g| g.to_string() == want).unwrap_or(false),
                        other => { mismatches.push(format!("{id}: unsupported result type {other:?}")); false }
                    };
                    if !ok {
                        let (got, want_show) = match results.first() {
                            Some(ValType::F64) => (
                                out[0].f64().map(|g| format!("{g} (0x{:016x})", g.to_bits())).unwrap_or_default(),
                                call["expect"]["f64bits"].as_str().unwrap_or(want).to_string(),
                            ),
                            Some(ValType::I64) => (out[0].i64().map(|g| g.to_string()).unwrap_or_default(), want.to_string()),
                            _ => (out[0].i32().map(|g| g.to_string()).unwrap_or_default(), want.to_string()),
                        };
                        mismatches.push(format!("{id}({args_json:?}): wasmtime={got} != expected={want_show}"));
                    }
                }
            }
        }
    }

    assert!(
        mismatches.is_empty(),
        "{} of {} calls diverged through real wasmtime:\n{}",
        mismatches.len(),
        checked,
        mismatches.join("\n")
    );
    assert!(checked >= 30, "corpus coverage too low: only {checked} calls (fixture incomplete — run the exporter)");
    assert!(traps_checked >= 3, "non-vacuity: only {traps_checked} trap classes exercised (need the fail-closed cases)");
    // Honest scope: this leg proves wasmtime matches the interp≡V8 FIXTURE. For value + symmetric-trap calls
    // that is the full three-way; for the D1 wasm-enforced-trap calls the fixture encodes V8≡wasmtime only (the
    // interpreter does not enforce the invariant — recorded by the exporter, not a wasmtime concern here).
    println!(
        "wasmtime corpus differential: {checked} calls ({traps_checked} fail-closed) — wasmtime matches the interp≡V8 fixture OK"
    );
    Ok(())
}
