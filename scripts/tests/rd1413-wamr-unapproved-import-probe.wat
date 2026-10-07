(module
  (import "host" "unapproved_operation" (func $unapproved_operation (result i32)))
  (func (export "call_unapproved_operation") (result i32)
    call $unapproved_operation
  )
)
