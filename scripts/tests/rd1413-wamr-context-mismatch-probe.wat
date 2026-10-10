(module
  (import "host" "operation_context" (func $operation_context (param i64) (result i64)))
  (func (export "read_operation_context") (param $value i64) (result i64)
    (call $operation_context (local.get $value))
  )
)
