(module
  (import "host" "unregistered_operation" (func $unregistered_operation (result i32)))
  (func (export "call_unregistered") (result i32)
    call $unregistered_operation
  )
)
