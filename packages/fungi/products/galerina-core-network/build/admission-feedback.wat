(module
  (memory 2 2048)
  (export "memory" (memory 0))

  ;; pure flow: k3Unknown
  (func $k3Unknown (result i32)
    (i32.const -128)
  )
  (export "k3Unknown" (func $k3Unknown))

  ;; pure flow: vAnd
  (func $vAnd (param $p0 i32) (param $p1 i32) (result i32)
    (if (i32.lt_s (local.get $p0) (local.get $p1))
      (then
        (return (local.get $p0))
      )
    )
    (local.get $p1)
  )
  (export "vAnd" (func $vAnd))

  ;; pure flow: telemetrySideSignal
  (func $telemetrySideSignal (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (result i32)
    (local $v i32)
    (local.set $v (i32.const 1))
    (if (i32.eq (local.get $p0) (i32.const 1))
      (then
        (local.set $v (call $vAnd (local.get $v) (call $k3Unknown )))
      )
    )
    (if (i32.eq (local.get $p1) (i32.const 1))
      (then
        (if (i32.eq (local.get $p2) (i32.const 1))
          (then
            (local.set $v (call $vAnd (local.get $v) (call $k3Unknown )))
          )
          (else
            (if (i32.eq (local.get $p3) (i32.const 1))
              (then
                (local.set $v (call $vAnd (local.get $v) (i32.const -1)))
              )
              (else
                (if (i32.eq (local.get $p4) (i32.const 1))
                  (then
                    (local.set $v (call $vAnd (local.get $v) (call $k3Unknown )))
                  )
                )
              )
            )
          )
        )
      )
    )
    (local.get $v)
  )
  (export "telemetrySideSignal" (func $telemetrySideSignal))

)