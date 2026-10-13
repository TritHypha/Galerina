(module
  (import "host" "operation_context" (func $context_a (result i32)))
  (import "host" "operation_context" (func $context_b (result i32)))
  (func (export "read_both") (result i32)
    (i32.add (call $context_a) (call $context_b))
  )
)
