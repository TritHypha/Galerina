(module
  (memory 2 2048)
  (export "memory" (memory 0))

  ;; strict-trapping i32 helper — signed overflow traps (unreachable)
  (func $lln_checked_add_i32 (param $a i32) (param $b i32) (result i32)
    (local $r i32)
    (local.set $r (i32.add (local.get $a) (local.get $b)))
    ;; signed overflow iff (a^r) & (b^r) < 0
    (if (i32.lt_s (i32.and (i32.xor (local.get $a) (local.get $r)) (i32.xor (local.get $b) (local.get $r))) (i32.const 0)) (then unreachable))
    (local.get $r))

  ;; strict-trapping i32 helper — signed overflow traps (unreachable)
  (func $lln_checked_sub_i32 (param $a i32) (param $b i32) (result i32)
    (local $r i32)
    (local.set $r (i32.sub (local.get $a) (local.get $b)))
    ;; signed overflow iff (a^b) & (a^r) < 0
    (if (i32.lt_s (i32.and (i32.xor (local.get $a) (local.get $b)) (i32.xor (local.get $a) (local.get $r))) (i32.const 0)) (then unreachable))
    (local.get $r))

  ;; strict-trapping i32 helper — signed overflow traps (unreachable)
  (func $lln_checked_mul_i32 (param $a i32) (param $b i32) (result i32)
    (local $r i64)
    (local.set $r (i64.mul (i64.extend_i32_s (local.get $a)) (i64.extend_i32_s (local.get $b))))
    ;; overflow iff the exact i64 product leaves [-2^31, 2^31-1]
    (if (i32.or (i64.lt_s (local.get $r) (i64.const -2147483648)) (i64.gt_s (local.get $r) (i64.const 2147483647))) (then unreachable))
    (i32.wrap_i64 (local.get $r)))

  ;; pure flow: calc
  (func $calc (param $p0 i32) (param $p1 i32) (param $p2 i32) (result i32)
    (call $lln_checked_sub_i32 (call $lln_checked_add_i32 (call $lln_checked_mul_i32 (local.get $p0) (local.get $p1)) (local.get $p2)) (local.get $p0))
  )
  (export "calc" (func $calc))

)