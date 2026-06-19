(module
  (memory 2 2048)
  (export "memory" (memory 0))

  ;; pure flow: sumList
  (func $sumList (param $p0 i32) (result i32)
    (local $total i32)
    (local.set $total (i32.const 0))
    (unreachable) ;; unsupported-in-WASM: forEachStmt — fail-closed trap (task #128), not yet lowered to WAT
    (local.get $total)
  )
  (export "sumList" (func $sumList))

)