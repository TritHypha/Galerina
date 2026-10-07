(module
  (import "host" "operation_context" (func $operation_context (result i32)))
  (func (export "read_operation_context") (result i32)
    call $operation_context
  )
)
